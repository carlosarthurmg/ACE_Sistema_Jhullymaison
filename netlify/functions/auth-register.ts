import type { Config } from "@netlify/functions";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fail, ok } from "./_shared/response";
import { handle, withCookie } from "./_shared/handler";
import { CURRENT_TERMS_VERSION } from "./_shared/legal";
import { createUserSession } from "./_shared/session-store";
import { getServiceClient } from "./_shared/supabase";
import { parseRegisterBody, readJsonBody } from "./_shared/validation";

// POST /api/auth/register  (RF01, RF24, RN20)
// Cria a conta no Supabase Auth, o perfil (com o aceite dos termos) e já faz o login.

export interface RegisterDeps {
  getClient: () => SupabaseClient;
  now: () => Date;
}

const defaultDeps: RegisterDeps = { getClient: getServiceClient, now: () => new Date() };

function isEmailTaken(error: unknown): boolean {
  const { code, status } = error as { code?: string; status?: number };
  return code === "email_exists" || status === 422;
}

export function createRegisterHandler(deps: RegisterDeps = defaultDeps) {
  return handle("POST", async (request) => {
    const body = await readJsonBody(request);
    if (!body) return fail(400, "VALIDATION_ERROR", "Envie os dados em formato JSON.");

    const parsed = parseRegisterBody(body);
    if (!parsed.ok) return fail(400, "VALIDATION_ERROR", "Revise os dados informados.", parsed.errors);
    const input = parsed.value;

    const client = deps.getClient();
    const now = deps.now();

    // email_confirm: true evita o e-mail de confirmação do Supabase (não temos e-mail no cadastro).
    const created = await client.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
    });
    if (created.error) {
      if (isEmailTaken(created.error)) {
        return fail(409, "EMAIL_IN_USE", "Este e-mail já está cadastrado.");
      }
      throw created.error;
    }
    const userId = created.data.user.id;

    const profile = await client.from("profiles").insert({
      id: userId,
      full_name: input.full_name,
      phone: input.phone,
      role: "customer",
      accepted_terms_at: now.toISOString(),
      accepted_terms_version: CURRENT_TERMS_VERSION,
    });
    if (profile.error) {
      // Não deixa conta "sem perfil" no Auth.
      await client.auth.admin.deleteUser(userId);
      throw profile.error;
    }

    const session = await createUserSession(client, userId, now);
    const response = ok({ user: { id: userId, full_name: input.full_name, role: "customer" } }, 201);
    return withCookie(response, session.cookie);
  });
}

export default createRegisterHandler();
export const config: Config = { path: "/api/auth/register" };
