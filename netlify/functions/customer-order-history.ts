import type { Config } from "@netlify/functions";
import { requireUser } from "./_shared/auth";
import { getServiceClient } from "./_shared/supabase";
import { ok, fail } from "./_shared/response";

export default async function history(request: Request) {
  try {
    const session = await requireUser(request);
    if (!session.ok) return session.response;
    const url = new URL(request.url);
    const id = url.pathname.split("/")[3];
    const db = getServiceClient();
    if (id) {
      if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))
        return fail(404, "NOT_FOUND", "Pedido não encontrado.");
      let q = db
        .from("orders")
        .select(
          "id,order_code,total,created_at,order_status,payment_method,payment_status,desired_at,fulfillment_type,delivery_address_snapshot,recipient_name,recipient_phone,card_message,customer_note,order_items(*,order_item_addons(*)),order_status_history(new_status,changed_at)",
        )
        .eq("id", id);
      if (session.role !== "admin") q = q.eq("customer_id", session.userId);
      const { data, error } = await q
        .order("changed_at", { referencedTable: "order_status_history" })
        .maybeSingle();
      if (error) throw error;
      return data ? ok(data) : fail(404, "NOT_FOUND", "Pedido não encontrado.");
    }
    const page = Number(url.searchParams.get("page") ?? 1);
    if (!Number.isSafeInteger(page) || page < 1 || page > 1000000)
      return fail(400, "INVALID_PAGE", "Página inválida.");
    const { data, error, count } = await db
      .from("orders")
      .select("id,order_code,order_status,payment_status,total,created_at", {
        count: "exact",
      })
      .eq("customer_id", session.userId)
      .order("created_at", { ascending: false })
      .order("id")
      .range((page - 1) * 20, page * 20 - 1);
    if (error) throw error;
    return ok({ items: data, page, total: count });
  } catch {
    return fail(500, "ORDERS_ERROR", "Não foi possível carregar os pedidos.");
  }
}
export const config: Config = {
  path: ["/api/orders", "/api/orders/:id"],
  method: "GET",
};
