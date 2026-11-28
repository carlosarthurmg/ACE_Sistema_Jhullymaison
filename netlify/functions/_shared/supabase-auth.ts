import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente DESCARTÁVEL só para conferir e-mail e senha (signInWithPassword).
 * Cria um novo a cada chamada. NUNCA reutilize nem troque pelo getServiceClient():
 * depois de um login, o supabase-js passa a usar o token da pessoa nas consultas,
 * e o cliente "service role" deixaria de ignorar o RLS.
 */
export function createAuthClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("SUPABASE_NOT_CONFIGURED");

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
