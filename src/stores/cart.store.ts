// Carrinho SOMENTE no navegador (D9): localStorage, chave jm_cart_v1, logado ou não.
// Guarda só identificadores e opções. NÃO calcula nem determina preço: o servidor recalcula tudo em POST /api/orders.
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { AddItemInput, CartItem, CreatedOrder, OrderItemPayload, UnavailableDetail } from "@/types/cart.types";

export const CART_STORAGE_KEY = "jm_cart_v1";
export const LAST_ORDER_KEY = "jm_last_order_v1";
export const MAX_QUANTITY = 20; // GUIA_CENTRAL 5.3
export const MAX_LINES = 20;
export const MAX_NOTE_LENGTH = 500;

const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 64;
const isQuantity = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= MAX_QUANTITY;

/** Mesma linha = mesmo produto + variação + adicionais (qualquer ordem) + observação. */
export function lineKey(i: Pick<CartItem, "product_id" | "variant_id" | "addon_ids" | "personalization_note">): string {
  const addons = [...i.addon_ids].sort().join(",");
  return [i.product_id, i.variant_id ?? "", addons, (i.personalization_note ?? "").trim().toLowerCase()].join("|");
}

/** Lê e valida o que está no storage. Dado antigo, corrompido ou adulterado vira carrinho vazio (ou linhas válidas), nunca erro. */
export function parseStoredCart(raw: string | null): CartItem[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const list = (parsed as { items?: unknown } | null)?.items;
  if (!Array.isArray(list)) return [];
  const out: CartItem[] = [];
  for (const it of list.slice(0, MAX_LINES)) {
    const r = it as Record<string, unknown> | null;
    if (!r || !isId(r.product_id) || !isQuantity(r.quantity)) continue;
    const variant = r.variant_id === null || r.variant_id === undefined ? null : isId(r.variant_id) ? r.variant_id : undefined;
    if (variant === undefined) continue;
    const addons = Array.isArray(r.addon_ids) ? r.addon_ids.filter(isId).slice(0, 10) : [];
    const note = typeof r.personalization_note === "string" && r.personalization_note.trim() ? r.personalization_note.trim().slice(0, MAX_NOTE_LENGTH) : null;
    const base = { product_id: r.product_id, variant_id: variant, addon_ids: [...new Set(addons)], personalization_note: note };
    const key = lineKey(base);
    if (out.some((o) => o.key === key)) continue;
    out.push({ ...base, key, product_slug: isId(r.product_slug) ? r.product_slug : null, quantity: r.quantity });
  }
  return out;
}

function safeGet(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}
function safeSet(storage: () => Storage, key: string, value: string | null) {
  try {
    if (value === null) storage().removeItem(key);
    else storage().setItem(key, value);
  } catch {
    /* armazenamento indisponível: o carrinho vale só nesta aba */
  }
}

export const useCartStore = defineStore("cart", () => {
  const items = ref<CartItem[]>(parseStoredCart(safeGet(() => localStorage, CART_STORAGE_KEY)));
  // Avisos do 409 do servidor (D17), por produto. Ficam só em memória.
  const unavailable = ref<Record<string, UnavailableDetail>>({});
  const lastOrder = ref<CreatedOrder | null>(readLastOrder());

  function readLastOrder(): CreatedOrder | null {
    const raw = safeGet(() => sessionStorage, LAST_ORDER_KEY);
    if (!raw) return null;
    try {
      const v = JSON.parse(raw) as CreatedOrder;
      return v && typeof v === "object" && v.order && typeof v.order.order_code === "string" ? v : null;
    } catch {
      return null;
    }
  }

  const itemCount = computed(() => items.value.reduce((s, i) => s + i.quantity, 0));
  const isEmpty = computed(() => items.value.length === 0);
  const hasBlockingIssues = computed(() => Object.keys(unavailable.value).length > 0);

  function persist() {
    safeSet(() => localStorage, CART_STORAGE_KEY, JSON.stringify({ version: 1, items: items.value }));
  }

  /** Adiciona ao carrinho. Quantidade inválida lança erro; linhas iguais somam a quantidade. */
  async function addItem(input: AddItemInput): Promise<void> {
    if (!isId(input.product_id)) throw new Error("Produto inválido.");
    if (!isQuantity(input.quantity)) throw new Error(`A quantidade deve ser de 1 a ${MAX_QUANTITY}.`);
    const note = input.personalization_note?.trim() ? input.personalization_note.trim().slice(0, MAX_NOTE_LENGTH) : null;
    const base = {
      product_id: input.product_id,
      variant_id: input.variant_id ?? null,
      addon_ids: [...new Set((input.addon_ids ?? []).filter(isId))],
      personalization_note: note,
    };
    const key = lineKey(base);
    const existing = items.value.find((i) => i.key === key);
    if (existing) {
      existing.quantity = Math.min(existing.quantity + input.quantity, MAX_QUANTITY);
      if (input.product_slug && !existing.product_slug) existing.product_slug = input.product_slug;
    } else {
      if (items.value.length >= MAX_LINES) throw new Error(`O carrinho aceita até ${MAX_LINES} itens diferentes. Finalize ou remova algum.`);
      items.value.push({ ...base, key, product_slug: input.product_slug ?? null, quantity: input.quantity });
    }
    clearFlag(base.product_id);
    persist();
  }

  /** Altera a quantidade. Valor inválido é ignorado (retorna false); para sair do carrinho use removeItem. */
  function setQuantity(key: string, quantity: number): boolean {
    const line = items.value.find((i) => i.key === key);
    if (!line || !isQuantity(quantity)) return false;
    line.quantity = quantity;
    clearFlag(line.product_id);
    persist();
    return true;
  }

  function removeItem(key: string) {
    const line = items.value.find((i) => i.key === key);
    items.value = items.value.filter((i) => i.key !== key);
    if (line && !items.value.some((i) => i.product_id === line.product_id)) clearFlag(line.product_id);
    persist();
  }

  function clear() {
    items.value = [];
    unavailable.value = {};
    persist();
  }

  function clearFlag(productId: string) {
    if (!(productId in unavailable.value)) return;
    const { [productId]: _gone, ...rest } = unavailable.value;
    unavailable.value = rest;
  }

  /** Corpo `items` do POST /api/orders: só ids, opções e quantidades. */
  function toOrderItems(): OrderItemPayload[] {
    return items.value.map((i) => ({
      product_id: i.product_id,
      variant_id: i.variant_id,
      addon_ids: [...i.addon_ids],
      quantity: i.quantity,
      personalization_note: i.personalization_note,
    }));
  }

  /** D17: marca os produtos citados no 409. O cliente remove ou ajusta; nada é removido sozinho. */
  function markUnavailable(details: UnavailableDetail[]) {
    const next: Record<string, UnavailableDetail> = {};
    for (const d of details) if (isId(d.product_id) && items.value.some((i) => i.product_id === d.product_id)) next[d.product_id] = d;
    unavailable.value = next;
  }

  /** Remove todas as linhas dos produtos marcados como indisponíveis. */
  function removeUnavailable() {
    const ids = new Set(Object.keys(unavailable.value));
    items.value = items.value.filter((i) => !ids.has(i.product_id));
    unavailable.value = {};
    persist();
  }

  /** Ajusta a quantidade ao estoque informado pelo servidor (quando ainda há unidades). */
  function fitToAvailable(productId: string) {
    const d = unavailable.value[productId];
    if (!d || d.available_quantity < 1) return;
    let budget = Math.min(d.available_quantity, MAX_QUANTITY);
    for (const line of items.value.filter((i) => i.product_id === productId)) {
      line.quantity = Math.max(1, Math.min(line.quantity, budget));
      budget = Math.max(1, budget - line.quantity);
    }
    clearFlag(productId);
    persist();
  }

  /** Pedido criado: guarda o retorno do servidor para a confirmação e esvazia o carrinho. */
  function finishOrder(created: CreatedOrder) {
    lastOrder.value = created;
    safeSet(() => sessionStorage, LAST_ORDER_KEY, JSON.stringify(created));
    clear();
  }

  return {
    items, unavailable, lastOrder,
    itemCount, isEmpty, hasBlockingIssues,
    addItem, setQuantity, removeItem, clear, toOrderItems,
    markUnavailable, removeUnavailable, fitToAvailable, finishOrder,
  };
});
