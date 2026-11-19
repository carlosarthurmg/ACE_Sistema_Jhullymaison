import type { Config } from "@netlify/functions";
import { requireAdmin } from "./_shared/order-admin-access";
import { fail, ok } from "./_shared/response";
import { getServiceClient } from "./_shared/supabase";

export default async function sales(request: Request) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return auth.response;
    if (request.method !== "GET")
      return fail(405, "METHOD_NOT_ALLOWED", "Método inválido.");
    const params = new URL(request.url).searchParams;
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Fortaleza",
    }).format(new Date());
    const from = params.get("from") ?? today.slice(0, 8) + "01";
    const to = params.get("to") ?? today;
    const valid = (v: string) =>
      /^\d{4}-\d{2}-\d{2}$/.test(v) &&
      Number.isFinite(Date.parse(v)) &&
      new Date(v).toISOString().startsWith(v);
    if (!valid(from) || !valid(to) || from > to)
      return fail(400, "INVALID_PERIOD", "Confira o período informado.");
    const end = Date.parse(to + "T00:00:00-03:00") + 86400000;
    const { data, error } = await getServiceClient().rpc(
      "admin_sales_summary",
      {
        p_from: from + "T00:00:00-03:00",
        p_until: new Date(end).toISOString(),
      },
    );
    if (error) throw error;
    return ok({ ...data, from, to });
  } catch {
    return fail(500, "REPORT_ERROR", "Não foi possível gerar o relatório.");
  }
}
export const config: Config = { path: "/api/admin/reports/sales" };
