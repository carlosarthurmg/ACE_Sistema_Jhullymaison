<script setup lang="ts">
import { RouterLink } from 'vue-router'
import AppFooter from '@/components/layout/AppFooter.vue'
import { STORE, whatsappUrl } from '@/utils/store-info'

// Texto provisório baseado no protótipo aprovado; o conteúdo final será definido com a cliente (RF22).
const steps = [
  { title: 'Escolha com carinho', text: 'Encontre o presente que combina com a ocasião.' },
  { title: 'Dê o seu toque', text: 'Conte à loja como deseja personalizar cada detalhe.' },
  { title: 'Combine com a loja', text: 'Defina prazo, entrega ou retirada pelo WhatsApp.' },
]
</script>

<template>
  <main class="bg-brand-cream text-brand-black">
    <div class="mx-auto max-w-3xl px-4 pt-10">
      <h1 class="font-display text-4xl leading-tight">Carinho em forma de presente.</h1>
      <h2 class="mt-8 font-display text-2xl">Um gesto. Muitas histórias.</h2>
      <p class="mt-2 max-w-prose text-brand-black/70">
        A {{ STORE.name }}, de Jullyanne Hellen, reúne buquês, cestas e presentes personalizados em um só lugar.
      </p>

      <ol class="mt-8 space-y-5 border-t border-brand-black/15 pt-6">
        <li v-for="(s, i) in steps" :key="s.title" class="flex gap-4">
          <span class="font-display text-brand-gold-dark" aria-hidden="true">{{ i + 1 }}</span>
          <div>
            <h3 class="font-semibold">{{ s.title }}</h3>
            <p class="text-base text-brand-black/70">{{ s.text }}</p>
          </div>
        </li>
      </ol>

      <p class="mt-8 text-base text-brand-black/70">{{ STORE.leadTimeNotice }}</p>

      <div class="mt-6 flex flex-wrap gap-3">
        <RouterLink to="/catalogo" class="btn btn-primary">Explorar presentes</RouterLink>
        <a :href="whatsappUrl()" target="_blank" rel="noopener" class="btn btn-secondary">Falar com a {{ STORE.name }}</a>
      </div>
    </div>
    <AppFooter />
  </main>
</template>
