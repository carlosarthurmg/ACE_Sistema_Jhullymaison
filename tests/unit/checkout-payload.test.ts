import { describe, expect, it } from "vitest";
import { buildOrderPayload, emptyAddress, nowInFortaleza, validateCheckout, type CheckoutForm } from "../../src/utils/checkout-payload";

const now = new Date("2026-11-27T15:00:00Z"); // 12:00 em Fortaleza
const items = [{ product_id: "p1", variant_id: null, addon_ids: [], quantity: 1, personalization_note: null }];
const address = { postal_code: "64000-000", street: "Rua A", number: "10", complement: "", neighborhood: "Centro", city: "Teresina", state: "pi" };
const base = (over: Partial<CheckoutForm> = {}): CheckoutForm => ({
  fulfillment_type: "delivery", desired_date: "2026-11-28", desired_time: "15:00", address, gift: false,
  recipient_name: "", recipient_phone: "", card_message: "", customer_note: "", payment_method: "pix", ...over,
});

describe("fuso de Fortaleza", () => {
  it("converte o instante para data e hora locais (UTC-3)", () => {
    expect(nowInFortaleza(now)).toEqual({ date: "2026-11-27", time: "12:00" });
    expect(nowInFortaleza(new Date("2026-11-28T01:30:00Z"))).toEqual({ date: "2026-11-27", time: "22:30" });
  });
});

describe("validateCheckout", () => {
  it("formulário completo de entrega é válido", () => {
    expect(validateCheckout(base(), now)).toEqual({});
  });
  it("entrega exige endereço completo", () => {
    const e = validateCheckout(base({ address: { ...emptyAddress(), city: "" } }), now);
    expect(Object.keys(e).sort()).toEqual(["city", "neighborhood", "number", "postal_code", "street"].sort());
  });
  it("retirada não exige endereço", () => {
    expect(validateCheckout(base({ fulfillment_type: "pickup", address: emptyAddress() }), now)).toEqual({});
  });
  it("data no passado e horário que já passou hoje são recusados", () => {
    expect(validateCheckout(base({ desired_date: "2026-11-26" }), now).desired_date).toBeTruthy();
    expect(validateCheckout(base({ desired_date: "2026-11-27", desired_time: "11:00" }), now).desired_time).toBeTruthy();
    expect(validateCheckout(base({ desired_date: "2026-11-27", desired_time: "18:00" }), now)).toEqual({});
  });
  it("presente exige nome e telefone do destinatário", () => {
    const e = validateCheckout(base({ gift: true, recipient_phone: "123" }), now);
    expect(Object.keys(e).sort()).toEqual(["recipient_name", "recipient_phone"]);
  });
});

describe("buildOrderPayload", () => {
  it("entrega leva o endereço normalizado e nenhum preço", () => {
    const p = buildOrderPayload(items, base());
    expect(p.delivery_address).toMatchObject({ postal_code: "64000000", state: "PI" });
    expect(JSON.stringify(p)).not.toMatch(/price|total|product_name|preco/i);
    expect(p.payment_method).toBe("pix");
  });
  it("retirada omite o endereço", () => {
    expect(buildOrderPayload(items, base({ fulfillment_type: "pickup" }))).not.toHaveProperty("delivery_address");
  });
  it("destinatário só vai quando é presente; textos vazios viram null", () => {
    const sem = buildOrderPayload(items, base({ recipient_name: "Ana", recipient_phone: "86999999999" }));
    expect(sem.recipient_name).toBeNull();
    const com = buildOrderPayload(items, base({ gift: true, recipient_name: " Ana ", recipient_phone: "(86) 99999-9999", card_message: "  " }));
    expect(com).toMatchObject({ recipient_name: "Ana", recipient_phone: "(86) 99999-9999", card_message: null });
  });
});
