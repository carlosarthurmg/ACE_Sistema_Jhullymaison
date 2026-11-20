// Tipos do contrato de catálogo (arquivo próprio para não editar o domain.types.ts compartilhado).
// O João consome ProductDetail no carrinho; o Carlos pode reexportar estes tipos em domain.types.ts.
export interface CategorySummary { id: string; name: string; slug: string; description?: string | null }

export interface ProductImage { id: string; url: string; alt_text: string | null; is_cover: boolean }

export interface ProductListItem {
  id: string
  slug: string
  name: string
  categories: CategorySummary[]
  base_price: number
  effective_price: number
  on_promotion: boolean
  discount_percent: number
  stock_available: number
  image_url: string | null
  image_alt: string
}

/** price = preço efetivo da variação (já com a regra 4.5); original_price = preço cadastrado. */
export interface ProductVariant { id: string; name: string; price: number; original_price: number }
export interface ProductAddon { id: string; name: string; price: number }

export interface ProductDetail extends ProductListItem {
  description: string
  material: string | null
  size_description: string | null
  images: ProductImage[]
  variants: ProductVariant[]
  addons: ProductAddon[]
}

export interface Paginated<T> { items: T[]; page: number; page_size: number; total: number }

export type ProductVisibility = 'published' | 'awaiting_approval' | 'inactive' | 'out_of_stock'

export interface AdminProductListItem {
  id: string
  slug: string
  name: string
  categories: CategorySummary[]
  base_price: number
  stock_quantity: number
  is_approved: boolean
  is_active: boolean
  visibility: ProductVisibility
  image_url: string | null
}
export interface AdminVariant { id: string; name: string; price: number; is_active: boolean }
export interface AdminAddon { id: string; name: string; price: number; is_active: boolean }
export interface AdminPromotion { id: string; promotional_price: number; starts_at: string; ends_at: string; is_active: boolean }
export interface AdminImage extends ProductImage { sort_order: number }
export interface AdminProductDetail extends AdminProductListItem {
  category_ids: string[]
  description: string
  material: string | null
  size_description: string | null
  images: AdminImage[]
  variants: AdminVariant[]
  addons: AdminAddon[]
  promotions: AdminPromotion[]
}
export interface AdminCategory {
  id: string; name: string; slug: string; description: string | null
  is_active: boolean; sort_order: number; product_count: number
}

/** Corpo de criação/edição de produto. */
export interface ProductPayload {
  name: string
  description: string
  material: string | null
  size_description: string | null
  base_price: number
  category_ids: string[]
  stock_quantity: number
  is_approved: boolean
  is_active: boolean
}

/** Seleção feita em ProductOptions. */
export interface OptionSelection { variantId: string | null; addonIds: string[] }
