-- 007_catalog_atomic_operations.sql
-- Responsável: Rodolfo Dheymison. Rodar DEPOIS de 001 a 006 (usa order_items e cart_items).
-- Triggers e operações atômicas do catálogo. Prefixo catalog_ para não colidir com funções da 005.

-- Funções com prefixo catalog_ para não colidir com as da migration 005.
CREATE OR REPLACE FUNCTION public.catalog_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

CREATE TRIGGER products_touch_updated_at BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.catalog_touch_updated_at();

-- RN07: preço promocional sempre menor que o preço original (reforço no banco).
CREATE OR REPLACE FUNCTION public.catalog_check_promotion_price()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE original NUMERIC(10,2);
BEGIN
  SELECT base_price INTO original FROM public.products WHERE id = NEW.product_id;
  IF NEW.promotional_price >= original THEN
    RAISE EXCEPTION 'promotional_price must be lower than base_price' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER promotions_check_price BEFORE INSERT OR UPDATE ON public.promotions
  FOR EACH ROW EXECUTE FUNCTION public.catalog_check_promotion_price();

-- ---------------------------------------------------------------------------
-- Operações atômicas (uma transação cada): evitam estado pela metade entre tabelas.
-- ---------------------------------------------------------------------------

-- Troca o conjunto de categorias do produto (mínimo 1, RN10).
CREATE OR REPLACE FUNCTION public.catalog_set_product_categories(p_product UUID, p_categories UUID[])
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF p_categories IS NULL OR cardinality(p_categories) = 0 THEN
    RAISE EXCEPTION 'product needs at least one category' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.product_categories WHERE product_id = p_product AND category_id <> ALL (p_categories);
  INSERT INTO public.product_categories (product_id, category_id)
    SELECT p_product, c FROM unnest(p_categories) AS c
    ON CONFLICT DO NOTHING;
END $$;

-- Define a capa (no máximo uma por produto).
CREATE OR REPLACE FUNCTION public.catalog_set_cover(p_product UUID, p_image UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.product_images WHERE id = p_image AND product_id = p_product) THEN
    RAISE EXCEPTION 'image not found' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.product_images SET is_cover = false WHERE product_id = p_product AND is_cover AND id <> p_image;
  UPDATE public.product_images SET is_cover = true WHERE id = p_image;
END $$;

-- RN10: move os produtos para outra categoria antes de excluir a categoria.
CREATE OR REPLACE FUNCTION public.catalog_reassign_category(p_from UUID, p_to UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.categories WHERE id = p_to) THEN
    RAISE EXCEPTION 'target category not found' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.product_categories (product_id, category_id)
    SELECT product_id, p_to FROM public.product_categories WHERE category_id = p_from
    ON CONFLICT DO NOTHING;
  DELETE FROM public.product_categories WHERE category_id = p_from;
END $$;

-- RN17: com pedidos, só inativa; sem pedidos, exclui e devolve os caminhos das fotos para limpar o Storage.
CREATE OR REPLACE FUNCTION public.catalog_delete_product(p_product UUID)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE paths TEXT[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_product) THEN
    RAISE EXCEPTION 'product not found' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (SELECT 1 FROM public.order_items WHERE product_id = p_product) THEN
    UPDATE public.products SET is_active = false WHERE id = p_product;
    RETURN jsonb_build_object('status', 'deactivated', 'paths', '[]'::jsonb);
  END IF;
  SELECT COALESCE(array_agg(storage_path), ARRAY[]::TEXT[]) INTO paths
    FROM public.product_images WHERE product_id = p_product;
  DELETE FROM public.cart_items WHERE product_id = p_product;  -- ON DELETE RESTRICT no carrinho
  DELETE FROM public.products WHERE id = p_product;
  RETURN jsonb_build_object('status', 'deleted', 'paths', to_jsonb(paths));
END $$;

-- Só o servidor (service role) pode chamar estas funções.
REVOKE ALL ON FUNCTION public.catalog_set_product_categories(UUID, UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.catalog_set_cover(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.catalog_reassign_category(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.catalog_delete_product(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_set_product_categories(UUID, UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.catalog_set_cover(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.catalog_reassign_category(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.catalog_delete_product(UUID) TO service_role;

