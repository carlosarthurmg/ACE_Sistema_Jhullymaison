// GET /api/categories: somente categorias ativas (RF03, RF06)
import type { Config } from '@netlify/functions'
import { assertDb, handle, HttpError } from './_shared/catalog-errors'
import { ok } from './_shared/response'
import { supabaseAdmin } from './_shared/supabase'

export const config: Config = { path: '/api/categories' }

export default async (req: Request): Promise<Response> =>
  handle(async () => {
    if (req.method !== 'GET') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Método não permitido.')
    const { data, error } = await supabaseAdmin()
      .from('categories')
      .select('id,name,slug,description')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
    assertDb(error)
    return ok(data ?? [])
  })
