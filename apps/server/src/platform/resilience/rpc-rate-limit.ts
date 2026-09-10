import { busyError } from "./busy-error";

export class RpcRateLimit {
  private readonly buckets = new Map<string, { tokens: number; at: number }>();

  constructor(private readonly now = Date.now) {}

  consume(userId: string, mutation: boolean): void {
    const key = `${userId}:${mutation ? "write" : "read"}`;
    const capacity = mutation ? 6 : 30;
    const rate = mutation ? 1 : 10;
    const now = this.now();
    const old = this.buckets.get(key) ?? { tokens: capacity, at: now };
    const tokens = Math.min(
      capacity,
      old.tokens + (Math.max(0, now - old.at) * rate) / 1000,
    );
    if (tokens < 1) throw busyError();
    this.buckets.delete(key);
    this.buckets.set(key, { tokens: tokens - 1, at: now });
    if (this.buckets.size > 200) {
      const oldest = this.buckets.keys().next().value;
      if (oldest !== undefined) this.buckets.delete(oldest);
    }
  }
}
