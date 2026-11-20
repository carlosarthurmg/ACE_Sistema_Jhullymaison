<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import AppFooter from '@/components/layout/AppFooter.vue'
import ProductGallery from '@/components/products/ProductGallery.vue'
import ProductOptions from '@/components/products/ProductOptions.vue'
import { errorMessage, errorStatus, getProduct } from '@/services/catalog.service'
import { useCartStore } from '@/stores/cart.store' // dono: João (contrato em docs/catalogo-rodolfo.md)
import type { OptionSelection, ProductDetail } from '@/types/catalog.types'
import { formatBRL } from '@/utils/catalog-format'

const route = useRoute()
const cart = useCartStore()

const product = ref<ProductDetail | null>(null)
const loading = ref(true)
const notFound = ref(false)
const error = ref('')
const selection = reactive<OptionSelection>({ variantId: null, addonIds: [] })
const quantity = ref(1)
const note = ref('')
const adding = ref(false)
const added = ref(false)

const round2 = (n: number) => Math.round(n * 100) / 100

// Prévia da regra 4.5: preço efetivo (variação já vem com a promoção proporcional) + adicionais (sem desconto),
// vezes a quantidade. O servidor recalcula tudo no checkout.
const unit = computed(() => {
  const p = product.value
  if (!p) return 0
  const variant = p.variants.find((v) => v.id === selection.variantId)
  const base = variant ? variant.price : p.effective_price
  const extras = p.addons.filter((a) => selection.addonIds.includes(a.id)).reduce((s, a) => s + a.price, 0)
  return round2(base + extras)
})
const total = computed(() => round2(unit.value * quantity.value))
const maxQuantity = computed(() => Math.min(product.value?.stock_available ?? 1, 20))
// Regra 4.5, item 7: com variações ativas, o cliente precisa escolher uma.
const needsVariant = computed(() => !!product.value?.variants.length && !selection.variantId)

async function load(slug: string) {
  loading.value = true
  notFound.value = false
  error.value = ''
  added.value = false
  try {
    const data = await getProduct(slug)
    product.value = data
    selection.variantId = data.variants[0]?.id ?? null
    selection.addonIds = []
    quantity.value = 1
    note.value = ''
  } catch (e) {
    product.value = null
    if (errorStatus(e) === 404) notFound.value = true
    else error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}

async function addToCart() {
  const p = product.value
  if (!p || needsVariant.value) return
  adding.value = true
  error.value = ''
  try {
    await cart.addItem({
      product_id: p.id,
      variant_id: selection.variantId,
      addon_ids: [...selection.addonIds],
      quantity: quantity.value,
      personalization_note: note.value.trim() || null,
    })
    added.value = true
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    adding.value = false
  }
}

watch(() => route.params.slug, (slug) => typeof slug === 'string' && load(slug), { immediate: true })
</script>

<template>
  <main class="bg-brand-cream text-brand-black">
    <div class="mx-auto max-w-5xl px-4 pb-4 pt-6">
      <RouterLink to="/catalogo" class="text-base font-semibold text-brand-gold-dark underline-offset-4 hover:underline">Voltar ao catálogo</RouterLink>

      <div v-if="loading" class="mt-6 grid gap-8 md:grid-cols-2" aria-busy="true">
        <div class="aspect-[4/5] animate-pulse rounded-2xl bg-brand-black/5" />
        <div class="space-y-3"><div class="h-8 w-2/3 animate-pulse rounded bg-brand-black/5" /><div class="h-5 w-1/3 animate-pulse rounded bg-brand-black/5" /></div>
      </div>

      <div v-else-if="notFound" class="mt-10 text-center">
        <h1 class="font-display text-2xl">Este presente não está mais disponível.</h1>
        <RouterLink to="/catalogo" class="btn btn-primary mt-4">Ver outros presentes</RouterLink>
      </div>

      <div v-else-if="product" class="mt-6 grid gap-8 md:grid-cols-2">
        <ProductGallery :images="product.images" :fallback-alt="product.name" />

        <div>
          <p v-if="product.categories.length" class="text-base font-semibold text-brand-gold-dark">
            {{ product.categories.map((c) => c.name).join(', ') }}
          </p>
          <h1 class="font-display text-3xl sm:text-4xl">{{ product.name }}</h1>
          <p class="mt-2 text-xl font-bold">
            {{ formatBRL(product.effective_price) }}
            <s v-if="product.on_promotion" class="ml-2 text-base font-normal text-brand-black/70">
              <span class="sr-only">preço original</span>{{ formatBRL(product.base_price) }}
            </s>
            <span v-if="product.on_promotion" class="ml-2 rounded-full bg-brand-black/5 px-2.5 py-0.5 text-sm font-bold">Promoção −{{ product.discount_percent }}%</span>
          </p>
          <p class="mt-3 max-w-prose text-base text-brand-black/70">{{ product.description }}</p>

          <dl v-if="product.material || product.size_description" class="mt-4 grid grid-cols-2 gap-3 text-base">
            <div v-if="product.material"><dt class="font-semibold">Material</dt><dd class="text-brand-black/70">{{ product.material }}</dd></div>
            <div v-if="product.size_description"><dt class="font-semibold">Tamanho</dt><dd class="text-brand-black/70">{{ product.size_description }}</dd></div>
          </dl>

          <div class="mt-6">
            <ProductOptions v-model="selection" :variants="product.variants" :addons="product.addons" />
          </div>

          <div class="mt-6 space-y-1.5">
            <label for="personalization" class="text-base font-semibold">Conte como você imaginou</label>
            <textarea id="personalization" v-model="note" rows="3" maxlength="500" class="field" placeholder="Nome, mensagem, cores preferidas…" />
          </div>

          <div class="mt-4 flex items-center justify-between">
            <label for="quantity" class="text-base font-semibold">Quantidade</label>
            <input id="quantity" v-model.number="quantity" type="number" min="1" :max="maxQuantity" class="field !w-24 text-center" />
          </div>

          <div class="mt-6 flex items-center justify-between border-t border-brand-black/15 pt-4">
            <span class="text-base text-brand-black/70">Total com adicionais</span>
            <span class="text-2xl font-bold" aria-live="polite">{{ formatBRL(total) }}</span>
          </div>

          <button type="button" class="btn btn-primary mt-4 w-full" :disabled="adding || needsVariant || quantity < 1 || quantity > maxQuantity" @click="addToCart">
            {{ adding ? 'Adicionando…' : 'Adicionar ao carrinho' }}
          </button>
          <p v-if="needsVariant" class="mt-2 text-base text-brand-black/70">Escolha uma opção para continuar.</p>
          <p v-if="added" role="status" class="mt-3 text-base">
            Adicionado ao carrinho.
            <RouterLink to="/carrinho" class="font-semibold text-brand-gold-dark underline-offset-4 hover:underline">Ver carrinho</RouterLink>
          </p>
          <p v-if="error" role="alert" class="mt-3 text-base text-red-800">{{ error }}</p>
        </div>
      </div>

      <p v-else-if="error" role="alert" class="mt-10 text-center text-base">{{ error }}</p>
    </div>
    <AppFooter />
  </main>
</template>
