/**
 * session.ts — peças da sessão por cookie HttpOnly (Guia, Apêndice D).
 *
 * O navegador recebe só um identificador aleatório (token). No banco ficam:
 *  - app_sessions.token_hash         = SHA-256 do token, em HEXADECIMAL (mesmo formato
 *                                      que o auth.ts usa para conferir)
 *  - app_sessions.encrypted_session  = tokens do Supabase Auth criptografados (AES-256-GCM)
 *
 * Este arquivo é puro: não acessa banco nem rede. NUNCA registre em log o token,
 * o cookie, a chave de criptografia nem o texto cifrado.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// ---------- Token e hash ----------

/** Identificador aleatório da sessão: 256 bits, em base64url (43 caracteres). */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** SHA-256 em hexadecimal. É o valor gravado em app_sessions.token_hash. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// ---------- Criptografia dos tokens do Supabase Auth ----------

/**
 * SESSION_ENCRYPTION_KEY: 32 bytes aleatórios em base64. Para gerar (qualquer sistema):
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 * Use uma chave diferente em cada ambiente e guarde só no .env local e no painel do Netlify.
 */
export function loadEncryptionKey(raw: string | undefined = process.env.SESSION_ENCRYPTION_KEY): Buffer {
  if (!raw) throw new Error("SESSION_ENCRYPTION_KEY_MISSING");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("SESSION_ENCRYPTION_KEY_INVALID");
  return key;
}

/** Formato do resultado: v1.<iv>.<tag>.<texto cifrado>, tudo em base64url. */
export function encryptSessionPayload(plaintext: string, key: Buffer = loadEncryptionKey()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptSessionPayload(encrypted: string, key: Buffer = loadEncryptionKey()): string {
  const parts = encrypted.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") throw new Error("SESSION_DECRYPT_FAILED");
  try {
    const iv = Buffer.from(parts[1]!, "base64url");
    const tag = Buffer.from(parts[2]!, "base64url");
    const ciphertext = Buffer.from(parts[3]!, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    // Mensagem genérica de propósito: não revela por que falhou.
    throw new Error("SESSION_DECRYPT_FAILED");
  }
}

// ---------- Cookie ----------

export interface CookieSettings {
  name: string;
  maxAgeSeconds: number;
  secure: boolean;
}

/**
 * Lê COOKIE_NAME e COOKIE_MAX_AGE_SECONDS.
 *  - Desenvolvimento (netlify dev, http://localhost): jm_session, sem Secure.
 *  - Produção: __Host-jm_session, com Secure.
 * Secure fica ligado quando o nome começa com "__Host-" ou quando o Netlify informa
 * um contexto que não é "dev" (production, deploy-preview, branch-deploy).
 */
export function getCookieSettings(env: Record<string, string | undefined> = process.env): CookieSettings {
  const name = env.COOKIE_NAME || "jm_session";
  const parsed = Number(env.COOKIE_MAX_AGE_SECONDS);
  const maxAgeSeconds = Number.isInteger(parsed) && parsed > 0 ? parsed : 7200;
  const secure = name.startsWith("__Host-") || (!!env.CONTEXT && env.CONTEXT !== "dev");
  return { name, maxAgeSeconds, secure };
}

export function buildSessionCookie(token: string, settings: CookieSettings = getCookieSettings()): string {
  assertCookieIsValid(settings);
  const parts = [
    `${settings.name}=${token}`,
    `Max-Age=${settings.maxAgeSeconds}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (settings.secure) parts.push("Secure");
  return parts.join("; ");
}

/** Cookie que apaga a sessão no navegador, com os mesmos atributos. */
export function buildClearSessionCookie(settings: CookieSettings = getCookieSettings()): string {
  assertCookieIsValid(settings);
  const parts = [
    `${settings.name}=`,
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (settings.secure) parts.push("Secure");
  return parts.join("; ");
}

// O prefixo __Host- exige Secure; sem isso o navegador recusa o cookie.
function assertCookieIsValid(settings: CookieSettings): void {
  if (settings.name.startsWith("__Host-") && !settings.secure) {
    throw new Error("COOKIE_HOST_PREFIX_REQUIRES_SECURE");
  }
}

/** Lê o token do cabeçalho Cookie. Devolve null se não houver ou se o formato for estranho. */
export function getSessionToken(request: Request, cookieName: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;

  for (const part of header.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName === cookieName) {
      const value = rest.join("=");
      return /^[A-Za-z0-9_-]{20,200}$/.test(value) ? value : null;
    }
  }
  return null;
}
