// Tipos do carrinho (local) e do contrato POST /api/orders (GUIA_CENTRAL 5.3). Arquivo próprio: não edita domain.types.ts.

/** Linha do carrinho guardada no navegador: só identificadores e opções. Nunca preço, total ou nome como dado confiável. */
export interface CartItem {
  key: string; // identifica a linha (produto + variação + adicionais + observação)
  product_id: string;
  product_slug: string | null; // só para reconstruir a exibição pelo catálogo
  variant_id: string | null;
  addon_ids: string[];
  quantity: number;
  personalization_note: string | null;
}

/** Contrato com o catálogo (Rodolfo): o que `addItem` aceita. */
export interface AddItemInput {
  product_id: string;
  product_slug?: string | null;
  variant_id?: string | null;
  addon_ids?: string[];
  quantity: number;
  personalization_note?: string | null;
}

/** Item enviado ao servidor. */
export interface OrderItemPayload {
  product_id: string;
  variant_id: string | null;
  addon_ids: string[];
  quantity: number;
  personalization_note: string | null;
}

export type FulfillmentType = "delivery" | "pickup";
export type PaymentMethod = "pix" | "cash_on_delivery" | "card_on_delivery";

export interface DeliveryAddress {
  postal_code: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
}

export interface CreateOrderPayload {
  items: OrderItemPayload[];
  fulfillment_type: FulfillmentType;
  desired_date: string; // YYYY-MM-DD (fuso America/Fortaleza)
  desired_time: string; // HH:MM
  delivery_address?: DeliveryAddress; // só em entrega (RN12)
  recipient_name: string | null;
  recipient_phone: string | null;
  card_message: string | null;
  customer_note: string | null;
  payment_method: PaymentMethod;
}

export interface CreatedOrderItem {
  product_name: string;
  variant_name: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  personalization_note: string | null;
  addons: { name: string; quantity: number; line_total: number }[];
}

export interface CreatedOrder {
  order: {
    id: string;
    order_code: string;
    order_status: string;
    payment_status: string;
    payment_method: PaymentMethod;
    fulfillment_type: FulfillmentType;
    subtotal: number;
    total: number;
    desired_at: string | null;
    items: CreatedOrderItem[];
  };
  pix_key: string | null;
  whatsapp: { url: string; message: string } | null;
}

/** Item citado em `details` quando o servidor responde 409. */
export interface UnavailableDetail {
  product_id: string;
  name: string;
  available_quantity: number;
}
