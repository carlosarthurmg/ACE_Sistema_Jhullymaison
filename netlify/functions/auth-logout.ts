import type { Config } from "@netlify/functions";
import type { SupabaseClient } from "@supabase/supabase-js";
import { noContent } from "./_shared/response";
import { handle, withCookie } from "./_shared/handler";
import { buildClearSessionCookie, getCookieSettings, getSessionToken } from "./_shared/session";
import { revokeSessionByToken } from "./_shared/session-store";
import { getServiceClient } from "./_shared/supabase";

// POST /api/auth/logout  (RF36, RNF17)
// Revoga a sessão no servidor e apaga o cookie. Sem cookie, também responde 204.

export interface LogoutDeps {
  getClient: () => SupabaseClient;
  now: () => Date;
}

const defaultDeps: LogoutDeps = { getClient: getServiceClient, now: () => new Date() };

export function createLogoutHandler(deps: LogoutDeps = defaultDeps) {
  return handle("POST", async (request) => {
    const settings = getCookieSettings();
    const token = getSessionToken(request, settings.name);
    if (token) await revokeSessionByToken(deps.getClient(), token, deps.now());
    return withCookie(noContent(), buildClearSessionCookie(settings));
  });
}

export default createLogoutHandler();
export const config: Config = { path: "/api/auth/logout" };
