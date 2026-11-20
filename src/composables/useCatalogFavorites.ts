// Ponte entre o catálogo e a store de favoritos (RF12, RF13, RN09: favoritar exige conta).
// ASSUNÇÃO: a store do projeto expõe isFavorite(id), toggle(id) e load(). Se os nomes forem outros,
// ajuste SOMENTE este arquivo.
import { useRoute, useRouter } from 'vue-router'
import { useFavoritesStore } from '@/stores/favorites.store'
import { errorStatus } from '@/services/catalog.service'

export function useCatalogFavorites() {
  const store = useFavoritesStore()
  const router = useRouter()
  const route = useRoute()

  /** Carrega os favoritos do cliente logado. Visitante (401) simplesmente não tem favoritos. */
  async function load(): Promise<void> {
    try {
      await store.load()
    } catch (e) {
      if (errorStatus(e) !== 401) console.error('favorites_load_failed')
    }
  }

  async function toggle(productId: string): Promise<void> {
    try {
      await store.toggle(productId)
    } catch (e) {
      // Visitante: leva para o login e volta para a mesma página.
      if (errorStatus(e) === 401) await router.push({ path: '/login', query: { redirect: route.fullPath } })
      else throw e
    }
  }

  return { isFavorite: (productId: string): boolean => store.isFavorite(productId), load, toggle }
}
