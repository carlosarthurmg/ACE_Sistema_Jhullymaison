<script setup lang="ts">
import { RouterLink } from 'vue-router'
import type { ProductListItem } from '@/types/catalog.types'
import { formatBRL } from '@/utils/catalog-format'

defineProps<{ product: ProductListItem; showFavorite?: boolean; favorited?: boolean }>()
defineEmits<{ (e: 'toggle-favorite', productId: string): void }>()
</script>

<template>
  <article>
    <div class="relative aspect-[4/5] overflow-hidden rounded-2xl bg-brand-black/5">
      <RouterLink :to="`/produto/${product.slug}`" class="block h-full" :aria-label="`Ver ${product.name}`">
        <img v-if="product.image_url" :src="product.image_url" :alt="product.image_alt" loading="lazy" class="h-full w-full object-cover" />
        <span v-else class="grid h-full place-items-center text-base text-brand-black/70">Sem foto</span>
      </RouterLink>
      <span v-if="product.on_promotion" class="absolute bottom-3 left-3 rounded-full bg-brand-cream px-3 py-1 text-sm font-bold text-brand-black">
        Promoção −{{ product.discount_percent }}%
      </span>
      <button
        v-if="showFavorite"
        type="button"
        class="absolute right-2 top-2 grid size-11 place-items-center rounded-full bg-brand-cream/95"
        :aria-pressed="favorited ? 'true' : 'false'"
        :aria-label="favorited ? `Remover ${product.name} dos favoritos` : `Favoritar ${product.name}`"
        @click="$emit('toggle-favorite', product.id)"
      >
        <svg viewBox="0 0 24 24" class="size-5" :fill="favorited ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />
        </svg>
      </button>
    </div>
    <h3 class="mt-3 text-base font-semibold">{{ product.name }}</h3>
    <p class="mt-0.5 text-base">
      <span class="font-bold">{{ formatBRL(product.effective_price) }}</span>
      <s v-if="product.on_promotion" class="ml-2 text-brand-black/70">
        <span class="sr-only">preço original</span>{{ formatBRL(product.base_price) }}
      </s>
    </p>
  </article>
</template>
