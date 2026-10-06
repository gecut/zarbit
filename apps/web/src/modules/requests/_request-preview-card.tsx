import { formatNumber } from "@zarbit/format";
import type { CreateRequestInput, RequestPriceMode } from "@zarbit/contracts";
import TomanIcon from "@/shared/ui/_toman-icon";
import { conditionShortLabels, actionLabels } from "./_request-view-model";

export interface RequestPreviewCardProps {
  action: CreateRequestInput["action"];
  condition: CreateRequestInput["condition"];
  targetPrice: number;
  units: number | null;
  priceMode: RequestPriceMode;
  currentTradePrice?: number;
}

export function RequestPreviewCard({
  action,
  condition,
  targetPrice,
  units,
  priceMode,
  currentTradePrice,
}: RequestPreviewCardProps) {
  const isPriceValid = Number.isFinite(targetPrice) && targetPrice > 0;
  const conditionLabel = conditionShortLabels[condition];

  const distance =
    isPriceValid &&
    currentTradePrice != null &&
    Number.isFinite(currentTradePrice)
      ? targetPrice - currentTradePrice
      : null;

  // Has the condition already been met under current market quote?
  const isCurrentlyTriggered =
    distance != null &&
    ((condition === "LTE" && distance >= 0) ||
      (condition === "GTE" && distance <= 0));

  const totalToman =
    action !== "ALERT" && isPriceValid && units != null && units > 0
      ? targetPrice * 1000 * units
      : null;

  // Trading strategy insight based on action and condition
  const strategyTag =
    action === "BUY"
      ? condition === "LTE"
        ? "خرید در افت قیمت (کف‌خری)"
        : "خرید در شکست سقف (بریک‌آوت)"
      : action === "SELL"
        ? condition === "GTE"
          ? "فروش در اوج قیمت (سقف‌فروشی)"
          : "حد ضرر / خروج در افت"
        : "هشدار نوسان بازار";

  return (
    <div className="border-border/75 bg-surface-secondary/70 relative flex flex-col gap-2.5 rounded-2xl border p-3.5 text-xs transition-colors">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-foreground flex items-center gap-1.5 font-semibold">
          <span
            className={`size-2 shrink-0 rounded-full ${
              action === "BUY"
                ? "bg-success"
                : action === "SELL"
                  ? "bg-danger"
                  : "bg-warning"
            }`}
          />
          <span>پیش‌نمایش درخواست ({actionLabels[action]})</span>
          <span className="text-muted text-[10px] font-normal">
            · {strategyTag}
          </span>
        </div>

        {distance != null && (
          <span
            className={`text-[11px] font-semibold tabular-nums ${
              distance === 0
                ? "text-muted"
                : isCurrentlyTriggered
                  ? "text-success"
                  : "text-muted"
            }`}
          >
            فاصله با بازار:{" "}
            <bdi dir="rtl">
              {formatNumber(Math.abs(distance))}
              {distance > 0 ? "+" : distance < 0 ? "-" : ""}
            </bdi>{" "}
            هزار تومان
          </span>
        )}
      </div>

      <p className="text-foreground/90 text-[12px] leading-relaxed">
        {action === "ALERT" ? (
          <>
            با رسیدن قیمت بازار به{" "}
            <b className="text-foreground font-bold tabular-nums">
              {isPriceValid ? formatNumber(targetPrice) : "—"}
            </b>{" "}
            هزار تومان یا {conditionLabel}،{" "}
            <span className="text-warning font-semibold">اعلان هشدار</span> برای
            شما صادر می‌شود.
          </>
        ) : (
          <>
            با رسیدن قیمت بازار به{" "}
            <b className="text-foreground font-bold tabular-nums">
              {isPriceValid ? formatNumber(targetPrice) : "—"}
            </b>{" "}
            هزار تومان یا {conditionLabel}، سفارش{" "}
            <b
              className={`font-bold ${
                action === "BUY" ? "text-success" : "text-danger"
              }`}
            >
              {actionLabels[action]}{" "}
              {units != null && units > 0 ? formatNumber(units) : "۱"} واحد طلا
            </b>{" "}
            با{" "}
            <span className="font-semibold underline decoration-dotted">
              {priceMode === "LAST_TRADE"
                ? "مظنه آخرین معامله"
                : "مظنه تعیین‌شده"}
            </span>{" "}
            در گروه تلگرام ارسال خواهد شد.
          </>
        )}
      </p>

      {isCurrentlyTriggered && (
        <div className="border-success/30 bg-success/10 text-success flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-medium">
          <span className="bg-success size-1.5 shrink-0 rounded-full" />
          <span>
            شرط در نرخ فعلی بازار محقق است و با اولین معاملهٔ بعدی ارسال می‌شود.
          </span>
        </div>
      )}

      {totalToman != null && (
        <div className="border-separator/50 flex items-center justify-between border-t pt-2 text-[11px]">
          <span className="text-muted">
            ارزش تخمینی سفارش ({formatNumber(units ?? 1)} واحد):
          </span>
          <div className="text-foreground flex items-center gap-1 font-bold">
            <span className="tabular-nums">{formatNumber(totalToman)}</span>
            <TomanIcon className="text-muted size-3.5" />
          </div>
        </div>
      )}
    </div>
  );
}
