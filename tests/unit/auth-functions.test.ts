import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLoginHandler } from "../../netlify/functions/auth-login";
import { createLogoutHandler } from "../../netlify/functions/auth-logout";
import { createRegisterHandler } from "../../netlify/functions/auth-register";
import { createSessionHandler } from "../../netlify/functions/auth-session";
import { requireUser } from "../../netlify/functions/_shared/auth";
import { CURRENT_TERMS_VERSION } from "../../netlify/functions/_shared/legal";
import { RateLimiter } from "../../netlify/functions/_shared/rate-limit";
import { hashSessionToken } from "../../netlify/functions/_shared/session";
import { revokeAllUserSessions } from "../../netlify/functions/_shared/session-store";
import { createFakeSupabase } from "./helpers/fake-supabase";

const NOW = new Date("2026-11-27T12:00:00Z");
const KEY = Buffer.alloc(32, 5).toString("base64");

const registerBody = {
  full_name: "Ana Souza",
  phone: "86999990000",
  email: "ana@exemplo.com",
  password: "Senha123",
  accepted_terms: true,
};

function post(path: string, body?: unknown, cookie?: string): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function get(path: string, cookie?: string): Request {
  return new Request(`http://localhost${path}`, { headers: cookie ? { cookie } : {} });
}

/** Pega o token do cabeçalho Set-Cookie da resposta. */
function tokenFrom(response: Response): string {
  const setCookie = response.headers.getSetCookie()[0] ?? "";
  return setCookie.split(";")[0]!.split("=")[1]!;
}

async function json(response: Response) {
  return (await response.json()) as { data: Record<string, unknown> | null; error: Record<string, unknown> | null };
}

beforeEach(() => {
  vi.stubEnv("COOKIE_NAME", "jm_session");
  vi.stubEnv("COOKIE_MAX_AGE_SECONDS", "7200");
  vi.stubEnv("SESSION_ENCRYPTION_KEY", KEY);
  vi.stubEnv("CONTEXT", "dev");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/auth/register", () => {
  it("cria conta, perfil, sessão e cookie (201)", async () => {
    const db = createFakeSupabase();
    const handler = createRegisterHandler({ getClient: () => db.client, now: () => NOW });
    const response = await handler(post("/api/auth/register", registerBody));
    const body = await json(response);

    expect(response.status).toBe(201);
    expect(body.data).toEqual({ user: { id: "user-1", full_name: "Ana Souza", role: "customer" } });
    expect(JSON.stringify(body)).not.toContain("Senha123");

    expect(db.tables.profiles![0]).toMatchObject({
      id: "user-1",
      full_name: "Ana Souza",
      phone: "86999990000",
      role: "customer",
      accepted_terms_version: CURRENT_TERMS_VERSION,
      accepted_terms_at: NOW.toISOString(),
    });
    expect(db.tables.app_sessions).toHaveLength(1);
  });

  it("o cookie é HttpOnly, SameSite=Lax, Path=/ e a resposta não pode ser guardada em cache", async () => {
    const db = createFakeSupabase();
    const handler = createRegisterHandler({ getClient: () => db.client, now: () => NOW });
    const response = await handler(post("/api/auth/register", registerBody));
    const cookie = response.headers.getSetCookie()[0]!;

    expect(cookie).toContain("jm_session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=7200");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("guarda no banco só o HASH do token, nunca o token", async () => {
    const db = createFakeSupabase();
    const handler = createRegisterHandler({ getClient: () => db.client, now: () => NOW });
    const response = await handler(post("/api/auth/register", registerBody));
    const token = tokenFrom(response);
    const session = db.tables.app_sessions![0]!;

    expect(session.token_hash).toBe(hashSessionToken(token));
    expect(JSON.stringify(session)).not.toContain(token);
    expect(String(session.encrypted_session).startsWith("v1.")).toBe(true);
    expect(session.expires_at).toBe(new Date(NOW.getTime() + 7200 * 1000).toISOString());
  });

  it("400 com erro por campo e sem tocar no banco", async () => {
    const db = createFakeSupabase();
    const handler = createRegisterHandler({ getClient: () => db.client, now: () => NOW });
    const response = await handler(post("/api/auth/register", { ...registerBody, accepted_terms: false, email: "x" }));
    const body = await json(response);

    expect(response.status).toBe(400);
    expect(body.error?.code).toBe("VALIDATION_ERROR");
    expect(Object.keys(body.error?.details as object).sort()).toEqual(["accepted_terms", "email"]);
    expect(db.tables.profiles).toHaveLength(0);
  });

  it("400 para corpo que não é JSON", async () => {
    const handler = createRegisterHandler({ getClient: () => createFakeSupabase().client, now: () => NOW });
    const response = await handler(new Request("http://x/", { method: "POST", body: "texto" }));
    expect(response.status).toBe(400);
  });

  it("409 quando o e-mail já existe", async () => {
    const db = createFakeSupabase();
    db.addUser("ana@exemplo.com", "Outra123", "user-9");
    const handler = createRegisterHandler({ getClient: () => db.client, now: () => NOW });
    const response = await handler(post("/api/auth/register", registerBody));

    expect(response.status).toBe(409);
    expect((await json(response)).error?.code).toBe("EMAIL_IN_USE");
    expect(db.tables.profiles).toHaveLength(0);
  });

  it("se o perfil falhar, apaga a conta criada e responde 500 sem detalhes internos", async () => {
    const db = createFakeSupabase();
    db.failures.add("insert:profiles");
    const handler = createRegisterHandler({ getClient: () => db.client, now: () => NOW });
    const response = await handler(post("/api/auth/register", registerBody));
    const body = await json(response);

    expect(response.status).toBe(500);
    expect(body.error?.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(body)).not.toContain("falha simulada");
    expect(db.deletedUsers).toEqual(["user-1"]);
    expect(db.tables.app_sessions).toHaveLength(0);
  });

  it("o log de erro não contém a mensagem do erro (pode ter e-mail ou dado pessoal)", async () => {
    const db = createFakeSupabase();
    db.failures.add("insert:profiles");
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const handler = createRegisterHandler({ getClient: () => db.client, now: () => NOW });
    await handler(post("/api/auth/register", registerBody));

    const logged = JSON.stringify(logSpy.mock.calls);
    expect(logged).not.toContain("falha simulada");
    expect(logged).not.toContain("ana@exemplo.com");
  });

  it("405 para outro método", async () => {
    const handler = createRegisterHandler({ getClient: () => createFakeSupabase().client, now: () => NOW });
    const response = await handler(get("/api/auth/register"));
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
  });
});

describe("POST /api/auth/login", () => {
  const setup = (profile: Record<string, unknown> = { full_name: "Ana Souza", role: "customer", anonymized_at: null }) => {
    const db = createFakeSupabase();
    db.addUser("ana@exemplo.com", "Senha123", "user-7", profile);
    const limiter = new RateLimiter(5, 15 * 60 * 1000);
    const handler = createLoginHandler({
      getClient: () => db.client,
      getAuthClient: () => db.client,
      limiter,
      now: () => NOW,
    });
    return { db, handler, limiter };
  };

  it("login correto: 200, usuário e cookie de sessão", async () => {
    const { db, handler } = setup();
    const response = await handler(post("/api/auth/login", { email: "ANA@exemplo.com", password: "Senha123" }));
    const body = await json(response);

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ user: { id: "user-7", full_name: "Ana Souza", role: "customer" } });
    expect(response.headers.getSetCookie()[0]).toContain("HttpOnly");
    expect(db.tables.app_sessions).toHaveLength(1);
  });

  it("senha errada e e-mail inexistente dão a MESMA resposta 401", async () => {
    const { handler } = setup();
    const wrongPassword = await handler(post("/api/auth/login", { email: "ana@exemplo.com", password: "Errada123" }));
    const unknownEmail = await handler(post("/api/auth/login", { email: "ninguem@exemplo.com", password: "Senha123" }));

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(await json(wrongPassword)).toEqual(await json(unknownEmail));
    expect(wrongPassword.headers.getSetCookie()).toHaveLength(0);
  });

  it("todas as causas de falha (senha, e-mail, anonimizada, sem perfil) respondem IGUAL", async () => {
    const credentials = { email: "ana@exemplo.com", password: "Senha123" };
    const make = (profile?: Record<string, unknown>) => {
      const db = createFakeSupabase();
      db.addUser("ana@exemplo.com", "Senha123", "user-7", profile);
      return createLoginHandler({
        getClient: () => db.client, getAuthClient: () => db.client, limiter: new RateLimiter(5, 1000), now: () => NOW,
      });
    };

    const responses = await Promise.all([
      make({ full_name: "A", role: "customer", anonymized_at: null })(post("/api/auth/login", { ...credentials, password: "Errada123" })),
      make({ full_name: "A", role: "customer", anonymized_at: null })(post("/api/auth/login", { ...credentials, email: "outro@exemplo.com" })),
      make({ full_name: "A", role: "customer", anonymized_at: NOW.toISOString() })(post("/api/auth/login", credentials)),
      make(undefined)(post("/api/auth/login", credentials)),
    ]);

    const bodies = await Promise.all(responses.map((response) => json(response)));
    for (const response of responses) expect(response.status).toBe(401);
    for (const body of bodies) expect(body).toEqual(bodies[0]);
  });

  it("conta anonimizada ou sem perfil não entra (401)", async () => {
    const anonymized = setup({ full_name: "Cliente removido", role: "customer", anonymized_at: NOW.toISOString() });
    const a = await anonymized.handler(post("/api/auth/login", { email: "ana@exemplo.com", password: "Senha123" }));
    expect(a.status).toBe(401);

    const db = createFakeSupabase();
    db.addUser("ana@exemplo.com", "Senha123", "user-7"); // sem perfil
    const handler = createLoginHandler({
      getClient: () => db.client, getAuthClient: () => db.client, limiter: new RateLimiter(5, 1000), now: () => NOW,
    });
    const b = await handler(post("/api/auth/login", { email: "ana@exemplo.com", password: "Senha123" }));
    expect(b.status).toBe(401);
    expect(db.tables.app_sessions).toHaveLength(0);
  });

  it("depois de 5 falhas bloqueia com 429 e Retry-After, até com a senha certa", async () => {
    const { handler } = setup();
    for (let i = 0; i < 5; i++) {
      const r = await handler(post("/api/auth/login", { email: "ana@exemplo.com", password: "Errada123" }));
      expect(r.status).toBe(401);
    }
    const blocked = await handler(post("/api/auth/login", { email: "ana@exemplo.com", password: "Senha123" }));
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("login certo zera a contagem de falhas", async () => {
    const { handler, limiter } = setup();
    await handler(post("/api/auth/login", { email: "ana@exemplo.com", password: "Errada123" }));
    await handler(post("/api/auth/login", { email: "ana@exemplo.com", password: "Senha123" }));
    expect(limiter.isLimited("unknown|ana@exemplo.com")).toBe(false);
  });

  it("400 sem e-mail ou senha", async () => {
    const { handler } = setup();
    expect((await handler(post("/api/auth/login", { email: "ana@exemplo.com" }))).status).toBe(400);
    expect((await handler(post("/api/auth/login", {}))).status).toBe(400);
  });
});

describe("ciclo completo: cadastro, sessão, logout (critérios 1 a 4, com Supabase simulado)", () => {
  it("o cookie do login é aceito em /api/auth/session; sem cookie é 401; depois do logout é 401", async () => {
    const db = createFakeSupabase();
    const register = createRegisterHandler({ getClient: () => db.client, now: () => NOW });
    const session = createSessionHandler({ getClient: () => db.client, now: () => NOW });
    const logout = createLogoutHandler({ getClient: () => db.client, now: () => NOW });

    const registered = await register(post("/api/auth/register", registerBody));
    const token = tokenFrom(registered);
    const cookie = `jm_session=${token}`;

    // critério 3: com cookie devolve o usuário; sem cookie, 401
    const withCookie = await session(get("/api/auth/session", cookie));
    expect(withCookie.status).toBe(200);
    expect((await json(withCookie)).data).toEqual({
      user: { id: "user-1", full_name: "Ana Souza", role: "customer" },
    });
    expect(withCookie.headers.get("Cache-Control")).toBe("no-store");
    const withoutCookie = await session(get("/api/auth/session"));
    expect(withoutCookie.status).toBe(401);

    // critério 4: logout apaga o cookie e a sessão deixa de valer no servidor
    const loggedOut = await logout(post("/api/auth/logout", undefined, cookie));
    expect(loggedOut.status).toBe(204);
    const cleared = loggedOut.headers.getSetCookie()[0]!;
    expect(cleared).toContain("jm_session=;");
    expect(cleared).toContain("Max-Age=0");
    expect(db.tables.app_sessions![0]!.revoked_at).toBe(NOW.toISOString());

    const afterLogout = await session(get("/api/auth/session", cookie));
    expect(afterLogout.status).toBe(401);
  });

  it("logout sem cookie também responde 204 e apaga o cookie", async () => {
    const db = createFakeSupabase();
    const logout = createLogoutHandler({ getClient: () => db.client, now: () => NOW });
    const response = await logout(post("/api/auth/logout"));
    expect(response.status).toBe(204);
    expect(response.headers.getSetCookie()[0]).toContain("Max-Age=0");
  });

  it("logout com falha no banco responde 500 (não finge que revogou)", async () => {
    const db = createFakeSupabase();
    const register = createRegisterHandler({ getClient: () => db.client, now: () => NOW });
    const token = tokenFrom(await register(post("/api/auth/register", registerBody)));
    db.failures.add("update:app_sessions");
    const logout = createLogoutHandler({ getClient: () => db.client, now: () => NOW });
    const response = await logout(post("/api/auth/logout", undefined, `jm_session=${token}`));
    expect(response.status).toBe(500);
  });

  it("critério 5 (base): revogar todas as sessões da pessoa derruba o cookie antigo", async () => {
    const db = createFakeSupabase();
    const register = createRegisterHandler({ getClient: () => db.client, now: () => NOW });
    const token = tokenFrom(await register(post("/api/auth/register", registerBody)));
    const request = () => get("/api/auth/session", `jm_session=${token}`);

    expect((await requireUser(request(), { client: db.client, now: NOW })).ok).toBe(true);
    await revokeAllUserSessions(db.client, "user-1", NOW);
    expect((await requireUser(request(), { client: db.client, now: NOW })).ok).toBe(false);
  });

  it("sessão vence no horário: 2 horas depois o cookie não vale mais", async () => {
    const db = createFakeSupabase();
    const register = createRegisterHandler({ getClient: () => db.client, now: () => NOW });
    const token = tokenFrom(await register(post("/api/auth/register", registerBody)));
    const later = new Date(NOW.getTime() + 2 * 60 * 60 * 1000);
    const result = await requireUser(get("/x", `jm_session=${token}`), { client: db.client, now: later });
    expect(result.ok).toBe(false);
  });
});
