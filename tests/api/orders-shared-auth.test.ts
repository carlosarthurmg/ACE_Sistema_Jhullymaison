import { createClient } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";
import * as database from "../../netlify/functions/_shared/supabase";
import { generateSessionToken } from "../../netlify/functions/_shared/session";
import reports from "../../netlify/functions/admin-reports";
import orders from "../../netlify/functions/admin-orders";
import customers from "../../netlify/functions/admin-customers";
import history from "../../netlify/functions/customer-order-history";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

const customerId = "10000000-0000-4000-8000-000000000001";
const orderId = "20000000-0000-4000-8000-000000000001";

function session(role: "admin" | "customer", orderRows: Record<string, unknown>[] = []) {
  vi.stubEnv("COOKIE_NAME", "jm_session");
  const requests: URL[] = [];
  const client = createClient("https://db.test", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async input => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      requests.push(url);
      switch (url.pathname.split("/").pop()) {
        case "app_sessions":
          return Response.json([{ user_id: customerId, revoked_at: null,
            expires_at: new Date(Date.now() + 3600000).toISOString() }]);
        case "profiles": return Response.json([{ role, anonymized_at: null }]);
        case "orders": return Response.json(orderRows);
        case "admin_sales_summary": return Response.json({ orders: 0, total: 0 });
        default: throw Error("Consulta inesperada");
      }
    } },
  });
  vi.spyOn(database, "getServiceClient").mockReturnValue(client);
  const headers = { Cookie: "jm_session=" + generateSessionToken() };
  return { requests, request: (path: string) => new Request("https://loja.test" + path, { headers }) };
}

it.each([orders, reports, customers])("rejeita um cliente autenticado nas APIs administrativas", async endpoint => {
  const { request, requests } = session("customer");
  expect((await endpoint(request("/api/admin/orders"))).status).toBe(403);
  expect(requests.map(url => url.pathname)).toEqual(["/rest/v1/app_sessions", "/rest/v1/profiles"]);
});

it("libera o relatório para uma sessão administrativa", async () => {
  const { request, requests } = session("admin");
  expect((await reports(request("/api/admin/reports?from=2026-11-01&to=2026-11-20"))).status).toBe(200);
  expect(requests.at(-1)?.pathname).toBe("/rest/v1/rpc/admin_sales_summary");
});

it("restringe lista e detalhe ao cliente identificado pela sessão", async () => {
  const { request, requests } = session("customer");
  expect((await history(request("/api/orders"))).status).toBe(200);
  expect((await history(request("/api/orders/" + orderId))).status).toBe(404);
  const reads = requests.filter(url => url.pathname === "/rest/v1/orders");
  expect(reads.map(url => url.searchParams.get("customer_id"))).toEqual(["eq." + customerId, "eq." + customerId]);
  expect(reads[1].searchParams.get("id")).toBe("eq." + orderId);
});

it("omite dados pessoais do cliente anonimizado no pedido individual", async () => {
  const { request } = session("admin", [{ id: orderId, profiles: {
    anonymized_at: "2026-01-01", full_name: "Nome privado", phone: "111222333"
  }, recipient_name: "Nome privado", recipient_phone: "111222333", order_items: [] }]);
  const response = await orders(request("/api/admin/orders/" + orderId));
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.data.profiles).toMatchObject({ full_name: "Cliente anonimizado", phone: null });
  expect(JSON.stringify(body)).not.toMatch(/Nome privado|111222333/);
});

it("recusa cookies duplicados antes de consultar a sessão", async () => {
  const { requests } = session("admin");
  const cookie = "jm_session=" + generateSessionToken();
  const response = await orders(new Request("https://loja.test/api/admin/orders", {
    headers: { cookie: cookie + "; " + cookie },
  }));
  expect(response.status).toBe(401);
  expect(requests).toHaveLength(0);
});

it("recusa alteração administrativa por cliente com origem válida", async () => {
  vi.stubEnv("APP_BASE_URL", "https://loja.test");
  const { request, requests } = session("customer");
  const r = new Request(request("/api/admin/orders/" + orderId + "/cancel"), {method:"POST"});
  r.headers.set("origin", "https://loja.test");
  expect((await orders(r)).status).toBe(403);
  expect(requests).toHaveLength(2);
});
