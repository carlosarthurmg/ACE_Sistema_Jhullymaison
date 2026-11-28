<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRoute } from "vue-router";
import { api } from "@/services/api-client";
import { date, money, labels } from "./order-display";
const id = useRoute().params.id,
  search = ref(""),
  error = ref(""),
  page = ref(1),
  total = ref(0),
  busy = ref(false);
interface Row {
  id: string;
  full_name: string;
  phone: string;
  order_code: string;
  created_at: string;
  order_status: string;
  total: number;
}
const items = ref<Row[]>([]);
async function load(n = 1) {
  busy.value = true;
  error.value = "";
  items.value = [];
  total.value = 0;
  try {
    const q = new URLSearchParams({ search: search.value, page: String(n) });
    const endpoint = "/api/admin/customers" + (id ? "/" + id + "/orders" : "");
    const data = await api.get<{ items: Row[]; total: number }>(
      endpoint + "?" + q,
    );
    items.value = data.items;
    total.value = data.total;
    page.value = n;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
onMounted(() => load());
</script>
<template>
  <h1>{{ id ? "Pedidos do cliente" : "Clientes" }}</h1>
  <form v-if="!id" @submit.prevent="load()">
    <label>Nome do cliente<input v-model="search" /></label
    ><button :disabled="busy">Pesquisar</button>
  </form>
  <p v-if="error" role="alert">{{ error }}</p>
  <p v-else-if="busy">Carregando…</p>
  <p v-else>{{ total }} registro(s)</p>
  <ul>
    <li v-for="r in items" :key="r.id">
      <RouterLink :to="(id ? '/admin/pedidos/' : '/admin/clientes/') + r.id">{{
        id ? r.order_code : r.full_name
      }}</RouterLink>
      ·
      {{
        id
          ? [date(r.created_at), labels[r.order_status], money(r.total)].join(
              " · ",
            )
          : r.phone
      }}
    </li>
  </ul>
  <div class="actions">
    <button :disabled="busy || page <= 1" @click="load(page - 1)">
      Anterior</button
    ><button :disabled="busy || page * 30 >= total" @click="load(page + 1)">
      Próxima
    </button>
  </div>
</template>
