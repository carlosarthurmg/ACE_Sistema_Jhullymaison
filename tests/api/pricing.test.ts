import { describe, expect, it } from 'vitest'
import {
  currentPromotion, itemTotal, orderTotal, resolvePrice, variantEffectivePrice,
} from '../../netlify/functions/_shared/pricing'

const now = new Date('2026-10-20T12:00:00-03:00')
const RANGE: [string, string] = ['2026-10-01T00:00:00-03:00', '2026-10-31T23:59:59-03:00']
const promo = (price: number, from: string, to: string, active = true) => ({
  promotional_price: price, starts_at: from, ends_at: to, is_active: active,
})

describe('promoção vigente (4.5 item 3, RN07)', () => {
  it('ignora inativa, fora do período e com preço maior ou igual ao original', () => {
    expect(currentPromotion(200, [promo(180, ...RANGE, false)], now)).toBeNull()
    expect(currentPromotion(200, [promo(180, '2026-09-01T00:00:00-03:00', '2026-09-30T23:59:59-03:00')], now)).toBeNull()
    expect(currentPromotion(200, [promo(200, ...RANGE)], now)).toBeNull()
    expect(currentPromotion(200, [promo(250, ...RANGE)], now)).toBeNull()
  })
  it('com várias vigentes usa a de menor preço', () => {
    expect(currentPromotion(200, [promo(180, ...RANGE), promo(150, ...RANGE)], now)).toBe(150)
  })
})

describe('preço do produto (4.5 item 1)', () => {
  it('sem promoção usa base_price', () => {
    expect(resolvePrice(200, [], now)).toEqual({ base_price: 200, effective_price: 200, on_promotion: false, discount_percent: 0 })
  })
  it('com promoção usa o preço promocional e calcula o percentual', () => {
    const r = resolvePrice(200, [promo(180, ...RANGE)], now)
    expect(r).toMatchObject({ effective_price: 180, on_promotion: true, discount_percent: 10 })
  })
})

describe('preço da variação (4.5 item 2): price × promocional ÷ base', () => {
  it('sem promoção usa o preço da variação', () => {
    expect(variantEffectivePrice(240, 200, [], now)).toBe(240)
  })
  it('com promoção aplica o desconto proporcional', () => {
    expect(variantEffectivePrice(200, 200, [promo(180, ...RANGE)], now)).toBe(180)
    expect(variantEffectivePrice(240, 200, [promo(180, ...RANGE)], now)).toBe(216)
  })
  it('arredonda para 2 casas', () => {
    expect(variantEffectivePrice(100, 300, [promo(100, ...RANGE)], now)).toBe(33.33)
  })
})

describe('totais (4.5 itens 4 a 6)', () => {
  it('adicionais não recebem desconto e multiplicam pela quantidade do item', () => {
    // (180 + 25×1 + 15×2) × 2 = 470
    expect(itemTotal(180, [{ price: 25, quantity: 1 }, { price: 15, quantity: 2 }], 2)).toBe(470)
  })
  it('total do pedido é a soma dos itens', () => {
    expect(orderTotal([205, 149])).toBe(354)
  })
})
