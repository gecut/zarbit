import type { MarketNotification } from "@zarbit/contracts";
import type { Prisma } from "../prisma/generated/client";

/** PostgreSQL delivers this signal only after the caller's transaction commits. */
export async function notifyMarketChange(
  tx: Prisma.TransactionClient,
  event: MarketNotification,
): Promise<void> {
  await tx.$queryRaw`SELECT pg_notify('zarbit_market_changed', ${JSON.stringify(event)})::text`;
}
