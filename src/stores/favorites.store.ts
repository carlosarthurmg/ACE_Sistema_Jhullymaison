// STUB local: o oficial é da store de favoritos do projeto.
import { reactive } from 'vue'

const ids = reactive(new Set<string>())
export const useFavoritesStore = () => ({
  isFavorite: (id: string) => ids.has(id),
  toggle: async (id: string) => { if (ids.has(id)) ids.delete(id); else ids.add(id) },
  load: async () => {},
})
