import { Button, Skeleton } from "@heroui/react";
import type { MarketSnapshot } from "@zarbit/contracts";
import { fullToman, marketDifference, marketTime } from "./_market-format";

interface MarketSummaryProps {
  data?: MarketSnapshot;
  pending: boolean;
  error: Error | null;
  retry: () => void;
}
export function MarketSummary({
  data,
  pending,
  error,
  retry,
}: MarketSummaryProps) {
  return (
    <div className="grid gap-3">
      {error && (
        <div role="alert" className="text-danger text-xs">
          دریافت آخرین قیمت ناموفق بود.{" "}
          <Button size="sm" variant="ghost" onPress={retry}>
            تلاش دوباره
          </Button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        {(
          [
            { title: "آخرین مظنه", point: data?.quote, official: true },
            { title: "آخرین معامله", point: data?.trade, official: false },
          ] as const
        ).map(({ title, point, official }) => (
          <section
            key={title}
            className={`flex min-w-0 flex-col gap-3 rounded-2xl border p-3 sm:p-4 ${official ? "border-accent/30 bg-accent-soft/30" : "border-border bg-surface-secondary/40"}`}
          >
            <h2 className="text-muted text-xs font-medium sm:text-sm">
              {title}
            </h2>
            {pending && !data ? (
              <>
                <Skeleton className="h-8 w-full rounded" />
                <Skeleton className="h-4 w-20 rounded" />
              </>
            ) : (
              <>
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-1">
                  <strong className="text-foreground text-lg font-bold tabular-nums sm:text-2xl">
                    {point ? fullToman(point.compactPrice) : "ثبت‌نشده"}
                  </strong>
                  {point && <span className="text-muted text-xs">تومان</span>}
                </div>
                {!official && data?.tradeQuoteDifference != null && (
                  <span
                    title="مقایسه با آخرین مظنهٔ فعلی؛ نه قیمت مظنه در زمان اجرا"
                    className={`w-fit rounded-full px-2 py-1 text-[0.65rem] ${data.tradeQuoteDifference < 0 ? "bg-danger-soft text-danger-soft-foreground" : "bg-accent-soft text-accent-soft-foreground"}`}
                  >
                    {marketDifference(data.tradeQuoteDifference)}
                  </span>
                )}
                <div className="border-separator text-muted mt-auto border-t pt-2 text-[0.65rem] leading-5 sm:text-xs">
                  {point ? (
                    <time dateTime={point.announcedAt}>
                      ساعت {marketTime(point.announcedAt)}
                    </time>
                  ) : official ? (
                    "در انتظار اعلام مظنه"
                  ) : (
                    "در انتظار معاملهٔ تکمیل‌شده"
                  )}
                </div>
              </>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
