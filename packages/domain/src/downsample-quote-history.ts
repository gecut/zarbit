export interface QuoteHistoryInputPoint {
  compactPrice?: number;
  compactQuote?: number;
  quote?: number;
  announcedAt: Date | string;
  sourceMessageId?: number;
}

export interface DownsampledQuotePoint {
  compactPrice: number;
  announcedAt: string;
}

export interface DownsampleQuoteOptions {
  /** Reference timestamp defining the rolling window boundary. Defaults to Date.now(). */
  now?: Date | number;
  /** Duration of the rolling window in milliseconds. Defaults to 72 hours. */
  windowMs?: number;
  /** Size of each bucket in milliseconds. Defaults to 2 hours. */
  bucketSizeMs?: number;
}

const TWO_HOURS_MS = 2 * 60 * 60 * 1_000;
const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1_000;

/**
 * Downsamples raw quote history into 2-hour buckets over a rolling 72-hour window.
 *
 * Requirements:
 * - Rolling 72 hours (by default [now - 72h, now]).
 * - 2-hour buckets (by default aligned to even hours in epoch time).
 * - Maximum theoretical output: 36 points.
 * - Output order: oldest -> newest.
 * - Each bucket returns the LAST real quote observed inside that bucket.
 * - Empty buckets are omitted (no interpolation or synthesized prices).
 * - Preserves the actual announcedAt timestamp of the selected quote.
 */
export function downsampleQuoteHistory(
  quotes: readonly QuoteHistoryInputPoint[],
  options?: DownsampleQuoteOptions,
): DownsampledQuotePoint[] {
  if (!quotes || quotes.length === 0) {
    return [];
  }

  const nowMs =
    options?.now instanceof Date
      ? options.now.getTime()
      : typeof options?.now === "number"
        ? options.now
        : Date.now();

  const windowMs = options?.windowMs ?? SEVENTY_TWO_HOURS_MS;
  const bucketSizeMs = options?.bucketSizeMs ?? TWO_HOURS_MS;
  const windowStartMs = nowMs - windowMs;

  const validPoints: Array<{
    compactPrice: number;
    announcedAtMs: number;
    announcedAtIso: string;
    sourceMessageId?: number;
  }> = [];

  for (const q of quotes) {
    const rawPrice = q.compactPrice ?? q.compactQuote ?? q.quote;
    if (
      rawPrice === undefined ||
      !Number.isSafeInteger(rawPrice) ||
      rawPrice <= 0
    ) {
      continue;
    }

    const d =
      q.announcedAt instanceof Date ? q.announcedAt : new Date(q.announcedAt);
    const ms = d.getTime();
    if (Number.isNaN(ms)) {
      continue;
    }

    // Must be inside the required 72-hour window
    if (ms < windowStartMs || ms > nowMs) {
      continue;
    }

    validPoints.push({
      compactPrice: rawPrice,
      announcedAtMs: ms,
      announcedAtIso: d.toISOString(),
      sourceMessageId: q.sourceMessageId,
    });
  }

  if (validPoints.length === 0) {
    return [];
  }

  // Sort chronologically ascending (oldest -> newest).
  // On equal timestamps, break ties with sourceMessageId if available.
  validPoints.sort((a, b) => {
    const diff = a.announcedAtMs - b.announcedAtMs;
    if (diff !== 0) return diff;
    if (a.sourceMessageId !== undefined && b.sourceMessageId !== undefined) {
      return a.sourceMessageId - b.sourceMessageId;
    }
    return 0;
  });

  // Group into 2-hour buckets: [bucketStart, bucketStart + 2h).
  // Math.floor(announcedAtMs / bucketSizeMs) yields deterministic integer bucket keys.
  // Quotes exactly on a boundary (e.g. 14:00:00.000) belong to that boundary's bucket.
  const bucketMap = new Map<number, (typeof validPoints)[0]>();

  for (const point of validPoints) {
    const bucketKey = Math.floor(point.announcedAtMs / bucketSizeMs);
    // Since points are sorted oldest -> newest, later points in the same bucket overwrite earlier ones.
    // This guarantees each bucket keeps the LAST real quote observed inside it.
    bucketMap.set(bucketKey, point);
  }

  // Sort bucket representatives chronologically (oldest -> newest).
  const sortedBucketKeys = Array.from(bucketMap.keys()).sort((a, b) => a - b);

  // Cap at max theoretical buckets for the window (e.g. 72h / 2h = 36 points).
  const maxBuckets = Math.floor(windowMs / bucketSizeMs);
  const selectedKeys =
    sortedBucketKeys.length > maxBuckets
      ? sortedBucketKeys.slice(-maxBuckets)
      : sortedBucketKeys;

  return selectedKeys.map((key) => {
    const representative = bucketMap.get(key)!;
    return {
      compactPrice: representative.compactPrice,
      announcedAt: representative.announcedAtIso,
    };
  });
}
