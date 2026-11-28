import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { CART_STORAGE_KEY, MAX_LINES, lineKey, parseStoredCart, useCartStore } from "../../src/stores/cart.store";
import type { CreatedOrder } from "../../src/types/cart.types";

class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
  removeItem(k: string) { this.data.delete(k); }
}

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const V = "33333333-3333-4333-8333-333333333333";
const A1 = "44444444-4444-4444-8444-444444444444";
const A2 = "55555555-5555-4555-8555-555555555555";

let local: MemoryStorage;
let session: MemoryStorage;
beforeEach(() => {
  local = new MemoryStorage();
  session = new MemoryStorage();
  vi.stubGlobal("localStorage", local);
  vi.stubGlobal("sessionStorage", session);
  setActivePinia(createPinia());
});

describe("adicionar, alterar e remover", () => {
  it("adiciona, soma linhas iguais e separa linhas diferentes", async () => {
    const cart = useCartStore();
    await cart.addItem({ product_id: P1, variant_id: V, addon_ids: [A1, A2], quantity: 1, personalization_note: " Laço " });
    await cart.addItem({ product_id: P1, variant_id: V, addon_ids: [A2, A1], quantity: 2, personalization_note: "laço" });
    await cart.addItem({ product_id: P1, variant_id: null, quantity: 1 });
    expect(cart.items).toHaveLength(2);
    expect(cart.items[0].quantity).toBe(3);
    expect(cart.itemCount).toBe(4);
  });

  it("altera a quantidade e rejeita valores inválidos", async () => {
    const cart = useCartStore();
    await cart.addItem({ product_id: P1, quantity: 2 });
    const key = cart.items[0].key;
    expect(cart.setQuantity(key, 5)).toBe(true);
    for (const bad of [0, -1, 1.5, 21, Number.NaN]) expect(cart.setQuantity(key, bad)).toBe(false);
    expect(cart.items[0].quantity).toBe(5);
  });

  it("limita a 20 por linha e rejeita quantidade inválida ao adicionar", async () => {
    const cart = useCartStore();
    await cart.addItem({ product_id: P1, quantity: 15 });
    await cart.addItem({ product_id: P1, quantity: 15 });
    expect(cart.items[0].quantity).toBe(20);
    await expect(cart.addItem({ product_id: P1, quantity: 0 })).rejects.toThrow();
    await expect(cart.addItem({ product_id: P1, quantity: 21 })).rejects.toThrow();
    await expect(cart.addItem({ product_id: "", quantity: 1 })).rejects.toThrow();
  });

  it("limita o número de linhas diferentes", async () => {
    const cart = useCartStore();
    for (let i = 0; i < MAX_LINES; i++) await cart.addItem({ product_id: `p${i}`, quantity: 1 });
    await expect(cart.addItem({ product_id: "extra", quantity: 1 })).rejects.toThrow();
  });

  it("remove item e esvazia o carrinho", async () => {
    const cart = useCartStore();
    await cart.addItem({ product_id: P1, quantity: 1 });
    await cart.addItem({ product_id: P2, quantity: 1 });
    cart.removeItem(cart.items[0].key);
    expect(cart.items.map((i) => i.product_id)).toEqual([P2]);
    cart.clear();
    expect(cart.isEmpty).toBe(true);
  });
});

describe("persistência em localStorage (jm_cart_v1)", () => {
  it("sobrevive ao recarregar e guarda só ids, opções e quantidades", async () => {
    const cart = useCartStore();
    await cart.addItem({ product_id: P1, product_slug: "buque", variant_id: V, addon_ids: [A1], quantity: 2, personalization_note: "oi" });
    const raw = local.getItem(CART_STORAGE_KEY)!;
    expect(raw).not.toMatch(/price|total|name|preco/i);
    setActivePinia(createPinia()); // simula recarregar a página
    const again = useCartStore();
    expect(again.items).toHaveLength(1);
    expect(again.items[0]).toMatchObject({ product_id: P1, product_slug: "buque", variant_id: V, addon_ids: [A1], quantity: 2 });
  });

  it("dados corrompidos ou antigos não quebram: viram carrinho vazio", () => {
    for (const raw of [null, "", "{", "[]", "null", '{"items":"x"}', '{"items":[1,null,{"product_id":5}]}']) {
      expect(parseStoredCart(raw)).toEqual([]);
    }
    local.setItem(CART_STORAGE_KEY, "{ lixo");
    expect(useCartStore().items).toEqual([]);
  });

  it("descarta linhas inválidas e ignora campos de preço adulterados", () => {
    const raw = JSON.stringify({
      items: [
        { product_id: P1, quantity: 2, unit_price: 0.01, price: 1, total: 1, product_name: "x", addon_ids: [A1, A1] },
        { product_id: P2, quantity: 999 },
        { product_id: P2, quantity: 1, variant_id: 7 },
      ],
    });
    const items = parseStoredCart(raw);
    expect(items).toHaveLength(1);
    expect(items[0]).not.toHaveProperty("unit_price");
    expect(items[0].addon_ids).toEqual([A1]);
  });

  it("funciona mesmo se o armazenamento estiver indisponível", async () => {
    vi.stubGlobal("localStorage", { getItem() { throw new Error("x"); }, setItem() { throw new Error("x"); }, removeItem() {} });
    setActivePinia(createPinia());
    const cart = useCartStore();
    await cart.addItem({ product_id: P1, quantity: 1 });
    expect(cart.itemCount).toBe(1);
  });
});

describe("payload e indisponibilidade (D17)", () => {
  it("toOrderItems envia só ids, opções e quantidades", async () => {
    const cart = useCartStore();
    await cart.addItem({ product_id: P1, product_slug: "buque", variant_id: V, addon_ids: [A1], quantity: 2, personalization_note: "oi" });
    expect(cart.toOrderItems()).toEqual([{ product_id: P1, variant_id: V, addon_ids: [A1], quantity: 2, personalization_note: "oi" }]);
  });

  it("marca itens do 409, ajusta ao estoque e remove os indisponíveis", async () => {
    const cart = useCartStore();
    await cart.addItem({ product_id: P1, quantity: 5 });
    await cart.addItem({ product_id: P2, quantity: 1 });
    cart.markUnavailable([
      { product_id: P1, name: "A", available_quantity: 2 },
      { product_id: P2, name: "B", available_quantity: 0 },
      { product_id: "fora", name: "C", available_quantity: 0 },
    ]);
    expect(cart.hasBlockingIssues).toBe(true);
    expect(Object.keys(cart.unavailable).sort()).toEqual([P1, P2].sort());
    cart.fitToAvailable(P1);
    expect(cart.items.find((i) => i.product_id === P1)!.quantity).toBe(2);
    cart.removeUnavailable();
    expect(cart.items.map((i) => i.product_id)).toEqual([P1]);
    expect(cart.hasBlockingIssues).toBe(false);
  });

  it("finishOrder guarda o retorno do servidor e esvazia o carrinho", async () => {
    const cart = useCartStore();
    await cart.addItem({ product_id: P1, quantity: 1 });
    const created = { order: { order_code: "JM-0001", id: "x" }, pix_key: null, whatsapp: null } as unknown as CreatedOrder;
    cart.finishOrder(created);
    expect(cart.isEmpty).toBe(true);
    expect(JSON.parse(local.getItem(CART_STORAGE_KEY)!).items).toEqual([]);
    setActivePinia(createPinia());
    expect(useCartStore().lastOrder?.order.order_code).toBe("JM-0001");
  });
});

it("lineKey ignora caixa, espaços e ordem dos adicionais", () => {
  const a = lineKey({ product_id: P1, variant_id: V, addon_ids: [A1, A2], personalization_note: " X " });
  const b = lineKey({ product_id: P1, variant_id: V, addon_ids: [A2, A1], personalization_note: "x" });
  expect(a).toBe(b);
});
