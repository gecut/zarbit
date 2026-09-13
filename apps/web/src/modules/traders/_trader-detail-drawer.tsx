import { useQuery, skipToken } from "@tanstack/react-query";
import { Card, Chip, cn, ScrollShadow } from "@heroui/react";
import { useIdentity } from "../../shared/auth/auth";
import { useApi } from "../../shared/api/api-context";
import { DrawerSheet } from "../../shared/ui/drawer";
import { DataCoverageBadge } from "./_data-coverage-badge";
import TomanIcon from "@/shared/ui/_toman-icon";

function formatPersianNumber(value: number): string {
  return new Intl.NumberFormat("fa-IR").format(value);
}

function formatTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat("fa-IR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(d);
  } catch {
    return isoString;
  }
}
function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat("fa-IR", {
      day: "numeric",
      month: "long",
    }).format(d);
  } catch {
    return isoString;
  }
}

export function TraderDetailDrawer({
  alias,
  onClose,
}: {
  alias: string | null;
  onClose: () => void;
}) {
  const api = useApi(useIdentity().telegramUserId);
  const detailQuery = useQuery(
    api.analytics.traderDetail.queryOptions({
      input: alias ? { alias } : skipToken,
      refetchInterval: 5000,
    }),
  );

  const detail = detailQuery.data;
  const summary = detail?.summary;
  const isProfitable = (summary?.realizedPnlPoints ?? 0) > 0;
  const isLoss = (summary?.realizedPnlPoints ?? 0) < 0;

  return (
    <DrawerSheet
      open={Boolean(alias)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={alias ? `عملکرد ۷ روزه: ${alias}` : "مشخصات معامله‌گر"}
    >
      {detailQuery.isLoading && (
        <div className="text-muted py-12 text-center text-sm">
          در حال بارگذاری اطلاعات معامله‌گر…
        </div>
      )}

      {detailQuery.isError && (
        <div className="text-danger py-8 text-center text-sm">
          خطا در دریافت اطلاعات معامله‌گر. لطفاً دوباره تلاش کنید.
        </div>
      )}

      {summary && (
        <div className="space-y-4">
          {/* Header Card */}
          <Card className="border-border bg-surface space-y-3 rounded-2xl border p-4">
            <div className="flex items-center justify-between">
              <span className="text-muted text-xs">وضعیت داده‌ها:</span>
              <DataCoverageBadge confidence={summary.confidence} />
            </div>

            <div className="border-border/60 flex items-baseline justify-between border-t pt-3">
              <span className="text-muted text-sm">سود / زیان محقق‌شده:</span>
              <div className="text-left">
                <span
                  className={cn(
                    "flex items-center gap-1 text-lg font-bold",
                    isProfitable && "text-success",
                    isLoss && "text-danger",
                    !isProfitable && !isLoss && "text-muted",
                  )}
                >
                  {formatPersianNumber(summary.realizedPnlTomans)}
                  {isProfitable ? "+" : ""}
                  <TomanIcon className="text-muted mb-1" />
                </span>
              </div>
            </div>
          </Card>

          {/* Metrics Grid */}
          <div className="grid grid-cols-2 gap-2.5">
            <Card className="border-border bg-surface rounded-2xl border p-3">
              <span className="text-muted text-xs">کل حجم معاملات:</span>
              <span className="text-foreground mt-1 block text-sm font-semibold">
                {formatPersianNumber(summary.totalVolume)} واحد
              </span>
              <span className="text-muted mt-0.5 block text-[11px]">
                خرید: {formatPersianNumber(summary.buyVolume)} | فروش:{" "}
                {formatPersianNumber(summary.sellVolume)}
              </span>
            </Card>

            <Card className="border-border bg-surface rounded-2xl border p-3">
              <span className="text-muted text-xs">تعداد کل معاملات:</span>
              <span className="text-foreground mt-1 block text-sm font-semibold">
                {formatPersianNumber(summary.totalTrades)} معامله
              </span>
              <span className="text-muted mt-0.5 block text-[11px]">
                خرید: {formatPersianNumber(summary.buyTrades)} | فروش:{" "}
                {formatPersianNumber(summary.sellTrades)}
              </span>
            </Card>

            <Card className="border-border bg-surface rounded-2xl border p-3">
              <span className="text-muted text-xs">میانگین حجم هر معامله:</span>
              <span className="text-foreground mt-1 block text-sm font-semibold">
                {formatPersianNumber(summary.averageTradeSize)} واحد
              </span>
            </Card>

            <Card className="border-border bg-surface rounded-2xl border p-3">
              <span className="text-muted text-xs">موقعیت باز فعلی:</span>
              <div className="mt-1">
                {summary.observedPosition === 0 ? (
                  <Chip size="sm" variant="soft" color="default">
                    بسته (۰)
                  </Chip>
                ) : summary.observedPosition > 0 ? (
                  <Chip size="sm" variant="soft" color="success">
                    خرید: +{formatPersianNumber(summary.observedPosition)}
                  </Chip>
                ) : (
                  <Chip size="sm" variant="soft" color="danger">
                    فروش: {formatPersianNumber(summary.observedPosition)}
                  </Chip>
                )}
              </div>
              {summary.currentCostBasis > 0 && (
                <span className="text-muted dir-ltr mt-1 block text-right text-[11px]">
                  مظنه میانگین: {formatPersianNumber(summary.currentCostBasis)}
                </span>
              )}
            </Card>
          </div>

          {/* Recent Trades Activity */}
          <div className="space-y-2 pt-2">
            <h4 className="text-foreground text-sm font-semibold">
              آخرین معاملات مشاهده‌شده
            </h4>

            {detail?.recentTrades.length === 0 && (
              <p className="text-muted py-4 text-center text-xs">
                معامله‌ای در بازه زمانی اخیر ثبت نشده است.
              </p>
            )}

            <ScrollShadow orientation="vertical" className="max-h-56">
              <div className="space-y-1.5">
                {detail?.recentTrades.map((t) => (
                  <div
                    key={t.id}
                    className="border-border bg-surface/60 flex items-center justify-between rounded-xl border p-2.5 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <Chip
                        size="sm"
                        variant="soft"
                        color={t.side === "BUY" ? "success" : "danger"}
                        className="min-w-10 justify-center text-xs font-light"
                      >
                        {t.side === "BUY" ? "خرید" : "فروش"}
                      </Chip>

                      <span className="text-foreground font-medium">
                        {formatPersianNumber(t.quantity)} واحد
                      </span>
                      <span className="text-muted">با مظنه</span>
                      <span className="text-foreground">
                        {formatPersianNumber(t.compactPrice)}
                      </span>
                      <span className="text-muted">
                        با {t.counterpartyAlias}
                      </span>
                    </div>

                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-muted block text-xs">
                        {formatDate(t.announcedAt)}
                      </span>
                      <span className="text-muted block text-xs tracking-wider">
                        {formatTime(t.announcedAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollShadow>
          </div>

          {/* Transparent Protocol Disclosure */}
          <p className="text-muted/80 border-border/40 border-t pt-2 text-justify text-[11px] leading-5">
            * تمام محاسبات سود و زیان صرفاً بر اساس حواله‌های قطعی ربات و فرمول
            میانگین موزون (WACB) محاسبه شده‌اند. معاملات پیش از بازه ۷ روزه تنها
            برای استخراج موقعیت و مظنه باز ابتدای بازه منظور شده‌اند.
          </p>
        </div>
      )}
    </DrawerSheet>
  );
}
