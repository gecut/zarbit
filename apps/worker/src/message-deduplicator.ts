export type DeduplicatedMessageKind = "quote" | "trade" | "action" | "order";

export class BoundedMessageDeduplicator {
  private readonly seen = new Map<string, DeduplicatedMessageKind>();
  private readonly maxSize: number;

  constructor(maxSize = 2_000) {
    this.maxSize = maxSize;
  }

  static key(chatId: number | undefined, messageId: number): string {
    return chatId !== undefined ? `${chatId}:${messageId}` : `${messageId}`;
  }

  has(messageId: number, chatId?: number): DeduplicatedMessageKind | undefined {
    if (chatId !== undefined) {
      const specific = this.seen.get(
        BoundedMessageDeduplicator.key(chatId, messageId),
      );
      if (specific !== undefined) {
        return specific;
      }
    }
    return this.seen.get(`${messageId}`);
  }

  add(messageId: number, kind: DeduplicatedMessageKind, chatId?: number): void {
    const key = BoundedMessageDeduplicator.key(chatId, messageId);
    if (this.seen.size >= this.maxSize && !this.seen.has(key)) {
      const oldestKey = this.seen.keys().next().value;
      if (oldestKey !== undefined) {
        this.seen.delete(oldestKey);
      }
    }
    this.seen.set(key, kind);
  }

  get size(): number {
    return this.seen.size;
  }
}
