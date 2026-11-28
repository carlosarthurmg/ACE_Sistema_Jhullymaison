import { describe, expect, it } from "vitest";
import { created, fail, noContent, ok } from "../../netlify/functions/_shared/response";

describe("response helpers", () => {
  it("ok e created seguem o padrão { data, error }", async () => {
    expect(await ok({ a: 1 }).json()).toEqual({ data: { a: 1 }, error: null });
    const response = created({ id: 1 });
    expect(response.status).toBe(201);
  });

  it("noContent responde 204 sem corpo", async () => {
    const response = noContent();
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });

  it("fail sem details não cria a chave details", async () => {
    const body = await fail(400, "X", "Mensagem").json();
    expect(body).toEqual({ data: null, error: { code: "X", message: "Mensagem" } });
  });

  it("fail com details inclui os detalhes (ex.: erro por campo)", async () => {
    const body = await fail(400, "VALIDATION_ERROR", "Revise", { email: "inválido" }).json();
    expect(body.error.details).toEqual({ email: "inválido" });
  });
});
