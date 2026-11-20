export const labels: Record<string, string> = {
  awaiting_payment: "Aguardando pagamento",
  preparing: "Em preparação",
  ready_for_pickup: "Disponível para retirada",
  shipped: "Enviado",
  delivered: "Entregue",
  cancelled: "Cancelado",
  paid: "Pago",
  pending: "Pendente",
  pickup: "Retirada",
  delivery: "Entrega",
  pix: "Pix",
  cash_on_delivery: "Dinheiro",
  card_on_delivery: "Cartão",
};
export const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    value,
  );
export const date = (value: string) =>
  new Date(value).toLocaleString("pt-BR", { timeZone: "America/Fortaleza" });
export interface Order {
  id: string;
  order_code: string;
  order_status: string;
  payment_status: string;
  fulfillment_type: string;
  total: number;
}
