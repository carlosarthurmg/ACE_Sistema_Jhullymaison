import { describe, expect, it } from "vitest";
import handler from "../../netlify/functions/health";

describe("GET /api/health", () => {
  it("responde 200 com o padrão { data, error }", async () => {
    const response = await handler();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.error).toBeNull();
    expect(body.data.service).toBe("jhullymaison-api");
  });
});
