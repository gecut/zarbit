import { Client, type Notification } from "pg";
import {
  marketNotificationSchema,
  marketLiveEventSchema,
  type MarketNotification,
} from "@zarbit/contracts";
import type { Store } from "@zarbit/db";
import type { MarketHub } from "./market-hub";
import type { MarketState } from "./market-state";

type Observe = (
  event: string,
  details?: Record<string, number | boolean>,
) => void;

export class MarketListener {
  private client: Client | null = null;
  private stopping = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private attempt = 0;
  private queue: MarketNotification[] = [];
  private draining = false;
  private ready = false;
  private readonly seen = new Set<string>();
  private disconnectedAt = Date.now();

  constructor(
    private readonly deps: {
      url: string;
      state: MarketState;
      hub: MarketHub;
      event: Store["marketEvent"];
      observe: Observe;
    },
  ) {}

  async start(): Promise<void> {
    await this.connect();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    clearTimeout(this.timer);
    this.deps.hub.stop();
    const client = this.client;
    this.client = null;
    this.ready = this.deps.state.connected = false;
    this.queue = [];
    if (client) await client.end().catch(() => undefined);
  }

  private async connect(): Promise<void> {
    if (this.stopping) return;
    const client = new Client({
      connectionString: this.deps.url,
      connectionTimeoutMillis: 5_000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10_000,
    });
    this.client = client;
    const failure = () => this.degrade(client);
    client.on("error", failure);
    client.on("end", failure);
    client.on("notification", (message: Notification) => {
      if (this.client !== client || message.channel !== "zarbit_market_changed")
        return;
      this.deps.observe("notification");
      try {
        const event = marketNotificationSchema.parse(
          JSON.parse(message.payload ?? ""),
        );
        if (this.queue.length >= 256) {
          failure();
          return;
        }
        this.queue.push(event);
        if (this.ready) void this.drain(client);
      } catch {
        this.deps.observe("invalid_notification");
        failure();
      }
    });
    try {
      await client.connect();
      await client.query("LISTEN zarbit_market_changed");
      const started = performance.now();
      await this.deps.state.read(true);
      if (this.client !== client || this.stopping) return;
      this.ready = this.deps.state.connected = true;
      this.attempt = 0;
      this.deps.observe("connected", {
        hydrationMs: performance.now() - started,
        downtimeMs: Date.now() - this.disconnectedAt,
      });
      this.deps.hub.publish({
        type: "RECONCILE_REQUIRED",
        revision: this.deps.state.revision,
      });
      void this.drain(client);
    } catch {
      failure();
    }
  }

  private async drain(client: Client): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.ready && this.client === client && this.queue.length) {
        const notice = this.queue.shift();
        if (!notice) break;
        const identity = `${notice.type}:${notice.sourceMessageId}`;
        if (this.seen.has(identity)) {
          this.deps.observe("duplicate");
          continue;
        }
        const row = await this.deps.event(notice);
        if (this.client !== client) break;
        if (!row) throw new Error("Missing committed market event");
        const event = marketLiveEventSchema.parse({
          ...row,
          revision: Math.max(this.deps.state.revision, notice.sourceMessageId),
        });
        if (event.type !== "QUOTE" && event.type !== "TRADE") continue;
        const advanced = this.deps.state.apply(event);
        if (!advanced) this.deps.observe("older_head");
        // An older head may still be a newly committed historical point.
        this.deps.hub.publish(event);
        this.seen.add(identity);
        if (this.seen.size > 4_096) {
          const oldest = this.seen.values().next().value;
          if (oldest) this.seen.delete(oldest);
        }
      }
    } catch {
      this.degrade(client);
    } finally {
      this.draining = false;
      if (this.ready && this.client && this.queue.length)
        void this.drain(this.client);
    }
  }

  private degrade(client: Client): void {
    if (this.client !== client) return;
    this.client = null;
    this.ready = this.deps.state.connected = false;
    this.disconnectedAt = Date.now();
    this.queue = [];
    this.deps.hub.disconnect();
    void client.end().catch(() => undefined);
    if (this.stopping) return;
    const delay = Math.min(30_000, 1_000 * 2 ** Math.min(this.attempt++, 5));
    this.deps.observe("degraded", {
      reconnectAttempt: this.attempt,
      retryMs: delay,
    });
    this.timer = setTimeout(() => {
      void this.connect();
    }, delay);
  }
}
