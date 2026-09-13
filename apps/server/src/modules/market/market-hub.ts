import { ORPCError, withEventMeta } from "@orpc/server";
import type { MarketLiveEvent } from "@zarbit/contracts";

type Subscriber = {
  close: (error?: Error) => void;
  push: (event: MarketLiveEvent) => void;
};

/** One bounded registry for the process. No subscriber can stall publication. */
export class MarketHub {
  private readonly subscribers = new Set<Subscriber>();
  private stopped = false;
  constructor(
    private readonly observe: (event: string, active: number) => void = () =>
      undefined,
  ) {}

  subscribe(
    initial: MarketLiveEvent,
    signal?: AbortSignal,
  ): AsyncIteratorObject<MarketLiveEvent, void, void> {
    if (this.stopped || this.subscribers.size >= 100)
      throw new ORPCError("SERVICE_UNAVAILABLE");
    const queue: MarketLiveEvent[] = [initial];
    let closed = false;
    let failure: Error | undefined;
    let lifetime: ReturnType<typeof setTimeout> | undefined = undefined;
    let wake: (() => void) | undefined;
    const close = (error?: Error) => {
      if (closed) return;
      closed = true;
      failure = error;
      queue.length = 0;
      clearTimeout(lifetime);
      this.subscribers.delete(subscriber);
      signal?.removeEventListener("abort", abort);
      wake?.();
      this.observe("closed", this.subscribers.size);
    };
    const abort = () => close();
    const subscriber: Subscriber = {
      close,
      push: (event) => {
        if (queue.length >= 100) {
          this.observe("slow_client", this.subscribers.size);
          close(
            new ORPCError("SERVICE_UNAVAILABLE", {
              message: "ارتباط زنده را دوباره برقرار کنید.",
            }),
          );
          return;
        }
        queue.push(event);
        wake?.();
      },
    };
    this.subscribers.add(subscriber);
    lifetime = setTimeout(() => close(), 30 * 60_000);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) close();
    this.observe("opened", this.subscribers.size);
    return {
      [Symbol.asyncIterator]() {
        return this;
      },
      async next() {
        while (!closed && !queue.length)
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
        wake = undefined;
        if (failure) throw failure;
        const value = queue.shift();
        if (!value) return { done: true, value: undefined };
        const id =
          value.type === "QUOTE" || value.type === "TRADE"
            ? `${value.type}:${value.sourceMessageId}`
            : undefined;
        return {
          done: false,
          value: id ? withEventMeta(value, { id }) : value,
        };
      },
      async return() {
        close();
        return { done: true, value: undefined };
      },
      async [Symbol.asyncDispose]() {
        close();
      },
      async throw(error: unknown) {
        close();
        throw error;
      },
    };
  }

  publish(event: MarketLiveEvent): void {
    for (const subscriber of this.subscribers) subscriber.push(event);
    this.observe(event.type, this.subscribers.size);
  }
  disconnect(): void {
    for (const subscriber of this.subscribers) subscriber.close();
  }
  stop(): void {
    this.stopped = true;
    this.disconnect();
  }
}
