import { createHash } from "node:crypto";
import { getServiceClient } from "./supabase";
import { fail } from "./response";

// Contrato de sessão opaca do apêndice D. O login da equipe emite o cookie.
export async function requireOrderSession(request: Request) {
  const cookieName = process.env.COOKIE_NAME;
  if (!cookieName) throw new Error("COOKIE_NOT_CONFIGURED");
  const denied = () => ({
    ok: false as const,
    response: fail(401, "UNAUTHORIZED", "Faça login novamente."),
  });
  const prefix = cookieName + "=";
  const cookies = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((v) => v.trim())
    .filter((v) => v.startsWith(prefix));
  if (cookies.length !== 1 || cookies[0].length === prefix.length)
    return denied();
  if (request.method !== "GET") {
    const origin = request.headers.get("origin");
    const base = process.env.APP_BASE_URL;
    if (!base || origin !== new URL(base).origin) {
      return {
        ok: false as const,
        response: fail(403, "FORBIDDEN", "Origem da requisição inválida."),
      };
    }
  }
  const hash = createHash("sha256")
    .update(cookies[0].slice(prefix.length))
    .digest("hex");
  const db = getServiceClient();
  const { data: session, error } = await db
    .from("app_sessions")
    .select("user_id")
    .eq("token_hash", hash)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) throw error;
  if (!session) return denied();
  const profile = await db
    .from("profiles")
    .select("role,anonymized_at")
    .eq("id", session.user_id)
    .maybeSingle();
  if (profile.error) throw profile.error;
  if (!profile.data || profile.data.anonymized_at) return denied();
  return {
    ok: true as const,
    userId: session.user_id as string,
    role: profile.data.role as string,
  };
}

export async function requireAdmin(request: Request) {
  const session = await requireOrderSession(request);
  if (session.ok && session.role !== "admin") {
    return {
      ok: false as const,
      response: fail(403, "FORBIDDEN", "Acesso restrito à administração."),
    };
  }
  return session;
}
