/**
 * Process-local keyed single-flight execution manager.
 * Ensures that concurrent operations for the same key share a single in-flight Promise.
 * When the operation settles (resolves or rejects), the in-flight registration is
 * immediately cleared so subsequent calls can execute or retry.
 */
export class KeyedSingleFlight {
  private readonly flights = new Map<string, Promise<void>>();

  /**
   * Executes the provided `work` function for the given `key`.
   * If an operation for this `key` is already in flight, the caller shares that operation
   * and awaits its completion without invoking `work` again.
   *
   * @param key Unique identity of the operation (e.g. `${chatId}:${messageId}`)
   * @param work Function to execute if this call is the winning execution
   * @param onCoalesced Optional callback invoked when coalescing onto an existing flight
   * @returns `true` if this caller was the winning execution, `false` if coalesced
   */
  async execute(
    key: string,
    work: () => Promise<void>,
    onCoalesced?: () => void,
  ): Promise<boolean> {
    const existing = this.flights.get(key);
    if (existing) {
      onCoalesced?.();
      await existing;
      return false;
    }

    const flight = Promise.resolve().then(work);

    // Guard against unhandled rejection warnings if a joiner attaches asynchronously
    flight.catch(() => undefined);

    this.flights.set(key, flight);

    try {
      await flight;
      return true;
    } finally {
      if (this.flights.get(key) === flight) {
        this.flights.delete(key);
      }
    }
  }

  isInFlight(key: string): boolean {
    return this.flights.has(key);
  }

  get inFlightCount(): number {
    return this.flights.size;
  }
}
