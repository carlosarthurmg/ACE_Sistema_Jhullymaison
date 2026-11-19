<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api } from "@/services/api-client";

// Tela provisória do projeto-base: confirma que o frontend conversa com
// as Netlify Functions. Será substituída pela página inicial (tela 1).
const apiStatus = ref<"checking" | "ok" | "error">("checking");

onMounted(async () => {
  try {
    await api.get<{ service: string }>("/api/health");
    apiStatus.value = "ok";
  } catch {
    apiStatus.value = "error";
  }
});
</script>

<template>
  <main class="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
    <h1 class="font-display text-4xl">jhullymaison</h1>
    <p class="text-brand-gold-dark">Projeto-base funcionando.</p>
    <p class="rounded-md bg-brand-black px-4 py-2 text-sm text-brand-gold" role="status">
      <template v-if="apiStatus === 'checking'">Verificando a API...</template>
      <template v-else-if="apiStatus === 'ok'">API respondendo (/api/health)</template>
      <template v-else>API indisponível. Rode com "npm run dev:netlify".</template>
    </p>
  </main>
</template>
