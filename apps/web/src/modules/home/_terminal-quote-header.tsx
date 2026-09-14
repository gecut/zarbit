import {
  Alert,
  Button,
  Card,
  Chip,
  Separator,
  Skeleton,
  Spinner,
} from "@heroui/react";
import type { MarketSnapshot } from "@zarbit/contracts";
import { RefreshCircleIcon } from "@solar-icons/react/linear/refresh-circle";
type MarketConnection = "connecting" | "healthy" | "degraded";
import {
  fullToman,
  compactPriceFormat,
  marketNumber,
  marketTimePrecise,
  marketDifferenceDetails,
} from "./_market-format";
import { QuoteAge } from "./_quote-age";

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
    <Card variant="secondary">
      <Card.Header>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Card.Title>مظنه رسمی طلا</Card.Title>
          <div className="flex items-center gap-2">
            <span role="status" aria-label="وضعیت جریان بازار">
              <Chip
                size="sm"
                variant="soft"
                color={connection === "degraded" ? "warning" : "default"}
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
      <Card.Content className="grid gap-3">
        {isPending && !data ? (
          <div className="grid gap-2" aria-label="در حال دریافت مظنه">
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-5 w-1/2" />
          </div>
        ) : (
          <div className="grid gap-1">
            <div className="flex flex-wrap items-baseline gap-2">
              <strong
                className="text-3xl font-bold tabular-nums sm:text-4xl"
                dir="ltr"
              >
                {quote ? fullToman(quote.compactPrice) : "ثبت‌نشده"}
              </strong>
              {quote && <span className="text-muted text-sm">تومان</span>}
            </div>
            {quote && (
              <div className="text-muted flex flex-wrap items-center justify-between gap-2 text-xs">
                <span>
                  مظنه فشرده{" "}
                  <b className="text-foreground tabular-nums">
                    {compactPriceFormat(quote.compactPrice)}
                  </b>{" "}
                  · هزار تومان
                </span>
                <time className="tabular-nums" dateTime={quote.announcedAt}>
                  {marketTimePrecise(quote.announcedAt)}
                </time>
              </div>
            )}
          </div>
        )}
        <QuoteAge announcedAt={quote?.announcedAt} asOf={data?.asOf} />
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
        <div className="grid gap-1 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-muted">آخرین معامله تأییدشده</span>
            {trade && (
              <time
                className="text-muted tabular-nums"
                dateTime={trade.announcedAt}
              >
                {marketTimePrecise(trade.announcedAt)}
              </time>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              <b className="tabular-nums">
                {trade ? fullToman(trade.compactPrice) : "در انتظار ثبت"}
              </b>
              {trade && " تومان"}
            </span>
            {trade?.quantity != null && (
              <span className="tabular-nums">
                {marketNumber.format(trade.quantity)} واحد
              </span>
            )}
            {trade && difference && (
              <span
                className={
                  difference.direction === "up"
                    ? "text-success"
                    : difference.direction === "down"
                      ? "text-danger"
                      : "text-muted"
                }
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
