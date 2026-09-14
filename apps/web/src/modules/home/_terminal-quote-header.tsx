import {
  Alert,
  Button,
  Card,
  Chip,
  cn,
  Separator,
  Skeleton,
  Spinner,
} from "@heroui/react";
import type { MarketSnapshot } from "@zarbit/contracts";
import { formatTime, formatTomanFromCompactPrice } from "@zarbit/format";
import { RefreshCircleIcon } from "@solar-icons/react/linear/refresh-circle";
type MarketConnection = "connecting" | "healthy" | "degraded";
import { marketDifferenceDetails } from "./_market-format";
import { QuoteAge } from "./_quote-age";
import TomanIcon from "@/shared/ui/_toman-icon";

interface TerminalQuoteHeaderProps {
  data?: MarketSnapshot;
  connection: MarketConnection;
  isPending: boolean;
  isFetching: boolean;
  error: Error | null;
  onRefresh: () => void;
}

const connectionLabels: Record<MarketConnection, string> = {
  healthy: "زنده",
  connecting: "در حال اتصال",
  degraded: "دریافت دوره‌ای · هر ۳ ثانیه",
};

export function TerminalQuoteHeader({
  data,
  connection,
  isPending,
  isFetching,
  error,
  onRefresh,
}: TerminalQuoteHeaderProps) {
  const quote = data?.quote;
  const trade = data?.trade;
  const difference =
    data?.tradeQuoteDifference != null
      ? marketDifferenceDetails(data.tradeQuoteDifference)
      : null;

  return (
    <Card variant="tertiary">
      <Card.Header>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Card.Title>مظنه رسمی طلا</Card.Title>
          <div className="flex items-center gap-2">
            <span role="status" aria-label="وضعیت جریان بازار">
              <Chip
                size="sm"
                variant="soft"
                color={
                  connection === "degraded"
                    ? "warning"
                    : connection === "healthy"
                      ? "success"
                      : "default"
                }
              >
                <Chip.Label>{connectionLabels[connection]}</Chip.Label>
              </Chip>
            </span>

            <Button
              size="sm"
              variant="ghost"
              isIconOnly
              isPending={isFetching}
              onPress={onRefresh}
              aria-label="تازه‌سازی آخرین اطلاعات بازار"
            >
              {isFetching ? (
                <Spinner color="current" size="sm" />
              ) : (
                <RefreshCircleIcon />
              )}
            </Button>
          </div>
        </div>
      </Card.Header>
      <Card.Content className="grid gap-6">
        {isPending && !data ? (
          <div className="grid gap-2" aria-label="در حال دریافت مظنه">
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-5 w-1/2" />
          </div>
        ) : (
          <div className="items-baseline-last flex w-full justify-between">
            <div className="flex flex-col gap-1">
              <div className="flex items-baseline gap-1">
                <strong className="text-3xl font-bold sm:text-4xl">
                  {quote
                    ? formatTomanFromCompactPrice(quote.compactPrice)
                    : "ثبت‌نشده"}
                </strong>
                {quote && <TomanIcon className="text-muted size-6" />}
              </div>

              <QuoteAge announcedAt={quote?.announcedAt} asOf={data?.asOf} />
            </div>

            {quote && (
              <time
                className="text-muted text-xs tabular-nums"
                dateTime={quote.announcedAt}
              >
                {formatTime(quote.announcedAt)}
              </time>
            )}
          </div>
        )}

        {error && (
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>
                دریافت آخرین اطلاعات بازار ناموفق بود؛ دوباره تازه‌سازی کنید.
              </Alert.Title>
            </Alert.Content>
          </Alert>
        )}

        <Separator />

        <div className="grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-muted">آخرین معامله تأییدشده</span>

            {trade && (
              <time
                className="text-muted tabular-nums"
                dateTime={trade.announcedAt}
              >
                {formatTime(trade.announcedAt)}
              </time>
            )}
          </div>

          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1 text-lg">
              <b className="font-semibold">
                {trade
                  ? formatTomanFromCompactPrice(trade.compactPrice)
                  : "در انتظار ثبت"}
              </b>

              {trade && <TomanIcon className="text-muted mb-0.5 size-4" />}
            </span>

            {trade && difference && (
              <span
                className={cn(
                  "text-sm",
                  difference.direction === "up"
                    ? "text-success"
                    : difference.direction === "down"
                      ? "text-danger"
                      : "text-muted",
                )}
                title="مقایسه با مظنه فعلی، نه مظنه زمان معامله"
              >
                {difference.text}
              </span>
            )}
          </div>
        </div>
      </Card.Content>
    </Card>
  );
}
