import { Button, Card, Skeleton } from "@heroui/react";
import { Link } from "@tanstack/react-router";
import { DollarMinimalisticIcon } from "@solar-icons/react/linear";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useQuoteDashboard } from "../lib/quote";
import TomanIcon from "./-toman-icon";

function formatQuote(value: number) {
  return new Intl.NumberFormat("fa-IR").format(value);
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
        <div className="grid gap-3">
          <Skeleton className="h-10 w-4/5 rounded" />
          <Skeleton className="h-4 w-28 rounded" />
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
          <Card.Title>دریافت مظنه ناموفق بود</Card.Title>
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

  if (!quote.data.latest)
    return (
      <Card variant="tertiary">
        <Card.Header className="p-0">
          <Card.Title>هنوز مظنه‌ای دریافت نشده است</Card.Title>
          <Card.Description>
            پس از اتصال یک حساب عضو گروه، آخرین مظنه اینجا نمایش داده می‌شود.
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
    Date.now() - new Date(quote.data.latest.announcedAt).getTime() >
    staleAfterMs;

  return (
    <Card variant="tertiary">
      <Card.Header>
        {isStale && (
          <p className="border-warning-soft-foreground bg-warning-soft text-warning-soft-foreground mb-4 rounded-full border px-4 py-2 text-center text-xs font-semibold">
            این مظنه بیش از پنج دقیقه پیش اعلام شده است.
          </p>
        )}

        <div className="flex flex-col gap-2 px-4">
          <DollarMinimalisticIcon className="mx-auto size-12 text-[#DAA464]" />

          <div className="flex items-end justify-center gap-1">
            <p className="text-foreground text-3xl font-semibold sm:text-4xl">
              {formatQuote(quote.data.latest.quote)}
            </p>

            <TomanIcon className="mb-2 size-5 opacity-60" />
          </div>

          <div className="flex items-center justify-between">
            <Card.Title className="text-muted text-sm">آخرین مظنه</Card.Title>

            <time
              className="text-muted text-xs"
              dateTime={quote.data.latest.announcedAt}
            >
              {formatDate(quote.data.latest.announcedAt)}
            </time>
          </div>
        </div>
      </Card.Header>

      <Card.Content className="flex flex-col">
        <div className="border-separator grid gap-2 border-t pt-4">
          <h2 className="text-foreground text-xs font-semibold opacity-60">
            روند سه روز گذشته
          </h2>

          {quote.data.points.length ? (
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
                      `${formatQuote(Number(value ?? 0) / 1000)}`,
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
