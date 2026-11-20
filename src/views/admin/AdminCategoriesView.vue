<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import FormField from '@/components/common/FormField.vue'
import {
  adminCreateCategory, adminDeleteCategory, adminListCategories, adminUpdateCategory, errorMessage,
} from '@/services/catalog.service'
import type { AdminCategory } from '@/types/catalog.types'

const items = ref<AdminCategory[]>([])
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const notice = ref('')
const form = reactive({ id: '', name: '', description: '' })

const toDelete = ref<AdminCategory | null>(null)
const reassignTo = ref('')

async function load() {
  loading.value = true
  try {
    items.value = await adminListCategories()
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}

function clearForm() {
  form.id = ''
  form.name = ''
  form.description = ''
}
function startEdit(c: AdminCategory) {
  form.id = c.id
  form.name = c.name
  form.description = c.description ?? ''
}

async function save() {
  saving.value = true
  error.value = ''
  notice.value = ''
  const body = { name: form.name.trim(), description: form.description.trim() || null }
  try {
    if (form.id) await adminUpdateCategory(form.id, body)
    else await adminCreateCategory(body)
    notice.value = form.id ? 'Categoria atualizada.' : 'Categoria criada.'
    clearForm()
    await load()
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    saving.value = false
  }
}

function askDelete(c: AdminCategory) {
  toDelete.value = c
  reassignTo.value = ''
  error.value = ''
}

async function confirmDelete() {
  const c = toDelete.value
  if (!c) return
  if (c.product_count > 0 && !reassignTo.value) {
    error.value = 'Escolha a categoria que receberá os produtos.'
    return
  }
  try {
    await adminDeleteCategory(c.id, c.product_count > 0 ? reassignTo.value : undefined)
    notice.value = 'Categoria excluída.'
    toDelete.value = null
    await load()
  } catch (e) {
    error.value = errorMessage(e)
    toDelete.value = null
  }
}

onMounted(load)
</script>

<template>
  <section class="mx-auto max-w-5xl p-6 text-brand-black">
    <h1 class="font-display text-3xl">Categorias</h1>
    <p class="mt-1 text-sm text-brand-black/70">Organize os presentes para facilitar a escolha dos clientes.</p>

    <p v-if="notice" role="status" class="mt-4 rounded-xl bg-brand-black/5 px-4 py-2 text-sm">{{ notice }}</p>
    <p v-if="error" role="alert" class="mt-4 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-800">{{ error }}</p>

    <div class="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
      <div class="card overflow-x-auto">
        <table class="w-full text-left text-sm">
          <caption class="sr-only-label">Categorias da loja</caption>
          <thead class="text-brand-black/70"><tr><th class="py-2">Nome</th><th>Produtos</th><th><span class="sr-only-label">Ações</span></th></tr></thead>
          <tbody>
            <tr v-if="loading"><td colspan="3" class="py-6 text-brand-black/70">Carregando…</td></tr>
            <tr v-else-if="!items.length"><td colspan="3" class="py-6 text-brand-black/70">Nenhuma categoria ainda. Crie a primeira ao lado.</td></tr>
            <tr v-for="c in items" :key="c.id" class="border-t border-brand-black/15">
              <td class="py-3 font-semibold">{{ c.name }}</td>
              <td>{{ c.product_count }}</td>
              <td class="space-x-3 text-right">
                <button type="button" class="font-semibold text-brand-gold-dark" @click="startEdit(c)">Editar</button>
                <button type="button" class="font-semibold text-red-800" @click="askDelete(c)">Excluir</button>
              </td>
            </tr>
          </tbody>
        </table>
        <p class="mt-4 rounded-xl bg-brand-black/5 px-3 py-2 text-xs text-brand-black/70">
          Uma categoria com produtos só pode ser excluída depois de mover os produtos para outra categoria.
        </p>
      </div>

      <form class="card space-y-4" @submit.prevent="save">
        <h2 class="font-semibold">{{ form.id ? 'Editar categoria' : 'Nova categoria' }}</h2>
        <FormField id="cat-name" label="Nome da categoria">
          <input id="cat-name" v-model="form.name" class="field" required minlength="2" maxlength="80" placeholder="Ex.: Arranjos" />
        </FormField>
        <FormField id="cat-desc" label="Descrição">
          <textarea id="cat-desc" v-model="form.description" rows="3" maxlength="500" class="field" />
        </FormField>
        <div class="flex gap-2">
          <button type="submit" class="btn btn-primary" :disabled="saving">{{ saving ? 'Salvando…' : 'Salvar categoria' }}</button>
          <button v-if="form.id || form.name" type="button" class="btn btn-secondary" @click="clearForm">Limpar campos</button>
        </div>
      </form>
    </div>

    <ConfirmDialog
      :open="!!toDelete"
      :title="`Excluir ${toDelete?.name ?? ''}?`"
      :message="toDelete && toDelete.product_count > 0
        ? `Esta categoria tem ${toDelete.product_count} produto(s). Escolha para onde eles vão.`
        : 'Esta ação não pode ser desfeita.'"
      confirm-label="Excluir categoria"
      danger
      @cancel="toDelete = null"
      @confirm="confirmDelete"
    >
      <template v-if="toDelete && toDelete.product_count > 0">
        <label for="reassign" class="text-sm font-semibold">Mover produtos para</label>
        <select id="reassign" v-model="reassignTo" class="field mt-1">
          <option value="" disabled>Escolha uma categoria</option>
          <option v-for="c in items.filter((x) => x.id !== toDelete?.id)" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
      </template>
    </ConfirmDialog>
  </section>
</template>
