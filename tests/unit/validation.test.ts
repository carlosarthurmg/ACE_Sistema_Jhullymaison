import { describe, expect, it } from "vitest";
import {
  parseEmail,
  parseFullName,
  parseLoginBody,
  parsePassword,
  parsePhone,
  parseRegisterBody,
  readJsonBody,
} from "../../netlify/functions/_shared/validation";

const validBody = {
  full_name: "  Ana   Souza ",
  phone: "(86) 99999-0000",
  email: "  ANA@Exemplo.com ",
  password: "Senha123",
  accepted_terms: true,
};

describe("campos", () => {
  it("e-mail: limpa espaços, passa para minúsculas e valida", () => {
    expect(parseEmail("  ANA@Exemplo.com ")).toEqual({ ok: true, value: "ana@exemplo.com" });
    expect(parseEmail("sem-arroba").ok).toBe(false);
    expect(parseEmail("a@b").ok).toBe(false);
    expect(parseEmail(123).ok).toBe(false);
    expect(parseEmail(`${"a".repeat(150)}@x.com`).ok).toBe(false);
  });

  it("senha: 8 a 72 caracteres, com letra e número", () => {
    expect(parsePassword("Senha123").ok).toBe(true);
    expect(parsePassword("curta1").ok).toBe(false);
    expect(parsePassword("somenteletras").ok).toBe(false);
    expect(parsePassword("12345678").ok).toBe(false);
    expect(parsePassword(`a1${"x".repeat(80)}`).ok).toBe(false);
    expect(parsePassword(undefined).ok).toBe(false);
  });

  it("nome: remove espaços repetidos e limita o tamanho", () => {
    expect(parseFullName("  Ana   Souza ")).toEqual({ ok: true, value: "Ana Souza" });
    expect(parseFullName("A").ok).toBe(false);
    expect(parseFullName("x".repeat(151)).ok).toBe(false);
  });

  it("telefone: guarda só os dígitos, de 10 a 13", () => {
    expect(parsePhone("(86) 99999-0000")).toEqual({ ok: true, value: "86999990000" });
    expect(parsePhone("5586999990000").ok).toBe(true);
    expect(parsePhone("99999").ok).toBe(false);
    expect(parsePhone("12345678901234").ok).toBe(false);
  });
});

describe("cadastro", () => {
  it("aceita um corpo válido e normaliza", () => {
    const parsed = parseRegisterBody(validBody);
    expect(parsed).toEqual({
      ok: true,
      value: { full_name: "Ana Souza", phone: "86999990000", email: "ana@exemplo.com", password: "Senha123" },
    });
  });

  it("exige o aceite dos termos (RN20)", () => {
    for (const accepted of [false, "true", 1, undefined]) {
      const parsed = parseRegisterBody({ ...validBody, accepted_terms: accepted });
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) expect(parsed.errors.accepted_terms).toBeDefined();
    }
  });

  it("devolve um erro por campo", () => {
    const parsed = parseRegisterBody({ accepted_terms: true });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(Object.keys(parsed.errors).sort()).toEqual(["email", "full_name", "password", "phone"]);
    }
  });
});

describe("login e corpo JSON", () => {
  it("login não aplica a regra de senha nova", () => {
    expect(parseLoginBody({ email: "a@b.co", password: "x" }).ok).toBe(true);
    expect(parseLoginBody({ email: "a@b.co", password: "" }).ok).toBe(false);
    expect(parseLoginBody({ email: "ruim", password: "x" }).ok).toBe(false);
  });

  it("readJsonBody só aceita objeto JSON pequeno", async () => {
    const make = (body: string) => new Request("http://x/", { method: "POST", body });
    expect(await readJsonBody(make('{"a":1}'))).toEqual({ a: 1 });
    expect(await readJsonBody(make("[1,2]"))).toBeNull();
    expect(await readJsonBody(make("texto"))).toBeNull();
    expect(await readJsonBody(make(""))).toBeNull();
    expect(await readJsonBody(make(JSON.stringify({ a: "x".repeat(20_000) })))).toBeNull();
  });
});
