import type { Config } from "@netlify/functions";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fail, ok } from "./_shared/response";
import { getClientIp, handle, withCookie } from "./_shared/handler";
import { RateLimiter } from "./_shared/rate-limit";
import { createUserSession } from "./_shared/session-store";
import { createAuthClient } from "./_shared/supabase-auth";
import { getServiceClient } from "./_shared/supabase";
import { parseLoginBody, readJsonBody } from "./_shared/validation";

// POST /api/auth/login  (RF02, RNF15, RNF17)
// Confere e-mail e senha no Supabase Auth e abre uma sessão por cookie HttpOnly.

export interface LoginDeps {
  getClient: () => SupabaseClient;
  getAuthClient: () => SupabaseClient;
  limiter: RateLimiter;
  now: () => Date;
}

const defaultDeps: LoginDeps = {
  getClient: getServiceClient,
  getAuthClient: createAuthClient,
  limiter: new RateLimiter(5, 15 * 60 * 1000), // 5 falhas por 15 minutos
  now: () => new Date(),
};

// Mesma mensagem para qualquer causa: não revela se o e-mail existe.
const invalidCredentials = () => fail(401, "INVALID_CREDENTIALS", "E-mail ou senha incorretos.");

function isInvalidCredentials(error: unknown): boolean {
  const { code, status } = error as { code?: string; status?: number };
  return code === "invalid_credentials" || status === 400;
}

export function createLoginHandler(deps: LoginDeps = defaultDeps) {
  return handle("POST", async (request) => {
    const body = await readJsonBody(request);
    const parsed = body ? parseLoginBody(body) : null;
    if (!parsed || !parsed.ok) return fail(400, "VALIDATION_ERROR", "Informe e-mail e senha.");
    const { email, password } = parsed.value;

    const key = `${getClientIp(request)}|${email}`;
    if (deps.limiter.isLimited(key)) {
      const response = fail(429, "TOO_MANY_REQUESTS", "Muitas tentativas. Aguarde alguns minutos e tente de novo.");
      response.headers.set("Retry-After", String(deps.limiter.retryAfterSeconds(key)));
      return response;
    }

    const signIn = await deps.getAuthClient().auth.signInWithPassword({ email, password });
    if (signIn.error) {
      if (isInvalidCredentials(signIn.error)) {
        deps.limiter.hit(key);
        return invalidCredentials();
      }
      throw signIn.error;
    }
    const userId = signIn.data.user.id;

    const client = deps.getClient();
    const profile = await client
      .from("profiles")
      .select("full_name, role, anonymized_at")
      .eq("id", userId)
      .maybeSingle();
    if (profile.error) throw profile.error;
    if (!profile.data || profile.data.anonymized_at) {
      deps.limiter.hit(key);
      return invalidCredentials();
    }

    const session = await createUserSession(client, userId, deps.now());
    deps.limiter.clear(key);

    const response = ok({
      user: { id: userId, full_name: profile.data.full_name, role: profile.data.role },
    });
    return withCookie(response, session.cookie);
  });
}

export default createLoginHandler();
export const config: Config = { path: "/api/auth/login" };
