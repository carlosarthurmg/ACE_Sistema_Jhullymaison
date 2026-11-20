// Rotas do catálogo. No router/index.ts do projeto:  routes: [...catalogRoutes, ...]
// `requiresAdmin` é lido pelo guard do Carlos (o servidor valida de novo em toda chamada).
import type { RouteRecordRaw } from 'vue-router'

export const catalogRoutes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: () => import('@/views/public/HomeView.vue') },
  { path: '/catalogo', name: 'catalog', component: () => import('@/views/public/CatalogView.vue') },
  { path: '/produto/:slug', name: 'product-detail', component: () => import('@/views/public/ProductDetailView.vue') },
  { path: '/sobre', name: 'about', component: () => import('@/views/public/AboutView.vue') },
  {
    path: '/admin/produtos',
    name: 'admin-products',
    component: () => import('@/views/admin/AdminProductsView.vue'),
    meta: { requiresAdmin: true },
  },
  {
    path: '/admin/produtos/novo',
    name: 'admin-product-new',
    component: () => import('@/views/admin/AdminProductFormView.vue'),
    meta: { requiresAdmin: true },
  },
  {
    path: '/admin/produtos/:id',
    name: 'admin-product-edit',
    component: () => import('@/views/admin/AdminProductFormView.vue'),
    meta: { requiresAdmin: true },
  },
  {
    path: '/admin/categorias',
    name: 'admin-categories',
    component: () => import('@/views/admin/AdminCategoriesView.vue'),
    meta: { requiresAdmin: true },
  },
]
