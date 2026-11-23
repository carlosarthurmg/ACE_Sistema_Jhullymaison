<script setup lang="ts">
import { computed, ref, onMounted } from "vue";
import { useRoute } from "vue-router";
import { api } from "@/services/api-client";
import { date, money, labels, type Order } from "./order-display";
import { pricePurchasedItems, type PurchasedItem } from "../order-pricing";

interface Detail extends Order {
  payment_method: string;
  recipient_name: string;
  recipient_phone: string;
  card_message: string;
  customer_note: string;
  desired_at: string | null;
  profiles: { full_name: string; phone: string; anonymized_at: string | null };
  delivery_address_snapshot: Record<string, string> | null;
  order_items: (PurchasedItem & {
    id: string;
    product_name_snapshot: string;
    variant_name_snapshot: string;
    personalization_note: string;
    quantity: number;
    order_item_addons: {
      id: string;
      addon_name_snapshot: string;
      unit_price_snapshot: number;
      quantity: number;
    }[];
  })[];
  order_status_history: { changed_at: string; new_status: string }[];
}
const url = "/api/admin/orders/" + useRoute().params.id;
const order = ref<Detail>(),
  error = ref(""),
  busy = ref(false);
const next = computed(() => {
  const o = order.value;
  if (o?.order_status === "awaiting_payment") return "preparing";
  if (o?.order_status === "preparing")
    return o.fulfillment_type === "delivery" ? "shipped" : "ready_for_pickup";
  if (
    o &&
    ["ready_for_pickup", "shipped"].includes(o.order_status) &&
    o.payment_status === "paid"
  )
    return "delivered";
  return "";
});
async function load() {
  order.value = await api.get<Detail>(url);
}
async function change(action: string) {
  if (busy.value || !window.confirm("Confirma esta alteração no pedido?"))
    return;
  busy.value = true;
  error.value = "";
  try {
    if (action === "cancel") await api.post(url + "/cancel");
    else
      await api.patch(
        url + "/" + action,
        action === "payment"
          ? { payment_status: "paid" }
          : { status: next.value },
      );
    await load();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
onMounted(() => load().catch((e) => (error.value = e.message)));
const breakdown = computed(() => pricePurchasedItems(order.value?.order_items ?? []));
</script>
<template>
  <p v-if="error" role="alert">{{ error }}</p>
  <template v-if="order">
    <h1>Pedido {{ order.order_code }}</h1>
    <p>
      {{ labels[order.order_status] }} · {{ labels[order.payment_status] }} ·
      {{ labels[order.payment_method] }} · {{ money(order.total) }}
    </p>
    <h2>Cliente e entrega</h2>
    <p>
      {{
        order.profiles.anonymized_at
          ? "Cliente anonimizado"
          : order.profiles.full_name + " · " + order.profiles.phone
      }}
    </p>
    <p>
      {{ labels[order.fulfillment_type] }}
      <span v-if="order.desired_at">· {{ date(order.desired_at) }}</span>
    </p>
    <p v-if="order.delivery_address_snapshot">
      {{
        Object.values(order.delivery_address_snapshot)
          .filter(Boolean)
          .join(", ")
      }}
    </p>
    <p v-if="order.recipient_name">
      Destinatário · {{ order.recipient_name }} {{ order.recipient_phone }}
    </p>
    <p v-if="order.card_message">Cartão · {{ order.card_message }}</p>
    <h2>Itens</h2>
    <ul>
      <li v-for="i in breakdown.lines" :key="i.id">
        {{ i.quantity }} × {{ i.product_name_snapshot }}
        {{ i.variant_name_snapshot }} · {{ money(i.itemTotal) }}
        <p>{{ i.personalization_note }}</p>
        <span v-for="a in i.order_item_addons" :key="a.id">
          + {{ a.quantity }} × {{ a.addon_name_snapshot }}</span
        >
      </li>
    </ul>
    <p>Subtotal dos itens: {{ money(breakdown.subtotal) }}</p>
    <p v-if="order.customer_note">{{ order.customer_note }}</p>
    <h2>Histórico</h2>
    <ol>
      <li v-for="h in order.order_status_history">
        {{ date(h.changed_at) }} · {{ labels[h.new_status] }}
      </li>
    </ol>
    <div
      v-if="!['delivered', 'cancelled'].includes(order.order_status)"
      class="actions"
    >
      <button v-if="next" :disabled="busy" @click="change('status')">
        Marcar como {{ labels[next]?.toLowerCase() }}
      </button>
      <button
        v-if="order.payment_status === 'pending'"
        :disabled="busy"
        @click="change('payment')"
      >
        Confirmar pagamento conferido
      </button>
      <button :disabled="busy" @click="change('cancel')">
        Cancelar pedido
      </button>
    </div></template
  >
</template>
