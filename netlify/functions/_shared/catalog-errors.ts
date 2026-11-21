// Erros HTTP do catálogo, construídos sobre o response.ts compartilhado (fail).
import { ZodError } from 'zod'
import { fail } from './response'

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message)
  }
}

/** Converte erro do Postgres em HttpError sem vazar detalhes internos. */
export function assertDb(error: { code?: string } | null): void {
  if (!error) return
  console.error('db_error', error.code)
  if (error.code === '23505') throw new HttpError(409, 'CONFLICT', 'Já existe um registro com esses dados.')
  if (error.code === '23503' || error.code === '23001') {
    throw new HttpError(409, 'CONFLICT', 'Este registro está vinculado a outros dados.')
  }
  if (error.code === '23514' || error.code === '22023') {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Revise os valores informados.')
  }
  if (error.code === 'P0002') throw new HttpError(404, 'NOT_FOUND', 'Registro não encontrado.')
  throw new HttpError(500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.')
}

export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.code, e.message)
    if (e instanceof ZodError) return fail(400, 'VALIDATION_ERROR', 'Revise os dados informados.')
    console.error('unexpected_error', e instanceof Error ? e.name : 'unknown')
    return fail(500, 'INTERNAL_ERROR', 'Erro inesperado. Tente novamente.')
  }
}
