import type { Config } from "@netlify/functions";
import { requireAdmin } from "./_shared/order-admin-access";
import { fail, ok } from "./_shared/response";
import { getServiceClient } from "./_shared/supabase";

export default async function customers(request: Request) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return auth.response;
    if (request.method !== "GET")
      return fail(405, "METHOD_NOT_ALLOWED", "Método inválido.");
    const url = new URL(request.url);
    const id = url.pathname.split("/")[4];
    const page = Number(url.searchParams.get("page") ?? 1);
    if (!Number.isSafeInteger(page) || page < 1 || page > 1000000)
      return fail(400, "INVALID_PAGE", "Página inválida.");
    const db = getServiceClient();
    const start = (page - 1) * 30;
    if (id && !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))
      return fail(400, "INVALID_ID", "Cliente inválido.");
    const term = (url.searchParams.get("search") ?? "")
      .trim()
      .slice(0, 80)
      .replace(/[\\%_]/g, "\\$&");
    const query = id
      ? db
          .from("orders")
          .select("id,order_code,created_at,total,order_status", {
            count: "exact",
          })
          .eq("customer_id", id)
          .order("created_at", { ascending: false })
      : db
          .from("profiles")
          .select("id,full_name,phone", { count: "exact" })
          .eq("role", "customer")
          .is("anonymized_at", null)
          .ilike("full_name", "%" + term + "%")
          .order("full_name");
    const { data, error, count } = await query
      .order("id")
      .range(start, start + 29);
    if (error) throw error;
    return ok({ items: data, total: count, page });
  } catch {
    return fail(
      500,
      "CUSTOMERS_ERROR",
      "Não foi possível consultar os clientes.",
    );
  }
}
export const config: Config = {
  path: ["/api/admin/customers", "/api/admin/customers/:id/orders"],
};
