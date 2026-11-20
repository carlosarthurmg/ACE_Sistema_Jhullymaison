import { createClient, type SupabaseClient } from '@supabase/supabase-js'

function env(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}`)
  return value
}

/**
 * Credencial de serviço (ignora RLS). Adendo 4.4: o catálogo público é lido somente pelas
 * Functions, então toda consulta precisa filtrar explicitamente o que o público pode ver.
 */
export const supabaseAdmin = (): SupabaseClient =>
  createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
