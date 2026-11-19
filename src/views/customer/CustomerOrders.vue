<script setup lang="ts">
import { ref, watch } from "vue";
import { useRoute } from "vue-router";
import { api } from "@/services/api-client";
import { labels, date, money, type Order } from "../admin/order-display";
interface Detail extends Order {
  created_at: string;
  payment_method: string;
  order_items: {
    id: string;
    quantity: number;
    product_name_snapshot: string;
    variant_name_snapshot: string;
    line_total: number;
  }[];
  order_status_history: { new_status: string; changed_at: string }[];
}
const route = useRoute(),
  items = ref<Order[]>([]),
  detail = ref<Detail>(),
  error = ref(""),
  page = ref(1),
  total = ref(0),
  busy = ref(false);
let sequence = 0;
async function load(n = 1) {
  const current = ++sequence;
  error.value = "";
  busy.value = true;
  detail.value = undefined;
  items.value = [];
  total.value = 0;
  try {
    if (route.params.id) {
      const result = await api.get<Detail>("/api/orders/" + route.params.id);
      if (sequence === current) detail.value = result;
    } else {
      const result = await api.get<{ items: Order[]; total: number }>(
        "/api/orders?page=" + n,
      );
      if (sequence === current) {
        items.value = result.items;
        total.value = result.total;
        page.value = n;
      }
    }
  } catch (e) {
    if (sequence === current) error.value = (e as Error).message;
  } finally {
    if (sequence === current) busy.value = false;
  }
}
watch(
  () => route.params.id,
  () => load(),
  { immediate: true },
);
</script>
<template>
  <main class="mx-auto max-w-3xl p-6">
    <h1 class="my-4 font-display text-3xl">
      {{ detail ? "Pedido " + detail.order_code : "Meus pedidos" }}
    </h1>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-else-if="busy">Carregando…</p>
    <template v-else-if="detail"
      ><p>Pedido · {{ labels[detail.order_status] }}</p>
      <p>
        Pagamento · {{ labels[detail.payment_status] }} ·
        {{ labels[detail.payment_method] }}
      </p>
      <p>{{ date(detail.created_at) }} · {{ money(detail.total) }}</p>
      <h2 class="mt-4 font-bold">Itens</h2>
      <ul>
        <li v-for="i in detail.order_items" :key="i.id">
          {{ i.quantity }} × {{ i.product_name_snapshot }}
          {{ i.variant_name_snapshot }} · {{ money(i.line_total) }}
        </li>
      </ul>
      <h2 class="mt-4 font-bold">Histórico</h2>
      <ol>
        <li v-for="h in detail.order_status_history">
          {{ date(h.changed_at) }} · {{ labels[h.new_status] }}
        </li>
      </ol>
      <RouterLink
        class="inline-flex min-h-11 items-center underline"
        to="/meus-pedidos"
        >Voltar aos pedidos</RouterLink
      ></template
    >
    <template v-else
      ><p>{{ total }} pedido(s)</p>
      <ul>
        <li v-for="o in items" :key="o.id">
          <RouterLink
            class="inline-flex min-h-11 items-center underline"
            :to="'/meus-pedidos/' + o.id"
            >{{ o.order_code }}</RouterLink
          >
          · {{ labels[o.order_status] }} · Pagamento
          {{ labels[o.payment_status]?.toLowerCase() }} · {{ money(o.total) }}
        </li>
      </ul>
      <button
        class="min-h-11 px-3"
        :disabled="page <= 1"
        @click="load(page - 1)"
      >
        Anterior</button
      ><button
        class="min-h-11 px-3"
        :disabled="page * 20 >= total"
        @click="load(page + 1)"
      >
        Próxima
      </button></template
    >
  </main>
</template>
