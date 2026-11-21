import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Arquivo COMPARTILHADO e fonte única do cliente Supabase no servidor.
// Nome definitivo: getServiceClient() (sem alias). Não crie outro helper.

let serviceClient: SupabaseClient | null = null;

/**
 * Cliente com a chave service role: IGNORA o RLS e só existe no servidor.
 * Quem usa precisa conferir a permissão ANTES (requireUser / requireAdmin).
 * Nunca importe este arquivo no frontend (src/).
 */
export function getServiceClient(): SupabaseClient {
  if (serviceClient) return serviceClient;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // A mensagem diz o que falta, nunca o valor.
  if (!url || !key) throw new Error("SUPABASE_NOT_CONFIGURED");

  serviceClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return serviceClient;
}
