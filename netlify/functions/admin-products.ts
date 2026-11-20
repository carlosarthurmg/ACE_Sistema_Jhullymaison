// Administração de produtos, variações, adicionais e promoções.
// RF05, RF08-RF10, RF33, RF34 | RN01, RN03, RN07, RN10, RN16, RN17
//   GET/POST         /api/admin/products
//   GET/PATCH/DELETE /api/admin/products/:id
//   POST             /api/admin/products/:id/{variants|addons|promotions}
//   PATCH/DELETE     /api/admin/products/:id/{variants|addons|promotions}/:childId  (DELETE = desativar)
// Fotos: admin-upload-product-image.ts (/api/admin/products/:id/image).
import type { Config } from '@netlify/functions'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { z } from 'zod'
import { audit } from './_shared/audit'
import { BUCKET, CATEGORY_EMBED, categoriesOf, imagesOf, IMAGE_FIELDS, PROMO_FIELDS, toAdminListItem } from './_shared/catalog'
import {
  addonInput, addonPatch, clampInt, cleanSearch, productInput, productPatch, promotionInput,
  promotionPatch, readJson, slugify, uuid, variantInput, variantPatch,
} from './_shared/catalog-validation'
import { requireAdmin } from './_shared/permissions'
import { assertDb, handle, HttpError } from './_shared/catalog-errors'
import { noContent, ok } from './_shared/response'
import { supabaseAdmin } from './_shared/supabase'

export const config: Config = {
  path: [
    '/api/admin/products',
    '/api/admin/products/:id',
    '/api/admin/products/:id/variants',
    '/api/admin/products/:id/variants/:variantId',
    '/api/admin/products/:id/addons',
    '/api/admin/products/:id/addons/:addonId',
    '/api/admin/products/:id/promotions',
    '/api/admin/products/:id/promotions/:promotionId',
  ],
}

const LIST_FIELDS = [
  'id,slug,name,base_price,stock_quantity,is_approved,is_active,created_at',
  CATEGORY_EMBED,
  `product_images(${IMAGE_FIELDS})`,
].join(',')
const DETAIL_FIELDS = [
  LIST_FIELDS,
  'description,material,size_description',
  'product_variants(id,name,price,is_active)',
  'product_addons(id,name,price,is_active)',
  `promotions(${PROMO_FIELDS})`,
].join(',')

type ChildKey = 'variants' | 'addons' | 'promotions'
const CHILDREN: Record<ChildKey, { table: string; create: z.ZodTypeAny; patch: z.ZodTypeAny }> = {
  variants: { table: 'product_variants', create: variantInput, patch: variantPatch },
  addons: { table: 'product_addons', create: addonInput, patch: addonPatch },
  promotions: { table: 'promotions', create: promotionInput, patch: promotionPatch },
}

/** RN10: todas as categorias informadas precisam existir. */
async function assertCategories(db: SupabaseClient, ids: string[]): Promise<string[]> {
  const unique = [...new Set(ids)]
  const { data, error } = await db.from('categories').select('id').in('id', unique)
  assertDb(error)
  if ((data ?? []).length !== unique.length) throw new HttpError(400, 'VALIDATION_ERROR', 'Categoria não encontrada.')
  return unique
}

async function productExists(db: SupabaseClient, id: string): Promise<void> {
  const { data, error } = await db.from('products').select('id').eq('id', id).maybeSingle()
  assertDb(error)
  if (!data) throw new HttpError(404, 'NOT_FOUND', 'Produto não encontrado.')
}

async function getBasePrice(db: SupabaseClient, productId: string): Promise<number> {
  const { data, error } = await db.from('products').select('base_price').eq('id', productId).maybeSingle()
  assertDb(error)
  if (!data) throw new HttpError(404, 'NOT_FOUND', 'Produto não encontrado.')
  return Number(data.base_price)
}

async function insertProduct(db: SupabaseClient, fields: Record<string, unknown>, name: string): Promise<string> {
  const base = slugify(name) || 'produto'
  for (let i = 0; i < 4; i++) {
    const slug = i === 0 ? base : `${base}-${crypto.randomUUID().slice(0, 4)}`
    const { data, error } = await db.from('products').insert({ ...fields, slug }).select('id').single()
    if (!error) return data.id as string
    if (error.code !== '23505') assertDb(error)
  }
  throw new HttpError(409, 'CONFLICT', 'Não foi possível gerar um endereço único para o produto.')
}

async function collection(req: Request, db: SupabaseClient, adminId: string): Promise<Response> {
  if (req.method === 'GET') {
    const sp = new URL(req.url).searchParams
    const page = clampInt(sp.get('page'), 1, 1, 1000)
    const size = clampInt(sp.get('page_size'), 20, 1, 50)
    let q = db.from('products').select(LIST_FIELDS, { count: 'exact' })

    const status = sp.get('status')
    if (status === 'published') q = q.eq('is_approved', true).eq('is_active', true).gt('stock_quantity', 0)
    if (status === 'unpublished') q = q.or('is_approved.eq.false,is_active.eq.false,stock_quantity.lte.0')

    const search = cleanSearch(sp.get('search'))
    if (search) q = q.ilike('name', `%${search}%`)

    const { data, count, error } = await q
      .order('created_at', { ascending: false })
      .range((page - 1) * size, page * size - 1)
    assertDb(error)
    return ok({ items: (data ?? []).map(toAdminListItem), page, page_size: size, total: count ?? 0 })
  }

  if (req.method === 'POST') {
    const { category_ids, ...fields } = await readJson(req, productInput)
    const categories = await assertCategories(db, category_ids)
    const id = await insertProduct(db, fields, fields.name)

    // Se vincular as categorias falhar, desfaz o produto: nunca fica produto sem categoria (RN10).
    const { error } = await db.rpc('catalog_set_product_categories', { p_product: id, p_categories: categories })
    if (error) {
      const undo = await db.from('products').delete().eq('id', id)
      if (undo.error) console.error('rollback_failed', undo.error.code)
      assertDb(error)
    }
    await audit(db, adminId, 'product.create', 'product', id)
    return ok({ id }, 201)
  }
  throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Método não permitido.')
}

async function item(req: Request, db: SupabaseClient, adminId: string, id: string): Promise<Response> {
  if (req.method === 'GET') {
    const { data, error } = await db.from('products').select(DETAIL_FIELDS).eq('id', id).maybeSingle()
    assertDb(error)
    if (!data) throw new HttpError(404, 'NOT_FOUND', 'Produto não encontrado.')
    const row = data as unknown as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
    const categories = categoriesOf(row, false)
    return ok({
      ...toAdminListItem(row),
      category_ids: categories.map((c) => c.id),
      description: row.description as string,
      material: row.material ?? null,
      size_description: row.size_description ?? null,
      images: imagesOf(row),
      variants: (row.product_variants ?? []).filter((v: { is_active: boolean }) => v.is_active),
      addons: (row.product_addons ?? []).filter((a: { is_active: boolean }) => a.is_active),
      promotions: (row.promotions ?? []).filter((p: { is_active: boolean }) => p.is_active),
    })
  }

  if (req.method === 'PATCH') {
    const { category_ids, ...fields } = await readJson(req, productPatch)
    if (!category_ids && Object.keys(fields).length === 0) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Nada para atualizar.')
    }
    await productExists(db, id)
    const categories = category_ids ? await assertCategories(db, category_ids) : null

    if (Object.keys(fields).length) assertDb((await db.from('products').update(fields).eq('id', id)).error)
    if (categories) assertDb((await db.rpc('catalog_set_product_categories', { p_product: id, p_categories: categories })).error)

    const action = fields.is_approved !== undefined ? 'product.approval' : 'product.update'
    await audit(db, adminId, action, 'product', id, { fields: [...Object.keys(fields), ...(category_ids ? ['category_ids'] : [])] })
    return ok({ id })
  }

  if (req.method === 'DELETE') {
    // RN17 (atômico no banco): com pedidos só inativa; sem pedidos exclui e devolve as fotos para limpar.
    const { data, error } = await db.rpc('catalog_delete_product', { p_product: id })
    assertDb(error)
    const result = data as { status: 'deleted' | 'deactivated'; paths: string[] }

    // O registro no banco é a fonte da verdade. Falha ao apagar arquivos só deixa lixo no Storage: registra e segue.
    if (result.paths.length) {
      const cleanup = await db.storage.from(BUCKET).remove(result.paths)
      if (cleanup.error) console.error('storage_cleanup_failed', result.paths.length)
    }
    await audit(db, adminId, result.status === 'deleted' ? 'product.delete' : 'product.deactivate', 'product', id)
    return ok({ deleted: result.status === 'deleted', deactivated: result.status === 'deactivated' })
  }
  throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Método não permitido.')
}

async function assertPromotionPrice(db: SupabaseClient, productId: string, price: number): Promise<void> {
  if (price >= (await getBasePrice(db, productId))) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'O preço promocional deve ser menor que o preço original.')
  }
}

async function child(
  req: Request, db: SupabaseClient, adminId: string,
  productId: string, key: ChildKey, childId?: string,
): Promise<Response> {
  const cfg = CHILDREN[key]
  const entity = `product_${key}`

  if (req.method === 'POST' && !childId) {
    const input = (await readJson(req, cfg.create)) as Record<string, unknown>
    if (key === 'promotions') await assertPromotionPrice(db, productId, input.promotional_price as number)
    else await getBasePrice(db, productId)
    const { data, error } = await db.from(cfg.table).insert({ ...input, product_id: productId }).select().single()
    assertDb(error)
    await audit(db, adminId, `${entity}.create`, entity, data.id, { product_id: productId })
    return ok(data, 201)
  }

  if (!childId) throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Método não permitido.')

  if (req.method === 'PATCH') {
    const input = (await readJson(req, cfg.patch)) as Record<string, unknown>
    if (Object.keys(input).length === 0) throw new HttpError(400, 'VALIDATION_ERROR', 'Nada para atualizar.')
    if (key === 'promotions') {
      if (typeof input.promotional_price === 'number') await assertPromotionPrice(db, productId, input.promotional_price)
      if (input.starts_at && input.ends_at && new Date(input.ends_at as string) <= new Date(input.starts_at as string)) {
        throw new HttpError(400, 'VALIDATION_ERROR', 'A data final deve ser posterior à inicial.')
      }
    }
    const { data, error } = await db.from(cfg.table).update(input).eq('id', childId).eq('product_id', productId).select()
    assertDb(error)
    if (!data?.length) throw new HttpError(404, 'NOT_FOUND', 'Registro não encontrado.')
    await audit(db, adminId, `${entity}.update`, entity, childId, { product_id: productId })
    return ok(data[0])
  }

  if (req.method === 'DELETE') {
    // Desativa em vez de apagar: carrinhos e histórico podem referenciar o registro.
    const { data, error } = await db
      .from(cfg.table).update({ is_active: false }).eq('id', childId).eq('product_id', productId).select('id')
    assertDb(error)
    if (!data?.length) throw new HttpError(404, 'NOT_FOUND', 'Registro não encontrado.')
    await audit(db, adminId, `${entity}.deactivate`, entity, childId, { product_id: productId })
    return noContent()
  }
  throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Método não permitido.')
}

export default async (req: Request): Promise<Response> =>
  handle(async () => {
    const admin = await requireAdmin(req)
    const db = supabaseAdmin()
    // /api/admin/products/:id/:sub/:childId
    const parts = new URL(req.url).pathname.replace(/\/+$/, '').split('/').filter(Boolean)
    const [, , , rawId, sub, rawChild] = parts

    if (!rawId) return collection(req, db, admin.id)
    const id = uuid.parse(rawId)
    if (!sub) return item(req, db, admin.id, id)
    if (sub in CHILDREN) return child(req, db, admin.id, id, sub as ChildKey, rawChild ? uuid.parse(rawChild) : undefined)
    throw new HttpError(404, 'NOT_FOUND', 'Rota não encontrada.')
  })
