// Validação do formulário de checkout e montagem do corpo de POST /api/orders (GUIA_CENTRAL 5.3).
// Nenhum preço, total ou nome de produto entra no payload.
import type { CreateOrderPayload, DeliveryAddress, FulfillmentType, OrderItemPayload, PaymentMethod } from "@/types/cart.types";

export interface CheckoutForm {
  fulfillment_type: FulfillmentType;
  desired_date: string;
  desired_time: string;
  address: DeliveryAddress;
  gift: boolean;
  recipient_name: string;
  recipient_phone: string;
  card_message: string;
  customer_note: string;
  payment_method: PaymentMethod;
}

export const emptyAddress = (): DeliveryAddress => ({
  postal_code: "", street: "", number: "", complement: "", neighborhood: "", city: "Teresina", state: "PI",
});

const TZ = "America/Fortaleza";

/** Data (YYYY-MM-DD) e hora (HH:MM) atuais em Fortaleza. */
export function nowInFortaleza(now: Date = new Date()): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const p = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
  return { date: `${p("year")}-${p("month")}-${p("day")}`, time: `${p("hour")}:${p("minute")}` };
}

const digits = (v: string) => v.replace(/\D/g, "");

export function validateCheckout(form: CheckoutForm, now: Date = new Date()): Record<string, string> {
  const e: Record<string, string> = {};
  const today = nowInFortaleza(now);

  if (!form.desired_date) e.desired_date = "Informe a data desejada.";
  else if (form.desired_date < today.date) e.desired_date = "A data não pode ser anterior a hoje.";
  if (!form.desired_time) e.desired_time = "Informe o horário desejado.";
  else if (form.desired_date === today.date && form.desired_time <= today.time) e.desired_time = "Escolha um horário depois de agora.";

  if (form.fulfillment_type === "delivery") {
    const a = form.address;
    if (digits(a.postal_code).length !== 8) e.postal_code = "Informe o CEP com 8 números.";
    if (!a.street.trim()) e.street = "Informe a rua.";
    if (!a.number.trim()) e.number = "Informe o número.";
    if (!a.neighborhood.trim()) e.neighborhood = "Informe o bairro.";
    if (!a.city.trim()) e.city = "Informe a cidade.";
    if (!/^[A-Za-z]{2}$/.test(a.state.trim())) e.state = "Informe a sigla do estado (ex.: PI).";
  }

  if (form.gift) {
    if (!form.recipient_name.trim()) e.recipient_name = "Informe o nome de quem vai receber.";
    const d = digits(form.recipient_phone).length;
    if (d < 10 || d > 13) e.recipient_phone = "Informe um telefone com DDD.";
  }
  return e;
}

const orNull = (v: string) => (v.trim() ? v.trim() : null);

export function buildOrderPayload(items: OrderItemPayload[], form: CheckoutForm): CreateOrderPayload {
  const payload: CreateOrderPayload = {
    items,
    fulfillment_type: form.fulfillment_type,
    desired_date: form.desired_date,
    desired_time: form.desired_time,
    recipient_name: form.gift ? orNull(form.recipient_name) : null,
    recipient_phone: form.gift ? orNull(form.recipient_phone) : null,
    card_message: orNull(form.card_message),
    customer_note: orNull(form.customer_note),
    payment_method: form.payment_method,
  };
  if (form.fulfillment_type === "delivery") {
    const a = form.address;
    payload.delivery_address = {
      postal_code: digits(a.postal_code),
      street: a.street.trim(),
      number: a.number.trim(),
      complement: a.complement.trim(),
      neighborhood: a.neighborhood.trim(),
      city: a.city.trim(),
      state: a.state.trim().toUpperCase(),
    };
  }
  return payload;
}
