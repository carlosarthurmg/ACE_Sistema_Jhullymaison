<script setup lang="ts">
defineProps<{ open: boolean; title: string; message: string; confirmLabel?: string; danger?: boolean }>()
defineEmits<{ (e: 'confirm'): void; (e: 'cancel'): void }>()
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 grid place-items-center bg-brand-black/50 p-4" @keydown.esc="$emit('cancel')">
    <div role="dialog" aria-modal="true" :aria-label="title" class="w-full max-w-sm rounded-2xl bg-brand-cream p-6 shadow-xl">
      <h2 class="font-display text-xl">{{ title }}</h2>
      <p class="mt-2 text-sm text-brand-black/70">{{ message }}</p>
      <div class="mt-4"><slot /></div>
      <div class="mt-5 flex justify-end gap-2">
        <button type="button" class="btn btn-secondary" autofocus @click="$emit('cancel')">Cancelar</button>
        <button type="button" class="btn" :class="danger ? 'btn-danger' : 'btn-primary'" @click="$emit('confirm')">
          {{ confirmLabel ?? 'Confirmar' }}
        </button>
      </div>
    </div>
  </div>
</template>
