/**
 * Limite de tentativas em MEMÓRIA (RNF15). Limitação conhecida: Functions serverless
 * não compartilham memória entre instâncias, então é proteção de "melhor esforço".
 * Para algo mais forte seria preciso guardar a contagem no banco (adiado).
 */
export class RateLimiter {
  private buckets = new Map<string, { count: number; resetAt: number }>();
  private limit: number;
  private windowMs: number;

  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  isLimited(key: string, now: number = Date.now()): boolean {
    const bucket = this.buckets.get(key);
    if (!bucket || now >= bucket.resetAt) return false;
    return bucket.count >= this.limit;
  }

  /** Registra uma tentativa que falhou. */
  hit(key: string, now: number = Date.now()): void {
    const bucket = this.buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
    } else {
      bucket.count += 1;
    }
    if (this.buckets.size > 1000) this.purge(now);
  }

  clear(key: string): void {
    this.buckets.delete(key);
  }

  retryAfterSeconds(key: string, now: number = Date.now()): number {
    const bucket = this.buckets.get(key);
    if (!bucket) return 1;
    return Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  }

  private purge(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (now >= bucket.resetAt) this.buckets.delete(key);
    }
  }
}
