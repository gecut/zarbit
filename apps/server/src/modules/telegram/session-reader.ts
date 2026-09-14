import type { Store } from "@zarbit/db";
type Session = NonNullable<Awaited<ReturnType<Store["session"]>>>;
export interface SessionReader {
  session(
    userId: string,
  ): Promise<Pick<
    Session,
    | "state"
    | "connectedTelegramUserId"
    | "membershipCheckedAt"
    | "revision"
    | "version"
    | "stateChangedAt"
    | "loginId"
  > | null>;
  activeTelegramOperation(userId: string): Promise<{ id: string } | null>;
}
