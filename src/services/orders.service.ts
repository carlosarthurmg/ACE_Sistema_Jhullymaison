// POST /api/orders (dono: Enzo; contrato: GUIA_CENTRAL 5.3). As telas não chamam o servidor direto.
// Usa fetch próprio (como o upload do catálogo) porque o ApiError compartilhado ainda não guarda `details`,
// necessário para o 409 (D17). Quando o Carlos acrescentar `details` ao ApiError, pode trocar por `api.post`.
import type { CreateOrderPayload, CreatedOrder, UnavailableDetail } from "@/types/cart.types";

export type OrderErrorKind = "auth" | "validation" | "unavailable" | "variant" | "busy" | "network" | "unknown";

export class OrderServiceError extends Error {
  kind: OrderErrorKind;
  status: number;
  details: UnavailableDetail[];

  constructor(kind: OrderErrorKind, status: number, message: string, details: UnavailableDetail[] = []) {
    super(message);
    this.kind = kind;
    this.status = status;
    this.details = details;
  }
}

interface ApiBody {
  data?: CreatedOrder | null;
  error?: { code?: string; message?: string; details?: unknown } | null;
}

function parseDetails(raw: unknown): UnavailableDetail[] {
  if (!Array.isArray(raw)) return [];
  const out: UnavailableDetail[] = [];
  for (const d of raw) {
    const r = d as Record<string, unknown> | null;
    if (!r || typeof r.product_id !== "string") continue;
    out.push({
      product_id: r.product_id,
      name: typeof r.name === "string" ? r.name : "Produto",
      available_quantity: typeof r.available_quantity === "number" && r.available_quantity >= 0 ? r.available_quantity : 0,
    });
  }
  return out;
}

/** Mensagens para o cliente. Nunca repete detalhe interno do servidor. */
export function toOrderError(status: number, body: ApiBody | null): OrderServiceError {
  const code = body?.error?.code ?? "";
  if (status === 401) return new OrderServiceError("auth", 401, "Entre na sua conta para finalizar o pedido.");
  if (status === 400) {
    const msg = body?.error?.message;
    return new OrderServiceError("validation", 400, msg && msg.length < 200 ? msg : "Revise os dados do pedido e tente de novo.");
  }
  if (status === 409 && code === "VARIANT_INVALID") {
    return new OrderServiceError("variant", 409, "A opção escolhida de um item não está mais disponível. Remova o item e escolha de novo.");
  }
  if (status === 409) {
    const details = parseDetails(body?.error?.details);
    return new OrderServiceError("unavailable", 409, "Alguns itens ficaram indisponíveis ou sem estoque suficiente. Confira o carrinho.", details);
  }
  if (status === 429) return new OrderServiceError("busy", 429, "Muitas tentativas. Aguarde um pouco e tente de novo.");
  return new OrderServiceError("unknown", status, "Não foi possível registrar o pedido agora. Tente novamente em instantes.");
}

function mockOrder(payload: CreateOrderPayload): CreatedOrder {
  return {
    order: {
      id: "00000000-0000-4000-8000-000000000000",
      order_code: "JM-0000",
      order_status: "awaiting_payment",
      payment_status: "pending",
      payment_method: payload.payment_method,
      fulfillment_type: payload.fulfillment_type,
      subtotal: 0,
      total: 0,
      desired_at: null,
      items: payload.items.map((i) => ({
        product_name: "Produto (mock)", variant_name: null, quantity: i.quantity, unit_price: 0, line_total: 0,
        personalization_note: i.personalization_note, addons: [],
      })),
    },
    pix_key: payload.payment_method === "pix" ? "(00) 00000-0000" : null,
    whatsapp: { url: "https://wa.me/5500000000000?text=mock", message: "mock" },
  };
}

/** Cria o pedido. Em qualquer erro nada foi gravado (contrato 5.3). */
export async function createOrder(payload: CreateOrderPayload): Promise<CreatedOrder> {
  // Desenvolvimento sem o backend do Enzo: VITE_USE_MOCKS=true
  if (import.meta.env?.VITE_USE_MOCKS === "true") return mockOrder(payload);

  let response: Response;
  try {
    response = await fetch("/api/orders", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new OrderServiceError("network", 0, "Sem conexão com o servidor. Verifique a internet e tente de novo.");
  }
  const body = (await response.json().catch(() => null)) as ApiBody | null;
  if (response.status === 201 && body?.data?.order) return body.data;
  throw toOrderError(response.ok ? 500 : response.status, body);
}
