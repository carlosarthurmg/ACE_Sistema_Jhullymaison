import type { Config } from "@netlify/functions";
import { ok } from "./_shared/response";

// Function de teste do projeto-base. Pode ser removida depois do Marco A.
export default async (): Promise<Response> => {
  return ok({ service: "jhullymaison-api", time: new Date().toISOString() });
};

export const config: Config = { path: "/api/health" };
