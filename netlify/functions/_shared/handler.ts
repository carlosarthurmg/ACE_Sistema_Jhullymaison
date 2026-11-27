/**
 * handler.ts — esqueleto das Functions: confere o método HTTP e transforma qualquer
 * erro inesperado em 500 no padrão { data, error }, SEM vazar detalhes internos (RNF19).
 *
 *   export default handle("POST", async (request) => { ... return ok({ ... }); });
 */
import { fail } from "./response";

export type RouteHandler = (request: Request) => Promise<Response>;

export function handle(method: string, fn: RouteHandler): RouteHandler {
  return async (request) => {
    if (request.method !== method) {
      const response = fail(405, "METHOD_NOT_ALLOWED", "Método não permitido.");
      response.headers.set("Allow", method);
      return response;
    }
    try {
      return await fn(request);
    } catch (error) {
      // Só o nome/código do erro vai para o log: nunca a mensagem (pode ter e-mail ou dado pessoal).
      console.error("[api]", describeError(error));
      return fail(500, "INTERNAL_ERROR", "Erro interno. Tente novamente em instantes.");
    }
  };
}

export function describeError(error: unknown): string {
  if (error && typeof error === "object") {
    const name = (error as { name?: unknown }).name;
    const code = (error as { code?: unknown }).code;
    return [typeof name === "string" ? name : "Error", typeof code === "string" ? code : null]
      .filter(Boolean)
      .join(":");
  }
  return "UnknownError";
}

/** Acrescenta o cookie e impede cache da resposta (respostas de login nunca podem ser guardadas). */
export function withCookie(response: Response, cookie: string): Response {
  const headers = new Headers(response.headers);
  headers.append("Set-Cookie", cookie);
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, { status: response.status, headers });
}

export function noStore(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, { status: response.status, headers });
}

/** IP de quem chamou (o Netlify informa no cabeçalho). Usado só para limitar tentativas. */
export function getClientIp(request: Request): string {
  return (
    request.headers.get("x-nf-client-connection-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}
