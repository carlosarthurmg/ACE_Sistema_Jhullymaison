import { afterEach, describe, expect, it, vi } from "vitest";
import { OrderServiceError, createOrder } from "../../src/services/orders.service";
import type { CreateOrderPayload } from "../../src/types/cart.types";

const payload: CreateOrderPayload = {
  items: [{ product_id: "p1", variant_id: null, addon_ids: [], quantity: 1, personalization_note: null }],
  fulfillment_type: "pickup", desired_date: "2026-11-28", desired_time: "15:00",
  recipient_name: null, recipient_phone: null, card_message: null, customer_note: null, payment_method: "pix",
};

const respond = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
afterEach(() => vi.unstubAllGlobals());

async function failure(status: number, body: unknown): Promise<OrderServiceError> {
  vi.stubGlobal("fetch", respond(status, body));
  try { await createOrder(payload); } catch (e) { return e as OrderServiceError; }
  throw new Error("deveria falhar");
}

describe("createOrder", () => {
  it("201 devolve o pedido e envia só o payload do contrato, com cookie e JSON", async () => {
    const data = { order: { id: "1", order_code: "JM-0001" }, pix_key: "k", whatsapp: { url: "https://wa.me/55?text=a", message: "a" } };
    const fetchMock = respond(201, { data, error: null });
    vi.stubGlobal("fetch", fetchMock);
    expect(await createOrder(payload)).toEqual(data);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/orders");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("same-origin");
    const sent = JSON.parse(init.body as string);
    expect(JSON.stringify(sent)).not.toMatch(/price|total|product_name|preco/i);
  });

  it("401 pede autenticação", async () => {
    const e = await failure(401, { data: null, error: { code: "UNAUTHORIZED", message: "interno" } });
    expect(e).toMatchObject({ kind: "auth", status: 401 });
    expect(e.message).not.toContain("interno");
  });

  it("400 mostra mensagem curta de validação", async () => {
    const e = await failure(400, { data: null, error: { code: "VALIDATION_ERROR", message: "Informe a data desejada." } });
    expect(e).toMatchObject({ kind: "validation", message: "Informe a data desejada." });
  });

  it("409 OUT_OF_STOCK e PRODUCT_UNAVAILABLE trazem os itens de details", async () => {
    for (const code of ["OUT_OF_STOCK", "PRODUCT_UNAVAILABLE"]) {
      const e = await failure(409, { data: null, error: { code, message: "x", details: [{ product_id: "p1", name: "Buquê", available_quantity: 2 }, { lixo: true }] } });
      expect(e.kind).toBe("unavailable");
      expect(e.details).toEqual([{ product_id: "p1", name: "Buquê", available_quantity: 2 }]);
    }
  });

  it("409 VARIANT_INVALID orienta a remover o item", async () => {
    const e = await failure(409, { data: null, error: { code: "VARIANT_INVALID", message: "x" } });
    expect(e.kind).toBe("variant");
  });

  it("5xx e resposta quebrada não vazam detalhes internos", async () => {
    const e = await failure(500, { data: null, error: { code: "INTERNAL", message: "stack trace secreto" } });
    expect(e.kind).toBe("unknown");
    expect(e.message).not.toContain("secreto");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 502 })));
    await expect(createOrder(payload)).rejects.toMatchObject({ kind: "unknown" });
  });

  it("falha de rede vira mensagem amigável", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("failed"); }));
    await expect(createOrder(payload)).rejects.toMatchObject({ kind: "network" });
  });
});
