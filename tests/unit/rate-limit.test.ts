import { describe, expect, it } from "vitest";
import { RateLimiter } from "../../netlify/functions/_shared/rate-limit";

const MINUTE = 60_000;

describe("RateLimiter", () => {
  it("bloqueia depois do limite de falhas", () => {
    const limiter = new RateLimiter(3, 15 * MINUTE);
    for (let i = 0; i < 3; i++) {
      expect(limiter.isLimited("k", 0)).toBe(false);
      limiter.hit("k", 0);
    }
    expect(limiter.isLimited("k", 1000)).toBe(true);
  });

  it("libera quando a janela termina", () => {
    const limiter = new RateLimiter(1, 15 * MINUTE);
    limiter.hit("k", 0);
    expect(limiter.isLimited("k", 14 * MINUTE)).toBe(true);
    expect(limiter.isLimited("k", 15 * MINUTE)).toBe(false);
  });

  it("chaves diferentes não se afetam", () => {
    const limiter = new RateLimiter(1, MINUTE);
    limiter.hit("a", 0);
    expect(limiter.isLimited("a", 1)).toBe(true);
    expect(limiter.isLimited("b", 1)).toBe(false);
  });

  it("clear zera a contagem e retryAfter conta os segundos", () => {
    const limiter = new RateLimiter(1, MINUTE);
    limiter.hit("k", 0);
    expect(limiter.retryAfterSeconds("k", 10_000)).toBe(50);
    limiter.clear("k");
    expect(limiter.isLimited("k", 1)).toBe(false);
    expect(limiter.retryAfterSeconds("k", 1)).toBe(1);
  });
});
