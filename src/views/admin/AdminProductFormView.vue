<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import FormField from '@/components/common/FormField.vue'
import {
  adminAddChild, adminCreateProduct, adminDeleteImage, adminDeleteProduct, adminGetProduct, adminListCategories,
  adminRemoveChild, adminUpdateImage, adminUpdateProduct, adminUploadImage, errorMessage, type ChildKind,
} from '@/services/catalog.service'
import type { AdminCategory, AdminProductDetail, ProductPayload } from '@/types/catalog.types'
import { dayEndIso, dayStartIso, formatBRL, formatDay } from '@/utils/catalog-format'
import { compressImage } from '@/utils/image'

const route = useRoute()
const router = useRouter()
const productId = computed(() => (typeof route.params.id === 'string' ? route.params.id : ''))
const isNew = computed(() => !productId.value)

const categories = ref<AdminCategory[]>([])
const product = ref<AdminProductDetail | null>(null)
const loading = ref(true)
const saving = ref(false)
const notice = ref('')
const error = ref('')
const confirmDelete = ref(false)

const form = reactive({
  name: '', description: '', material: '', size_description: '',
  base_price: 0, category_ids: [] as string[], stock_quantity: 0, is_approved: false, is_active: true,
})
const variantForm = reactive({ name: '', price: 0 })
const addonForm = reactive({ name: '', price: 0 })
const promoForm = reactive({ promotional_price: 0, starts: '', ends: '' })
const photoAlt = ref('')
const altDrafts = reactive<Record<string, string>>({})

function fillForm(p: AdminProductDetail) {
  form.name = p.name
  form.description = p.description
  form.material = p.material ?? ''
  form.size_description = p.size_description ?? ''
  form.base_price = p.base_price
  form.category_ids = [...p.category_ids]
  form.stock_quantity = p.stock_quantity
  form.is_approved = p.is_approved
  form.is_active = p.is_active
  for (const img of p.images) altDrafts[img.id] = img.alt_text ?? ''
}

async function refresh() {
  if (!productId.value) return
  product.value = await adminGetProduct(productId.value)
  fillForm(product.value)
}

/** Executa uma ação, limpa mensagens antigas e mostra sucesso ou erro. */
async function run(action: () => Promise<void>, success?: string) {
  error.value = ''
  notice.value = ''
  try {
    await action()
    if (success) notice.value = success
  } catch (e) {
    error.value = errorMessage(e)
  }
}

function payload(): ProductPayload {
  return {
    name: form.name.trim(),
    description: form.description.trim(),
    material: form.material.trim() || null,
    size_description: form.size_description.trim() || null,
    base_price: Number(form.base_price),
    category_ids: [...form.category_ids],
    stock_quantity: Number(form.stock_quantity),
    is_approved: form.is_approved,
    is_active: form.is_active,
  }
}

async function save() {
  if (form.category_ids.length === 0) {
    error.value = 'Escolha pelo menos uma categoria.'
    return
  }
  saving.value = true
  await run(async () => {
    if (isNew.value) {
      const created = await adminCreateProduct(payload())
      await router.replace(`/admin/produtos/${created.id}`)
      await refresh()
      notice.value = 'Produto criado. Agora você pode enviar fotos, variações e promoção.'
    } else {
      await adminUpdateProduct(productId.value, payload())
      await refresh()
      notice.value = 'Produto salvo.'
    }
  })
  saving.value = false
}

// ---------- fotos ----------
async function onPhoto(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !productId.value) return
  await run(async () => {
    const compressed = await compressImage(file)
    await adminUploadImage(productId.value, compressed, photoAlt.value)
    photoAlt.value = ''
    await refresh()
  }, 'Foto enviada.')
  input.value = ''
}
const saveAlt = (imageId: string) =>
  run(async () => {
    await adminUpdateImage(productId.value, imageId, { alt_text: altDrafts[imageId]?.trim() || null })
    await refresh()
  }, 'Descrição da foto salva.')
const makeCover = (imageId: string) =>
  run(async () => { await adminUpdateImage(productId.value, imageId, { is_cover: true }); await refresh() }, 'Capa atualizada.')
const removeImage = (imageId: string) =>
  run(async () => { await adminDeleteImage(productId.value, imageId); await refresh() }, 'Foto removida.')

// ---------- variações, adicionais e promoção ----------
const addChild = (kind: ChildKind, body: object, done: () => void, success: string) =>
  run(async () => { await adminAddChild(productId.value, kind, body); done(); await refresh() }, success)
const removeChild = (kind: ChildKind, id: string, success: string) =>
  run(async () => { await adminRemoveChild(productId.value, kind, id); await refresh() }, success)

const addVariant = () =>
  addChild('variants', { name: variantForm.name.trim(), price: Number(variantForm.price) },
    () => { variantForm.name = ''; variantForm.price = 0 }, 'Variação adicionada.')
const addAddon = () =>
  addChild('addons', { name: addonForm.name.trim(), price: Number(addonForm.price) },
    () => { addonForm.name = ''; addonForm.price = 0 }, 'Adicional incluído.')
const addPromotion = () =>
  addChild('promotions', {
    promotional_price: Number(promoForm.promotional_price),
    starts_at: dayStartIso(promoForm.starts),
    ends_at: dayEndIso(promoForm.ends),
  }, () => { promoForm.promotional_price = 0; promoForm.starts = ''; promoForm.ends = '' }, 'Promoção ativada.')

// ---------- ativar, inativar e excluir ----------
async function toggleActive() {
  const willActivate = !form.is_active // decide a mensagem ANTES da mudança
  await run(async () => {
    await adminUpdateProduct(productId.value, { is_active: willActivate })
    await refresh()
  }, willActivate ? 'Produto reativado.' : 'Produto inativado.')
}

async function deleteProduct() {
  confirmDelete.value = false
  await run(async () => {
    const result = await adminDeleteProduct(productId.value)
    if (result?.deactivated) {
      await refresh()
      notice.value = 'Este produto já tem pedidos, então foi inativado em vez de excluído.'
    } else {
      await router.push('/admin/produtos')
    }
  })
}

onMounted(async () => {
  try {
    categories.value = await adminListCategories()
    await refresh()
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section class="mx-auto max-w-5xl p-6 text-brand-black">
    <RouterLink to="/admin/produtos" class="text-sm font-semibold text-brand-gold-dark">Voltar aos produtos</RouterLink>
    <h1 class="mt-2 font-display text-3xl">{{ isNew ? 'Novo produto' : 'Editar produto' }}</h1>

    <p v-if="notice" role="status" class="mt-4 rounded-xl bg-brand-black/5 px-4 py-2 text-sm">{{ notice }}</p>
    <p v-if="error" role="alert" class="mt-4 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-800">{{ error }}</p>
    <p v-if="loading" class="mt-6 text-brand-black/70">Carregando…</p>

    <div v-else class="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
      <div class="space-y-6">
        <form class="card space-y-4" @submit.prevent="save">
          <h2 class="font-semibold">Informações do produto</h2>
          <FormField id="p-name" label="Nome"><input id="p-name" v-model="form.name" class="field" required minlength="2" maxlength="150" /></FormField>
          <FormField id="p-desc" label="Descrição"><textarea id="p-desc" v-model="form.description" rows="3" class="field" required maxlength="2000" /></FormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <FormField id="p-material" label="Material"><input id="p-material" v-model="form.material" class="field" maxlength="100" /></FormField>
            <FormField id="p-size" label="Tamanho"><input id="p-size" v-model="form.size_description" class="field" maxlength="50" placeholder="Ex.: aprox. 35 cm" /></FormField>
            <FormField id="p-price" label="Preço base (R$)" hint="Preço do produto sem variações.">
              <input id="p-price" v-model.number="form.base_price" type="number" min="0" step="0.01" class="field" required />
            </FormField>
            <FormField id="p-stock" label="Quantidade em estoque" hint="Compartilhado entre as variações. Com estoque 0 o produto some da vitrine.">
              <input id="p-stock" v-model.number="form.stock_quantity" type="number" min="0" step="1" class="field" required />
            </FormField>
          </div>

          <fieldset class="space-y-2">
            <legend class="text-sm font-semibold">Categorias (escolha pelo menos uma)</legend>
            <div class="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <label v-for="c in categories" :key="c.id" class="flex items-center gap-2">
                <input v-model="form.category_ids" type="checkbox" :value="c.id" /> {{ c.name }}
              </label>
            </div>
          </fieldset>

          <fieldset class="flex flex-wrap gap-6 text-sm">
            <legend class="sr-only-label">Publicação</legend>
            <label class="flex items-center gap-2"><input v-model="form.is_approved" type="checkbox" /> Aprovado para a vitrine</label>
            <label class="flex items-center gap-2"><input v-model="form.is_active" type="checkbox" /> Ativo</label>
          </fieldset>
          <button type="submit" class="btn btn-primary" :disabled="saving">{{ saving ? 'Salvando…' : 'Salvar produto' }}</button>
        </form>

        <template v-if="product">
          <div class="card space-y-4">
            <h2 class="font-semibold">Variações</h2>
            <p class="text-xs text-brand-black/70">
              Cada variação tem o seu preço. Em promoção, o desconto é proporcional: preço da variação × preço promocional ÷ preço base.
            </p>
            <ul class="divide-y divide-brand-black/15 text-sm">
              <li v-for="v in product.variants" :key="v.id" class="flex items-center justify-between py-2">
                <span>{{ v.name }} <span class="text-brand-black/70">({{ formatBRL(v.price) }})</span></span>
                <button type="button" class="font-semibold text-red-800" @click="removeChild('variants', v.id, 'Variação removida.')">Remover</button>
              </li>
              <li v-if="!product.variants.length" class="py-2 text-brand-black/70">Nenhuma variação cadastrada.</li>
            </ul>
            <form class="flex flex-wrap items-end gap-3" @submit.prevent="addVariant">
              <FormField id="v-name" label="Nome da variação"><input id="v-name" v-model="variantForm.name" class="field" required maxlength="100" placeholder="Ex.: Especial" /></FormField>
              <FormField id="v-price" label="Preço (R$)"><input id="v-price" v-model.number="variantForm.price" type="number" min="0" step="0.01" class="field !w-32" required /></FormField>
              <button type="submit" class="btn btn-secondary">Adicionar variação</button>
            </form>
          </div>

          <div class="card space-y-4">
            <h2 class="font-semibold">Adicionais opcionais</h2>
            <ul class="divide-y divide-brand-black/15 text-sm">
              <li v-for="a in product.addons" :key="a.id" class="flex items-center justify-between py-2">
                <span>{{ a.name }} <span class="text-brand-black/70">(+ {{ formatBRL(a.price) }})</span></span>
                <button type="button" class="font-semibold text-red-800" @click="removeChild('addons', a.id, 'Adicional removido.')">Remover</button>
              </li>
              <li v-if="!product.addons.length" class="py-2 text-brand-black/70">Nenhum adicional cadastrado.</li>
            </ul>
            <form class="flex flex-wrap items-end gap-3" @submit.prevent="addAddon">
              <FormField id="a-name" label="Nome do adicional"><input id="a-name" v-model="addonForm.name" class="field" required maxlength="100" placeholder="Ex.: Chocolates" /></FormField>
              <FormField id="a-price" label="Preço (R$)"><input id="a-price" v-model.number="addonForm.price" type="number" min="0" step="0.01" class="field !w-32" required /></FormField>
              <button type="submit" class="btn btn-secondary">Incluir adicional</button>
            </form>
          </div>

          <div class="card space-y-4">
            <h2 class="font-semibold">Promoção</h2>
            <ul class="divide-y divide-brand-black/15 text-sm">
              <li v-for="p in product.promotions" :key="p.id" class="flex items-center justify-between py-2">
                <span>{{ formatBRL(p.promotional_price) }} de {{ formatDay(p.starts_at) }} até {{ formatDay(p.ends_at) }}</span>
                <button type="button" class="font-semibold text-red-800" @click="removeChild('promotions', p.id, 'Promoção encerrada.')">Encerrar</button>
              </li>
              <li v-if="!product.promotions.length" class="py-2 text-brand-black/70">Nenhuma promoção ativa.</li>
            </ul>
            <form class="flex flex-wrap items-end gap-3" @submit.prevent="addPromotion">
              <FormField id="pr-price" label="Preço promocional (R$)" :hint="`Deve ser menor que ${formatBRL(product.base_price)}.`">
                <input id="pr-price" v-model.number="promoForm.promotional_price" type="number" min="0" step="0.01" class="field !w-40" required />
              </FormField>
              <FormField id="pr-start" label="Início"><input id="pr-start" v-model="promoForm.starts" type="date" class="field" required /></FormField>
              <FormField id="pr-end" label="Fim"><input id="pr-end" v-model="promoForm.ends" type="date" class="field" required /></FormField>
              <button type="submit" class="btn btn-secondary">Ativar promoção</button>
            </form>
          </div>
        </template>
      </div>

      <aside v-if="product" class="space-y-6">
        <div class="card space-y-4">
          <h2 class="font-semibold">Fotos do produto</h2>
          <ul class="space-y-4">
            <li v-for="img in product.images" :key="img.id" class="space-y-2">
              <img :src="img.url" :alt="img.alt_text || product.name" class="aspect-[4/5] w-full rounded-xl object-cover" />
              <FormField :id="`alt-${img.id}`" label="Descrição da foto" hint="Lida por leitores de tela.">
                <input :id="`alt-${img.id}`" v-model="altDrafts[img.id]" class="field" maxlength="200" @change="saveAlt(img.id)" />
              </FormField>
              <div class="flex items-center justify-between text-sm">
                <span v-if="img.is_cover" class="rounded-full bg-brand-black/5 px-2.5 py-1 font-semibold">Capa</span>
                <button v-else type="button" class="font-semibold text-brand-gold-dark" @click="makeCover(img.id)">Definir como capa</button>
                <button type="button" class="font-semibold text-red-800" @click="removeImage(img.id)">Remover</button>
              </div>
            </li>
          </ul>
          <p v-if="!product.images.length" class="grid aspect-[4/5] place-items-center rounded-xl bg-brand-black/5 text-sm text-brand-black/70">Sem fotos</p>

          <FormField id="photo-alt" label="Descrição da nova foto" hint="Opcional. Se ficar vazio, usamos o nome do produto.">
            <input id="photo-alt" v-model="photoAlt" class="field" maxlength="200" />
          </FormField>
          <label class="btn btn-secondary w-full cursor-pointer">
            Enviar foto
            <input type="file" accept="image/jpeg,image/png,image/webp" class="sr-only-label" @change="onPhoto" />
          </label>
          <p class="text-xs text-brand-black/70">Até 8 fotos. A primeira vira a capa. JPG, PNG ou WebP, reduzidas automaticamente.</p>
        </div>

        <div class="card space-y-3">
          <h2 class="font-semibold">Ações do produto</h2>
          <button type="button" class="btn btn-secondary w-full" @click="toggleActive">{{ form.is_active ? 'Inativar produto' : 'Reativar produto' }}</button>
          <button type="button" class="btn btn-danger w-full" @click="confirmDelete = true">Excluir produto</button>
          <p class="text-xs text-brand-black/70">Se o produto já tiver pedidos, ele será apenas inativado para preservar o histórico.</p>
        </div>
      </aside>
    </div>

    <ConfirmDialog
      :open="confirmDelete"
      title="Excluir este produto?"
      message="Produtos sem pedidos são excluídos de vez. Produtos com pedidos são apenas inativados."
      confirm-label="Excluir produto"
      danger
      @cancel="confirmDelete = false"
      @confirm="deleteProduct"
    />
  </section>
</template>
