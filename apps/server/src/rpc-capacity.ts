import { AppError } from "@zarbit/contracts";

export function busyError() {
  return new AppError(
    "RATE_LIMITED",
    "سرویس شلوغ است؛ چند لحظه بعد تلاش کنید.",
    429,
    new Date(Date.now() + 1000).toISOString(),
  );
}

/** No unbounded queue. Timed-out callers do not release still-running work. */
export class ReadCapacity {
  private active = 0;
  constructor(
    private readonly limit = 3,
    private readonly timeoutMs = 3000,
  ) {}
  async run<T>(load: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) throw busyError();
    this.active++;
    const work = Promise.resolve()
      .then(load)
      .finally(() => {
        this.active--;
      });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        work,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new AppError(
                  "READ_TIMEOUT",
                  "دریافت اطلاعات طول کشید؛ دوباره تلاش کنید.",
                  503,
                ),
              ),
            this.timeoutMs,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
}

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
