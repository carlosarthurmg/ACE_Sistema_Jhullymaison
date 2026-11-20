<script setup lang="ts">
import type { OptionSelection, ProductAddon, ProductVariant } from '@/types/catalog.types'
import { formatBRL } from '@/utils/catalog-format'

const props = defineProps<{ variants: ProductVariant[]; addons: ProductAddon[]; modelValue: OptionSelection }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: OptionSelection): void }>()

function pickVariant(id: string) {
  emit('update:modelValue', { ...props.modelValue, variantId: id })
}
function toggleAddon(id: string, checked: boolean) {
  const ids = checked ? [...props.modelValue.addonIds, id] : props.modelValue.addonIds.filter((x) => x !== id)
  emit('update:modelValue', { ...props.modelValue, addonIds: ids })
}
</script>

<template>
  <div class="space-y-6">
    <fieldset v-if="variants.length" class="space-y-2">
      <legend class="mb-2 text-base font-semibold">Escolha uma opção</legend>
      <label
        v-for="v in variants"
        :key="v.id"
        class="flex min-h-11 cursor-pointer items-center justify-between rounded-xl border bg-white px-4 py-3"
        :class="modelValue.variantId === v.id ? 'border-brand-gold' : 'border-brand-black/15'"
      >
        <span class="flex items-center gap-3">
          <input type="radio" name="variant" class="size-5" :value="v.id" :checked="modelValue.variantId === v.id" @change="pickVariant(v.id)" />
          <span class="font-medium">{{ v.name }}</span>
        </span>
        <span class="text-base text-brand-black/70">
          {{ formatBRL(v.price) }}
          <s v-if="v.price < v.original_price" class="ml-1"><span class="sr-only">preço original</span>{{ formatBRL(v.original_price) }}</s>
        </span>
      </label>
    </fieldset>

    <fieldset v-if="addons.length" class="space-y-2">
      <legend class="mb-2 text-base font-semibold">Deixe ainda mais especial</legend>
      <label
        v-for="a in addons"
        :key="a.id"
        class="flex min-h-11 cursor-pointer items-center justify-between rounded-xl border bg-white px-4 py-3"
        :class="modelValue.addonIds.includes(a.id) ? 'border-brand-gold' : 'border-brand-black/15'"
      >
        <span class="flex items-center gap-3">
          <input type="checkbox" class="size-5" :checked="modelValue.addonIds.includes(a.id)" @change="toggleAddon(a.id, ($event.target as HTMLInputElement).checked)" />
          <span class="font-medium">{{ a.name }}</span>
        </span>
        <span class="text-base text-brand-black/70">+ {{ formatBRL(a.price) }}</span>
      </label>
    </fieldset>
  </div>
</template>
