<script setup lang="ts">
import { ref, onMounted } from "vue";
import { api } from "@/services/api-client";
import { labels, money, type Order } from "./order-display";
const filters = ref({
  code: "",
  customer: "",
  status: "",
  payment: "",
  from: "",
  to: "",
  desired_from: "",
  desired_to: "",
});
const items = ref<(Order & { customer: { name: string } })[]>([]);
const page = ref(1),
  total = ref(0),
  error = ref(""),
  busy = ref(false);
async function load(number = 1) {
  busy.value = true;
  error.value = "";
  items.value = [];
  total.value = 0;
  try {
    const q = new URLSearchParams({ ...filters.value, page: String(number) });
    const data = await api.get<{ items: typeof items.value; total: number }>(
      "/api/admin/orders?" + q,
    );
    items.value = data.items;
    total.value = data.total;
    page.value = number;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
onMounted(() => load());
</script>
<template>
  <h1>Pedidos</h1>
  <form @submit.prevent="load()">
    <label>Código<input v-model="filters.code" placeholder="JM-0001" /></label>
    <label>Cliente<input v-model="filters.customer" /></label>
    <label
      >Status<select v-model="filters.status">
        <option value="">Todos</option>
        <option
          v-for="s in [
            'awaiting_payment',
            'preparing',
            'ready_for_pickup',
            'shipped',
            'delivered',
            'cancelled',
          ]"
          :value="s"
        >
          {{ labels[s] }}
        </option>
      </select></label
    >
    <label
      >Pagamento<select v-model="filters.payment">
        <option value="">Todos</option>
        <option v-for="s in ['paid', 'pending', 'cancelled']" :value="s">
          {{ labels[s] }}
        </option>
      </select></label
    >
    <label>Pedido de<input type="date" v-model="filters.from" /></label
    ><label>Até<input type="date" v-model="filters.to" /></label>
    <label
      >Data desejada de<input
        type="date"
        v-model="filters.desired_from" /></label
    ><label
      >Até (desejada)<input type="date" v-model="filters.desired_to"
    /></label>
    <button :disabled="busy">Filtrar</button>
  </form>
  <p v-if="error" role="alert">{{ error }}</p>
  <p v-else-if="busy">Carregando…</p>
  <p v-else>{{ total }} pedido(s)</p>
  <ul>
    <li v-for="o in items" :key="o.id">
      <RouterLink :to="'/admin/pedidos/' + o.id">{{ o.order_code }}</RouterLink>
      · {{ o.customer.name }} · {{ labels[o.order_status] }} ·
      {{ labels[o.payment_status] }} · {{ money(o.total) }}
    </li>
  </ul>
  <div class="actions">
    <button :disabled="busy || page <= 1" @click="load(page - 1)">
      Anterior</button
    ><button :disabled="busy || page * 20 >= total" @click="load(page + 1)">
      Próxima
    </button>
  </div>
</template>
