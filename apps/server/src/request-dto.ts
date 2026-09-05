import type { Store } from "@zarbit/db";
import type { ZarbitRequest } from "@zarbit/contracts";
import { compactQuoteToHumanPrice } from "@zarbit/domain";

export function requestDto(
  request: NonNullable<Awaited<ReturnType<Store["request"]>>>,
): ZarbitRequest {
  return {
    id: request.id,
    condition: request.condition,
    action: request.action,
    units: request.units,
    targetPrice: compactQuoteToHumanPrice(request.targetPrice),
    status: request.status,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
    completedAt: request.completedAt?.toISOString() ?? null,
    triggeredQuote: request.triggeredQuote
      ? compactQuoteToHumanPrice(request.triggeredQuote)
      : null,
    failureReason: request.failureReason,
    cancellationReason: request.cancellationReason,
    isExecuting: request.status === "ACTIVE" && Boolean(request.claimToken),
  };
}
