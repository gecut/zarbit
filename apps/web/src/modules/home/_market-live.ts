import type { QueryClient } from "@tanstack/react-query";
import {
  AppError,
  marketLiveEventSchema,
  type MarketLiveEvent,
  type MarketSnapshot,
} from "@zarbit/contracts";
import type { RpcUtils } from "../../shared/api/orpc";
import { applyMarketEvent } from "../../shared/api/merge-market-snapshot";

export type MarketConnection = "connecting" | "healthy" | "degraded" | "paused";
export interface LiveView {
  connection: MarketConnection;
}

/** Feature-owned transport for realtime market stream. Updates Query snapshot directly. */
export class MarketLive {
  private view: LiveView = { connection: "connecting" };
  private listeners = new Set<() => void>();
  private controller: AbortController | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private graceTimer: ReturnType<typeof setTimeout> | undefined;
  private active = false;
  private generation = 0;
  private attempt = 0;
  private reconciliation: Promise<void> | undefined;
  private seen = new Set<string>();
  private lastEventId: string | undefined;

  constructor(
    private readonly api: RpcUtils,
    private readonly client: QueryClient,
  ) {}

  getSnapshot = (): LiveView => this.view;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  start(): () => void {
    this.active = true;
    document.addEventListener("visibilitychange", this.resume);
    window.addEventListener("online", this.resume);
    window.addEventListener("offline", this.resume);
    this.resume();
    return () => {
      this.active = false;
      this.cancel();
      document.removeEventListener("visibilitychange", this.resume);
      window.removeEventListener("online", this.resume);
      window.removeEventListener("offline", this.resume);
    };
  }

  private publish(update: Partial<LiveView>): void {
    this.view = { ...this.view, ...update };
    for (const listener of this.listeners) listener();
  }

  private cancel(): void {
    this.generation++;
    this.controller?.abort();
    clearTimeout(this.retryTimer);
    clearTimeout(this.graceTimer);
  }

  private resume = (): void => {
    this.cancel();
    if (!this.active) return;
    if (document.hidden || !navigator.onLine) {
      this.publish({ connection: "paused" });
      return;
    }
    void this.reconcile();
    void this.connect();
  };

  private async connect(): Promise<void> {
    const generation = ++this.generation;
    const controller = new AbortController();
    this.controller = controller;
    if (this.view.connection !== "degraded")
      this.publish({ connection: "connecting" });
    this.graceTimer = setTimeout(() => {
      if (generation === this.generation)
        this.publish({ connection: "degraded" });
    }, 4_000);
    try {
      const iterator = await this.api.market.live.call(undefined, {
        signal: controller.signal,
        lastEventId: this.lastEventId,
      });
      try {
        for await (const raw of iterator) {
          if (!this.active || generation !== this.generation) break;
          const parsed = marketLiveEventSchema.safeParse(raw);
          if (!parsed.success) {
            await this.reconcile();
            throw new Error("Invalid market event");
          }
          const event = parsed.data;
          clearTimeout(this.graceTimer);
          if (event.type === "SYNC" || event.type === "RECONCILE_REQUIRED") {
            const snapshot = this.client.getQueryData<MarketSnapshot>(
              this.api.market.snapshot.queryKey(),
            );
            if (this.attempt > 0 || event.type === "RECONCILE_REQUIRED")
              await this.reconcile();
            else if (snapshot && event.revision > snapshot.revision)
              await this.refreshSnapshot();
            if (generation !== this.generation) break;
            this.attempt = 0;
            this.publish({ connection: "healthy" });
            continue;
          }
          const identity = `${event.type}:${event.sourceMessageId}`;
          this.lastEventId = identity;
          if (this.seen.has(identity)) continue;
          this.seen.add(identity);
          if (this.seen.size > 4_096) {
            const oldest = this.seen.values().next().value;
            if (oldest) this.seen.delete(oldest);
          }
          this.applyEvent(event);
          this.publish({ connection: "healthy" });
        }
      } finally {
        await iterator.return?.();
      }
      if (!controller.signal.aborted) throw new Error("Market stream closed");
    } catch (error) {
      if (error instanceof AppError && error.status === 401) {
        await this.client.invalidateQueries({ queryKey: this.api.auth.key() });
        return;
      }
      if (
        !this.active ||
        generation !== this.generation ||
        controller.signal.aborted
      )
        return;
      clearTimeout(this.graceTimer);
      this.publish({ connection: "degraded" });
      const delay = Math.min(30_000, 1_000 * 2 ** Math.min(this.attempt++, 5));
      this.retryTimer = setTimeout(() => {
        void this.connect();
      }, delay);
    }
  }

  private applyEvent(
    event: Extract<MarketLiveEvent, { type: "QUOTE" | "TRADE" }>,
  ): void {
    const key = this.api.market.snapshot.queryKey();
    const current = this.client.getQueryData<MarketSnapshot>(key);
    if (!current) return;
    const next = applyMarketEvent(current, event);
    if (current === next) return;
    this.client.setQueryData(key, next);
  }

  private async refreshSnapshot(): Promise<void> {
    await this.client.invalidateQueries(
      { queryKey: this.api.market.snapshot.key() },
      { cancelRefetch: false },
    );
  }

  private reconcile(): Promise<void> {
    if (this.reconciliation) return this.reconciliation;
    this.reconciliation = this.refreshSnapshot()
      .then(() => undefined)
      .finally(() => {
        this.reconciliation = undefined;
      });
    return this.reconciliation;
  }
}
