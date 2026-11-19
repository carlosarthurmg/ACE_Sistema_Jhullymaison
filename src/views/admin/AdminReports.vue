<script setup lang="ts">
import { ref, onMounted } from "vue";
import { api } from "@/services/api-client";
import { labels, money } from "./order-display";
interface Report {
  orders: number;
  total: number;
  from: string;
  to: string;
  by_method: { payment_method: string; orders: number; total: number }[];
  products: { name: string; quantity: number }[];
}
const report = ref<Report>(),
  from = ref(""),
  to = ref(""),
  error = ref(""),
  busy = ref(false);
async function load() {
  const q = new URLSearchParams();
  if (from.value) q.set("from", from.value);
  if (to.value) q.set("to", to.value);
  error.value = "";
  busy.value = true;
  report.value = undefined;
  try {
    const r = await api.get<Report>("/api/admin/reports/sales?" + q);
    report.value = r;
    from.value = r.from;
    to.value = r.to;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
onMounted(load);
</script>
<template>
  <h1>Relatório de vendas</h1>
  <form @submit.prevent="load">
    <label>Data inicial<input v-model="from" type="date" /></label
    ><label>Data final<input v-model="to" type="date" /></label
    ><button :disabled="busy">Consultar</button>
  </form>
  <p v-if="error" role="alert">{{ error }}</p>
  <template v-if="report"
    ><h2>{{ money(report.total) }} em {{ report.orders }} pedido(s) pago(s)</h2>
    <h2>Por forma de pagamento</h2>
    <ul>
      <li v-for="m in report.by_method">
        {{ labels[m.payment_method] }} · {{ m.orders }} pedido(s) ·
        {{ money(m.total) }}
      </li>
    </ul>
    <h2>Produtos mais vendidos</h2>
    <ol>
      <li v-for="p in report.products">
        {{ p.name }} · {{ p.quantity }} unidade(s)
      </li>
    </ol></template
  >
</template>
