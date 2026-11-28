/**
 * validation.ts — validação de entrada no servidor (RNF16). O navegador nunca é confiável.
 * Cada parser devolve { ok: true, value } ou { ok: false, message } (mensagem em português).
 */
export type FieldResult<T> = { ok: true; value: T } | { ok: false; message: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lê o corpo JSON com limite de tamanho. Devolve null se não for um objeto JSON válido. */
export async function readJsonBody(
  request: Request,
  maxBytes = 10_000,
): Promise<Record<string, unknown> | null> {
  let text: string;
  try {
    text = await request.text();
  } catch {
    return null;
  }
  if (text.length === 0 || text.length > maxBytes) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function parseEmail(value: unknown): FieldResult<string> {
  if (typeof value !== "string") return { ok: false, message: "Informe o e-mail." };
  const email = value.trim().toLowerCase();
  if (email.length > 150 || !EMAIL_PATTERN.test(email)) {
    return { ok: false, message: "Informe um e-mail válido." };
  }
  return { ok: true, value: email };
}

/** Mínimo de 8 caracteres, com letra e número. Máximo de 72 (limite do algoritmo de senha). */
export function parsePassword(value: unknown): FieldResult<string> {
  if (typeof value !== "string") return { ok: false, message: "Informe a senha." };
  if (value.length < 8) return { ok: false, message: "A senha deve ter pelo menos 8 caracteres." };
  if (value.length > 72) return { ok: false, message: "A senha deve ter no máximo 72 caracteres." };
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
    return { ok: false, message: "A senha deve ter letras e números." };
  }
  return { ok: true, value };
}

export function parseFullName(value: unknown): FieldResult<string> {
  if (typeof value !== "string") return { ok: false, message: "Informe o nome completo." };
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 150) {
    return { ok: false, message: "O nome deve ter entre 2 e 150 caracteres." };
  }
  return { ok: true, value: name };
}

/** Guarda só os dígitos (10 a 13: DDD + número, com ou sem DDI 55). */
export function parsePhone(value: unknown): FieldResult<string> {
  if (typeof value !== "string") return { ok: false, message: "Informe o telefone." };
  const digits = value.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 13) {
    return { ok: false, message: "Informe o telefone com DDD." };
  }
  return { ok: true, value: digits };
}

export interface RegisterInput {
  full_name: string;
  phone: string;
  email: string;
  password: string;
}

export type ParsedBody<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> };

export function parseRegisterBody(body: Record<string, unknown>): ParsedBody<RegisterInput> {
  const errors: Record<string, string> = {};
  const fullName = parseFullName(body.full_name);
  const phone = parsePhone(body.phone);
  const email = parseEmail(body.email);
  const password = parsePassword(body.password);

  if (!fullName.ok) errors.full_name = fullName.message;
  if (!phone.ok) errors.phone = phone.message;
  if (!email.ok) errors.email = email.message;
  if (!password.ok) errors.password = password.message;
  if (body.accepted_terms !== true) {
    errors.accepted_terms = "É necessário aceitar os Termos de Uso e a Política de Privacidade.";
  }

  if (!fullName.ok || !phone.ok || !email.ok || !password.ok || errors.accepted_terms) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: { full_name: fullName.value, phone: phone.value, email: email.value, password: password.value },
  };
}

export function parseLoginBody(
  body: Record<string, unknown>,
): ParsedBody<{ email: string; password: string }> {
  const email = parseEmail(body.email);
  // No login NÃO aplicamos a regra de senha nova: só exigimos algo preenchido.
  const password = typeof body.password === "string" && body.password.length > 0 && body.password.length <= 200;
  const errors: Record<string, string> = {};
  if (!email.ok) errors.email = email.message;
  if (!password) errors.password = "Informe a senha.";
  if (!email.ok || !password) return { ok: false, errors };
  return { ok: true, value: { email: email.value, password: body.password as string } };
}
