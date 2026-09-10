interface Value<T> {
  value: T;
  freshUntil: number;
  usableUntil: number;
}

export interface CacheOptions {
  ttlMs: number;
  staleMs?: number;
  maxEntries?: number;
  now?: () => number;
  observe?: (event: "hit" | "miss" | "stale" | "coalesced" | "failure") => void;
}

/** Bounded SWR cache. Separate flights prevent missing values and stale-write races. */
export class ResponseCache<T> {
  private readonly values = new Map<string, Value<T>>();
  private readonly flights = new Map<string, Promise<T>>();
  private readonly now: () => number;

  constructor(private readonly options: CacheOptions) {
    this.now = options.now ?? Date.now;
  }

  get(key: string, load: () => Promise<T>): Promise<T> {
    const entry = this.values.get(key);
    const now = this.now();
    if (entry && entry.freshUntil > now) {
      this.options.observe?.("hit");
      return Promise.resolve(entry.value);
    }
    if (entry && entry.usableUntil > now) {
      this.options.observe?.("stale");
      void this.refresh(key, load).catch(() => undefined);
      return Promise.resolve(entry.value);
    }
    return this.refresh(key, load);
  }

  private refresh(key: string, load: () => Promise<T>): Promise<T> {
    const existing = this.flights.get(key);
    if (existing) {
      this.options.observe?.("coalesced");
      return existing;
    }
    this.options.observe?.("miss");
    const promise = Promise.resolve()
      .then(load)
      .then((value) => {
        if (this.flights.get(key) === promise) {
          const now = this.now();
          this.values.delete(key);
          this.values.set(key, {
            value,
            freshUntil: now + this.options.ttlMs,
            usableUntil: now + this.options.ttlMs + (this.options.staleMs ?? 0),
          });
          while (this.values.size > (this.options.maxEntries ?? 100)) {
            const oldest = this.values.keys().next().value;
            if (oldest !== undefined) this.values.delete(oldest);
          }
        }
        return value;
      })
      .catch((error: unknown) => {
        this.options.observe?.("failure");
        throw error;
      })
      .finally(() => {
        if (this.flights.get(key) === promise) this.flights.delete(key);
      });
    this.flights.set(key, promise);
    return promise;
  }

  invalidate(key: string): void {
    this.values.delete(key);
    this.flights.delete(key);
  }
}
