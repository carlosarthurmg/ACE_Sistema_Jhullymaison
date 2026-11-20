import { describe, expect, it } from 'vitest'
import { assertDb, HttpError } from '../../netlify/functions/_shared/catalog-errors'

const status = (code: string) => {
  try {
    assertDb({ code })
  } catch (e) {
    return (e as HttpError).status
  }
  return 0
}

describe('assertDb (erros do Postgres viram HTTP certo)', () => {
  it('violações de unicidade e vínculo viram 409', () => {
    expect(status('23505')).toBe(409) // duplicado
    expect(status('23503')).toBe(409) // chave estrangeira (NO ACTION)
    expect(status('23001')).toBe(409) // chave estrangeira (ON DELETE RESTRICT)
  })
  it('valor inválido vira 400 e registro ausente vira 404', () => {
    expect(status('23514')).toBe(400)
    expect(status('22023')).toBe(400)
    expect(status('P0002')).toBe(404)
  })
  it('erro desconhecido vira 500 genérico', () => expect(status('XX000')).toBe(500))
  it('null não lança', () => expect(() => assertDb(null)).not.toThrow())
})
