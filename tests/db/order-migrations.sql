-- Run with psql on a disposable Supabase after 001–007, before 008.
\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE baseline AS
  SELECT oid, relname FROM pg_class
  WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r','p');
\ir ../../supabase/migrations/008_order_admin_functions.sql

DO $check$
DECLARE
  actor uuid := gen_random_uuid();
  purchase uuid := gen_random_uuid();
  product uuid;
  stock_before integer;
BEGIN
  IF (SELECT count(*) FROM baseline) <> 21 OR EXISTS (
    SELECT 1 FROM baseline b FULL JOIN (
      SELECT oid, relname, relrowsecurity FROM pg_class
      WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r','p')
    ) a USING (oid, relname)
    WHERE b.oid IS NULL OR a.oid IS NULL OR NOT a.relrowsecurity
  ) THEN RAISE EXCEPTION 'Expected the same 21 tables, all with RLS'; END IF;

  IF (SELECT count(*) FROM public.categories) <> 3
    OR (SELECT count(*) FROM public.products) <> 6
    OR (SELECT count(*) FROM public.products WHERE is_approved AND is_active AND stock_quantity > 0) <> 4
  THEN RAISE EXCEPTION 'Unexpected seed data'; END IF;

  IF EXISTS (
    SELECT FROM unnest(ARRAY[
      'public.admin_change_order_status(uuid,public.order_status,uuid)',
      'public.admin_set_order_payment(uuid,public.payment_status,uuid)',
      'public.admin_cancel_order(uuid,uuid)',
      'public.admin_sales_summary(timestamptz,timestamptz)'
    ]) AS rpc(signature)
    WHERE has_function_privilege('anon', signature, 'execute')
      OR has_function_privilege('authenticated', signature, 'execute')
      OR NOT has_function_privilege('service_role', signature, 'execute')
  ) THEN RAISE EXCEPTION 'Unexpected admin RPC grants'; END IF;

  INSERT INTO auth.users (id) VALUES (actor);
  INSERT INTO public.profiles (id, full_name, phone, role, accepted_terms_at, accepted_terms_version)
    VALUES (actor, 'Fixture', '', 'admin', now(), 'test');
  SELECT id, stock_quantity INTO STRICT product, stock_before FROM public.products ORDER BY id LIMIT 1;
  INSERT INTO public.orders (id, order_code, customer_id, payment_method, fulfillment_type, subtotal, total)
    VALUES (purchase, public.next_order_code(), actor, 'pix', 'pickup', 12, 12);
  INSERT INTO public.order_items (order_id, product_id, product_name_snapshot, unit_price_snapshot, quantity, line_total)
    VALUES (purchase, product, 'Fixture', 6, 2, 12);
  IF (SELECT count(*) FROM public.notification_outbox WHERE order_id=purchase AND notification_type='new_order') <> 1
    OR (SELECT count(*) FROM public.order_status_history WHERE order_id=purchase) <> 1
  THEN RAISE EXCEPTION 'Expected one notification and initial history'; END IF;

  BEGIN
    PERFORM public.admin_change_order_status(purchase, 'delivered', actor);
    RAISE EXCEPTION 'Unexpected successful status change';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'INVALID_TRANSITION' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.admin_set_order_payment(purchase, 'cancelled', actor);
    RAISE EXCEPTION 'Unexpected successful payment change';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'USE_CANCEL_ENDPOINT' THEN RAISE; END IF;
  END;

  PERFORM public.admin_change_order_status(purchase, 'preparing', actor);
  PERFORM public.admin_set_order_payment(purchase, 'paid', actor);
  IF (public.admin_sales_summary(now()-interval '1 day', now()+interval '1 day')->>'total')::numeric <> 12
  THEN RAISE EXCEPTION 'Expected paid order in report'; END IF;
  PERFORM public.admin_cancel_order(purchase, actor);
  BEGIN
    PERFORM public.admin_cancel_order(purchase, actor);
    RAISE EXCEPTION 'Unexpected second cancellation';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'ALREADY_CANCELLED' THEN RAISE; END IF;
  END;
  IF (SELECT stock_quantity FROM public.products WHERE id=product) <> stock_before + 2
    OR (public.admin_sales_summary(now()-interval '1 day', now()+interval '1 day')->>'orders')::int <> 0
  THEN RAISE EXCEPTION 'Cancellation did not restore stock or exclude sale'; END IF;
END
$check$;
ROLLBACK;
