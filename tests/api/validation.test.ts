import { describe, expect, it } from 'vitest'
import { detectImageType } from '../../netlify/functions/admin-upload-product-image'
import {
  cleanSearch, imagePatch, productInput, promotionInput, slugify, variantInput,
} from '../../netlify/functions/_shared/catalog-validation'

const cat = '8f14e45f-ceea-4672-9c1e-2f4f5d3a1b11'
const validProduct = { category_ids: [cat], name: 'Buquê Aurora', description: 'Delicado', base_price: 200, stock_quantity: 6 }

describe('produto', () => {
  it('aceita produto válido', () => {
    expect(productInput.safeParse(validProduct).success).toBe(true)
  })
  it('RN10: exige pelo menos uma categoria', () => {
    expect(productInput.safeParse({ ...validProduct, category_ids: [] }).success).toBe(false)
    expect(productInput.safeParse({ ...validProduct, category_ids: undefined }).success).toBe(false)
  })
  it('rejeita preço/estoque negativos e campos desconhecidos', () => {
    expect(productInput.safeParse({ ...validProduct, base_price: -1 }).success).toBe(false)
    expect(productInput.safeParse({ ...validProduct, stock_quantity: -1 }).success).toBe(false)
    expect(productInput.safeParse({ ...validProduct, role: 'admin' }).success).toBe(false)
  })
})

describe('variação (RF33) e promoção (RN07)', () => {
  it('variação tem preço próprio, não negativo', () => {
    expect(variantInput.safeParse({ name: 'Especial', price: 240 }).success).toBe(true)
    expect(variantInput.safeParse({ name: 'Especial', price: -1 }).success).toBe(false)
    expect(variantInput.safeParse({ name: 'Especial', price_delta: 40 }).success).toBe(false)
  })
  it('promoção exige data final posterior à inicial', () => {
    const bad = { promotional_price: 10, starts_at: '2026-10-20T00:00:00-03:00', ends_at: '2026-10-19T00:00:00-03:00' }
    expect(promotionInput.safeParse(bad).success).toBe(false)
    expect(promotionInput.safeParse({ ...bad, ends_at: '2026-10-31T23:59:59-03:00' }).success).toBe(true)
  })
})

describe('fotos', () => {
  it('só permite marcar como capa (true), nunca desmarcar', () => {
    expect(imagePatch.safeParse({ is_cover: true }).success).toBe(true)
    expect(imagePatch.safeParse({ is_cover: false }).success).toBe(false)
  })
  it('detectImageType confere os bytes reais, não a extensão', () => {
    expect(detectImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg')
    expect(detectImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe('png')
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])
    expect(detectImageType(webp)).toBe('webp')
    expect(detectImageType(new TextEncoder().encode('<?php echo 1; ?>'))).toBeNull()
  })
})

describe('utilitários', () => {
  it('slugify remove acentos e símbolos', () => {
    expect(slugify('Buquê de Rosas & Cia!')).toBe('buque-de-rosas-cia')
  })
  it('cleanSearch remove caracteres de filtro', () => {
    expect(cleanSearch('rosa%,(x)*')).toBe('rosa x')
  })
})
