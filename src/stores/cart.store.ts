// Carrinho (RF26, RF27, RN09, RN23). Arquivo ÚNICO deste PR: tipos e regras de mesclagem vivem aqui.
//  - Visitante: itens no localStorage (só IDs, opções, quantidades e um "display" informativo).
//  - Logado: carrinho no banco via /api/cart (o servidor recalcula preço e remove indisponíveis).
// O navegador NUNCA calcula preço nem total. Visitante vê só o preço informado pelo catálogo.
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { api, ApiError } from "@/services/api-client";

// ---------- Tipos (reexportados em src/types/cart.types.ts) ----------

export interface CartAddonSelection {
  addon_id: string;
  quantity: number; // por unidade do item
}

/** Entrada para adicionar/atualizar item. Nunca contém preço. */
export interface CartItemInput {
  product_id: string;
  variant_id?: string | null;
  quantity: number;
  personalization_note?: string | null;
  addons?: CartAddonSelection[];
}

/** Dados só para EXIBIR o carrinho do visitante (vêm do catálogo; o servidor não confia neles). */
export interface GuestDisplay {
  slug: string;
  name: string;
  image_url?: string | null;
  image_alt?: string | null;
  variant_name?: string | null;
  addon_names?: Record<string, string>;
  unit_price?: number | null;
}

/** Contrato com o catálogo (Rodolfo): aceita `addon_ids` (cada adicional entra com quantidade 1). */
export type AddItemInput = CartItemInput & { addon_ids?: string[] };

export type LocalCartItem = CartItemInput & { local_id: string; display: GuestDisplay };

export interface CartItemView {
  id: string; // cart_items.id (logado) ou local_id (visitante)
  product_id: string;
  product_slug: string;
  product_name: string;
  image_url: string | null;
  image_alt: string | null;
  variant_id: string | null;
  variant_name: string | null;
  quantity: number;
  personalization_note: string | null;
  unit_price: number | null; // preço efetivo (pricing.ts). Visitante: informado pelo catálogo
  original_unit_price: number | null; // só quando há promoção vigente
  discount_percent: number;
  addons: { addon_id: string; name: string; unit_price: number | null; quantity: number; line_total: number | null }[];
  product_line_total: number | null;
  line_total: number | null; // produto + adicionais. null para visitante (calculado ao entrar)
  stock_available: number | null;
}

export interface RemovedItem {
  item_id: string;
  product_name: string;
  reason: "product_unavailable" | "out_of_stock" | "variant_unavailable";
}

export interface AdjustedItem {
  item_id: string;
  product_name: string;
  reason: "quantity_adjusted" | "addon_removed";
  available?: number;
}

export interface CartView {
  items: CartItemView[];
  subtotal: number | null;
  item_count: number;
  removed_items: RemovedItem[];
  adjusted_items: AdjustedItem[];
}

export type FulfillmentType = "delivery" | "pickup";
export type PaymentMethod = "pix" | "cash_on_delivery" | "card_on_delivery";

export interface AddressSnapshot {
  label: string | null;
  recipient_name: string | null;
  postal_code: string;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
}

/** Pedido recém-criado (resposta de POST /api/orders). */
export interface OrderDetailData {
  id: string;
  order_code: string;
  order_status: string;
  payment_status: string;
  payment_method: PaymentMethod;
  fulfillment_type: FulfillmentType;
  desired_at: string | null;
  delivery_address_snapshot: AddressSnapshot | null;
  recipient_name: string | null;
  recipient_phone: string | null;
  card_message: string | null;
  customer_note: string | null;
  subtotal: number;
  total: number;
  created_at: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  items: {
    product_name: string;
    variant_name: string | null;
    quantity: number;
    unit_price: number;
    personalization_note: string | null;
    line_total: number; // só o produto (convenção do pricing.ts)
    addons: { name: string; quantity: number; unit_price: number; line_total: number }[];
  }[];
  replayed?: boolean;
}

// ---------- Regras locais ----------

const GUEST_STORAGE_KEY = "jm_guest_cart_v1";
const LAST_ORDER_KEY = "jm_last_order_v1";
const MAX_ITEM_QUANTITY = 20;
const GUEST_CART_MAX_ITEMS = 30;

/** Chave de mesclagem: mesmo produto + variação + adicionais + observação = mesmo item. */
export function itemKey(
  i: Pick<CartItemInput, "product_id" | "variant_id" | "personalization_note" | "addons">,
): string {
  const addons = [...(i.addons ?? [])]
    .sort((a, b) => a.addon_id.localeCompare(b.addon_id))
    .map((a) => `${a.addon_id}:${a.quantity}`)
    .join(",");
  const note = (i.personalization_note ?? "").trim().toLowerCase();
  return [i.product_id, i.variant_id ?? "", addons, note].join("|");
}

function readJson<T>(storage: Storage, key: string, fallback: T): T {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function readGuestItems(): LocalCartItem[] {
  const parsed = readJson<unknown>(localStorage, GUEST_STORAGE_KEY, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (i): i is LocalCartItem =>
      !!i && typeof i.local_id === "string" && typeof i.product_id === "string" && Number.isInteger(i.quantity) && !!i.display,
  );
}

const emptyView = (): CartView => ({ items: [], subtotal: null, item_count: 0, removed_items: [], adjusted_items: [] });

function guestToView(items: LocalCartItem[]): CartView {
  return {
    items: items.map((l) => ({
      id: l.local_id,
      product_id: l.product_id,
      product_slug: l.display.slug,
      product_name: l.display.name,
      image_url: l.display.image_url ?? null,
      image_alt: l.display.image_alt ?? null,
      variant_id: l.variant_id ?? null,
      variant_name: l.display.variant_name ?? null,
      quantity: l.quantity,
      personalization_note: l.personalization_note ?? null,
      unit_price: l.display.unit_price ?? null,
      original_unit_price: null,
      discount_percent: 0,
      addons: (l.addons ?? []).map((a) => ({
        addon_id: a.addon_id,
        name: l.display.addon_names?.[a.addon_id] ?? "Adicional",
        unit_price: null,
        quantity: a.quantity,
        line_total: null,
      })),
      product_line_total: null,
      line_total: null,
      stock_available: null,
    })),
    subtotal: null,
    item_count: items.reduce((s, i) => s + i.quantity, 0),
    removed_items: [],
    adjusted_items: [],
  };
}

const messageOf = (e: unknown) => (e instanceof Error && e.message ? e.message : "Não foi possível atualizar o carrinho.");

export const useCartStore = defineStore("cart", () => {
  const mode = ref<"unknown" | "guest" | "user">("unknown");
  const serverView = ref<CartView>(emptyView());
  const guestItems = ref<LocalCartItem[]>(readGuestItems());
  const loading = ref(false);
  const busyItemId = ref<string | null>(null);
  const error = ref<string | null>(null);
  const lastOrder = ref<OrderDetailData | null>(readJson<OrderDetailData | null>(sessionStorage, LAST_ORDER_KEY, null));

  const isLoggedIn = computed(() => mode.value === "user");
  const view = computed<CartView>(() => (mode.value === "user" ? serverView.value : guestToView(guestItems.value)));
  const itemCount = computed(() => view.value.item_count);
  const isEmpty = computed(() => view.value.items.length === 0);

  function persistGuest() {
    try {
      localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(guestItems.value));
    } catch {
      /* armazenamento indisponível: o carrinho vale só nesta sessão */
    }
  }

  /** Abre o carrinho: se há sessão, o GET /api/cart revalida e remove indisponíveis (RN23). */
  async function refresh() {
    loading.value = true;
    error.value = null;
    try {
      serverView.value = await api.get<CartView>("/api/cart");
      mode.value = "user";
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) mode.value = "guest";
      else error.value = messageOf(e);
    } finally {
      loading.value = false;
    }
  }

  /** Chamar uma vez ao iniciar o app (depois do router). Descobre se há sessão. */
  async function init() {
    await refresh();
    if (mode.value === "user" && guestItems.value.length > 0) await onLogin();
  }

  /** Adiciona ao carrinho. `display` (nome, foto…) só serve para exibir o carrinho do visitante. Erros (409 etc.) são lançados. */
  async function addItem(raw: AddItemInput, display?: GuestDisplay): Promise<CartView> {
    const { addon_ids, ...rest } = raw;
    const input: CartItemInput = { ...rest, addons: rest.addons ?? (addon_ids ?? []).map((id) => ({ addon_id: id, quantity: 1 })) };
    if (mode.value === "unknown") await refresh();
    if (mode.value === "user") {
      serverView.value = await api.put<CartView>("/api/cart/items", input);
      return serverView.value;
    }
    // Sem `display` o item entra mesmo assim (o servidor valida tudo no login); só a vitrine local fica genérica.
    const shown: GuestDisplay = display ?? { slug: "", name: "Produto" };
    const existing = guestItems.value.find((l) => itemKey(l) === itemKey(input));
    if (existing) existing.quantity = Math.min(existing.quantity + input.quantity, MAX_ITEM_QUANTITY);
    else {
      if (guestItems.value.length >= GUEST_CART_MAX_ITEMS) throw new Error("Seu carrinho está cheio. Finalize ou remova itens.");
      guestItems.value.push({ ...input, local_id: crypto.randomUUID(), display: shown });
    }
    persistGuest();
    return view.value;
  }

  async function updateQuantity(itemId: string, quantity: number) {
    const item = view.value.items.find((i) => i.id === itemId);
    if (!item) return;
    busyItemId.value = itemId;
    error.value = null;
    try {
      if (mode.value === "user") {
        serverView.value = await api.put<CartView>("/api/cart/items", {
          item_id: itemId,
          product_id: item.product_id,
          variant_id: item.variant_id,
          quantity,
          personalization_note: item.personalization_note,
          addons: item.addons.map((a) => ({ addon_id: a.addon_id, quantity: a.quantity })),
        });
      } else {
        const local = guestItems.value.find((l) => l.local_id === itemId);
        if (local) {
          local.quantity = Math.max(1, Math.min(quantity, MAX_ITEM_QUANTITY));
          persistGuest();
        }
      }
    } catch (e) {
      error.value = messageOf(e);
      await refresh();
    } finally {
      busyItemId.value = null;
    }
  }

  async function removeItem(itemId: string) {
    busyItemId.value = itemId;
    error.value = null;
    try {
      if (mode.value === "user") {
        serverView.value = await api.delete<CartView>(`/api/cart/items/${itemId}`);
      } else {
        guestItems.value = guestItems.value.filter((l) => l.local_id !== itemId);
        persistGuest();
      }
    } catch (e) {
      error.value = messageOf(e);
    } finally {
      busyItemId.value = null;
    }
  }

  /** Chamar depois de login/cadastro bem-sucedido: mescla o carrinho do navegador ao da conta (RF26). */
  async function onLogin() {
    loading.value = true;
    error.value = null;
    try {
      if (guestItems.value.length > 0) {
        serverView.value = await api.post<CartView>("/api/cart/merge", {
          items: guestItems.value.map(({ local_id: _id, display: _display, ...rest }) => rest),
        });
        guestItems.value = [];
        persistGuest();
      } else {
        serverView.value = await api.get<CartView>("/api/cart");
      }
      mode.value = "user";
    } catch (e) {
      error.value = messageOf(e); // o carrinho local é mantido para nova tentativa
    } finally {
      loading.value = false;
    }
  }

  /** Chamar depois do logout. */
  function onLogout() {
    mode.value = "guest";
    serverView.value = emptyView();
  }

  function clearAfterOrder(order: OrderDetailData) {
    serverView.value = emptyView();
    lastOrder.value = order;
    try {
      sessionStorage.setItem(LAST_ORDER_KEY, JSON.stringify(order));
    } catch {
      /* sem sessionStorage: a tela busca o pedido na API */
    }
  }

  return {
    mode, loading, busyItemId, error, lastOrder,
    isLoggedIn, view, itemCount, isEmpty,
    init, refresh, addItem, updateQuantity, removeItem, onLogin, onLogout, clearAfterOrder,
  };
});
