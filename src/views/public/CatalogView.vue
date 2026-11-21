<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AppFooter from '@/components/layout/AppFooter.vue'
import ProductCard from '@/components/products/ProductCard.vue'
import { useCatalogFavorites } from '@/composables/useCatalogFavorites'
import { errorMessage, listCategories, listProducts } from '@/services/catalog.service'
import type { CategorySummary, ProductListItem } from '@/types/catalog.types'

const SORTS = [
  { value: 'newest', label: 'Mais recentes' },
  { value: 'price_asc', label: 'Menor preço' },
  { value: 'price_desc', label: 'Maior preço' },
  { value: 'name', label: 'Nome (A–Z)' },
]
const PAGE_SIZE = 12

const route = useRoute()
const router = useRouter()
const favorites = useCatalogFavorites()
const categories = ref<CategorySummary[]>([])
const items = ref<ProductListItem[]>([])
const total = ref(0)
const page = ref(1)
const loading = ref(true)
const error = ref('')

const categorySlug = computed(() => (typeof route.query.categoria === 'string' ? route.query.categoria : ''))
const searchTerm = computed(() => (typeof route.query.q === 'string' ? route.query.q : ''))
const sort = computed(() => {
  const s = route.query.ordem
  return typeof s === 'string' && SORTS.some((o) => o.value === s) ? s : 'newest'
})
const searchInput = ref(searchTerm.value)

function queryWith(patch: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries({ ...route.query, ...patch })) {
    if (typeof v === 'string' && v) out[k] = v
  }
  return out
}

async function load(reset: boolean) {
  loading.value = true
  error.value = ''
  if (reset) {
    page.value = 1
    items.value = []
  }
  try {
    const data = await listProducts({
      category: categorySlug.value, search: searchTerm.value, sort: sort.value, page: page.value, pageSize: PAGE_SIZE,
    })
    items.value = reset ? data.items : [...items.value, ...data.items]
    total.value = data.total
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}

function loadMore() {
  page.value += 1
  load(false)
}
function submitSearch() {
  router.push({ path: '/catalogo', query: queryWith({ q: searchInput.value.trim() || undefined }) })
}
function changeSort(event: Event) {
  router.push({ path: '/catalogo', query: queryWith({ ordem: (event.target as HTMLSelectElement).value }) })
}

onMounted(async () => {
  favorites.load()
  try {
    categories.value = await listCategories()
  } catch {
    categories.value = []
  }
})
watch(() => route.fullPath, () => load(true), { immediate: true })
</script>

<template>
  <main class="bg-brand-cream text-brand-black">
    <div class="mx-auto max-w-5xl px-4 pt-8">
      <h1 class="font-display text-3xl sm:text-4xl">Presentes que dizem tudo.</h1>
      <p class="mt-2 max-w-prose text-base text-brand-black/70">Escolha uma categoria e encontre o seu próximo gesto de carinho.</p>

      <nav aria-label="Categorias" class="mt-6 flex flex-wrap gap-2">
        <RouterLink
          :to="{ path: '/catalogo', query: queryWith({ categoria: undefined }) }"
          class="chip"
          :class="{ 'chip-active': !categorySlug }"
          :aria-current="!categorySlug ? 'page' : undefined"
        >Todos</RouterLink>
        <RouterLink
          v-for="c in categories"
          :key="c.id"
          :to="{ path: '/catalogo', query: queryWith({ categoria: c.slug }) }"
          class="chip"
          :class="{ 'chip-active': categorySlug === c.slug }"
          :aria-current="categorySlug === c.slug ? 'page' : undefined"
        >{{ c.name }}</RouterLink>
      </nav>

      <div class="mt-4 flex flex-col gap-3 sm:flex-row">
        <form role="search" class="flex flex-1 gap-2" @submit.prevent="submitSearch">
          <label for="catalog-search" class="sr-only-label">Buscar presente</label>
          <input id="catalog-search" v-model="searchInput" type="search" class="field" placeholder="Buscar presente" maxlength="60" />
          <button type="submit" class="btn btn-secondary">Buscar</button>
        </form>
        <div>
          <label for="catalog-sort" class="sr-only-label">Ordenar por</label>
          <select id="catalog-sort" class="field" :value="sort" @change="changeSort">
            <option v-for="o in SORTS" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
        </div>
      </div>

      <p v-if="!loading && !error" class="mt-6 text-base text-brand-black/70" aria-live="polite">
        {{ total }} {{ total === 1 ? 'presente' : 'presentes' }}
      </p>

      <div v-if="error" role="alert" class="mt-8 rounded-2xl border border-brand-black/15 bg-white p-6 text-center text-base">
        <p>{{ error }}</p>
        <button type="button" class="btn btn-secondary mt-4" @click="load(true)">Tentar de novo</button>
      </div>

      <div v-else-if="loading && !items.length" class="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4" aria-busy="true">
        <div v-for="n in 4" :key="n" class="aspect-[4/5] animate-pulse rounded-2xl bg-brand-black/5" />
      </div>

      <div v-else-if="!items.length" class="mt-8 rounded-2xl border border-brand-black/15 bg-white p-8 text-center">
        <p class="font-display text-xl">Nenhum presente encontrado.</p>
        <p class="mt-1 text-base text-brand-black/70">Tente outra categoria ou limpe a busca.</p>
        <RouterLink to="/catalogo" class="btn btn-secondary mt-4">Ver todos</RouterLink>
      </div>

      <div v-else class="mt-4 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">
        <ProductCard
          v-for="p in items"
          :key="p.id"
          :product="p"
          show-favorite
          :favorited="favorites.isFavorite(p.id)"
          @toggle-favorite="favorites.toggle"
        />
      </div>

      <div v-if="items.length && items.length < total" class="mt-10 text-center">
        <button type="button" class="btn btn-secondary" :disabled="loading" @click="loadMore">
          {{ loading ? 'Carregando…' : 'Ver mais presentes' }}
        </button>
      </div>
    </div>
    <AppFooter />
  </main>
</template>
