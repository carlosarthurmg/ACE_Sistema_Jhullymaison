// STUB local: o oficial valida a sessão real (cookie HttpOnly). Este só libera em `netlify dev`.
import { HttpError } from './catalog-errors'

export async function requireAdmin(_req: Request): Promise<{ id: string }> {
  if (process.env.NETLIFY_DEV === 'true' && process.env.DEV_ADMIN_ID) return { id: process.env.DEV_ADMIN_ID }
  throw new HttpError(401, 'UNAUTHENTICATED', 'Faça login para continuar.')
}
