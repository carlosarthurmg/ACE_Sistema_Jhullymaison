import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

const sql = readFileSync('supabase/migrations/007_catalog_atomic_operations.sql', 'utf8')

describe('migration 007 (catálogo)', () => {
  it('não duplica o trigger de updated_at que já existe na 005', () => {
    expect(sql).not.toMatch(/catalog_touch_updated_at|products_touch_updated_at/)
  })

  it('catalog_reassign_category recusa origem igual ao destino (22023)', () => {
    const fn = sql.slice(sql.indexOf('catalog_reassign_category(p_from'))
    expect(fn).toMatch(/p_from = p_to/)
    expect(fn).toMatch(/22023/)
  })
})
