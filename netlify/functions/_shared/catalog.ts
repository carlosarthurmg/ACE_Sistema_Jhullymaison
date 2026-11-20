import { PromotionRow, resolvePrice, variantEffectivePrice } from './pricing'

export const BUCKET = 'product-images'
export const PROMO_FIELDS = 'id,promotional_price,starts_at,ends_at,is_active'
export const IMAGE_FIELDS = 'id,storage_path,alt_text,sort_order,is_cover'
export const CATEGORY_EMBED = 'product_categories(categories(id,name,slug,is_active))'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>

export function publicUrl(path: string): string {
  return `${process.env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`
}

export type Visibility = 'published' | 'awaiting_approval' | 'inactive' | 'out_of_stock'

export function visibility(p: { is_approved: boolean; is_active: boolean; stock_quantity: number }): Visibility {
  if (!p.is_approved) return 'awaiting_approval'
  if (!p.is_active) return 'inactive'
  if (p.stock_quantity <= 0) return 'out_of_stock'
  return 'published'
}

/** Capa primeiro; depois pela ordem escolhida. */
export function imagesOf(row: Row) {
  return ((row.product_images ?? []) as Row[])
    .slice()
    .sort((a, b) => Number(b.is_cover) - Number(a.is_cover) || a.sort_order - b.sort_order)
    .map((i) => ({
      id: i.id as string,
      url: publicUrl(i.storage_path as string),
      alt_text: (i.alt_text ?? null) as string | null,
      is_cover: Boolean(i.is_cover),
      sort_order: i.sort_order as number,
    }))
}

export function categoriesOf(row: Row, onlyActive: boolean) {
  return ((row.product_categories ?? []) as Row[])
    .map((pc) => pc.categories as Row | null)
    .filter((c): c is Row => !!c && (!onlyActive || c.is_active !== false))
    .map((c) => ({ id: c.id as string, name: c.name as string, slug: c.slug as string }))
}

/** Contrato público de produto (item de lista). */
export function toListItem(row: Row) {
  const price = resolvePrice(row.base_price, row.promotions as PromotionRow[])
  const cover = imagesOf(row)[0]
  return {
    id: row.id as string,
    slug: row.slug as string,
    name: row.name as string,
    categories: categoriesOf(row, true),
    ...price,
    stock_available: row.stock_quantity as number,
    image_url: cover?.url ?? null,
    image_alt: cover?.alt_text || (row.name as string),
  }
}

/** Contrato público de produto (detalhe), consumido pelo carrinho do João. Preços já com a regra 4.5. */
export function toDetail(row: Row) {
  const promotions = row.promotions as PromotionRow[]
  const variants = ((row.product_variants ?? []) as Row[])
    .filter((v) => v.is_active)
    .map((v) => ({
      id: v.id as string,
      name: v.name as string,
      original_price: Number(v.price),
      price: variantEffectivePrice(v.price, row.base_price, promotions),
    }))
    .sort((a, b) => a.original_price - b.original_price)
  const addons = ((row.product_addons ?? []) as Row[])
    .filter((a) => a.is_active)
    .map((a) => ({ id: a.id as string, name: a.name as string, price: Number(a.price) }))
  return {
    ...toListItem(row),
    description: row.description as string,
    material: (row.material ?? null) as string | null,
    size_description: (row.size_description ?? null) as string | null,
    images: imagesOf(row).map(({ id, url, alt_text, is_cover }) => ({ id, url, alt_text, is_cover })),
    variants,
    addons,
  }
}

export function toAdminListItem(row: Row) {
  const cover = imagesOf(row)[0]
  return {
    id: row.id as string,
    slug: row.slug as string,
    name: row.name as string,
    categories: categoriesOf(row, false),
    base_price: Number(row.base_price),
    stock_quantity: row.stock_quantity as number,
    is_approved: row.is_approved as boolean,
    is_active: row.is_active as boolean,
    visibility: visibility(row as { is_approved: boolean; is_active: boolean; stock_quantity: number }),
    image_url: cover?.url ?? null,
  }
}
