import type { TelegramSessionStatus } from "@zarbit/contracts";

export interface SessionReader {
  session(userId: string): Promise<{
    state: TelegramSessionStatus["state"];
    connectedTelegramUserId: string | null;
    membershipCheckedAt: Date | null;
  } | null>;
}
