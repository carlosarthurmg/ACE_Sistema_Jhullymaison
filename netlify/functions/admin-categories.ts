// Administração de categorias. RF06 | RN03, RN10
// GET /api/admin/categories · POST · PATCH /:id · DELETE /:id[?reassign_to=<uuid>]
import type { Config, Context } from '@netlify/functions'
import { audit } from './_shared/audit'
import { categoryInput, categoryPatch, readJson, slugify, uuid } from './_shared/catalog-validation'
import { requireAdmin } from './_shared/permissions'
import { assertDb, handle, HttpError } from './_shared/catalog-errors'
import { noContent, ok } from './_shared/response'
import { supabaseAdmin } from './_shared/supabase'

export const config: Config = { path: ['/api/admin/categories', '/api/admin/categories/:id'] }

export default async (req: Request, ctx: Context): Promise<Response> =>
  handle(async () => {
    const admin = await requireAdmin(req)
    const db = supabaseAdmin()
    const rawId = ctx.params?.id
    const id = rawId ? uuid.parse(rawId) : undefined

    if (req.method === 'GET' && !id) {
      const { data, error } = await db
        .from('categories')
        .select('id,name,slug,description,is_active,sort_order,product_categories(count)')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true })
      assertDb(error)
      const items = (data ?? []).map((c) => {
        const { product_categories, ...rest } = c as typeof c & { product_categories?: { count: number }[] }
        return { ...rest, product_count: product_categories?.[0]?.count ?? 0 }
      })
      return ok(items)
    }

    if (req.method === 'POST' && !id) {
      const input = await readJson(req, categoryInput)
      const slug = slugify(input.name)
      if (!slug) throw new HttpError(400, 'VALIDATION_ERROR', 'Informe um nome válido.')
      const { data, error } = await db.from('categories').insert({ ...input, slug }).select().single()
      if (error?.code === '23505') throw new HttpError(409, 'CONFLICT', 'Já existe uma categoria com esse nome.')
      assertDb(error)
      await audit(db, admin.id, 'category.create', 'category', data.id)
      return ok(data, 201)
    }

    if (!id) throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Método não permitido.')

    if (req.method === 'PATCH') {
      const input = await readJson(req, categoryPatch)
      if (Object.keys(input).length === 0) throw new HttpError(400, 'VALIDATION_ERROR', 'Nada para atualizar.')
      const { data, error } = await db.from('categories').update(input).eq('id', id).select()
      if (error?.code === '23505') throw new HttpError(409, 'CONFLICT', 'Já existe uma categoria com esse nome.')
      assertDb(error)
      if (!data?.length) throw new HttpError(404, 'NOT_FOUND', 'Categoria não encontrada.')
      await audit(db, admin.id, 'category.update', 'category', id)
      return ok(data[0])
    }

    if (req.method === 'DELETE') {
      // RN10: categoria com produtos só pode ser excluída depois de realocá-los.
      const { count, error: countError } = await db
        .from('product_categories')
        .select('product_id', { count: 'exact', head: true })
        .eq('category_id', id)
      assertDb(countError)

      if ((count ?? 0) > 0) {
        const reassign = new URL(req.url).searchParams.get('reassign_to')
        if (!reassign) {
          throw new HttpError(409, 'CATEGORY_HAS_PRODUCTS', 'Mova os produtos para outra categoria antes de excluir.')
        }
        const target = uuid.parse(reassign)
        if (target === id) throw new HttpError(400, 'VALIDATION_ERROR', 'Escolha outra categoria de destino.')
        // Movimentação atômica (uma transação no banco): ou move todos ou nenhum.
        assertDb((await db.rpc('catalog_reassign_category', { p_from: id, p_to: target })).error)
      }

      const { error } = await db.from('categories').delete().eq('id', id)
      assertDb(error)
      await audit(db, admin.id, 'category.delete', 'category', id, { moved_products: count ?? 0 })
      return noContent()
    }

    throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Método não permitido.')
  })
