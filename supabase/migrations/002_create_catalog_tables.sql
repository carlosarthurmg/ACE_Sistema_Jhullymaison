-- 002_create_catalog_tables.sql
-- Catálogo: categorias, produtos, fotos, variações, adicionais, promoções, favoritos.
-- Ajustes do Adendo 1: products SEM category_id e SEM image_path; variação com
-- preço próprio (price); product_categories e product_images são tabelas novas.

CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Estoque é do PRODUTO; as variações usam o estoque do produto (RF08, RN16).
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  material TEXT,
  size_description TEXT,
  base_price NUMERIC(10,2) NOT NULL CHECK (base_price >= 0),
  stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  is_approved BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Apoia o filtro do catálogo (aprovado, ativo e com estoque).
CREATE INDEX products_catalog_idx
  ON public.products(is_approved, is_active, stock_quantity);

-- Produto em uma ou mais categorias (RN10). A regra "pelo menos uma"
-- é validada na Function admin-products. Categoria com produtos não pode
-- ser excluída (RESTRICT): realocar os produtos antes.
CREATE TABLE public.product_categories (
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
  PRIMARY KEY (product_id, category_id)
);
CREATE INDEX product_categories_category_idx ON public.product_categories(category_id);

-- Várias fotos por produto, com capa e ordem (RF07, tela 20).
-- alt_text atende ao texto alternativo do RNF20.
CREATE TABLE public.product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  alt_text TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_cover BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX product_images_product_idx ON public.product_images(product_id);
-- No máximo uma capa por produto.
CREATE UNIQUE INDEX product_images_one_cover_idx
  ON public.product_images(product_id) WHERE is_cover;

-- Variação com preço próprio (RF33). Usa o estoque do produto.
CREATE TABLE public.product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX product_variants_product_idx ON public.product_variants(product_id);

-- Adicional cadastrado por produto (decisão do Adendo, seção 5). Sem desconto.
CREATE TABLE public.product_addons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX product_addons_product_idx ON public.product_addons(product_id);

-- Promoção (RF10, RN07). A regra "promotional_price < base_price" e o cálculo
-- do preço efetivo ficam em netlify/functions/_shared/pricing.ts.
CREATE TABLE public.promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  promotional_price NUMERIC(10,2) NOT NULL CHECK (promotional_price >= 0),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  CHECK (ends_at > starts_at)
);
CREATE INDEX promotions_product_idx ON public.promotions(product_id);

CREATE TABLE public.favorites (
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, product_id)
);
