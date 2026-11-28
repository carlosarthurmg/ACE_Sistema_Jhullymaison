// Padrão de resposta da API (Guia, seção 6.1): { data, error }.
// Arquivo COMPARTILHADO: todas as Functions usam estes helpers.

export function ok<T>(data: T, status = 200): Response {
  return Response.json({ data, error: null }, { status });
}

export function created<T>(data: T): Response {
  return ok(data, 201);
}

export function noContent(): Response {
  return new Response(null, { status: 204 });
}

/** `details` é opcional (ex.: erros por campo ou itens sem estoque). */
export function fail(status: number, code: string, message: string, details?: unknown): Response {
  const error: { code: string; message: string; details?: unknown } = { code, message };
  if (details !== undefined) error.details = details;
  return Response.json({ data: null, error }, { status });
}
