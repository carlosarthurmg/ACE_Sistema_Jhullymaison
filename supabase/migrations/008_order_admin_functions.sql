-- 008_order_admin_functions.sql
-- Autor: Enzo Morais | RF18, RF19, RF30 | Adendo 1, seções 4.3 e 5
--
-- O que faz:
--   1) Grava a primeira linha de order_status_history quando o pedido é criado.
--   2) Funções transacionais usadas pela Function admin-orders:
--        admin_change_order_status, admin_set_order_payment, admin_cancel_order.
--      Cada uma trava o pedido (FOR UPDATE), valida a regra, altera, grava
--      histórico e log de auditoria na MESMA transação.
--   3) Só a service role executa as funções (anon e authenticated não).
--
-- ATENÇÃO (João): o INSERT em orders já gera o histórico inicial via trigger.
-- Não grave essa linha de novo no POST /api/orders, para não duplicar.

-- 1) Histórico inicial ----------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS notification_new_order_unique
  ON public.notification_outbox(order_id) WHERE notification_type = 'new_order';

CREATE FUNCTION public.log_order_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.order_status_history (order_id, changed_by, previous_status, new_status)
  VALUES (NEW.id, NEW.customer_id, NULL, NEW.order_status);
  INSERT INTO public.notification_outbox (order_id, notification_type, recipient, payload)
  VALUES (NEW.id, 'new_order', 'ADMIN_NOTIFICATION_EMAIL', jsonb_build_object(
    'order_code', NEW.order_code, 'total', NEW.total, 'fulfillment_type', NEW.fulfillment_type,
    'payment_method', NEW.payment_method, 'desired_at', NEW.desired_at));
  RETURN NEW;
END;
$$;

CREATE TRIGGER orders_log_created
AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.log_order_created();

-- 2a) Mudar status do pedido ----------------------------------------------
-- Fluxo permitido (RN05):
--   awaiting_payment -> preparing
--   preparing -> ready_for_pickup (só retirada) | shipped (só entrega)
--   ready_for_pickup | shipped -> delivered (só com pagamento 'paid')
-- Cancelamento tem função própria (devolve estoque).
CREATE FUNCTION public.admin_change_order_status(
  p_order_id UUID,
  p_new_status public.order_status,
  p_admin_id UUID
)
RETURNS public.orders
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_order public.orders;
  v_prev  public.order_status;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  IF p_new_status = 'cancelled' THEN
    RAISE EXCEPTION 'USE_CANCEL_ENDPOINT';
  END IF;

  IF v_order.order_status IN ('delivered', 'cancelled') THEN
    RAISE EXCEPTION 'ORDER_FINALIZED';
  END IF;

  IF NOT (
       (v_order.order_status = 'awaiting_payment' AND p_new_status = 'preparing')
    OR (v_order.order_status = 'preparing' AND p_new_status = 'ready_for_pickup'
        AND v_order.fulfillment_type = 'pickup')
    OR (v_order.order_status = 'preparing' AND p_new_status = 'shipped'
        AND v_order.fulfillment_type = 'delivery')
    OR (v_order.order_status IN ('ready_for_pickup', 'shipped') AND p_new_status = 'delivered')
  ) THEN
    RAISE EXCEPTION 'INVALID_TRANSITION';
  END IF;

  IF p_new_status = 'delivered' AND v_order.payment_status <> 'paid' THEN
    RAISE EXCEPTION 'PAYMENT_REQUIRED';
  END IF;

  v_prev := v_order.order_status;

  UPDATE public.orders SET order_status = p_new_status
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  INSERT INTO public.order_status_history (order_id, changed_by, previous_status, new_status)
  VALUES (p_order_id, p_admin_id, v_prev, p_new_status);

  INSERT INTO public.admin_audit_logs (admin_id, action, entity_type, entity_id, metadata_safe)
  VALUES (p_admin_id, 'order.status_changed', 'order', p_order_id,
          jsonb_build_object('order_code', v_order.order_code,
                             'from', v_prev, 'to', p_new_status));

  RETURN v_order;
END;
$$;

-- 2b) Marcar pagamento -----------------------------------------------------
-- Só 'paid' ou 'pending'. 'cancelled' só pelo cancelamento do pedido.
-- Quem confirmou fica em admin_audit_logs (Adendo, seção 5.1).
CREATE FUNCTION public.admin_set_order_payment(
  p_order_id UUID,
  p_payment_status public.payment_status,
  p_admin_id UUID
)
RETURNS public.orders
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_order public.orders;
  v_prev  public.payment_status;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  IF p_payment_status = 'cancelled' THEN
    RAISE EXCEPTION 'USE_CANCEL_ENDPOINT';
  END IF;

  IF v_order.order_status = 'cancelled' THEN
    RAISE EXCEPTION 'ORDER_FINALIZED';
  END IF;

  IF v_order.payment_status = p_payment_status THEN
    RAISE EXCEPTION 'NO_CHANGE';
  END IF;

  -- Pedido já entregue não pode voltar a "pendente".
  IF p_payment_status = 'pending' AND v_order.order_status = 'delivered' THEN
    RAISE EXCEPTION 'ORDER_FINALIZED';
  END IF;

  v_prev := v_order.payment_status;

  UPDATE public.orders
  SET payment_status = p_payment_status,
      confirmed_at   = CASE WHEN p_payment_status = 'paid' THEN now() ELSE NULL END
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  INSERT INTO public.admin_audit_logs (admin_id, action, entity_type, entity_id, metadata_safe)
  VALUES (p_admin_id, 'order.payment_changed', 'order', p_order_id,
          jsonb_build_object('order_code', v_order.order_code,
                             'from', v_prev, 'to', p_payment_status));

  RETURN v_order;
END;
$$;

-- 2c) Cancelar pedido e devolver estoque UMA vez ---------------------------
-- Decisão a confirmar com a cliente: se o pagamento já estava 'paid', ele
-- permanece 'paid' (o reembolso é combinado fora do sistema). Se estava
-- 'pending', vira 'cancelled'.
CREATE FUNCTION public.admin_cancel_order(
  p_order_id UUID,
  p_admin_id UUID
)
RETURNS public.orders
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_order public.orders;
  v_prev  public.order_status;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  IF v_order.order_status = 'cancelled' THEN
    RAISE EXCEPTION 'ALREADY_CANCELLED';
  END IF;

  IF v_order.order_status = 'delivered' THEN
    RAISE EXCEPTION 'ORDER_FINALIZED';
  END IF;

  v_prev := v_order.order_status;

  IF v_order.stock_restored_at IS NULL THEN
    UPDATE public.products p
    SET stock_quantity = p.stock_quantity + s.qty
    FROM (
      SELECT product_id, SUM(quantity)::INTEGER AS qty
      FROM public.order_items
      WHERE order_id = p_order_id AND product_id IS NOT NULL
      GROUP BY product_id
    ) s
    WHERE p.id = s.product_id;
  END IF;

  UPDATE public.orders
  SET order_status      = 'cancelled',
      payment_status    = CASE WHEN payment_status = 'pending' THEN 'cancelled'
                               ELSE payment_status END,
      cancelled_at      = now(),
      stock_restored_at = COALESCE(stock_restored_at, now())
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  INSERT INTO public.order_status_history (order_id, changed_by, previous_status, new_status)
  VALUES (p_order_id, p_admin_id, v_prev, 'cancelled');

  INSERT INTO public.admin_audit_logs (admin_id, action, entity_type, entity_id, metadata_safe)
  VALUES (p_admin_id, 'order.cancelled', 'order', p_order_id,
          jsonb_build_object('order_code', v_order.order_code, 'from', v_prev));

  RETURN v_order;
END;
$$;

-- 3) Permissões: só a service role executa ---------------------------------
REVOKE ALL ON FUNCTION public.admin_change_order_status(UUID, public.order_status, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_set_order_payment(UUID, public.payment_status, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_cancel_order(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_change_order_status(UUID, public.order_status, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_order_payment(UUID, public.payment_status, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_cancel_order(UUID, UUID) TO service_role;

-- O período usa a data de criação local da loja, com fim exclusivo.
CREATE FUNCTION public.admin_sales_summary(p_from timestamptz, p_until timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  WITH sales AS (
    SELECT id, total, payment_method FROM orders
    WHERE payment_status = 'paid' AND order_status <> 'cancelled'
      AND created_at >= p_from AND created_at < p_until
  ), methods AS (
    SELECT payment_method, count(*) AS orders, sum(total) AS total
    FROM sales GROUP BY payment_method
  ), products_sold AS (
    SELECT i.product_id, i.product_name_snapshot AS name, sum(i.quantity) AS quantity
    FROM order_items i JOIN sales s ON s.id = i.order_id
    GROUP BY i.product_id, i.product_name_snapshot
  )
  SELECT jsonb_build_object('orders', count(*), 'total', coalesce(sum(total), 0),
    'by_method', coalesce((SELECT jsonb_agg(methods ORDER BY payment_method) FROM methods), '[]'),
    'products', coalesce((SELECT jsonb_agg(products_sold ORDER BY quantity DESC, name) FROM products_sold), '[]'))
  FROM sales;
$$;
REVOKE ALL ON FUNCTION public.admin_sales_summary(timestamptz,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_sales_summary(timestamptz,timestamptz) TO service_role;
