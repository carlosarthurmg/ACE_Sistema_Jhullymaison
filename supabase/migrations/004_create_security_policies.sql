-- 004_create_security_policies.sql
-- Segurança do banco (RNF14). REGRA: toda tabela do schema public tem RLS ligado.
-- Tabela com RLS e SEM policy fica fechada para o navegador (anon/authenticated).
-- As Functions usam a service role no servidor, que ignora o RLS.
--
-- Por isso, o catálogo público e as operações do cliente passam pelas Functions
-- (/api/*). O navegador NÃO consulta estas tabelas diretamente.
-- As policies abaixo são só uma segunda camada de proteção (Guia, E.2).

ALTER TABLE public.profiles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_addresses     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_sessions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset_audit   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_categories     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_addons         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carts                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_item_addons       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_item_addons      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_outbox    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs       ENABLE ROW LEVEL SECURITY;

-- Cliente lê só o que é dele.
CREATE POLICY profile_read_own ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid());

CREATE POLICY address_read_own ON public.customer_addresses
  FOR SELECT TO authenticated USING (customer_id = auth.uid());

CREATE POLICY address_insert_own ON public.customer_addresses
  FOR INSERT TO authenticated WITH CHECK (customer_id = auth.uid());

CREATE POLICY favorites_manage_own ON public.favorites
  FOR ALL TO authenticated
  USING (customer_id = auth.uid()) WITH CHECK (customer_id = auth.uid());

CREATE POLICY orders_read_own ON public.orders
  FOR SELECT TO authenticated USING (customer_id = auth.uid());

CREATE POLICY order_status_history_owner_read ON public.order_status_history
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_status_history.order_id AND o.customer_id = auth.uid()
  ));

-- SEM policy (propositalmente): app_sessions, password_reset_audit, categories,
-- products, product_categories, product_images, product_variants, product_addons,
-- promotions, carts, cart_items, cart_item_addons, order_items, order_item_addons,
-- notification_outbox, admin_audit_logs. Só as Functions acessam.

-- ---------- Storage: fotos dos produtos ----------
-- Bucket público para LEITURA do arquivo (a foto aparece no site).
-- Envio e exclusão só pelas Functions (service role): NÃO criar policy de
-- INSERT, UPDATE ou DELETE para anon nem authenticated.
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;
