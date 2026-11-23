-- 005_create_functions_triggers.sql
-- Código do pedido e atualização automática de updated_at.

-- Código do pedido com hífen (decisão D4): JM-0001, JM-0002...
-- Use DENTRO da transação de criação do pedido. A sequência pode "pular"
-- números se a transação for desfeita; é aceitável (único e nunca reutilizado: RN11).
CREATE OR REPLACE FUNCTION public.next_order_code()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'JM-' || LPAD(nextval('public.order_code_seq')::TEXT, 4, '0');
$$;

-- SECURITY DEFINER: roda com a permissão do dono, então não depende de
-- permissão na sequência. Só a service role (Functions) executa. O navegador não gera códigos.
REVOKE ALL ON FUNCTION public.next_order_code() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.next_order_code() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_order_code() TO service_role;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER products_set_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER carts_set_updated_at
  BEFORE UPDATE ON public.carts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER orders_set_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
