import type { Config } from "@netlify/functions";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ok } from "./_shared/response";
import { requireUser } from "./_shared/auth";
import { handle, noStore } from "./_shared/handler";
import { getServiceClient } from "./_shared/supabase";

// GET /api/auth/session
// 200 com o usuário logado; 401 sem sessão válida. O frontend chama ao abrir o site.

export interface SessionDeps {
  getClient: () => SupabaseClient;
  now: () => Date;
}

const defaultDeps: SessionDeps = { getClient: getServiceClient, now: () => new Date() };

export function createSessionHandler(deps: SessionDeps = defaultDeps) {
  return handle("GET", async (request) => {
    const client = deps.getClient();
    const auth = await requireUser(request, { client, now: deps.now() });
    if (!auth.ok) return noStore(auth.response);

    const profile = await client.from("profiles").select("full_name").eq("id", auth.userId).maybeSingle();
    if (profile.error) throw profile.error;

    return noStore(
      ok({ user: { id: auth.userId, full_name: profile.data?.full_name ?? "", role: auth.role } }),
    );
  });
}

export default createSessionHandler();
export const config: Config = { path: "/api/auth/session" };
