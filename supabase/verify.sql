-- verify.sql: rode no SQL Editor DEPOIS das migrations 001 a 006.
-- Resultado esperado está em cada comentário.

-- 1) Tabelas do schema public. Esperado: 21.
SELECT count(*) AS total_tabelas
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

-- 2) Tabelas SEM RLS. Esperado: nenhuma linha.
SELECT c.relname AS tabela_sem_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;

-- 3) Dados de demonstração. Esperado: categorias = 3, produtos = 6,
--    visíveis no catálogo (aprovados, ativos e com estoque) = 4.
SELECT
  (SELECT count(*) FROM public.categories) AS categorias,
  (SELECT count(*) FROM public.products) AS produtos,
  (SELECT count(*) FROM public.products
    WHERE is_approved AND is_active AND stock_quantity > 0) AS visiveis_no_catalogo;

-- 4) Código do pedido. Esperado: JM-0001 (a sequência avança a cada chamada;
--    se rodar mais de uma vez, o número seguinte é normal).
SELECT public.next_order_code() AS codigo_exemplo;
