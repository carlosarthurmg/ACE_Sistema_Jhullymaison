/**
 * auth.ts — QUEM está logado e O QUE pode fazer. Fonte única de permissão.
 *
 * Todo módulo usa requireUser() ou requireAdmin(). NENHUM módulo lê app_sessions
 * por conta própria. Se precisar de outra regra de acesso, peça mudança aqui.
 *
 * Uso numa Function:
 *   const auth = await requireUser(request);
 *   if (!auth.ok) return auth.response;     // 401 (ou 403)
 *   const { userId, role } = auth;
 *
 * Sessão negada devolve { ok: false, response }. Erro de banco é LANÇADO como exceção.
 * Seguro por padrão: sem cookie, token desconhecido, sessão revogada ou vencida,
 * ou conta anonimizada => 401.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fail } from "./response";
import { getCookieSettings, getSessionToken, hashSessionToken } from "./session";
import { getServiceClient } from "./supabase";

export type UserRole = "customer" | "admin";

export type AuthResult =
  | { ok: true; userId: string; role: UserRole }
  | { ok: false; response: Response };

export interface AuthOptions {
  /** Só para testes. Em produção usa getServiceClient(). */
  client?: Pick<SupabaseClient, "from">;
  /** Só para testes. */
  now?: Date;
}

const denied = (): AuthResult => ({
  ok: false,
  response: fail(401, "UNAUTHORIZED", "Faça login novamente."),
});

const forbidden = (): AuthResult => ({
  ok: false,
  response: fail(403, "FORBIDDEN", "Você não tem permissão para esta ação."),
});

/** Exige uma sessão válida (cliente ou administradora). */
export async function requireUser(request: Request, options: AuthOptions = {}): Promise<AuthResult> {
  const settings = getCookieSettings();
  const token = getSessionToken(request, settings.name);
  if (!token) return denied();

  const client = options.client ?? getServiceClient();
  const now = (options.now ?? new Date()).getTime();

  const sessionQuery = await client
    .from("app_sessions")
    .select("user_id, expires_at, revoked_at")
    .eq("token_hash", hashSessionToken(token))
    .maybeSingle();
  if (sessionQuery.error) throw sessionQuery.error;

  const session = sessionQuery.data;
  if (!session || session.revoked_at) return denied();
  if (new Date(session.expires_at).getTime() <= now) return denied();

  const profileQuery = await client
    .from("profiles")
    .select("role, anonymized_at")
    .eq("id", session.user_id)
    .maybeSingle();
  if (profileQuery.error) throw profileQuery.error;

  const profile = profileQuery.data;
  if (!profile || profile.anonymized_at) return denied();
  if (profile.role !== "customer" && profile.role !== "admin") return denied();

  return { ok: true, userId: session.user_id as string, role: profile.role as UserRole };
}

/** Exige sessão válida E perfil administrador (RN03, RNF14). */
export async function requireAdmin(request: Request, options: AuthOptions = {}): Promise<AuthResult> {
  const auth = await requireUser(request, options);
  if (!auth.ok) return auth;
  if (auth.role !== "admin") return forbidden();
  return auth;
}
