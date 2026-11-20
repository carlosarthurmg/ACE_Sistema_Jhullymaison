<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import AppFooter from '@/components/layout/AppFooter.vue'
import ProductCard from '@/components/products/ProductCard.vue'
import { useCatalogFavorites } from '@/composables/useCatalogFavorites'
import { listCategories, listProducts } from '@/services/catalog.service'
import type { CategorySummary, ProductListItem } from '@/types/catalog.types'
import { STORE, whatsappUrl } from '@/utils/store-info'

const categories = ref<CategorySummary[]>([])
const featured = ref<ProductListItem[]>([])
const loadFailed = ref(false)
const favorites = useCatalogFavorites()

onMounted(async () => {
  favorites.load()
  try {
    const [cats, products] = await Promise.all([listCategories(), listProducts({ sort: 'newest', pageSize: 4 })])
    categories.value = cats
    featured.value = products.items
  } catch {
    loadFailed.value = true
  }
})
</script>

<template>
  <main class="bg-brand-cream text-brand-black">
    <section class="mx-auto grid max-w-5xl gap-8 px-4 pb-10 pt-10 md:grid-cols-2 md:items-center">
      <div>
        <h1 class="font-display text-4xl leading-tight sm:text-5xl">O presente passa. O carinho fica.</h1>
        <p class="mt-4 max-w-md text-base text-brand-black/70">Buquês, cestas e presentes para transformar pequenos momentos.</p>
        <div class="mt-6 flex flex-wrap gap-3">
          <RouterLink to="/catalogo" class="btn btn-primary">Encontre seu presente</RouterLink>
          <a :href="whatsappUrl()" target="_blank" rel="noopener" class="btn btn-secondary">Falar no WhatsApp</a>
        </div>
      </div>
      <div class="aspect-[4/5] overflow-hidden rounded-3xl bg-brand-black/5">
        <img v-if="featured[0]?.image_url" :src="featured[0].image_url" :alt="featured[0].image_alt" class="h-full w-full object-cover" />
      </div>
    </section>

    <section v-if="categories.length" class="mx-auto max-w-5xl px-4 py-8" aria-labelledby="home-categorias">
      <h2 id="home-categorias" class="font-display text-2xl">Para cada jeito de presentear</h2>
      <ul class="mt-4 grid gap-3 sm:grid-cols-3">
        <li v-for="c in categories" :key="c.id">
          <RouterLink :to="{ path: '/catalogo', query: { categoria: c.slug } }" class="card block h-full hover:border-brand-gold">
            <span class="text-base font-semibold">{{ c.name }}</span>
            <span v-if="c.description" class="mt-1 block text-base text-brand-black/70">{{ c.description }}</span>
          </RouterLink>
        </li>
      </ul>
    </section>

    <section v-if="featured.length" class="mx-auto max-w-5xl px-4 py-8" aria-labelledby="home-destaques">
      <div class="flex items-baseline justify-between">
        <h2 id="home-destaques" class="font-display text-2xl">Escolhas especiais</h2>
        <RouterLink to="/catalogo" class="text-base font-semibold text-brand-gold-dark underline-offset-4 hover:underline">Ver tudo</RouterLink>
      </div>
      <div class="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <ProductCard
          v-for="p in featured"
          :key="p.id"
          :product="p"
          show-favorite
          :favorited="favorites.isFavorite(p.id)"
          @toggle-favorite="favorites.toggle"
        />
      </div>
    </section>
    <p v-else-if="loadFailed" role="alert" class="mx-auto max-w-5xl px-4 py-8 text-base text-brand-black/70">
      Não foi possível carregar os presentes agora. Tente novamente em instantes.
    </p>

    <section class="mx-auto max-w-5xl px-4 py-8">
      <div class="rounded-3xl bg-brand-black p-8 text-brand-cream">
        <h2 class="font-display text-2xl">Um presente com a sua história.</h2>
        <p class="mt-2 max-w-md text-base text-brand-cream/80">{{ STORE.leadTimeNotice }}</p>
        <RouterLink to="/sobre" class="mt-4 inline-block text-base font-semibold text-brand-gold underline-offset-4 hover:underline">
          Conheça a {{ STORE.name }}
        </RouterLink>
      </div>
    </section>
    <AppFooter />
  </main>
</template>
