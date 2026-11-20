import { describe, expect, it } from "vitest";
import {
  PricingError,
  calculateItemTotals,
  calculateOrderTotals,
  fromCents,
  getActivePromotion,
  getEffectivePrice,
  isPromotionActive,
  toCents,
  validateVariantSelection,
  type Promotion,
} from "../../netlify/functions/_shared/pricing";

const NOW = new Date("2026-11-20T12:00:00Z");

// Buquê Aurora (dados de demonstração): base 200, promoção 180 (10%).
const aurora: Promotion = {
  promotionalPrice: 180,
  startsAt: "2026-11-01T00:00:00Z",
  endsAt: "2026-12-01T00:00:00Z",
  isActive: true,
};

function errorCode(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return error instanceof PricingError ? error.code : "OTHER";
  }
  return undefined;
}

describe("dinheiro em centavos", () => {
  it("converte reais e texto do banco em centavos", () => {
    expect(toCents(180)).toBe(18000);
    expect(toCents("180.00")).toBe(18000);
    expect(toCents("89.90")).toBe(8990);
    expect(fromCents(8990)).toBe(89.9);
  });

  it("não tem erro de ponto flutuante", () => {
    expect(fromCents(toCents(0.1) + toCents(0.2))).toBe(0.3);
  });

  it("rejeita valor inválido ou negativo", () => {
    expect(errorCode(() => toCents(-1))).toBe("INVALID_PRICE");
    expect(errorCode(() => toCents("abc"))).toBe("INVALID_PRICE");
    expect(errorCode(() => toCents(Number.NaN))).toBe("INVALID_PRICE");
  });
});

describe("promoção vigente (RN07)", () => {
  it("vale dentro do período", () => {
    expect(isPromotionActive(aurora, 200, NOW)).toBe(true);
  });

  it("não vale antes do início, nem no fim, nem depois", () => {
    expect(isPromotionActive(aurora, 200, new Date("2026-10-31T23:59:59Z"))).toBe(false);
    expect(isPromotionActive(aurora, 200, new Date("2026-12-01T00:00:00Z"))).toBe(false);
    expect(isPromotionActive(aurora, 200, new Date("2027-01-01T00:00:00Z"))).toBe(false);
  });

  it("não vale se estiver inativa", () => {
    expect(isPromotionActive({ ...aurora, isActive: false }, 200, NOW)).toBe(false);
  });

  it("não vale se o preço promocional não for menor que o original", () => {
    expect(isPromotionActive({ ...aurora, promotionalPrice: 200 }, 200, NOW)).toBe(false);
    expect(isPromotionActive({ ...aurora, promotionalPrice: 250 }, 200, NOW)).toBe(false);
  });

  it("com várias promoções vigentes, vale a de menor preço", () => {
    const outra: Promotion = { ...aurora, promotionalPrice: 150 };
    expect(getActivePromotion([aurora, outra], 200, NOW)?.promotionalPrice).toBe(150);
  });

  it("sem promoções, devolve null", () => {
    expect(getActivePromotion([], 200, NOW)).toBeNull();
    expect(getActivePromotion(undefined, 200, NOW)).toBeNull();
  });
});

describe("preço efetivo", () => {
  it("produto sem variações e sem promoção usa o preço base", () => {
    const price = getEffectivePrice({ basePrice: "149.00", now: NOW });
    expect(price).toEqual({ originalPrice: 149, effectivePrice: 149, onPromotion: false, discountPercent: 0 });
  });

  it("produto sem variações com promoção usa o preço promocional (RF11)", () => {
    const price = getEffectivePrice({ basePrice: 200, promotions: [aurora], now: NOW });
    expect(price).toEqual({ originalPrice: 200, effectivePrice: 180, onPromotion: true, discountPercent: 10 });
  });

  it("variação com promoção recebe o mesmo percentual (Clássico 200 -> 180)", () => {
    const price = getEffectivePrice({ basePrice: 200, variantPrice: 200, promotions: [aurora], now: NOW });
    expect(price.effectivePrice).toBe(180);
    expect(price.originalPrice).toBe(200);
  });

  it("variação com promoção recebe o mesmo percentual (Especial 240 -> 216)", () => {
    const price = getEffectivePrice({ basePrice: 200, variantPrice: 240, promotions: [aurora], now: NOW });
    expect(price).toEqual({ originalPrice: 240, effectivePrice: 216, onPromotion: true, discountPercent: 10 });
  });

  it("variação sem promoção vigente usa o preço da variação", () => {
    const expirada = { ...aurora, endsAt: "2026-11-10T00:00:00Z" };
    const price = getEffectivePrice({ basePrice: 200, variantPrice: 240, promotions: [expirada], now: NOW });
    expect(price.effectivePrice).toBe(240);
    expect(price.onPromotion).toBe(false);
  });

  it("arredonda para 2 casas (99,99 com 10% de desconto)", () => {
    const dezPorCento: Promotion = { ...aurora, promotionalPrice: 90 };
    const price = getEffectivePrice({ basePrice: 100, variantPrice: 99.99, promotions: [dezPorCento], now: NOW });
    expect(price.effectivePrice).toBe(89.99);
  });

  it("não quebra com preço base zero", () => {
    const price = getEffectivePrice({ basePrice: 0, promotions: [aurora], now: NOW });
    expect(price.effectivePrice).toBe(0);
    expect(price.onPromotion).toBe(false);
  });
});

describe("escolha de variação (regra 7)", () => {
  const variants = [
    { id: "v1", isActive: true },
    { id: "v2", isActive: true },
    { id: "v3", isActive: false },
  ];

  it("devolve a variação escolhida", () => {
    expect(validateVariantSelection(variants, "v2")?.id).toBe("v2");
  });

  it("exige escolha quando há variações ativas", () => {
    expect(errorCode(() => validateVariantSelection(variants, null))).toBe("VARIANT_REQUIRED");
  });

  it("rejeita variação inativa ou de outro produto", () => {
    expect(errorCode(() => validateVariantSelection(variants, "v3"))).toBe("VARIANT_INVALID");
    expect(errorCode(() => validateVariantSelection(variants, "x"))).toBe("VARIANT_INVALID");
  });

  it("produto sem variações ativas: devolve null e não aceita variação", () => {
    expect(validateVariantSelection([{ id: "v3", isActive: false }], null)).toBeNull();
    expect(errorCode(() => validateVariantSelection([], "v1"))).toBe("VARIANT_NOT_ALLOWED");
  });
});

describe("total do item", () => {
  it("Buquê Aurora Clássico em promoção + chocolates = 205 (tela 3 do protótipo)", () => {
    const item = calculateItemTotals({ unitPrice: 180, quantity: 1, addons: [{ price: 25 }] });
    expect(item.productLineTotal).toBe(180);
    expect(item.addonsLineTotal).toBe(25);
    expect(item.itemTotal).toBe(205);
  });

  it("multiplica produto e adicionais pela quantidade do item", () => {
    const item = calculateItemTotals({ unitPrice: 180, quantity: 2, addons: [{ price: 25 }, { price: 15 }] });
    expect(item.productLineTotal).toBe(360);
    expect(item.addons.map((addon) => addon.lineTotal)).toEqual([50, 30]);
    expect(item.itemTotal).toBe(440);
  });

  it("considera a quantidade do adicional por unidade do produto", () => {
    const item = calculateItemTotals({ unitPrice: 100, quantity: 2, addons: [{ price: 10, quantity: 3 }] });
    expect(item.addons[0]).toEqual({ unitPrice: 10, quantity: 3, lineTotal: 60 });
    expect(item.itemTotal).toBe(260);
  });

  it("item sem adicionais", () => {
    expect(calculateItemTotals({ unitPrice: 149, quantity: 1 }).itemTotal).toBe(149);
  });

  it("rejeita quantidade inválida", () => {
    expect(errorCode(() => calculateItemTotals({ unitPrice: 10, quantity: 0 }))).toBe("INVALID_QUANTITY");
    expect(errorCode(() => calculateItemTotals({ unitPrice: 10, quantity: 1.5 }))).toBe("INVALID_QUANTITY");
    expect(errorCode(() => calculateItemTotals({ unitPrice: 10, quantity: -2 }))).toBe("INVALID_QUANTITY");
    expect(
      errorCode(() => calculateItemTotals({ unitPrice: 10, quantity: 1, addons: [{ price: 5, quantity: 0 }] })),
    ).toBe("INVALID_QUANTITY");
  });
});

describe("total do pedido", () => {
  it("soma os itens: 205 + 149 = 354 (tela 12 do protótipo)", () => {
    const buque = calculateItemTotals({ unitPrice: 180, quantity: 1, addons: [{ price: 25 }] });
    const cesta = calculateItemTotals({ unitPrice: 149, quantity: 1 });
    expect(calculateOrderTotals([buque, cesta])).toEqual({ subtotal: 354, total: 354 });
  });

  it("pedido sem itens tem total zero", () => {
    expect(calculateOrderTotals([])).toEqual({ subtotal: 0, total: 0 });
  });
});
