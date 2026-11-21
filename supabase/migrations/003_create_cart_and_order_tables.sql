-- 003_create_cart_and_order_tables.sql
-- Carrinho, pedidos, histórico de status, fila de e-mails e auditoria admin.

-- ---------- Carrinho (salvo na conta, sem limite de tempo: RF26) ----------
CREATE TABLE public.carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Se o produto for excluído, some do carrinho (CASCADE). O carrinho não reserva estoque (RN23).
CREATE TABLE public.cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id UUID NOT NULL REFERENCES public.carts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  personalization_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX cart_items_cart_idx ON public.cart_items(cart_id);

CREATE TABLE public.cart_item_addons (
  cart_item_id UUID NOT NULL REFERENCES public.cart_items(id) ON DELETE CASCADE,
  addon_id UUID NOT NULL REFERENCES public.product_addons(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  PRIMARY KEY (cart_item_id, addon_id)
);

-- ---------- Pedidos ----------
-- Pedido nunca é excluído, só cancelado (RN13). O status do pedido e o do
-- pagamento são separados (RN05). order_code é gerado por next_order_code().
-- Anonimização: se o cliente for anonimizado, a Function limpa recipient_*,
-- card_message e troca delivery_address_snapshot por '{}'::jsonb.
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_code TEXT NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  order_status public.order_status NOT NULL DEFAULT 'awaiting_payment',
  payment_status public.payment_status NOT NULL DEFAULT 'pending',
  payment_method public.payment_method NOT NULL,
  fulfillment_type public.fulfillment_type NOT NULL,
  desired_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  delivery_address_snapshot JSONB,
  recipient_name TEXT,
  recipient_phone TEXT,
  card_message TEXT,
  subtotal NUMERIC(10,2) NOT NULL CHECK (subtotal >= 0),
  total NUMERIC(10,2) NOT NULL CHECK (total >= 0),
  customer_note TEXT,
  cancellation_requested_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  stock_restored_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- RN12: endereço obrigatório na entrega.
  CONSTRAINT orders_delivery_needs_address CHECK (
    fulfillment_type = 'pickup' OR delivery_address_snapshot IS NOT NULL
  ),
  -- RN05: só pode ser entregue com o pagamento pago.
  CONSTRAINT orders_delivered_needs_paid CHECK (
    order_status <> 'delivered' OR payment_status = 'paid'
  )
);
CREATE INDEX orders_customer_idx ON public.orders(customer_id, created_at DESC);
CREATE INDEX orders_status_idx ON public.orders(order_status);
CREATE INDEX orders_payment_status_idx ON public.orders(payment_status);
CREATE INDEX orders_desired_at_idx ON public.orders(desired_at);

-- Itens guardam nome e preço do momento da compra (RN15).
-- product_id RESTRICT: produto que já tem pedido não pode ser excluído (RN17);
-- a Function deve responder 409 e sugerir inativar.
CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  product_id UUID REFERENCES public.products(id) ON DELETE RESTRICT,
  product_name_snapshot TEXT NOT NULL,
  variant_name_snapshot TEXT,
  unit_price_snapshot NUMERIC(10,2) NOT NULL CHECK (unit_price_snapshot >= 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  personalization_note TEXT,
  line_total NUMERIC(10,2) NOT NULL CHECK (line_total >= 0)
);
CREATE INDEX order_items_order_idx ON public.order_items(order_id);
CREATE INDEX order_items_product_idx ON public.order_items(product_id);

CREATE TABLE public.order_item_addons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id UUID NOT NULL REFERENCES public.order_items(id) ON DELETE RESTRICT,
  addon_name_snapshot TEXT NOT NULL,
  unit_price_snapshot NUMERIC(10,2) NOT NULL CHECK (unit_price_snapshot >= 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  line_total NUMERIC(10,2) NOT NULL CHECK (line_total >= 0)
);
CREATE INDEX order_item_addons_item_idx ON public.order_item_addons(order_item_id);

-- Histórico de status (Adendo 4.3). TODA mudança de orders.order_status
-- (criação, preparo, envio, entrega, cancelamento) grava uma linha aqui,
-- na mesma transação da mudança.
CREATE TABLE public.order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  previous_status public.order_status,
  new_status public.order_status NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX order_status_history_order_idx
  ON public.order_status_history(order_id, changed_at);

-- ---------- Fila de e-mails (RNF07) ----------
CREATE TABLE public.notification_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  notification_type TEXT NOT NULL,
  recipient TEXT NOT NULL,
  payload JSONB NOT NULL,
  status public.notification_status NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error_code TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notification_outbox_pending_idx
  ON public.notification_outbox(status, next_attempt_at);

-- ---------- Auditoria das ações da administradora (RNF19) ----------
-- metadata_safe: NUNCA colocar senha, token, cookie ou dado sensível.
CREATE TABLE public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  metadata_safe JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX admin_audit_logs_created_idx ON public.admin_audit_logs(created_at DESC);
