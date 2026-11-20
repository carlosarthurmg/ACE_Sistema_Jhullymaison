<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { adminListProducts, adminUpdateProduct, errorMessage } from '@/services/catalog.service'
import type { AdminProductListItem, ProductVisibility } from '@/types/catalog.types'
import { formatBRL } from '@/utils/catalog-format'

type Tab = 'all' | 'published' | 'unpublished'
const TABS: { value: Tab; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'published', label: 'Na vitrine' },
  { value: 'unpublished', label: 'Não publicados' },
]
const STATUS_LABEL: Record<ProductVisibility, string> = {
  published: 'Na vitrine',
  awaiting_approval: 'Aguardando aprovação',
  inactive: 'Inativo',
  out_of_stock: 'Oculto: sem estoque',
}

const tab = ref<Tab>('all')
const search = ref('')
const items = ref<AdminProductListItem[]>([])
const total = ref(0)
const page = ref(1)
const loading = ref(true)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await adminListProducts({
      status: tab.value === 'all' ? undefined : tab.value,
      search: search.value.trim() || undefined,
      page: page.value,
    })
    items.value = data.items
    total.value = data.total
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}

async function approve(p: AdminProductListItem) {
  try {
    await adminUpdateProduct(p.id, { is_approved: true })
    await load()
  } catch (e) {
    error.value = errorMessage(e)
  }
}

watch(tab, () => { page.value = 1; load() })
onMounted(load)
</script>

<template>
  <section class="mx-auto max-w-5xl p-6 text-brand-black">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="font-display text-3xl">Produtos</h1>
        <p class="mt-1 text-sm text-brand-black/70">Mantenha a vitrine atualizada e acompanhe o estoque de cada produto.</p>
      </div>
      <RouterLink to="/admin/produtos/novo" class="btn btn-primary">Novo produto</RouterLink>
    </div>

    <div class="mt-6 flex flex-wrap items-center gap-2">
      <button v-for="t in TABS" :key="t.value" type="button" class="chip" :class="{ 'chip-active': tab === t.value }" :aria-pressed="tab === t.value" @click="tab = t.value">
        {{ t.label }}
      </button>
      <form role="search" class="ml-auto flex gap-2" @submit.prevent="page = 1; load()">
        <label for="adm-search" class="sr-only-label">Buscar produto</label>
        <input id="adm-search" v-model="search" type="search" class="field !w-56" placeholder="Buscar produto" maxlength="60" />
        <button type="submit" class="btn btn-secondary">Buscar</button>
      </form>
    </div>

    <p v-if="error" role="alert" class="mt-4 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-800">{{ error }}</p>

    <div class="card mt-4 overflow-x-auto">
      <table class="w-full text-left text-sm">
        <caption class="sr-only-label">Lista de produtos</caption>
        <thead class="text-brand-black/70">
          <tr><th class="py-2">Produto</th><th>Categoria</th><th>Preço</th><th>Estoque</th><th>Publicação</th><th><span class="sr-only-label">Ações</span></th></tr>
        </thead>
        <tbody>
          <tr v-if="loading"><td colspan="6" class="py-6 text-brand-black/70">Carregando…</td></tr>
          <tr v-else-if="!items.length"><td colspan="6" class="py-6 text-brand-black/70">Nenhum produto por aqui. Use “Novo produto” para cadastrar o primeiro.</td></tr>
          <tr v-for="p in items" :key="p.id" class="border-t border-brand-black/15">
            <td class="py-3">
              <span class="flex items-center gap-3">
                <img v-if="p.image_url" :src="p.image_url" :alt="`Foto de ${p.name}`" class="size-10 rounded-lg object-cover" />
                <span v-else class="size-10 rounded-lg bg-brand-black/5" aria-hidden="true" />
                <span class="font-semibold">{{ p.name }}</span>
              </span>
            </td>
            <td>{{ p.categories.map((c) => c.name).join(', ') || '—' }}</td>
            <td>{{ formatBRL(p.base_price) }}</td>
            <td>{{ p.stock_quantity }}</td>
            <td>
              <span class="rounded-full px-2.5 py-1 text-xs font-semibold" :class="p.visibility === 'published' ? 'bg-green-100 text-green-900' : p.visibility === 'awaiting_approval' ? 'bg-brand-black/5' : 'bg-red-50 text-red-800'">
                {{ STATUS_LABEL[p.visibility] }}
              </span>
            </td>
            <td class="space-x-3 text-right">
              <button v-if="!p.is_approved" type="button" class="font-semibold text-brand-gold-dark" @click="approve(p)">Aprovar</button>
              <RouterLink :to="`/admin/produtos/${p.id}`" class="font-semibold text-brand-gold-dark">Editar</RouterLink>
            </td>
          </tr>
        </tbody>
      </table>
      <p class="mt-4 rounded-xl bg-brand-black/5 px-3 py-2 text-xs text-brand-black/70">
        Só aparecem no catálogo os produtos aprovados, ativos e com estoque. Produtos com pedidos anteriores podem ser inativados, mas não excluídos.
      </p>
    </div>
  </section>
</template>
