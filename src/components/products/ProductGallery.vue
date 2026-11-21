<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ProductImage } from '@/types/catalog.types'

const props = defineProps<{ images: ProductImage[]; fallbackAlt: string }>()
const current = ref(0)
const selected = computed(() => props.images[current.value])
const altOf = (img: ProductImage) => img.alt_text || props.fallbackAlt
</script>

<template>
  <div>
    <div class="aspect-[4/5] overflow-hidden rounded-2xl bg-brand-black/5">
      <img v-if="selected" :src="selected.url" :alt="altOf(selected)" class="h-full w-full object-cover" />
      <span v-else class="grid h-full place-items-center text-base text-brand-black/70">Sem foto</span>
    </div>
    <ul v-if="images.length > 1" class="mt-3 flex flex-wrap gap-2">
      <li v-for="(img, i) in images" :key="img.id">
        <button
          type="button"
          class="size-16 overflow-hidden rounded-lg border-2"
          :class="i === current ? 'border-brand-gold' : 'border-transparent'"
          :aria-label="`Ver foto ${i + 1} de ${images.length}`"
          :aria-current="i === current ? 'true' : undefined"
          @click="current = i"
        >
          <img :src="img.url" alt="" class="h-full w-full object-cover" />
        </button>
      </li>
    </ul>
  </div>
</template>
