-- 006_seed_demo_data.sql
-- Dados FICTÍCIOS para desenvolver e testar. Não contém dado real de ninguém.
-- As 3 categorias iniciais (RF06) são dados de referência da loja.
-- Não cria usuários: contas ficam no Supabase Auth (a administradora é criada
-- por script, com a senha vinda do .env, e nunca por este arquivo).
-- ATENÇÃO: antes de publicar a loja de verdade, remover os produtos de demonstração.

INSERT INTO public.categories (name, slug, description, sort_order) VALUES
  ('Buquês', 'buques', 'Buquês de flores', 1),
  ('Cestas', 'cestas', 'Cestas de presente', 2),
  ('Presentes personalizados', 'presentes-personalizados', 'Presentes feitos sob medida', 3)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.products
  (name, slug, description, material, size_description, base_price, stock_quantity, is_approved, is_active)
VALUES
  ('Buquê Aurora', 'buque-aurora', 'Delicadeza para transformar carinho em presente.',
   'Flores naturais e kraft', 'Aproximadamente 35 cm', 200.00, 6, true, true),
  ('Cesta Afeto', 'cesta-afeto', 'Cesta com itens selecionados (demonstração).',
   'Vime e laço de cetim', 'Tamanho único', 149.00, 4, true, true),
  ('Caixa Carinho', 'caixa-carinho', 'Caixa de presente com laço dourado (demonstração).',
   'Papelão rígido', 'Médio', 129.00, 8, true, true),
  ('Buquê Essência', 'buque-essencia', 'Buquê de demonstração.',
   'Flores naturais', 'Grande', 220.00, 3, true, true),
  ('Caixa Surpresa', 'caixa-surpresa', 'Estoque zero: não deve aparecer no catálogo (RN02).',
   'Papelão rígido', 'Médio', 160.00, 0, true, true),
  ('Buquê Sereno', 'buque-sereno', 'Aguardando aprovação: não deve aparecer no catálogo (RN01).',
   'Flores naturais', 'Médio', 190.00, 5, false, true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.product_categories (product_id, category_id)
SELECT p.id, c.id
FROM (VALUES
  ('buque-aurora', 'buques'), ('buque-essencia', 'buques'), ('buque-sereno', 'buques'),
  ('cesta-afeto', 'cestas'),
  ('caixa-carinho', 'presentes-personalizados'), ('caixa-surpresa', 'presentes-personalizados')
) AS m(product_slug, category_slug)
JOIN public.products p ON p.slug = m.product_slug
JOIN public.categories c ON c.slug = m.category_slug
ON CONFLICT DO NOTHING;

-- Variações com preço próprio (Buquê Aurora: Clássico 200, Especial 240).
INSERT INTO public.product_variants (product_id, name, price)
SELECT id, v.name, v.price
FROM public.products,
     (VALUES ('Clássico', 200.00), ('Especial', 240.00)) AS v(name, price)
WHERE slug = 'buque-aurora';

-- Adicionais (sem desconto de promoção).
INSERT INTO public.product_addons (product_id, name, price)
SELECT id, a.name, a.price
FROM public.products,
     (VALUES ('Chocolates', 25.00), ('Embalagem especial', 15.00)) AS a(name, price)
WHERE slug = 'buque-aurora';

-- Promoção do Buquê Aurora: 200 -> 180 (10%), válida por 30 dias a partir de agora.
INSERT INTO public.promotions (product_id, promotional_price, starts_at, ends_at)
SELECT id, 180.00, now() - interval '1 day', now() + interval '30 days'
FROM public.products WHERE slug = 'buque-aurora';
