// _shared/notifications.ts — Enzo Morais — RF20, RN08, RNF07 (Adendo 1, seção 7.4)
// Fila em notification_outbox. Só 'new_order' passa pelo retry automático;
// e-mail de recuperação de senha NÃO é reenviado (o link só existe no momento do envio).
import { getServiceClient } from "./supabase";
import { sendMail } from "./mailer";

export const MAX_ATTEMPTS = 5;
const CLAIM_LOCK_MINUTES = 10; // tempo em que a linha fica "reservada" enquanto o envio acontece
const RETRY_STEP_MINUTES = 15; // espera entre tentativas = 15 min x nº da tentativa

type NewOrderPayload = {
  order_code: string;
  total: number;
  fulfillment_type: "delivery" | "pickup";
  payment_method: "pix" | "cash_on_delivery" | "card_on_delivery";
  desired_at: string | null;
};

type OutboxRow = {
  id: string;
  recipient: string;
  payload: NewOrderPayload;
  attempt_count: number;
};

const PAYMENT_LABEL = {
  pix: "Pix",
  cash_on_delivery: "Dinheiro",
  card_on_delivery: "Cartão",
} as const;
const FULFILLMENT_LABEL = { delivery: "Entrega", pickup: "Retirada" } as const;

const minutesFromNow = (m: number) =>
  new Date(Date.now() + m * 60_000).toISOString();

export function buildNewOrderEmail(payload: NewOrderPayload, baseUrl: string) {
  const money = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(payload.total);
  const desired = payload.desired_at
    ? new Date(payload.desired_at).toLocaleString("pt-BR", {
        timeZone: "America/Fortaleza",
        dateStyle: "short",
        timeStyle: "short",
      })
    : "não informada";
  return {
    subject: `Novo pedido ${payload.order_code}`,
    text: [
      `Chegou um novo pedido: ${payload.order_code}`,
      "",
      `Valor: ${money}`,
      `Tipo: ${FULFILLMENT_LABEL[payload.fulfillment_type]}`,
      `Pagamento: ${PAYMENT_LABEL[payload.payment_method]}`,
      `Data desejada: ${desired}`,
      "",
      `Veja os detalhes no painel: ${baseUrl.replace(/\/$/, "")}/admin/pedidos`,
    ].join("\n"),
  };
}

async function deliver(row: OutboxRow): Promise<void> {
  const db = getServiceClient();
  // Reserva a linha: soma 1 tentativa e empurra next_attempt_at. O filtro por attempt_count
  // impede que duas execuções simultâneas enviem o mesmo e-mail.
  const attempt = row.attempt_count + 1;
  const { data: claimed, error: claimError } = await db
    .from("notification_outbox")
    .update({
      attempt_count: attempt,
      next_attempt_at: minutesFromNow(CLAIM_LOCK_MINUTES),
    })
    .eq("id", row.id)
    .eq("status", "pending")
    .eq("attempt_count", row.attempt_count)
    .select("id");
  if (claimError) throw claimError;
  if (!claimed || claimed.length === 0) return; // outra execução pegou

  const recipient =
    row.recipient === "ADMIN_NOTIFICATION_EMAIL"
      ? process.env.ADMIN_NOTIFICATION_EMAIL
      : row.recipient;
  let failure: string | null = null;
  try {
    if (!recipient || !process.env.APP_BASE_URL)
      throw new Error("MAIL_NOT_CONFIGURED");
    const mail = buildNewOrderEmail(row.payload, process.env.APP_BASE_URL);
    await sendMail({ to: recipient, ...mail });
  } catch (err) {
    failure =
      err instanceof Error && /^[A-Z_]+$/.test(err.message)
        ? err.message
        : "SEND_FAILED";
  }

  const update = failure
    ? {
        status: attempt >= MAX_ATTEMPTS ? "failed" : "pending",
        last_error_code: failure,
        next_attempt_at: minutesFromNow(RETRY_STEP_MINUTES * attempt),
      }
    : {
        status: "sent",
        recipient,
        sent_at: new Date().toISOString(),
        last_error_code: null,
      };
  const result = await db
    .from("notification_outbox")
    .update(update)
    .eq("id", row.id)
    .eq("status", "pending")
    .eq("attempt_count", attempt);
  if (result.error) throw result.error;
}

/** Hook opcional do checkout para envio imediato após o commit. A fila já está gravada. */
export async function enqueueNewOrderNotification(
  orderId: string,
): Promise<void> {
  try {
    const { data, error } = await getServiceClient()
      .from("notification_outbox")
      .select("id, recipient, payload, attempt_count")
      .eq("order_id", orderId)
      .eq("notification_type", "new_order")
      .eq("status", "pending")
      .eq("attempt_count", 0)
      .maybeSingle();
    if (error) throw error;
    if (data) await deliver(data as OutboxRow);
  } catch {
    console.error("Falha na tentativa imediata de notificação.");
  }
}

/** Reenvia pendentes vencidos. Usada por notifications-retry.ts. */
export async function processPendingNotifications(
  limit = 20,
): Promise<{ found: number }> {
  const db = getServiceClient();
  const expired = await db
    .from("notification_outbox")
    .update({ status: "failed", last_error_code: "DELIVERY_UNCONFIRMED" })
    .eq("notification_type", "new_order")
    .eq("status", "pending")
    .gte("attempt_count", MAX_ATTEMPTS)
    .lte("next_attempt_at", new Date().toISOString());
  if (expired.error) throw expired.error;
  const { data, error } = await db
    .from("notification_outbox")
    .select("id, recipient, payload, attempt_count")
    .eq("status", "pending")
    .eq("notification_type", "new_order")
    .lt("attempt_count", MAX_ATTEMPTS)
    .lte("next_attempt_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw error;
  const rows = (data ?? []) as OutboxRow[];
  for (const row of rows) await deliver(row);
  return { found: rows.length };
}
