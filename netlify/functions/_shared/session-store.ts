/**
 * session-store.ts — cria e revoga sessões na tabela app_sessions.
 * Fonte única: login, cadastro, logout e (depois) redefinição de senha usam estas funções.
 *
 * Diferença assumida em relação ao Apêndice D do Guia: NÃO guardamos os tokens do Supabase Auth.
 * Toda consulta ao banco usa a service role no servidor e a permissão vem de app_sessions + profiles,
 * então os tokens do Supabase não seriam usados e só aumentariam o que há para vazar.
 * A coluna encrypted_session (obrigatória) recebe um payload mínimo criptografado.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildSessionCookie,
  encryptSessionPayload,
  generateSessionToken,
  getCookieSettings,
  hashSessionToken,
  type CookieSettings,
} from "./session";

export interface CreatedSession {
  cookie: string;
  expiresAt: Date;
}

export async function createUserSession(
  client: Pick<SupabaseClient, "from">,
  userId: string,
  now: Date = new Date(),
  settings: CookieSettings = getCookieSettings(),
): Promise<CreatedSession> {
  const token = generateSessionToken();
  const expiresAt = new Date(now.getTime() + settings.maxAgeSeconds * 1000);
  const payload = JSON.stringify({ v: 1, user_id: userId, created_at: now.toISOString() });

  const { error } = await client.from("app_sessions").insert({
    user_id: userId,
    token_hash: hashSessionToken(token),
    encrypted_session: encryptSessionPayload(payload),
    expires_at: expiresAt.toISOString(),
  });
  if (error) throw error;

  return { cookie: buildSessionCookie(token, settings), expiresAt };
}

/** Logout: revoga a sessão do cookie atual. Não faz nada se ela já estiver revogada. */
export async function revokeSessionByToken(
  client: Pick<SupabaseClient, "from">,
  token: string,
  now: Date = new Date(),
): Promise<void> {
  const { error } = await client
    .from("app_sessions")
    .update({ revoked_at: now.toISOString() })
    .eq("token_hash", hashSessionToken(token))
    .is("revoked_at", null);
  if (error) throw error;
}

/** Troca/redefinição de senha: revoga TODAS as sessões da pessoa (RNF17). */
export async function revokeAllUserSessions(
  client: Pick<SupabaseClient, "from">,
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  const { error } = await client
    .from("app_sessions")
    .update({ revoked_at: now.toISOString() })
    .eq("user_id", userId)
    .is("revoked_at", null);
  if (error) throw error;
}
