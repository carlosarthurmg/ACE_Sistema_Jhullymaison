// Todas as chamadas HTTP do catálogo ficam aqui. As telas não falam com o api-client diretamente.
// Usa o api-client CENTRAL (Carlos): api.get/post/patch/delete -> Promise<data>, ApiError com .status.
// Exceção: o upload de foto usa fetch direto, porque o api-client sempre envia JSON e o upload é multipart.
import type { ApiResponse } from '@/types/api.types'
import { api, ApiError } from './api-client'
import type {
  AdminCategory, AdminImage, AdminProductDetail, AdminProductListItem, CategorySummary,
  Paginated, ProductDetail, ProductListItem, ProductPayload,
} from '@/types/catalog.types'

export const errorMessage = (e: unknown): string =>
  e instanceof Error && e.message ? e.message : 'Algo deu errado. Tente novamente.'

export const errorStatus = (e: unknown): number | undefined => (e as { status?: number } | null)?.status

function qs(params: Record<string, string | number | undefined>): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ''
}

// ---------- público ----------
export interface ProductQuery { category?: string; search?: string; sort?: string; page?: number; pageSize?: number }

export const listCategories = () => api.get<CategorySummary[]>('/api/categories')

export const listProducts = (q: ProductQuery = {}) =>
  api.get<Paginated<ProductListItem>>(
    `/api/products${qs({ category: q.category, search: q.search, sort: q.sort, page: q.page, page_size: q.pageSize })}`,
  )

export const getProduct = (slug: string) => api.get<ProductDetail>(`/api/products/${encodeURIComponent(slug)}`)

// ---------- administração ----------
export const adminListCategories = () => api.get<AdminCategory[]>('/api/admin/categories')
export const adminCreateCategory = (body: { name: string; description: string | null }) =>
  api.post('/api/admin/categories', body)
export const adminUpdateCategory = (id: string, body: { name: string; description: string | null }) =>
  api.patch(`/api/admin/categories/${id}`, body)
export const adminDeleteCategory = (id: string, reassignTo?: string) =>
  api.delete(`/api/admin/categories/${id}${qs({ reassign_to: reassignTo })}`)

export const adminListProducts = (q: { status?: string; search?: string; page?: number }) =>
  api.get<Paginated<AdminProductListItem>>(`/api/admin/products${qs({ ...q, page_size: 20 })}`)
export const adminGetProduct = (id: string) => api.get<AdminProductDetail>(`/api/admin/products/${id}`)
export const adminCreateProduct = (body: ProductPayload) => api.post<{ id: string }>('/api/admin/products', body)
export const adminUpdateProduct = (id: string, body: Partial<ProductPayload>) => api.patch(`/api/admin/products/${id}`, body)
export const adminDeleteProduct = (id: string) =>
  api.delete<{ deleted: boolean; deactivated: boolean }>(`/api/admin/products/${id}`)

export type ChildKind = 'variants' | 'addons' | 'promotions'
export const adminAddChild = (productId: string, kind: ChildKind, body: object) =>
  api.post(`/api/admin/products/${productId}/${kind}`, body)
export const adminRemoveChild = (productId: string, kind: ChildKind, childId: string) =>
  api.delete(`/api/admin/products/${productId}/${kind}/${childId}`)

export async function adminUploadImage(productId: string, file: File, altText: string): Promise<AdminImage> {
  const body = new FormData()
  body.append('file', file)
  if (altText.trim()) body.append('alt_text', altText.trim())
  const res = await fetch(`/api/admin/products/${productId}/image`, { method: 'POST', credentials: 'same-origin', body })
  const payload = (await res.json().catch(() => null)) as ApiResponse<AdminImage> | null
  if (!res.ok || payload?.error || !payload?.data) {
    throw new ApiError(res.status, payload?.error?.code ?? 'UNKNOWN_ERROR', payload?.error?.message ?? 'Não foi possível enviar a foto.')
  }
  return payload.data
}
export const adminUpdateImage = (
  productId: string, imageId: string, body: { alt_text?: string | null; is_cover?: true; sort_order?: number },
) => api.patch(`/api/admin/products/${productId}/image/${imageId}`, body)
export const adminDeleteImage = (productId: string, imageId: string) =>
  api.delete(`/api/admin/products/${productId}/image/${imageId}`)
