import { afterEach, describe, expect, it, vi } from "vitest";
import orders from "../../netlify/functions/admin-orders";
import reports from "../../netlify/functions/admin-reports";
import customers from "../../netlify/functions/admin-customers";
import { buildNewOrderEmail } from "../../netlify/functions/_shared/notifications";

afterEach(() => vi.unstubAllEnvs());
describe("Painel administrativo", () => {
  it.each([orders, reports, customers])(
    "exige sessão antes de consultar dados",
    async (endpoint) => {
      vi.stubEnv("COOKIE_NAME", "jm_session");
      const response = await endpoint(
        new Request("https://loja.test/api/admin/orders"),
      );
      expect(response.status).toBe(401);
      expect((await response.json()).data).toBeNull();
    },
  );
  it("exige a origem da loja nas alterações", async () => {
    vi.stubEnv("COOKIE_NAME", "jm_session");
    vi.stubEnv("APP_BASE_URL", "https://loja.test");
    const response = await orders(
      new Request("https://loja.test/api/admin/orders", {
        method: "PATCH",
        headers: { Cookie: "jm_session=fixture", Origin: "https://outra.test" },
      }),
    );
    expect(response.status).toBe(403);
  });
  it("formata o aviso com o código do pedido e o valor da compra", () => {
    const mail = buildNewOrderEmail(
      {
        order_code: "JM-0001",
        total: 45.5,
        fulfillment_type: "pickup",
        payment_method: "pix",
        desired_at: null,
      },
      "https://loja.test/",
    );
    expect(mail.subject).toContain("JM-0001");
    expect(mail.text).toContain("45,50");
    expect(mail.text).toContain("Retirada");
    expect(mail.text).toContain("https://loja.test/admin/pedidos");
  });
});
