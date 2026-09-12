import { Button, Card, Skeleton } from "@heroui/react";
import { Link } from "@tanstack/react-router";
import {
  BillCheckIcon,
  DollarMinimalisticIcon,
} from "@solar-icons/react/linear";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { compactQuoteToDisplayPrice } from "@zarbit/domain";

import { useQuoteDashboard } from "./_use-quote-dashboard";
import TomanIcon from "../../shared/ui/_toman-icon";

function formatQuote(value: number) {
  return new Intl.NumberFormat("fa-IR").format(value);
}

function safeDisplayPrice(price: number | undefined | null): number | null {
  if (typeof price !== "number" || !Number.isSafeInteger(price) || price <= 0) {
    return null;
  }
  try {
    return compactQuoteToDisplayPrice(price);
  } catch {
    return null;
  }
}

const staleAfterMs = 5 * 60_000;
const tehranTimeZone = "Asia/Tehran";

const relativeFormatter = new Intl.RelativeTimeFormat("fa-IR", {
  numeric: "auto",
});

const timeFormatter = new Intl.DateTimeFormat("fa-IR", {
  timeZone: tehranTimeZone,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatDate(value: string) {
  const date = new Date(value);
  if (isNaN(date.getTime())) return "ثبت‌نشده";

  const diff = date.getTime() - Date.now();

  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  const relative =
    Math.abs(diff) < hour
      ? relativeFormatter.format(Math.round(diff / minute), "minute")
      : Math.abs(diff) < day
        ? relativeFormatter.format(Math.round(diff / hour), "hour")
        : relativeFormatter.format(Math.round(diff / day), "day");

  return `${relative}، ساعت ${timeFormatter.format(date)}`;
}

function formatAxisDate(value: string) {
  return new Intl.DateTimeFormat("fa-IR", {
    timeZone: tehranTimeZone,
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}

function DashboardSkeleton() {
  return (
    <Card className="border-border bg-surface shadow-surface rounded-2xl border p-4 sm:p-6">
      <Card.Header className="p-0">
        <Skeleton className="h-4 w-24 rounded" />
      </Card.Header>
      <Card.Content className="grid gap-6 p-0 pt-6">
        <div className="grid grid-cols-2 gap-3">
          <div className="border-border/50 bg-surface-secondary/40 space-y-2 rounded-2xl border p-3.5 sm:p-4">
            <Skeleton className="h-3 w-16 rounded" />
            <Skeleton className="h-7 w-24 rounded sm:w-28" />
            <Skeleton className="h-3 w-20 rounded" />
          </div>
          <div className="border-border/50 bg-surface-secondary/40 space-y-2 rounded-2xl border p-3.5 sm:p-4">
            <Skeleton className="h-3 w-16 rounded" />
            <Skeleton className="h-7 w-24 rounded sm:w-28" />
            <Skeleton className="h-3 w-20 rounded" />
          </div>
        </div>
        <Skeleton className="h-50 w-full rounded-2xl sm:h-60" />
      </Card.Content>
    </Card>
  );
}

export function QuoteDashboardCard() {
  const quote = useQuoteDashboard();

  if (quote.isPending) return <DashboardSkeleton />;
  if (quote.error)
    return (
      <Card className="border-danger bg-danger-soft text-danger-soft-foreground rounded-2xl border p-4 sm:p-6">
        <Card.Header className="p-0">
          <Card.Title>دریافت اطلاعات بازار ناموفق بود</Card.Title>
        </Card.Header>
        <Card.Content className="p-0 pt-3 text-sm leading-7">
          {quote.error.message}
        </Card.Content>
        <Card.Footer className="p-0 pt-5">
          <Button onPress={() => void quote.refetch()} variant="secondary">
            تلاش دوباره
          </Button>
        </Card.Footer>
      </Card>
    );

  const { latest, latestTrade, points } = quote.data;

  if (!latest && !latestTrade)
    return (
      <Card variant="tertiary">
        <Card.Header className="p-0">
          <Card.Title>هنوز مظنه‌ای دریافت نشده است</Card.Title>
          <Card.Description>
            پس از اتصال یک حساب عضو گروه، آخرین مظنه و معاملات اینجا نمایش داده
            می‌شود.
          </Card.Description>
        </Card.Header>
        <Card.Content className="p-0 pt-6">
          <div className="border-border bg-surface-secondary text-muted h-50 grid place-items-center rounded-2xl border border-dashed px-6 text-center text-sm sm:h-60">
            روند سه روز گذشته پس از دریافت نخستین مظنه نمایش داده می‌شود.
          </div>
        </Card.Content>
        <Card.Footer className="p-0 pt-5">
          <Link
            className="bg-accent text-accent-foreground inline-flex min-h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold"
            to="/telegram"
          >
            اتصال تلگرام
          </Link>
        </Card.Footer>
      </Card>
    );

  const isStale =
    latest != null &&
    Date.now() - new Date(latest.announcedAt).getTime() > staleAfterMs;

  const displayQuote = safeDisplayPrice(latest?.quote);
  const displayTradePrice = safeDisplayPrice(latestTrade?.price);

  return (
    <Card variant="tertiary">
      <Card.Header>
        {isStale && (
          <p className="border-warning-soft-foreground bg-warning-soft text-warning-soft-foreground mb-4 rounded-full border px-4 py-2 text-center text-xs font-semibold">
            این مظنه بیش از پنج دقیقه پیش اعلام شده است.
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          {/* Latest Official Quote */}
          <div className="border-border bg-surface-secondary/60 flex flex-col justify-between rounded-2xl border p-3.5 sm:p-4">
            <div className="text-muted flex items-center gap-1.5">
              <DollarMinimalisticIcon className="size-4 shrink-0 text-[#DAA464]" />
              <span className="text-xs font-medium">آخرین مظنه</span>
            </div>

            <div className="my-1.5 flex items-end gap-1">
              {displayQuote != null ? (
                <>
                  <span className="text-foreground text-xl font-bold tabular-nums sm:text-2xl">
                    {formatQuote(displayQuote)}
                  </span>
                  <TomanIcon className="text-muted mb-0.5 size-4 shrink-0 opacity-70" />
                </>
              ) : (
                <span className="text-muted text-base font-medium sm:text-lg">
                  ثبت‌نشده
                </span>
              )}
            </div>

            {latest ? (
              <time
                className="text-muted text-xs leading-relaxed"
                dateTime={latest.announcedAt}
              >
                {formatDate(latest.announcedAt)}
              </time>
            ) : (
              <span className="text-muted text-xs leading-relaxed">
                در انتظار اعلام مظنه
              </span>
            )}
          </div>

          {/* Latest Completed Trade */}
          <div className="border-border bg-surface-secondary/60 flex flex-col justify-between rounded-2xl border p-3.5 sm:p-4">
            <div className="text-muted flex items-center gap-1.5">
              <BillCheckIcon className="text-accent size-4 shrink-0" />
              <span className="text-xs font-medium">آخرین معامله</span>
            </div>

            <div className="my-1.5 flex items-end gap-1">
              {displayTradePrice != null ? (
                <>
                  <span className="text-foreground text-xl font-bold tabular-nums sm:text-2xl">
                    {formatQuote(displayTradePrice)}
                  </span>
                  <TomanIcon className="text-muted mb-0.5 size-4 shrink-0 opacity-70" />
                </>
              ) : (
                <span className="text-muted text-base font-medium sm:text-lg">
                  ثبت‌نشده
                </span>
              )}
            </div>

            {latestTrade ? (
              <time
                className="text-muted text-xs leading-relaxed"
                dateTime={latestTrade.announcedAt}
              >
                {formatDate(latestTrade.announcedAt)}
              </time>
            ) : (
              <span className="text-muted text-xs leading-relaxed">
                در انتظار ثبت حواله
              </span>
            )}
          </div>
        </div>
      </Card.Header>

      <Card.Content className="flex flex-col">
        <div className="border-separator grid gap-2 border-t pt-4">
          <h2 className="text-foreground text-xs font-semibold opacity-60">
            روند سه روز گذشته
          </h2>

          {points.length ? (
            <div className="h-50 **:outline-0 min-w-0 sm:h-60" dir="ltr">
              <ResponsiveContainer height="100%" width="100%">
                <AreaChart
                  data={quote.data.points}
                  margin={{ top: 8, right: 4, left: 4, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="quote-chart-fill"
                      x1="0"
                      x2="0"
                      y1="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor="var(--accent)"
                        stopOpacity={0.28}
                      />
                      <stop
                        offset="100%"
                        stopColor="var(--accent)"
                        stopOpacity={0.02}
                      />
                    </linearGradient>
                  </defs>

                  <CartesianGrid
                    stroke="var(--separator)"
                    strokeDasharray="3 3"
                    vertical={false}
                  />

                  <XAxis
                    axisLine={false}
                    dataKey="announcedAt"
                    minTickGap={36}
                    tick={{ fill: "var(--muted)", fontSize: 11 }}
                    tickFormatter={(value: string) => formatAxisDate(value)}
                    tickLine={false}
                  />

                  <YAxis domain={["dataMin", "dataMax"]} hide />

                  <Tooltip
                    trigger="hover"
                    useTranslate3d
                    contentStyle={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius)",
                      color: "var(--foreground)",
                      direction: "rtl",
                    }}
                    labelStyle={{
                      fontSize: "0.875rem",
                      opacity: 50 / 100,
                    }}
                    itemStyle={{
                      color: "var(--accent)",
                      textAlign: "end",
                    }}
                    formatter={(value) => [
                      `${formatQuote(Number(value ?? 0))}`,
                    ]}
                    labelFormatter={(value) =>
                      typeof value === "string" ? formatDate(value) : ""
                    }
                  />

                  <Area
                    dataKey="quote"
                    fill="url(#quote-chart-fill)"
                    stroke="var(--accent)"
                    strokeWidth={2}
                    type="monotone"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="bg-surface-secondary text-muted h-50 grid place-items-center rounded-2xl px-6 text-center text-sm sm:h-60">
              برای این بازه داده‌ای ثبت نشده است.
            </div>
          )}
        </div>
      </Card.Content>
    </Card>
  );
}
