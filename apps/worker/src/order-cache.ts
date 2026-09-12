import type { CanonicalBotOrder } from "@zarbit/domain";

export type CachedCanonicalOrder = CanonicalBotOrder & {
  botMessageId: number;
  observedAt: Date;
  replyToMessageId?: number | null;
};

export class BoundedOrderCache {
  private readonly orders = new Map<number, CachedCanonicalOrder>();
  private readonly maxSize: number;

  constructor(maxSize = 2_000) {
    this.maxSize = maxSize;
  }

  get(messageId: number): CachedCanonicalOrder | undefined {
    return this.orders.get(messageId);
  }

  set(
    messageId: number,
    order: CanonicalBotOrder,
    observedAt: Date,
    replyToMessageId?: number | null,
  ): void {
    if (this.orders.size >= this.maxSize) {
      const oldestKey = this.orders.keys().next().value;
      if (oldestKey !== undefined) {
        this.orders.delete(oldestKey);
      }
    }
    this.orders.set(messageId, {
      ...order,
      botMessageId: messageId,
      observedAt,
      replyToMessageId: replyToMessageId ?? null,
    });
  }

  findRecent(windowStart: Date, windowEnd: Date): Array<CachedCanonicalOrder> {
    const result: Array<CachedCanonicalOrder> = [];
    for (const order of this.orders.values()) {
      if (order.observedAt >= windowStart && order.observedAt <= windowEnd) {
        result.push(order);
      }
    }
    return result;
  }
}
