<script setup lang="ts">
defineProps<{ label: string; id: string; hint?: string; error?: string }>()
</script>

<template>
  <div class="space-y-1.5">
    <label :for="id" class="text-sm font-semibold text-brand-black">{{ label }}</label>
    <slot />
    <p v-if="hint" :id="`${id}-hint`" class="text-xs text-brand-black/70">{{ hint }}</p>
    <p v-if="error" :id="`${id}-error`" role="alert" class="text-xs text-red-800">{{ error }}</p>
  </div>
</template>
