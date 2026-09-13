import { withEventMeta } from "@orpc/client";
import { marketLiveEventSchema, type MarketLiveEvent } from "@zarbit/contracts";

/** Deterministic in-memory transport used only by development fixtures. */
export function createMockLiveIterator(
  initial: MarketLiveEvent,
  signal?: AbortSignal,
) {
  const queue = [marketLiveEventSchema.parse(initial)];
  let closed = false;
  let wake: (() => void) | undefined;
  let error: Error | undefined;
  const close = (reason?: Error) => {
    closed = true;
    error = reason;
    queue.length = 0;
    wake?.();
    signal?.removeEventListener("abort", abort);
  };
  const abort = () => close();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) close();
  const iterator: AsyncIteratorObject<MarketLiveEvent, void, void> = {
    [Symbol.asyncIterator]() {
      return this;
    },
    async [Symbol.asyncDispose]() {
      close();
    },
    async next() {
      while (!closed && !queue.length)
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      if (error) throw error;
      const event = queue.shift();
      if (!event) return { done: true, value: undefined };
      return {
        done: false,
        value:
          event.type === "QUOTE" || event.type === "TRADE"
            ? withEventMeta(event, {
                id: `${event.type}:${event.sourceMessageId}`,
              })
            : event,
      };
    },
    async return() {
      close();
      return { done: true, value: undefined };
    },
    async throw(reason: unknown) {
      close();
      throw reason;
    },
  };
  return {
    iterator,
    get closed() {
      return closed;
    },
    emit(event: MarketLiveEvent) {
      if (closed) return;
      if (queue.length >= 100) {
        close(new Error("Mock slow client"));
        return;
      }
      queue.push(marketLiveEventSchema.parse(event));
      wake?.();
    },
    close,
  };
}
