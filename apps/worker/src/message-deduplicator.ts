export class BoundedMessageDeduplicator {
  private readonly seen = new Map<number, "quote" | "trade" | "action">();
  private readonly maxSize: number;

  constructor(maxSize = 2_000) {
    this.maxSize = maxSize;
  }

  has(messageId: number): "quote" | "trade" | "action" | undefined {
    return this.seen.get(messageId);
  }

  add(messageId: number, kind: "quote" | "trade" | "action"): void {
    if (this.seen.size >= this.maxSize) {
      const oldestKey = this.seen.keys().next().value;
      if (oldestKey !== undefined) {
        this.seen.delete(oldestKey);
      }
    }
    this.seen.set(messageId, kind);
  }
}
