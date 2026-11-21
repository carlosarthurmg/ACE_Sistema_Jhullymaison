// Roda 002 + 007 num PostgreSQL real (WebAssembly) e testa as funções do catálogo.
// Uso: npm i -D @electric-sql/pglite && node tests/sql/catalog-sql.test.mjs
// Usa a 002 do repositório (Carlos). Stubs mínimos: profiles, order_items e cart_items (vêm da 001/003 dele).
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
const M = new URL('../../supabase/migrations/', import.meta.url).pathname
const db = new PGlite()
let pass = 0, fail = 0
const ok = (name, cond) => { cond ? pass++ : fail++; console.log((cond ? 'OK   ' : 'FALHOU ') + name) }
const code = async (sql, params) => { try { await db.query(sql, params); return null } catch (e) { return e.code ?? e.message } }

// stubs das partes de outros módulos (Guia/Carlos)
await db.exec(`
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE SCHEMA storage;
  CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean);
  CREATE TABLE public.profiles (id uuid PRIMARY KEY);
`)
const strip = (s) => s.replace(/CREATE EXTENSION IF NOT EXISTS pgcrypto;/, '')
await db.exec(strip(fs.readFileSync(M + '002_create_catalog_tables.sql', 'utf8')))
await db.exec(`
  CREATE TABLE public.order_items (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, product_id uuid REFERENCES public.products(id) ON DELETE SET NULL);
  CREATE TABLE public.cart_items  (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT);
`)
await db.exec(fs.readFileSync(M + '007_catalog_atomic_operations.sql', 'utf8'))
await db.exec(`
  INSERT INTO categories (name, slug) VALUES ('Buquês','buques'), ('Cestas','cestas');
  INSERT INTO products (name, slug, description, base_price, stock_quantity, is_approved)
    VALUES ('Buquê de teste','buque-demonstracao','x',89.90,5,true);
  INSERT INTO product_categories SELECT p.id, c.id FROM products p, categories c WHERE p.slug='buque-demonstracao' AND c.slug='buques';
`)
ok('002 + 007 executam sem erro', true)

const one = async (sql, p) => (await db.query(sql, p)).rows[0]
const cats = Object.fromEntries((await db.query('SELECT slug,id FROM categories')).rows.map(r => [r.slug, r.id]))
const prod = await one("SELECT id, updated_at FROM products WHERE slug='buque-demonstracao'")

// 4.1: colunas antigas não existem; 4.2: price em variações
const cols = async (t) => (await db.query(`SELECT column_name FROM information_schema.columns WHERE table_name=$1`, [t])).rows.map(r => r.column_name)
const pc = await cols('products'), vc = await cols('product_variants')
ok('products sem category_id e sem image_path', !pc.includes('category_id') && !pc.includes('image_path'))
ok('product_variants tem price e não tem price_delta', vc.includes('price') && !vc.includes('price_delta'))
ok('produto de teste vinculado à categoria Buquês', (await one('SELECT count(*)::int n FROM product_categories WHERE product_id=$1', [prod.id])).n === 1)

// RN10: categorias
ok('set_product_categories([]) recusa (22023)', await code('SELECT catalog_set_product_categories($1, ARRAY[]::uuid[])', [prod.id]) === '22023')
await db.query('SELECT catalog_set_product_categories($1, $2::uuid[])', [prod.id, [cats.buques, cats.cestas]])
ok('produto em 2 categorias', (await one('SELECT count(*)::int n FROM product_categories WHERE product_id=$1', [prod.id])).n === 2)
await db.query('SELECT catalog_set_product_categories($1, $2::uuid[])', [prod.id, [cats.cestas]])
const left = (await db.query('SELECT category_id FROM product_categories WHERE product_id=$1', [prod.id])).rows
ok('trocar para 1 categoria remove a outra', left.length === 1 && left[0].category_id === cats.cestas)
ok('categoria vinculada não pode ser excluída direto (23001)', await code('DELETE FROM categories WHERE id=$1', [cats.cestas]) === '23001')
await db.query('SELECT catalog_reassign_category($1,$2)', [cats.cestas, cats.buques])
ok('reassign move os produtos', (await one('SELECT category_id FROM product_categories WHERE product_id=$1', [prod.id])).category_id === cats.buques)
ok('categoria vazia pode ser excluída', (await code('DELETE FROM categories WHERE id=$1', [cats.cestas])) === null)
ok('reassign para categoria inexistente recusa (P0002)', await code('SELECT catalog_reassign_category($1,$2)', [cats.buques, '00000000-0000-0000-0000-000000000000']) === 'P0002')

// RF07: fotos, capa única
const img = async (p, c) => (await one('INSERT INTO product_images (product_id,storage_path,sort_order,is_cover) VALUES ($1,$2,$3,$4) RETURNING id', [prod.id, p, c ? 0 : 1, c])).id
const i1 = await img('p/1.webp', true), i2 = await img('p/2.webp', false)
ok('duas capas no mesmo produto são barradas (23505)', await code('UPDATE product_images SET is_cover=true WHERE id=$1', [i2]) === '23505')
await db.query('SELECT catalog_set_cover($1,$2)', [prod.id, i2])
const covers = (await db.query('SELECT id FROM product_images WHERE product_id=$1 AND is_cover', [prod.id])).rows
ok('set_cover troca a capa e mantém só uma', covers.length === 1 && covers[0].id === i2)
ok('set_cover com foto de outro produto recusa (P0002)', await code('SELECT catalog_set_cover($1,$2)', [prod.id, '00000000-0000-0000-0000-000000000000']) === 'P0002')

// RN07: promoção
ok('promoção >= preço original barrada pelo banco (23514)',
  await code("INSERT INTO promotions (product_id,promotional_price,starts_at,ends_at) VALUES ($1,89.90,now(),now()+interval '1 day')", [prod.id]) === '23514')
ok('promoção menor que o original aceita',
  (await code("INSERT INTO promotions (product_id,promotional_price,starts_at,ends_at) VALUES ($1,79.90,now(),now()+interval '1 day')", [prod.id])) === null)
ok('promoção com fim antes do início barrada (23514)',
  await code("INSERT INTO promotions (product_id,promotional_price,starts_at,ends_at) VALUES ($1,50,now(),now()-interval '1 day')", [prod.id]) === '23514')

// updated_at
await new Promise(r => setTimeout(r, 15))
await db.query("UPDATE products SET stock_quantity=4 WHERE id=$1", [prod.id])
ok('updated_at muda ao editar', (await one('SELECT updated_at > created_at AS m FROM products WHERE id=$1', [prod.id])).m)

// RN17: excluir produto
const mk = async (slug) => (await one("INSERT INTO products (name,slug,description,base_price,stock_quantity) VALUES ($1,$1,'x',10,1) RETURNING id", [slug])).id
const withOrder = await mk('com-pedido'); await db.query('INSERT INTO order_items (product_id) VALUES ($1)', [withOrder])
let r = (await one('SELECT catalog_delete_product($1) AS r', [withOrder])).r
ok('produto com pedido é só inativado', r.status === 'deactivated' && (await one('SELECT is_active FROM products WHERE id=$1', [withOrder])).is_active === false)
const noOrder = await mk('sem-pedido')
await db.query('INSERT INTO product_images (product_id,storage_path) VALUES ($1,$2)', [noOrder, 'p/x.webp'])
await db.query('INSERT INTO cart_items (product_id) VALUES ($1)', [noOrder])
r = (await one('SELECT catalog_delete_product($1) AS r', [noOrder])).r
ok('produto sem pedido é excluído (mesmo estando em carrinho) e devolve as fotos', r.status === 'deleted' && r.paths[0] === 'p/x.webp'
  && (await one('SELECT count(*)::int n FROM products WHERE id=$1', [noOrder])).n === 0
  && (await one('SELECT count(*)::int n FROM cart_items WHERE product_id=$1', [noOrder])).n === 0)
ok('excluir produto inexistente recusa (P0002)', await code('SELECT catalog_delete_product($1)', ['00000000-0000-0000-0000-000000000000']) === 'P0002')

// segurança: só service_role executa as funções
const perms = (await db.query(`
  SELECT p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') a, has_function_privilege('authenticated', p.oid, 'EXECUTE') u, has_function_privilege('service_role', p.oid, 'EXECUTE') s
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'catalog\\_%' AND p.prorettype <> 'trigger'::regtype`)).rows
ok(`funções catalog_* só para service_role (${perms.length} funções)`, perms.length === 4 && perms.every(x => !x.a && !x.u && x.s))

console.log(`\n${pass} ok, ${fail} falharam`)
process.exit(fail ? 1 : 0)
