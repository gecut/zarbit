interface Sample {
  durations: number[];
  count: number;
  failures: number;
}

export class RpcMetrics {
  private readonly samples = new Map<string, Sample>();
  private readonly cache: Record<string, number> = {};
  private lastReport = Date.now();

  constructor(private readonly report: (snapshot: object) => void) {}

  cacheEvent(name: string, event: string): void {
    const key = `${name}.${event}`;
    this.cache[key] = (this.cache[key] ?? 0) + 1;
  }

  async measure<T>(name: string, operation: () => Promise<T>): Promise<T> {
    const start = performance.now();
    const sample = this.samples.get(name) ?? {
      durations: [],
      count: 0,
      failures: 0,
    };
    this.samples.set(name, sample);
    try {
      return await operation();
    } catch (error) {
      sample.failures++;
      throw error;
    } finally {
      sample.count++;
      if (sample.durations.length === 1000) sample.durations.shift();
      sample.durations.push(performance.now() - start);
      if (Date.now() - this.lastReport >= 60_000) {
        this.report(this.snapshot());
        this.lastReport = Date.now();
        this.samples.clear();
        for (const key of Object.keys(this.cache)) delete this.cache[key];
      }
    }
  }

  snapshot() {
    return {
      cache: { ...this.cache },
      operations: Object.fromEntries(
        [...this.samples].map(([name, sample]) => {
          const sorted = [...sample.durations].sort((a, b) => a - b);
          const percentile = (p: number) =>
            sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] ?? 0;
          return [
            name,
            {
              count: sample.count,
              failures: sample.failures,
              p50: percentile(0.5),
              p95: percentile(0.95),
              p99: percentile(0.99),
            },
          ];
        }),
      ),
    };
  }
}
