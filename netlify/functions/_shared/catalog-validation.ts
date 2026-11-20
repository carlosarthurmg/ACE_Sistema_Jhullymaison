import { z } from 'zod'
import { HttpError } from './catalog-errors'

export const uuid = z.string().uuid()

const text = (max: number) => z.string().trim().max(max)
const money = z.number().min(0).max(99999999.99)

export const categoryInput = z
  .object({
    name: text(80).min(2),
    description: text(500).nullable().optional(),
    is_active: z.boolean().optional(),
    sort_order: z.number().int().min(0).max(9999).optional(),
  })
  .strict()
export const categoryPatch = categoryInput.partial()

// RN10: pelo menos uma categoria (Adendo 4.2).
export const productInput = z
  .object({
    category_ids: z.array(uuid).min(1).max(10),
    name: text(150).min(2),
    description: text(2000).min(1),
    material: text(100).nullable().optional(),
    size_description: text(50).nullable().optional(),
    base_price: money,
    stock_quantity: z.number().int().min(0).max(100000),
    is_approved: z.boolean().optional(),
    is_active: z.boolean().optional(),
  })
  .strict()
export const productPatch = productInput.partial()

// RF33: variação com preço próprio.
export const variantInput = z
  .object({ name: text(100).min(1), price: money, is_active: z.boolean().optional() })
  .strict()
export const variantPatch = variantInput.partial()

export const addonInput = z
  .object({ name: text(100).min(1), price: money, is_active: z.boolean().optional() })
  .strict()
export const addonPatch = addonInput.partial()

const promotionBase = z
  .object({
    promotional_price: money,
    starts_at: z.string().datetime({ offset: true }),
    ends_at: z.string().datetime({ offset: true }),
    is_active: z.boolean().optional(),
  })
  .strict()
export const promotionInput = promotionBase.refine((p) => new Date(p.ends_at) > new Date(p.starts_at), {
  message: 'A data final deve ser posterior à inicial.',
  path: ['ends_at'],
})
export const promotionPatch = promotionBase.partial()

export const imagePatch = z
  .object({
    alt_text: text(200).nullable().optional(),
    sort_order: z.number().int().min(0).max(99).optional(),
    is_cover: z.literal(true).optional(), // para trocar a capa, marque outra foto como capa
  })
  .strict()

export async function readJson<S extends z.ZodTypeAny>(req: Request, schema: S): Promise<z.infer<S>> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Corpo da requisição inválido.')
  }
  return schema.parse(body)
}

export function clampInt(value: string | null, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(value ?? '', 10)
  if (Number.isNaN(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

/** Remove caracteres especiais do filtro PostgREST antes de usar em ilike. */
export function cleanSearch(value: string | null): string {
  return (value ?? '').replace(/[%,()*\\_]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
}
