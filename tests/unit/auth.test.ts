import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireAdmin, requireUser } from "../../netlify/functions/_shared/auth";
import { generateSessionToken, hashSessionToken } from "../../netlify/functions/_shared/session";

const NOW = new Date("2026-11-20T12:00:00Z");
const FUTURE = "2026-11-20T14:00:00Z";
const PAST = "2026-11-20T10:00:00Z";

type Row = Record<string, unknown> | null;
type QueryResult = { data: Row; error: Error | null };

/** Banco falso: devolve a linha configurada para cada tabela e guarda o que foi consultado. */
function fakeClient(tables: Record<string, QueryResult>) {
  const calls: Array<{ table: string; column: string; value: unknown }> = [];
  return {
    calls,
    from(table: string) {
      return {
        select() {
          return {
            eq(column: string, value: unknown) {
              calls.push({ table, column, value });
              return { maybeSingle: async () => tables[table] ?? { data: null, error: null } };
            },
          };
        },
      };
    },
  };
}

const token = generateSessionToken();
const requestWith = (cookie?: string) =>
  new Request("http://localhost/api/orders", { headers: cookie ? { cookie } : {} });
const validRequest = () => requestWith(`jm_session=${token}`);

const validTables = (role: string, overrides: Partial<Record<string, unknown>> = {}) => ({
  app_sessions: {
    data: { user_id: "user-1", expires_at: FUTURE, revoked_at: null, ...overrides },
    error: null,
  },
  profiles: { data: { role, anonymized_at: null }, error: null },
});

async function bodyOf(response: Response) {
  return (await response.json()) as { data: unknown; error: { code: string; message: string } | null };
}

beforeEach(() => {
  vi.stubEnv("COOKIE_NAME", "jm_session");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("requireUser", () => {
  it("sem cookie: 401 e nem consulta o banco", async () => {
    const client = fakeClient(validTables("customer"));
    const result = await requireUser(requestWith(), { client: client as never, now: NOW });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      expect((await bodyOf(result.response)).error?.code).toBe("UNAUTHORIZED");
    }
    expect(client.calls).toHaveLength(0);
  });

  it("consulta o banco pelo HASH do token, nunca pelo token", async () => {
    const client = fakeClient(validTables("customer"));
    await requireUser(validRequest(), { client: client as never, now: NOW });
    const query = client.calls.find((call) => call.table === "app_sessions");
    expect(query?.column).toBe("token_hash");
    expect(query?.value).toBe(hashSessionToken(token));
    expect(query?.value).not.toBe(token);
  });

  it("token desconhecido: 401", async () => {
    const client = fakeClient({ app_sessions: { data: null, error: null } });
    const result = await requireUser(validRequest(), { client: client as never, now: NOW });
    expect(result.ok).toBe(false);
  });

  it("sessão revogada (logout ou troca de senha): 401", async () => {
    const client = fakeClient(validTables("customer", { revoked_at: PAST }));
    const result = await requireUser(validRequest(), { client: client as never, now: NOW });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("sessão vencida: 401", async () => {
    const client = fakeClient(validTables("customer", { expires_at: PAST }));
    const result = await requireUser(validRequest(), { client: client as never, now: NOW });
    expect(result.ok).toBe(false);
  });

  it("sessão que vence exatamente agora: 401", async () => {
    const client = fakeClient(validTables("customer", { expires_at: NOW.toISOString() }));
    const result = await requireUser(validRequest(), { client: client as never, now: NOW });
    expect(result.ok).toBe(false);
  });

  it("conta anonimizada: 401", async () => {
    const client = fakeClient({
      ...validTables("customer"),
      profiles: { data: { role: "customer", anonymized_at: PAST }, error: null },
    });
    const result = await requireUser(validRequest(), { client: client as never, now: NOW });
    expect(result.ok).toBe(false);
  });

  it("perfil inexistente ou com perfil desconhecido: 401", async () => {
    const semPerfil = fakeClient({ ...validTables("customer"), profiles: { data: null, error: null } });
    expect((await requireUser(validRequest(), { client: semPerfil as never, now: NOW })).ok).toBe(false);

    const perfilEstranho = fakeClient(validTables("superuser"));
    expect((await requireUser(validRequest(), { client: perfilEstranho as never, now: NOW })).ok).toBe(false);
  });

  it("sessão válida de cliente: ok com userId e role", async () => {
    const client = fakeClient(validTables("customer"));
    const result = await requireUser(validRequest(), { client: client as never, now: NOW });
    expect(result).toEqual({ ok: true, userId: "user-1", role: "customer" });
  });

  it("erro de banco é lançado (não vira 401)", async () => {
    const client = fakeClient({ app_sessions: { data: null, error: new Error("db caiu") } });
    await expect(requireUser(validRequest(), { client: client as never, now: NOW })).rejects.toThrow("db caiu");
  });

  it("erro de banco no perfil também é lançado", async () => {
    const client = fakeClient({ ...validTables("customer"), profiles: { data: null, error: new Error("perfil falhou") } });
    await expect(requireUser(validRequest(), { client: client as never, now: NOW })).rejects.toThrow("perfil falhou");
  });

  it("a mensagem de 401 não revela o motivo", async () => {
    const revogada = fakeClient(validTables("customer", { revoked_at: PAST }));
    const semToken = fakeClient({ app_sessions: { data: null, error: null } });
    const a = await requireUser(validRequest(), { client: revogada as never, now: NOW });
    const b = await requireUser(validRequest(), { client: semToken as never, now: NOW });
    if (a.ok || b.ok) throw new Error("deveria negar");
    expect(await bodyOf(a.response)).toEqual(await bodyOf(b.response));
  });
});

describe("requireAdmin", () => {
  it("administradora: ok", async () => {
    const client = fakeClient(validTables("admin"));
    const result = await requireAdmin(validRequest(), { client: client as never, now: NOW });
    expect(result).toEqual({ ok: true, userId: "user-1", role: "admin" });
  });

  it("cliente comum: 403", async () => {
    const client = fakeClient(validTables("customer"));
    const result = await requireAdmin(validRequest(), { client: client as never, now: NOW });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      expect((await bodyOf(result.response)).error?.code).toBe("FORBIDDEN");
    }
  });

  it("sem sessão: 401 (não 403)", async () => {
    const client = fakeClient(validTables("admin"));
    const result = await requireAdmin(requestWith(), { client: client as never, now: NOW });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });
});
