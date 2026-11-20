// Regra única de preço (Adendo 1, seção 4.5). Responsável oficial: Carlos.
// Esta versão foi escrita pelo catálogo seguindo o Adendo; se o Carlos já criou o dele, mantenha o dele
// e apenas ajuste as chamadas em catalog.ts. Catálogo, carrinho e checkout NÃO reimplementam esta conta.

export interface PromotionRow {
  promotional_price: number | string
  starts_at: string
  ends_at: string
  is_active: boolean
}

export interface PriceInfo {
  base_price: number
  effective_price: number
  on_promotion: boolean
  discount_percent: number
}

export const round2 = (n: number): number => Math.round(n * 100) / 100

/** Item 3: vigente = ativa, dentro do período e com preço menor que o original (RN07). Usa a de menor preço. */
export function currentPromotion(
  basePrice: number | string,
  promotions: PromotionRow[] | null | undefined,
  now: Date = new Date(),
): number | null {
  const base = Number(basePrice)
  const prices = (promotions ?? [])
    .filter(
      (p) =>
        p.is_active &&
        new Date(p.starts_at) <= now &&
        now <= new Date(p.ends_at) &&
        Number(p.promotional_price) < base,
    )
    .map((p) => Number(p.promotional_price))
  return prices.length ? Math.min(...prices) : null
}

/** Item 1: preço efetivo do produto = promocional vigente, senão base_price. */
export function resolvePrice(
  basePrice: number | string,
  promotions: PromotionRow[] | null | undefined,
  now: Date = new Date(),
): PriceInfo {
  const base = Number(basePrice)
  const promo = currentPromotion(base, promotions, now)
  if (promo === null) {
    return { base_price: base, effective_price: base, on_promotion: false, discount_percent: 0 }
  }
  return {
    base_price: base,
    effective_price: round2(promo),
    on_promotion: true,
    discount_percent: Math.round((1 - promo / base) * 100),
  }
}

/** Item 2: variação = price × promocional ÷ base_price (2 casas) se houver promoção vigente; senão price. */
export function variantEffectivePrice(
  variantPrice: number | string,
  basePrice: number | string,
  promotions: PromotionRow[] | null | undefined,
  now: Date = new Date(),
): number {
  const price = Number(variantPrice)
  const promo = currentPromotion(basePrice, promotions, now)
  if (promo === null) return round2(price)
  return round2((price * promo) / Number(basePrice))
}

export interface AddonLine { price: number | string; quantity: number }

/** Itens 4 e 5: adicionais não têm desconto. Total = (efetivo + Σ adicional × qtd) × quantidade do item. */
export function itemTotal(effectiveUnit: number, addons: AddonLine[], quantity: number): number {
  const extras = addons.reduce((sum, a) => sum + Number(a.price) * a.quantity, 0)
  return round2((effectiveUnit + extras) * quantity)
}

/** Item 6: total do pedido = soma dos itens (sem taxa de entrega). */
export const orderTotal = (itemTotals: number[]): number => round2(itemTotals.reduce((s, t) => s + t, 0))
