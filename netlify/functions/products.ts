// Catálogo público. RF03, RF04, RF09, RF11 | RN01, RN02, RN07, RN09
// GET /api/products          lista (category, search, sort, page, page_size)
// GET /api/products/:slug    detalhe
// Leitura feita com a service role (Adendo 4.4): os filtros de visibilidade abaixo SÃO a regra de segurança.
import type { Config, Context } from '@netlify/functions'
import type { SupabaseClient } from '@supabase/supabase-js'
import { CATEGORY_EMBED, IMAGE_FIELDS, PROMO_FIELDS, toDetail, toListItem } from './_shared/catalog'
import { cleanSearch, clampInt } from './_shared/catalog-validation'
import { assertDb, handle, HttpError } from './_shared/catalog-errors'
import { ok } from './_shared/response'
import { supabaseAdmin } from './_shared/supabase'

export const config: Config = { path: ['/api/products', '/api/products/:slug'] }

const LIST_SELECT = [
  'id,slug,name,base_price,stock_quantity,created_at',
  CATEGORY_EMBED,
  `product_images(${IMAGE_FIELDS})`,
  `promotions(${PROMO_FIELDS})`,
].join(',')

const DETAIL_SELECT = [
  'id,slug,name,description,material,size_description,base_price,stock_quantity',
  CATEGORY_EMBED,
  `product_images(${IMAGE_FIELDS})`,
  'product_variants(id,name,price,is_active)',
  'product_addons(id,name,price,is_active)',
  `promotions(${PROMO_FIELDS})`,
].join(',')

async function list(db: SupabaseClient, sp: URLSearchParams): Promise<Response> {
  const page = clampInt(sp.get('page'), 1, 1, 1000)
  const size = clampInt(sp.get('page_size'), 12, 1, 48)
  const empty = ok({ items: [], page, page_size: size, total: 0 })

  // Filtro por categoria (só categorias ativas) via tabela de ligação.
  let ids: string[] | null = null
  const category = sp.get('category')
  if (category) {
    const { data, error } = await db
      .from('product_categories')
      .select('product_id,categories!inner(slug,is_active)')
      .eq('categories.slug', category.slice(0, 80))
      .eq('categories.is_active', true)
    assertDb(error)
    ids = (data ?? []).map((r) => r.product_id as string)
    if (ids.length === 0) return empty
  }

  // RN01 + RN02: só aprovados, ativos e com estoque.
  let q = db
    .from('products')
    .select(LIST_SELECT, { count: 'exact' })
    .eq('is_approved', true)
    .eq('is_active', true)
    .gt('stock_quantity', 0)
  if (ids) q = q.in('id', ids)

  const search = cleanSearch(sp.get('search'))
  if (search) q = q.ilike('name', `%${search}%`)

  switch (sp.get('sort')) {
    case 'price_asc':
      q = q.order('base_price', { ascending: true })
      break
    case 'price_desc':
      q = q.order('base_price', { ascending: false })
      break
    case 'name':
      q = q.order('name', { ascending: true })
      break
    default:
      q = q.order('created_at', { ascending: false })
  }

  const { data, count, error } = await q.range((page - 1) * size, page * size - 1)
  assertDb(error)
  return ok({ items: (data ?? []).map(toListItem), page, page_size: size, total: count ?? 0 })
}

async function detail(db: SupabaseClient, slug: string): Promise<Response> {
  const { data, error } = await db
    .from('products')
    .select(DETAIL_SELECT)
    .eq('slug', slug.slice(0, 160))
    .eq('is_approved', true)
    .eq('is_active', true)
    .gt('stock_quantity', 0)
    .maybeSingle()
  assertDb(error)
  if (!data) throw new HttpError(404, 'NOT_FOUND', 'Produto não encontrado.')
  return ok(toDetail(data))
}

export default async (req: Request, ctx: Context): Promise<Response> =>
  handle(async () => {
    if (req.method !== 'GET') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Método não permitido.')
    const db = supabaseAdmin()
    const slug = ctx.params?.slug
    return slug ? detail(db, slug) : list(db, new URL(req.url).searchParams)
  })
