import type { Config } from "@netlify/functions";
import { getServiceClient } from "./_shared/supabase";
import { requireAdmin } from "./_shared/auth";
import { ok, fail } from "./_shared/response";

const ORDER_STATUSES = [
  "awaiting_payment",
  "preparing",
  "ready_for_pickup",
  "shipped",
  "delivered",
  "cancelled",
] as const;
const PAYMENT_STATUSES = ["pending", "paid", "cancelled"] as const;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PAGE_SIZE = 50;
const TZ = "-03:00"; // Piauí (America/Fortaleza, sem horário de verão)

const SELECT_LIST =
  "id, order_code, order_status, payment_status, payment_method, fulfillment_type, desired_at, total, " +
  "created_at, cancellation_requested_at, profiles!inner(full_name, phone, anonymized_at)";

// Erro lançado pelas funções SQL -> HTTP
const RPC_ERRORS: Record<string, { status: number; message: string }> = {
  ORDER_NOT_FOUND: { status: 404, message: "Pedido não encontrado." },
  INVALID_TRANSITION: {
    status: 409,
    message: "Essa mudança de status não é permitida neste momento.",
  },
  PAYMENT_REQUIRED: {
    status: 409,
    message:
      "Só é possível marcar como entregue depois que o pagamento estiver confirmado.",
  },
  ORDER_FINALIZED: {
    status: 409,
    message: "Este pedido já foi finalizado e não pode mais ser alterado.",
  },
  ALREADY_CANCELLED: { status: 409, message: "Este pedido já está cancelado." },
  NO_CHANGE: { status: 409, message: "O pagamento já está com este status." },
  USE_CANCEL_ENDPOINT: {
    status: 400,
    message: "Para cancelar, use a ação de cancelamento do pedido.",
  },
};

function rpcFailure(error: { message?: string }): Response {
  const known = error.message ? RPC_ERRORS[error.message] : undefined;
  if (known) return fail(known.status, error.message as string, known.message);
  console.error("admin-orders rpc error"); // sem detalhes do banco no log nem na resposta
  return fail(500, "INTERNAL_ERROR", "Não foi possível concluir a operação.");
}

async function parseBody(
  event: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const body = await event.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? body
      : null;
  } catch {
    return null;
  }
}

function dayStart(date: string): string {
  return `${date}T00:00:00${TZ}`;
}

function nextDayStart(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return `${d.toISOString().slice(0, 10)}T00:00:00${TZ}`;
}

function validDate(value: string | undefined): value is string {
  return (
    !!value &&
    DATE_RE.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}

// JM0001, jm-1, "1" -> JM-0001. Texto parcial vira busca por trecho.
function normalizeCodeSearch(raw: string): {
  exact?: string;
  partial?: string;
} {
  const compact = raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const m = /^(?:JM)?(\d{1,6})$/.exec(compact);
  if (m) return { exact: `JM-${m[1].padStart(4, "0")}` };
  return { partial: raw.trim() };
}

function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, "\\$&")}%`;
}

async function listOrders(event: Request): Promise<Response> {
  const q = Object.fromEntries(new URL(event.url).searchParams);
  const db = getServiceClient();

  const page = Math.max(1, Number.parseInt(q.page ?? "1", 10) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number.parseInt(q.page_size ?? "20", 10) || 20),
  );

  let query = db.from("orders").select(SELECT_LIST, { count: "exact" });

  if (q.status) {
    if (!(ORDER_STATUSES as readonly string[]).includes(q.status))
      return fail(400, "VALIDATION_ERROR", "Status inválido.");
    query = query.eq("order_status", q.status);
  }
  if (q.payment) {
    if (!(PAYMENT_STATUSES as readonly string[]).includes(q.payment))
      return fail(400, "VALIDATION_ERROR", "Status de pagamento inválido.");
    query = query.eq("payment_status", q.payment);
  }
  for (const key of ["from", "to", "desired_from", "desired_to"] as const) {
    if (q[key] && !validDate(q[key]))
      return fail(
        400,
        "VALIDATION_ERROR",
        "Data inválida. Use o formato AAAA-MM-DD.",
      );
  }
  if (
    (q.from && q.to && q.from > q.to) ||
    (q.desired_from && q.desired_to && q.desired_from > q.desired_to)
  ) {
    return fail(
      400,
      "VALIDATION_ERROR",
      "A data inicial deve ser anterior ou igual à final.",
    );
  }
  if (q.from) query = query.gte("created_at", dayStart(q.from));
  if (q.to) query = query.lt("created_at", nextDayStart(q.to));
  if (q.desired_from) query = query.gte("desired_at", dayStart(q.desired_from));
  if (q.desired_to) query = query.lt("desired_at", nextDayStart(q.desired_to));

  if (q.code) {
    const code = normalizeCodeSearch(q.code.slice(0, 20));
    query = code.exact
      ? query.eq("order_code", code.exact)
      : query.ilike("order_code", likePattern(code.partial ?? ""));
  }
  if (q.customer) {
    query = query.ilike(
      "profiles.full_name",
      likePattern(q.customer.trim().slice(0, 60)),
    );
  }
  if (q.cancellation_requested === "true") {
    query = query
      .not("cancellation_requested_at", "is", null)
      .neq("order_status", "cancelled");
  }

  const fromIdx = (page - 1) * pageSize;
  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(fromIdx, fromIdx + pageSize - 1);

  if (error) {
    console.error("admin-orders list error");
    return fail(500, "INTERNAL_ERROR", "Não foi possível carregar os pedidos.");
  }

  type Row = {
    profiles:
      | { full_name: string; phone: string; anonymized_at: string | null }
      | { full_name: string; phone: string; anonymized_at: string | null }[];
  } & Record<string, unknown>;
  const items = ((data ?? []) as unknown as Row[]).map(
    ({ profiles, ...order }) => {
      const p = Array.isArray(profiles) ? profiles[0] : profiles;
      return {
        ...order,
        customer: p?.anonymized_at
          ? { name: "Cliente anonimizado", phone: null, anonymized: true }
          : {
              name: p?.full_name ?? null,
              phone: p?.phone ?? null,
              anonymized: false,
            },
      };
    },
  );

  return ok({ items, page, page_size: pageSize, total: count ?? 0 });
}

const RESULT_FIELDS = (o: Record<string, unknown>) => ({
  id: o.id,
  order_code: o.order_code,
  order_status: o.order_status,
  payment_status: o.payment_status,
  confirmed_at: o.confirmed_at,
  cancelled_at: o.cancelled_at,
});

export default async function adminOrders(event: Request): Promise<Response> {
  try {
    const auth = await requireAdmin(event);
    if (!auth.ok) return auth.response;

    // /api/admin/orders[/:id[/:action]]
    const segments = new URL(event.url).pathname.split("/").filter(Boolean);
    const idx = segments.lastIndexOf("orders");
    const id = idx >= 0 ? segments[idx + 1] : undefined;
    const action = idx >= 0 ? segments[idx + 2] : undefined;
    const method = event.method.toUpperCase();

    if (!id) {
      return method === "GET"
        ? await listOrders(event)
        : fail(405, "METHOD_NOT_ALLOWED", "Método não permitido.");
    }
    if (!UUID_RE.test(id))
      return fail(404, "ORDER_NOT_FOUND", "Pedido não encontrado.");

    const db = getServiceClient();

    if (!action && method === "GET") {
      const { data, error } = await db
        .from("orders")
        .select(
          "*, profiles(full_name,phone,anonymized_at), order_items(*,order_item_addons(*)), order_status_history(previous_status,new_status,changed_at)",
        )
        .eq("id", id)
        .order("changed_at", { referencedTable: "order_status_history" })
        .maybeSingle();
      if (error) throw error;
      if (data?.profiles?.anonymized_at) {
        return ok({
          ...data,
          profiles: { ...data.profiles, full_name: "Cliente anonimizado", phone: null },
          recipient_name: null,
          recipient_phone: null,
          delivery_address_snapshot: null,
          card_message: null,
          customer_note: null,
          order_items: data.order_items.map((item: Record<string, unknown>) => ({
            ...item, personalization_note: null,
          })),
        });
      }
      return data
        ? ok(data)
        : fail(404, "ORDER_NOT_FOUND", "Pedido não encontrado.");
    }
    if (action === "status" && method === "PATCH") {
      const body = await parseBody(event);
      const status = body?.status;
      if (
        typeof status !== "string" ||
        !(ORDER_STATUSES as readonly string[]).includes(status)
      ) {
        return fail(400, "VALIDATION_ERROR", "Status inválido.");
      }
      const { data, error } = await db.rpc("admin_change_order_status", {
        p_order_id: id,
        p_new_status: status,
        p_admin_id: auth.userId,
      });
      return error
        ? rpcFailure(error)
        : ok(RESULT_FIELDS(data as Record<string, unknown>));
    }

    if (action === "payment" && method === "PATCH") {
      const body = await parseBody(event);
      const paymentStatus = body?.payment_status;
      if (
        typeof paymentStatus !== "string" ||
        !(PAYMENT_STATUSES as readonly string[]).includes(paymentStatus)
      ) {
        return fail(400, "VALIDATION_ERROR", "Status de pagamento inválido.");
      }
      const { data, error } = await db.rpc("admin_set_order_payment", {
        p_order_id: id,
        p_payment_status: paymentStatus,
        p_admin_id: auth.userId,
      });
      return error
        ? rpcFailure(error)
        : ok(RESULT_FIELDS(data as Record<string, unknown>));
    }

    if (action === "cancel" && method === "POST") {
      const { data, error } = await db.rpc("admin_cancel_order", {
        p_order_id: id,
        p_admin_id: auth.userId,
      });
      return error
        ? rpcFailure(error)
        : ok(RESULT_FIELDS(data as Record<string, unknown>));
    }

    return fail(404, "NOT_FOUND", "Rota não encontrada.");
  } catch {
    console.error("admin-orders unexpected error");
    return fail(500, "INTERNAL_ERROR", "Erro inesperado.");
  }
}

export const config: Config = {
  path: [
    "/api/admin/orders",
    "/api/admin/orders/:id",
    "/api/admin/orders/:id/:action",
  ],
};
