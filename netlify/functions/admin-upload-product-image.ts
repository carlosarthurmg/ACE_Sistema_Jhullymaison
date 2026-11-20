// Fotos do produto (RF07, RNF04, RNF18, RNF20).
//   POST   /api/admin/products/:id/image             multipart: "file" (+ "alt_text" opcional)
//   PATCH  /api/admin/products/:id/image/:imageId   JSON: { alt_text?, sort_order?, is_cover?: true }
//   DELETE /api/admin/products/:id/image/:imageId
// Consistência banco x Storage: o banco é a fonte da verdade.
//   envio: sobe o arquivo; se gravar no banco falhar, apaga o arquivo enviado.
//   exclusão: apaga a linha no banco primeiro; falha ao apagar o arquivo só é registrada em log.
import type { Config, Context } from '@netlify/functions'
import type { SupabaseClient } from '@supabase/supabase-js'
import { audit } from './_shared/audit'
import { BUCKET, imagesOf, IMAGE_FIELDS } from './_shared/catalog'
import { imagePatch, readJson, uuid } from './_shared/catalog-validation'
import { requireAdmin } from './_shared/permissions'
import { assertDb, handle, HttpError } from './_shared/catalog-errors'
import { noContent, ok } from './_shared/response'
import { supabaseAdmin } from './_shared/supabase'

export const config: Config = {
  path: ['/api/admin/products/:id/image', '/api/admin/products/:id/image/:imageId'],
}

const MAX_UPLOAD_SIZE = 2 * 1024 * 1024 // 2 MB (o frontend já comprime para WebP)
const MAX_IMAGES = 8
const CONTENT_TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as const

export function detectImageType(b: Uint8Array): keyof typeof CONTENT_TYPES | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg'
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png'
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to))
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp'
  return null
}

async function removeFile(db: SupabaseClient, path: string, reason: string): Promise<void> {
  const { error } = await db.storage.from(BUCKET).remove([path])
  if (error) console.error('storage_cleanup_failed', reason)
}

async function upload(req: Request, db: SupabaseClient, adminId: string, productId: string): Promise<Response> {
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Envie a foto no campo "file".')
  }
  const file = form.get('file')
  if (!(file instanceof File)) throw new HttpError(400, 'VALIDATION_ERROR', 'Envie a foto no campo "file".')
  if (file.size === 0 || file.size > MAX_UPLOAD_SIZE) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'A foto deve ter no máximo 2 MB.')
  }
  const rawAlt = form.get('alt_text')
  const alt = typeof rawAlt === 'string' ? rawAlt.trim().slice(0, 200) : ''

  const bytes = new Uint8Array(await file.arrayBuffer())
  const ext = detectImageType(bytes)
  if (!ext) throw new HttpError(400, 'VALIDATION_ERROR', 'Use uma foto JPG, PNG ou WebP.')

  const { data: product, error } = await db.from('products').select('name').eq('id', productId).maybeSingle()
  assertDb(error)
  if (!product) throw new HttpError(404, 'NOT_FOUND', 'Produto não encontrado.')

  const { count, error: countError } = await db
    .from('product_images').select('id', { count: 'exact', head: true }).eq('product_id', productId)
  assertDb(countError)
  if ((count ?? 0) >= MAX_IMAGES) throw new HttpError(400, 'VALIDATION_ERROR', `Cada produto aceita até ${MAX_IMAGES} fotos.`)

  // Nome gerado no servidor: o nome enviado pelo usuário nunca é usado.
  const path = `products/${productId}/${crypto.randomUUID()}.${ext}`
  const sent = await db.storage.from(BUCKET).upload(path, bytes, {
    contentType: CONTENT_TYPES[ext], upsert: false, cacheControl: '31536000',
  })
  if (sent.error) {
    console.error('upload_error')
    throw new HttpError(500, 'INTERNAL_ERROR', 'Não foi possível enviar a foto.')
  }

  const { data: image, error: insertError } = await db
    .from('product_images')
    .insert({
      product_id: productId,
      storage_path: path,
      alt_text: alt || (product.name as string),
      sort_order: count ?? 0,
      is_cover: (count ?? 0) === 0, // a primeira foto vira a capa
    })
    .select(IMAGE_FIELDS)
    .single()
  if (insertError) {
    await removeFile(db, path, 'rollback_after_insert_error') // não deixa arquivo órfão
    assertDb(insertError)
  }

  await audit(db, adminId, 'product.image.add', 'product', productId)
  return ok(imagesOf({ product_images: [image] })[0], 201)
}

async function update(req: Request, db: SupabaseClient, adminId: string, productId: string, imageId: string) {
  const { is_cover, ...fields } = await readJson(req, imagePatch)
  if (!is_cover && Object.keys(fields).length === 0) throw new HttpError(400, 'VALIDATION_ERROR', 'Nada para atualizar.')

  if (Object.keys(fields).length) {
    const { data, error } = await db
      .from('product_images').update(fields).eq('id', imageId).eq('product_id', productId).select('id')
    assertDb(error)
    if (!data?.length) throw new HttpError(404, 'NOT_FOUND', 'Foto não encontrada.')
  }
  // Troca de capa em uma única transação no banco.
  if (is_cover) assertDb((await db.rpc('catalog_set_cover', { p_product: productId, p_image: imageId })).error)

  await audit(db, adminId, 'product.image.update', 'product', productId)
  return ok({ id: imageId })
}

async function remove(db: SupabaseClient, adminId: string, productId: string, imageId: string) {
  const { data: image, error } = await db
    .from('product_images').select('storage_path,is_cover').eq('id', imageId).eq('product_id', productId).maybeSingle()
  assertDb(error)
  if (!image) throw new HttpError(404, 'NOT_FOUND', 'Foto não encontrada.')

  assertDb((await db.from('product_images').delete().eq('id', imageId)).error) // banco primeiro
  await removeFile(db, image.storage_path as string, 'delete_image')

  if (image.is_cover) {
    // Promove a próxima foto a capa. Se falhar, o produto só fica sem capa (a vitrine usa a primeira foto).
    const { data: next } = await db
      .from('product_images').select('id').eq('product_id', productId).order('sort_order').limit(1)
    if (next?.length) {
      const promote = await db.rpc('catalog_set_cover', { p_product: productId, p_image: next[0].id })
      if (promote.error) console.error('promote_cover_failed', promote.error.code)
    }
  }
  await audit(db, adminId, 'product.image.delete', 'product', productId)
  return noContent()
}

export default async (req: Request, ctx: Context): Promise<Response> =>
  handle(async () => {
    const admin = await requireAdmin(req)
    const db = supabaseAdmin()
    const productId = uuid.parse(ctx.params?.id)
    const imageId = ctx.params?.imageId ? uuid.parse(ctx.params.imageId) : undefined

    if (!imageId && req.method === 'POST') return upload(req, db, admin.id, productId)
    if (imageId && req.method === 'PATCH') return update(req, db, admin.id, productId, imageId)
    if (imageId && req.method === 'DELETE') return remove(db, admin.id, productId, imageId)
    throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Método não permitido.')
  })

