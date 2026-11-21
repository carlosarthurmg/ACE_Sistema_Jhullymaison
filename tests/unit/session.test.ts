import { describe, expect, it } from "vitest";
import {
  buildClearSessionCookie,
  buildSessionCookie,
  decryptSessionPayload,
  encryptSessionPayload,
  generateSessionToken,
  getCookieSettings,
  getSessionToken,
  hashSessionToken,
  loadEncryptionKey,
} from "../../netlify/functions/_shared/session";

const KEY = Buffer.alloc(32, 7);
const KEY_BASE64 = KEY.toString("base64");

describe("token e hash", () => {
  it("gera tokens aleatórios, únicos e com 256 bits", () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("o hash é SHA-256 em hexadecimal (formato do order-admin-access do Enzo)", () => {
    // Vetor de teste conhecido do SHA-256 para "abc".
    expect(hashSessionToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(hashSessionToken("abc")).toHaveLength(64);
  });

  it("o hash é determinístico e diferente para tokens diferentes", () => {
    expect(hashSessionToken("x")).toBe(hashSessionToken("x"));
    expect(hashSessionToken("x")).not.toBe(hashSessionToken("y"));
  });
});

describe("criptografia AES-256-GCM", () => {
  it("criptografa e descriptografa", () => {
    const text = JSON.stringify({ access_token: "a", refresh_token: "r" });
    const encrypted = encryptSessionPayload(text, KEY);
    expect(encrypted.startsWith("v1.")).toBe(true);
    expect(encrypted).not.toContain("access_token");
    expect(decryptSessionPayload(encrypted, KEY)).toBe(text);
  });

  it("o mesmo texto gera resultados diferentes (IV aleatório)", () => {
    expect(encryptSessionPayload("igual", KEY)).not.toBe(encryptSessionPayload("igual", KEY));
  });

  it("falha com chave errada", () => {
    const encrypted = encryptSessionPayload("segredo", KEY);
    expect(() => decryptSessionPayload(encrypted, Buffer.alloc(32, 9))).toThrow("SESSION_DECRYPT_FAILED");
  });

  it("detecta texto alterado", () => {
    const parts = encryptSessionPayload("segredo", KEY).split(".");
    parts[3] = Buffer.from("adulterado").toString("base64url");
    expect(() => decryptSessionPayload(parts.join("."), KEY)).toThrow("SESSION_DECRYPT_FAILED");
  });

  it("rejeita formato inválido", () => {
    expect(() => decryptSessionPayload("lixo", KEY)).toThrow("SESSION_DECRYPT_FAILED");
    expect(() => decryptSessionPayload("v2.a.b.c", KEY)).toThrow("SESSION_DECRYPT_FAILED");
  });

  it("valida a chave sem revelar o valor", () => {
    expect(loadEncryptionKey(KEY_BASE64)).toHaveLength(32);
    expect(() => loadEncryptionKey(undefined)).toThrow("SESSION_ENCRYPTION_KEY_MISSING");
    expect(() => loadEncryptionKey("curta")).toThrow("SESSION_ENCRYPTION_KEY_INVALID");
    try {
      loadEncryptionKey("curta");
    } catch (error) {
      expect((error as Error).message).not.toContain("curta");
    }
  });
});

describe("configuração do cookie", () => {
  it("desenvolvimento: jm_session, sem Secure", () => {
    expect(getCookieSettings({ COOKIE_NAME: "jm_session", CONTEXT: "dev" })).toEqual({
      name: "jm_session",
      maxAgeSeconds: 7200,
      secure: false,
    });
    expect(getCookieSettings({}).secure).toBe(false);
  });

  it("produção: __Host- liga o Secure", () => {
    expect(getCookieSettings({ COOKIE_NAME: "__Host-jm_session" }).secure).toBe(true);
  });

  it("no Netlify publicado o Secure liga mesmo se o nome estiver sem prefixo", () => {
    expect(getCookieSettings({ COOKIE_NAME: "jm_session", CONTEXT: "production" }).secure).toBe(true);
    expect(getCookieSettings({ COOKIE_NAME: "jm_session", CONTEXT: "deploy-preview" }).secure).toBe(true);
  });

  it("usa 7200 segundos se COOKIE_MAX_AGE_SECONDS for inválido", () => {
    expect(getCookieSettings({ COOKIE_MAX_AGE_SECONDS: "abc" }).maxAgeSeconds).toBe(7200);
    expect(getCookieSettings({ COOKIE_MAX_AGE_SECONDS: "-5" }).maxAgeSeconds).toBe(7200);
    expect(getCookieSettings({ COOKIE_MAX_AGE_SECONDS: "3600" }).maxAgeSeconds).toBe(3600);
  });
});

describe("cookie de sessão (critério 1)", () => {
  it("em produção tem HttpOnly, Secure, SameSite=Lax, Path=/ e não tem Domain", () => {
    const cookie = buildSessionCookie("tokenqualquer1234567890", {
      name: "__Host-jm_session",
      maxAgeSeconds: 7200,
      secure: true,
    });
    expect(cookie).toContain("__Host-jm_session=tokenqualquer1234567890");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=7200");
    expect(cookie).not.toContain("Domain");
  });

  it("em desenvolvimento não tem Secure, mas continua HttpOnly", () => {
    const cookie = buildSessionCookie("tokenqualquer1234567890", {
      name: "jm_session",
      maxAgeSeconds: 7200,
      secure: false,
    });
    expect(cookie).not.toContain("Secure");
    expect(cookie).toContain("HttpOnly");
  });

  it("recusa __Host- sem Secure (o navegador rejeitaria o cookie)", () => {
    expect(() =>
      buildSessionCookie("t", { name: "__Host-jm_session", maxAgeSeconds: 60, secure: false }),
    ).toThrow("COOKIE_HOST_PREFIX_REQUIRES_SECURE");
  });

  it("o cookie de logout apaga com os mesmos atributos (critério 4)", () => {
    const cookie = buildClearSessionCookie({ name: "__Host-jm_session", maxAgeSeconds: 7200, secure: true });
    expect(cookie).toContain("__Host-jm_session=;");
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("Path=/");
  });
});

describe("leitura do token no cabeçalho Cookie", () => {
  const token = generateSessionToken();
  const request = (cookie?: string) =>
    new Request("http://localhost/api/x", { headers: cookie ? { cookie } : {} });

  it("acha o cookie entre vários", () => {
    expect(getSessionToken(request(`a=1; jm_session=${token}; b=2`), "jm_session")).toBe(token);
  });

  it("devolve null sem cookie, com outro nome ou com valor estranho", () => {
    expect(getSessionToken(request(), "jm_session")).toBeNull();
    expect(getSessionToken(request(`outro=${token}`), "jm_session")).toBeNull();
    expect(getSessionToken(request("jm_session=curto"), "jm_session")).toBeNull();
    expect(getSessionToken(request(`jm_session=${"a".repeat(300)}`), "jm_session")).toBeNull();
    expect(getSessionToken(request("jm_session="), "jm_session")).toBeNull();
  });
});
