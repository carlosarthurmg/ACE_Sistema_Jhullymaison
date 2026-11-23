-- Run with psql on a disposable Supabase after 001–006, before 007.
\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE baseline AS
  SELECT oid, relname FROM pg_class
  WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r','p');
\ir ../../supabase/migrations/007_order_admin_functions.sql

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

  PERFORM public.admin_change_order_status(purchase, 'preparing', actor);
  PERFORM public.admin_set_order_payment(purchase, 'paid', actor);
  IF (public.admin_sales_summary(now()-interval '1 day', now()+interval '1 day')->>'total')::numeric <> 12
  THEN RAISE EXCEPTION 'Expected paid order in report'; END IF;
  PERFORM public.admin_cancel_order(purchase, actor);
  IF (SELECT stock_quantity FROM public.products WHERE id=product) <> stock_before + 2
    OR (public.admin_sales_summary(now()-interval '1 day', now()+interval '1 day')->>'orders')::int <> 0
  THEN RAISE EXCEPTION 'Cancellation did not restore stock or exclude sale'; END IF;
END
$check$;
ROLLBACK;
