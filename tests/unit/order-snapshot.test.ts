import { expect, it } from "vitest";
import { pricePurchasedItems } from "../../src/views/order-pricing";

it("inclui os adicionais por unidade e mantém os preços históricos em centavos", () => {
  const result = pricePurchasedItems([
    { unit_price_snapshot: "12.35", quantity: 2,
      order_item_addons: [{ unit_price_snapshot: "0.10", quantity: 3 }] },
    { unit_price_snapshot: "1.01", quantity: 1, order_item_addons: [] },
  ]);
  expect(result.lines.map(item => item.itemTotal)).toEqual([25.30, 1.01]);
  expect(result.subtotal).toBe(26.31);
});
