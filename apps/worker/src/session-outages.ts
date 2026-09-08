interface OutageState {
  revision: number;
  since?: number;
  attempted: boolean;
  delivered: boolean;
}

/** Process-local notification state; connection retries remain owned by Sessions. */
export class SessionOutages {
  private readonly states = new Map<string, OutageState>();

  connected(userId: string, revision: number): boolean {
    const previous = this.states.get(userId);
    const announceRecovery = previous?.revision === revision && previous.delivered;
    this.states.set(userId, { revision, attempted: false, delivered: false });
    return announceRecovery;
  }

  failed(userId: string, revision: number, now: number): void {
    const state = this.states.get(userId);
    // Initial login/recovery has never been ready in this process.
    if (state?.revision !== revision) return;
    state.since ??= now;
  }

  clear(userId: string): void {
    this.states.delete(userId);
  }

  async check(userId: string, revision: number, now: number, send: () => Promise<boolean>): Promise<void> {
    const state = this.states.get(userId);
    if (state?.revision !== revision) {
      this.clear(userId);
      return;
    }
    if (state.since === undefined || now - state.since < 120_000 || state.attempted) return;
    state.attempted = true;
    state.delivered = await send();
  }
}
