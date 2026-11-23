import { calculateItemTotals, calculateOrderTotals, type MoneyInput } from "../../netlify/functions/_shared/pricing";

export interface PurchasedItem {
  unit_price_snapshot: MoneyInput;
  quantity: number;
  order_item_addons: { unit_price_snapshot: MoneyInput; quantity: number }[];
}

/** Histórico usa o preço efetivo registrado no checkout, inclusive em promoções. */
export function pricePurchasedItems<T extends PurchasedItem>(items: T[]) {
  const lines = items.map(item => ({
    ...item,
    itemTotal: calculateItemTotals({
      unitPrice: item.unit_price_snapshot,
      quantity: item.quantity,
      addons: item.order_item_addons.map(addon => ({
        price: addon.unit_price_snapshot,
        quantity: addon.quantity,
      })),
    }).itemTotal,
  }));
  return { lines, subtotal: calculateOrderTotals(lines).subtotal };
}
