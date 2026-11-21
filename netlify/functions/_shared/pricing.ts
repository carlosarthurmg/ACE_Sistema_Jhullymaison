/**
 * pricing.ts — ÚNICO lugar onde preço, promoção e total são calculados.
 *
 * Quem usa: catálogo (Rodolfo), carrinho e checkout (João), pedidos (Enzo).
 * NINGUÉM reimplementa estas contas em outro arquivo. Se a regra precisar
 * mudar, muda aqui, com teste, e o grupo é avisado.
 *
 * Regras (Adendo 1, seção 4.5):
 *  1. Sem variações: preço efetivo = preço promocional vigente, senão base_price.
 *  2. Com variação: preço efetivo = variant.price × promotional_price ÷ base_price
 *     (arredondado a 2 casas) se houver promoção vigente; senão variant.price.
 *  3. Promoção vigente = ativa, agora em [starts_at, ends_at) e promotional_price < base_price (RN07).
 *  4. Adicionais NÃO recebem desconto.
 *  5. Total do item = (preço efetivo + soma(adicionais × quantidade do adicional)) × quantidade do item.
 *  6. Total do pedido = soma dos itens. Não há taxa de entrega (combinada pelo WhatsApp).
 *  7. Produto com variações ativas: o cliente precisa escolher uma.
 *
 * Como gravar no pedido (tabelas order_items e order_item_addons):
 *  - order_items.unit_price_snapshot = unitPrice
 *  - order_items.line_total          = productLineTotal   (só o produto)
 *  - order_item_addons.quantity      = quantity do adicional POR UNIDADE do produto
 *  - order_item_addons.line_total    = addons[i].lineTotal (preço × qtd do adicional × qtd do item)
 *  - orders.subtotal e orders.total  = calculateOrderTotals(...)
 *
 * Todas as contas são feitas em CENTAVOS (inteiros) para não ter erro de
 * arredondamento (0.1 + 0.2 em decimal dá 0.30000000000000004). Os valores que
 * saem destas funções são números em reais com 2 casas.
 * Este arquivo é puro: não acessa banco, rede nem relógio (a data entra por parâmetro).
 */

export type MoneyInput = number | string;

export type PricingErrorCode =
  | "INVALID_PRICE"
  | "INVALID_QUANTITY"
  | "VARIANT_REQUIRED"
  | "VARIANT_NOT_ALLOWED"
  | "VARIANT_INVALID";

export class PricingError extends Error {
  code: PricingErrorCode;

  constructor(code: PricingErrorCode, message: string) {
    super(message);
    this.name = "PricingError";
    this.code = code;
  }
}

// ---------- Dinheiro ----------

/** Converte "180.00" ou 180 em 18000 centavos. Lança erro se for inválido ou negativo. */
export function toCents(value: MoneyInput): number {
  const amount = typeof value === "string" ? Number(value.trim()) : value;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) {
    throw new PricingError("INVALID_PRICE", "Valor monetário inválido.");
  }
  return Math.round(amount * 100);
}

/** Converte centavos em reais com 2 casas (18000 -> 180). */
export function fromCents(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

function assertQuantity(quantity: number): void {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new PricingError("INVALID_QUANTITY", "A quantidade deve ser um número inteiro maior que zero.");
  }
}

// ---------- Promoção ----------

export interface Promotion {
  promotionalPrice: MoneyInput;
  startsAt: string | Date;
  endsAt: string | Date;
  isActive: boolean;
}

/** Promoção vigente: ativa, dentro do período [início, fim) e com preço menor que o original (RN07). */
export function isPromotionActive(
  promotion: Promotion,
  basePrice: MoneyInput,
  now: Date = new Date(),
): boolean {
  if (!promotion.isActive) return false;

  const start = new Date(promotion.startsAt).getTime();
  const end = new Date(promotion.endsAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return false;

  const current = now.getTime();
  if (current < start || current >= end) return false;

  return toCents(promotion.promotionalPrice) < toCents(basePrice);
}

/** Se houver mais de uma promoção vigente, vale a de menor preço. */
export function getActivePromotion(
  promotions: Promotion[] | null | undefined,
  basePrice: MoneyInput,
  now: Date = new Date(),
): Promotion | null {
  const active = (promotions ?? []).filter((promotion) => isPromotionActive(promotion, basePrice, now));
  if (active.length === 0) return null;
  return active.reduce((best, current) =>
    toCents(current.promotionalPrice) < toCents(best.promotionalPrice) ? current : best,
  );
}

// ---------- Preço efetivo (o que o cliente paga por unidade) ----------

export interface EffectivePriceInput {
  /** products.base_price */
  basePrice: MoneyInput;
  /** product_variants.price da variação escolhida (omitir se o produto não tem variações) */
  variantPrice?: MoneyInput | null;
  /** promoções do produto (a função escolhe a vigente) */
  promotions?: Promotion[] | null;
  /** Data de referência. Nos testes, passe uma data fixa. */
  now?: Date;
}

export interface EffectivePrice {
  /** Preço antes da promoção (variação ou base). Mostrar riscado quando onPromotion. */
  originalPrice: number;
  /** Preço que o cliente paga por unidade. */
  effectivePrice: number;
  onPromotion: boolean;
  /** Percentual de desconto inteiro (RF11). 0 quando não há promoção. */
  discountPercent: number;
}

export function getEffectivePrice(input: EffectivePriceInput): EffectivePrice {
  const baseCents = toCents(input.basePrice);
  const originalCents =
    input.variantPrice !== undefined && input.variantPrice !== null
      ? toCents(input.variantPrice)
      : baseCents;

  const promotion = getActivePromotion(input.promotions, input.basePrice, input.now ?? new Date());
  if (!promotion) {
    return {
      originalPrice: fromCents(originalCents),
      effectivePrice: fromCents(originalCents),
      onPromotion: false,
      discountPercent: 0,
    };
  }

  // Mesmo percentual de desconto do produto, aplicado ao preço da variação.
  // baseCents > 0 aqui: promoção vigente exige promotional_price < base_price.
  const promoCents = toCents(promotion.promotionalPrice);
  const effectiveCents = Math.round((originalCents * promoCents) / baseCents);

  const discountPercent =
    originalCents > 0 ? Math.round((1 - effectiveCents / originalCents) * 100) : 0;

  return {
    originalPrice: fromCents(originalCents),
    effectivePrice: fromCents(effectiveCents),
    onPromotion: effectiveCents < originalCents,
    discountPercent,
  };
}

// ---------- Variação escolhida (regra 7) ----------

/**
 * Confere a escolha de variação (RF33).
 * - Produto com variações ativas: a escolha é obrigatória e precisa ser de uma variação ativa.
 * - Produto sem variações ativas: não pode enviar variação.
 * Devolve a variação escolhida (ou null).
 */
export function validateVariantSelection<T extends { id: string; isActive: boolean }>(
  variants: T[],
  selectedVariantId?: string | null,
): T | null {
  const activeVariants = variants.filter((variant) => variant.isActive);

  if (activeVariants.length === 0) {
    if (selectedVariantId) {
      throw new PricingError("VARIANT_NOT_ALLOWED", "Este produto não tem variações.");
    }
    return null;
  }

  if (!selectedVariantId) {
    throw new PricingError("VARIANT_REQUIRED", "Escolha uma variação do produto.");
  }
  const selected = activeVariants.find((variant) => variant.id === selectedVariantId);
  if (!selected) {
    throw new PricingError("VARIANT_INVALID", "A variação escolhida não está disponível.");
  }
  return selected;
}

// ---------- Total do item e do pedido ----------

export interface AddonSelection {
  /** product_addons.price (sem desconto) */
  price: MoneyInput;
  /** Quantidade do adicional POR UNIDADE do produto. Padrão: 1. */
  quantity?: number;
}

export interface ItemTotalsInput {
  /** EffectivePrice.effectivePrice */
  unitPrice: MoneyInput;
  quantity: number;
  addons?: AddonSelection[];
}

export interface ItemTotals {
  unitPrice: number;
  quantity: number;
  /** unitPrice × quantity (vai para order_items.line_total) */
  productLineTotal: number;
  addons: Array<{ unitPrice: number; quantity: number; lineTotal: number }>;
  /** Soma dos adicionais do item (já multiplicada pela quantidade do item) */
  addonsLineTotal: number;
  /** productLineTotal + addonsLineTotal */
  itemTotal: number;
}

export function calculateItemTotals(input: ItemTotalsInput): ItemTotals {
  assertQuantity(input.quantity);
  const unitCents = toCents(input.unitPrice);
  const productCents = unitCents * input.quantity;

  const addons = (input.addons ?? []).map((addon) => {
    const addonQuantity = addon.quantity ?? 1;
    assertQuantity(addonQuantity);
    const addonUnitCents = toCents(addon.price);
    return {
      unitCents: addonUnitCents,
      quantity: addonQuantity,
      lineCents: addonUnitCents * addonQuantity * input.quantity,
    };
  });

  const addonsCents = addons.reduce((sum, addon) => sum + addon.lineCents, 0);

  return {
    unitPrice: fromCents(unitCents),
    quantity: input.quantity,
    productLineTotal: fromCents(productCents),
    addons: addons.map((addon) => ({
      unitPrice: fromCents(addon.unitCents),
      quantity: addon.quantity,
      lineTotal: fromCents(addon.lineCents),
    })),
    addonsLineTotal: fromCents(addonsCents),
    itemTotal: fromCents(productCents + addonsCents),
  };
}

export interface OrderTotals {
  /** Soma dos itens (produtos + adicionais) */
  subtotal: number;
  /** Igual ao subtotal: não há taxa de entrega no sistema */
  total: number;
}

export function calculateOrderTotals(items: Array<{ itemTotal: MoneyInput }>): OrderTotals {
  const cents = items.reduce((sum, item) => sum + toCents(item.itemTotal), 0);
  return { subtotal: fromCents(cents), total: fromCents(cents) };
}
