<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { STORE, whatsappUrl } from '@/utils/store-info'
</script>

<template>
  <footer class="mt-16 border-t border-brand-black/15 px-4 py-10 text-center">
    <p class="font-display text-xl">Feito para surpreender.</p>
    <p class="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-1 text-base">
      <a :href="whatsappUrl()" target="_blank" rel="noopener" class="font-semibold text-brand-gold-dark underline-offset-4 hover:underline">
        WhatsApp {{ STORE.whatsappDisplay }}
      </a>
      <a :href="STORE.instagramUrl" target="_blank" rel="noopener" class="font-semibold text-brand-gold-dark underline-offset-4 hover:underline">
        Instagram {{ STORE.instagramHandle }}
      </a>
    </p>
    <p class="mt-2 text-base text-brand-black/70">
      <RouterLink to="/privacidade" class="underline-offset-4 hover:underline">Privacidade</RouterLink>
      e
      <RouterLink to="/termos" class="underline-offset-4 hover:underline">Termos</RouterLink>
    </p>
  </footer>
</template>
