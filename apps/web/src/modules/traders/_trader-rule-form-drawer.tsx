import { useState, useEffect, useMemo } from "react";
import {
  Button,
  Form,
  Input,
  Label,
  NumberField,
  Switch,
  cn,
} from "@heroui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateTraderRuleInput,
  TraderFollowDirection,
  TraderFollowSizing,
  TraderRuleSide,
  TraderRuleTrigger,
} from "@zarbit/contracts";
import { formatNumber } from "@zarbit/format";
import {
  ShieldCheckIcon,
  ShieldWarningIcon,
  UserCircleIcon,
  DocumentTextIcon,
  CheckCircleIcon,
  AltArrowUpIcon,
  AltArrowDownIcon,
  RepeatIcon,
  RefreshIcon,
  LockIcon,
  CopyIcon,
  BellIcon,
  BoltIcon,
  InfoCircleIcon,
  DangerCircleIcon,
  MagnifierIcon,
  PenIcon,
  CloseCircleIcon,
  UserPlusIcon,
} from "@solar-icons/react/linear";
import { useIdentity } from "../../shared/auth/auth";
import { useApi } from "../../shared/api/api-context";
import { DrawerSheet } from "../../shared/ui/drawer";

interface TraderRuleFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTraderAlias?: string | null;
  onSuccess?: () => void;
}

function normalizePersianText(str: string): string {
  return str
    .replace(/[\u200c\u200b]/g, " ")
    .replace(/[ي]/g, "ی")
    .replace(/[ك]/g, "ک")
    .replace(/[آإأ]/g, "ا")
    .replace(/[\u064B-\u065F]/g, "")
    .trim()
    .toLowerCase();
}

export function TraderRuleFormDrawer({
  open,
  onOpenChange,
  initialTraderAlias,
  onSuccess,
}: TraderRuleFormDrawerProps) {
  const identity = useIdentity();
  const api = useApi(identity.telegramUserId);
  const queryClient = useQueryClient();

  // Query cached active traders from database
  const tradersQuery = useQuery(
    api.analytics.tradersV2.queryOptions({
      input: { sortBy: "TRADE_COUNT", sortOrder: "DESC", limit: 60 },
      staleTime: 60_000,
    }),
  );
  const traders = useMemo(() => tradersQuery.data ?? [], [tradersQuery.data]);
  const topTraders = useMemo(() => traders.slice(0, 4), [traders]);

  const [traderAlias, setTraderAlias] = useState(initialTraderAlias ?? "");
  const [isSelectingTrader, setIsSelectingTrader] =
    useState(!initialTraderAlias);
  const [traderSearch, setTraderSearch] = useState("");

  const [trigger, setTrigger] = useState<TraderRuleTrigger>("ORDER_PLACED");
  const [side, setSide] = useState<TraderRuleSide>("BUY");
  const [minQuantity, setMinQuantity] = useState(1);
  const [alertEnabled, setAlertEnabled] = useState(true);
  const [followEnabled, setFollowEnabled] = useState(false);
  const [followDirection, setFollowDirection] =
    useState<TraderFollowDirection>("DIRECT");
  const [followSizing, setFollowSizing] = useState<TraderFollowSizing>("FIXED");
  const [fixedQuantity, setFixedQuantity] = useState(1);
  const [maxQuantity, setMaxQuantity] = useState<number | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    if (initialTraderAlias) {
      setTraderAlias(initialTraderAlias);
      setIsSelectingTrader(false);
    }
  }, [initialTraderAlias]);

  // Robust Persian-aware filter for traders
  const filteredTraders = useMemo(() => {
    const raw = traderSearch.trim();
    if (!raw) return traders;

    const q = normalizePersianText(raw);
    const compactQ = q.replace(/\s+/g, "");

    return traders.filter((t) => {
      const norm = normalizePersianText(t.alias);
      const compactNorm = norm.replace(/\s+/g, "");
      return norm.includes(q) || compactNorm.includes(compactQ);
    });
  }, [traders, traderSearch]);

  const selectedTraderMeta = useMemo(() => {
    if (!traderAlias) return null;
    return traders.find((t) => t.alias === traderAlias);
  }, [traders, traderAlias]);

  // Determine if typed search has an exact existing match
  const hasExactSearchMatch = useMemo(() => {
    const raw = traderSearch.trim();
    if (!raw) return true;
    const compact = normalizePersianText(raw).replace(/\s+/g, "");
    return traders.some(
      (t) => normalizePersianText(t.alias).replace(/\s+/g, "") === compact,
    );
  }, [traders, traderSearch]);

  const createMutation = useMutation(
    api.traderRules.create.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: api.traderRules.list.key(),
        });
        onOpenChange(false);
        onSuccess?.();
      },
      onError: (err) => {
        setErrorText(
          err instanceof Error ? err.message : "خطا در ثبت قانون معامله‌گر",
        );
      },
    }),
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorText(null);

    const alias = traderAlias.trim();
    if (!alias) {
      setErrorText("انتخاب یا تعیین معامله‌گر هدف الزامی است.");
      setIsSelectingTrader(true);
      return;
    }

    if (!alertEnabled && !followEnabled) {
      setErrorText(
        "حداقل یکی از اقدامات هشدار یا سفارش تعقیبی باید فعال باشد.",
      );
      return;
    }

    const payload: CreateTraderRuleInput = {
      traderAlias: alias,
      trigger,
      side,
      minQuantity: Math.max(1, minQuantity),
      alertEnabled,
      followEnabled,
      followDirection: followEnabled ? followDirection : null,
      followSizing: followEnabled ? followSizing : null,
      fixedQuantity:
        followEnabled && followSizing === "FIXED" ? fixedQuantity : null,
      maxQuantity:
        followEnabled && maxQuantity && maxQuantity > 0 ? maxQuantity : null,
    };

    createMutation.mutate(payload);
  };

  // Structured summary computation with concise phrasing
  const summaryScenario = useMemo(() => {
    const alias = traderAlias.trim();
    const triggerLabel =
      trigger === "ORDER_PLACED" ? "لفظ سفارش جدید" : "حواله معامله قطعی";
    const sideLabel =
      side === "BUY" ? "خرید" : side === "SELL" ? "فروش" : "خرید یا فروش";
    const sideColorClass =
      side === "BUY"
        ? "text-success font-bold"
        : side === "SELL"
          ? "text-danger font-bold"
          : "text-accent font-bold";
    const volumeLabel = `${formatNumber(Math.max(1, minQuantity))} واحد`;

    return {
      alias: alias || "معامله‌گر هدف",
      hasAlias: Boolean(alias),
      triggerLabel,
      sideLabel,
      sideColorClass,
      volumeLabel,
      hasAction: alertEnabled || followEnabled,
      alertAction: alertEnabled ? "ارسال پیام هشدار خصوصی در تلگرام" : null,
      followAction: followEnabled
        ? {
            directionLabel: followDirection === "DIRECT" ? "هم‌جهت" : "معکوس",
            sizingLabel:
              followSizing === "FIXED"
                ? `${formatNumber(fixedQuantity)} واحد ثابت`
                : "عین حجم تریدر",
            capLabel:
              maxQuantity && maxQuantity > 0
                ? `حداکثر تا سقف ${formatNumber(maxQuantity)} واحد`
                : "بدون سقف حجم",
          }
        : null,
    };
  }, [
    traderAlias,
    trigger,
    side,
    minQuantity,
    alertEnabled,
    followEnabled,
    followDirection,
    followSizing,
    fixedQuantity,
    maxQuantity,
  ]);

  return (
    <DrawerSheet
      open={open}
      onOpenChange={onOpenChange}
      snapPoints={[0.88, 1]}
      defaultSnapPoint={0.88}
      icon={<ShieldCheckIcon size={22} />}
      title="ثبت قانون معامله‌گر"
      description="رصد هوشمند رفتار تریدرهای گروه، دریافت هشدار و ارسال سفارش تعقیبی"
      footer={
        <div className="flex w-full gap-3">
          <Button
            data-base-ui-swipe-ignore
            form="create-trader-rule-form"
            isPending={createMutation.isPending}
            type="submit"
            fullWidth
            className="h-11 font-bold"
          >
            <CheckCircleIcon size={18} />
            {createMutation.isPending ? "در حال ثبت…" : "ثبت و فعال‌سازی قانون"}
          </Button>
          <Button
            data-base-ui-swipe-ignore
            isDisabled={createMutation.isPending}
            onPress={() => onOpenChange(false)}
            variant="secondary"
            className="h-11 px-5 font-semibold"
          >
            انصراف
          </Button>
        </div>
      }
    >
      <Form
        id="create-trader-rule-form"
        onSubmit={handleSubmit}
        className="flex flex-col gap-6 pb-4"
      >
        {/* Section 1: Target Trader Selection (Seamless Select & Search) */}
        <section
          aria-labelledby="target-trader-heading"
          className="border-border bg-surface shadow-xs flex flex-col gap-4 rounded-2xl border p-5"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserCircleIcon size={20} className="text-accent shrink-0" />
              <span
                id="target-trader-heading"
                className="text-foreground text-sm font-bold"
              >
                معامله‌گر هدف در گروه
              </span>
            </div>
            {traderAlias && !isSelectingTrader ? (
              <Button
                data-base-ui-swipe-ignore
                size="sm"
                variant="secondary"
                onPress={() => setIsSelectingTrader(true)}
                className="h-7 rounded-lg px-2.5 text-xs font-semibold"
              >
                <PenIcon size={13} className="shrink-0" />
                <span>تغییر معامله‌گر</span>
              </Button>
            ) : null}
          </div>

          {/* Mode A: Selected Trader Summary Badge */}
          {traderAlias && !isSelectingTrader ? (
            <div className="border-accent/40 bg-accent/8 flex items-center justify-between rounded-xl border p-3.5">
              <div className="flex items-center gap-3">
                <span className="bg-accent/20 text-accent grid size-10 shrink-0 place-items-center rounded-xl text-sm font-bold">
                  {traderAlias.slice(0, 1)}
                </span>
                <div className="flex flex-col gap-0.5">
                  <span className="text-foreground text-sm font-bold">
                    {traderAlias}
                  </span>
                  <span className="text-muted text-xs">
                    {selectedTraderMeta?.totalTrades
                      ? `${formatNumber(selectedTraderMeta.totalTrades)} معامله ثبت‌شده در سیستم`
                      : "معامله‌گر مشخص‌شده در گروه"}
                  </span>
                </div>
              </div>
              <CheckCircleIcon size={20} className="text-accent shrink-0" />
            </div>
          ) : (
            /* Mode B: Searchable Trader Picker List */
            <div className="flex flex-col gap-3">
              {/* Quick-tap Top Traders */}
              {topTraders.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="text-muted text-xs font-medium">
                    پرتراکنش‌ترین معامله‌گران:
                  </span>
                  <div
                    className="flex flex-wrap items-center gap-2"
                    role="group"
                    aria-label="معامله‌گران پرتراکنش"
                  >
                    {topTraders.map((t) => {
                      const isSelected = traderAlias === t.alias;
                      return (
                        <button
                          data-base-ui-swipe-ignore
                          key={t.alias}
                          type="button"
                          onClick={() => {
                            setTraderAlias(t.alias);
                            setIsSelectingTrader(false);
                            setTraderSearch("");
                            setErrorText(null);
                          }}
                          className={cn(
                            "inline-flex min-h-[38px] items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all",
                            "focus-visible:ring-accent focus-visible:outline-none focus-visible:ring-2",
                            isSelected
                              ? "border-accent bg-accent/15 text-accent ring-accent font-bold ring-1"
                              : "border-border bg-surface-secondary/60 text-foreground hover:bg-surface-secondary",
                          )}
                        >
                          <span className="bg-accent/20 text-accent grid size-5 shrink-0 place-items-center rounded-md text-[11px] font-bold">
                            {t.alias.slice(0, 1)}
                          </span>
                          <span>{t.alias}</span>
                          {t.totalTrades ? (
                            <span className="text-muted text-[10px]">
                              ({formatNumber(t.totalTrades)})
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Search & Filter Bar */}
              <div className="relative pt-1">
                <Input
                  data-base-ui-swipe-ignore
                  value={traderSearch}
                  onChange={(e) => setTraderSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (filteredTraders.length === 1) {
                        setTraderAlias(filteredTraders[0].alias);
                        setIsSelectingTrader(false);
                        setTraderSearch("");
                        setErrorText(null);
                      } else if (traderSearch.trim()) {
                        setTraderAlias(traderSearch.trim());
                        setIsSelectingTrader(false);
                        setTraderSearch("");
                        setErrorText(null);
                      }
                    }
                  }}
                  placeholder="جستجو یا تایپ نام معامله‌گر در گروه…"
                  className="h-10 w-full pr-9 text-xs"
                  aria-label="جستجوی معامله‌گر"
                />
                <MagnifierIcon
                  size={16}
                  className="text-muted pointer-events-none absolute right-3 top-3.5"
                />
                {traderSearch ? (
                  <button
                    data-base-ui-swipe-ignore
                    type="button"
                    onClick={() => setTraderSearch("")}
                    className="text-muted hover:text-foreground absolute left-3 top-3"
                  >
                    <CloseCircleIcon size={16} />
                  </button>
                ) : null}
              </div>

              {/* Use custom typed alias if no exact match */}
              {traderSearch.trim() && !hasExactSearchMatch && (
                <button
                  data-base-ui-swipe-ignore
                  type="button"
                  onClick={() => {
                    setTraderAlias(traderSearch.trim());
                    setIsSelectingTrader(false);
                    setTraderSearch("");
                    setErrorText(null);
                  }}
                  className="border-accent/40 bg-accent/10 text-accent hover:bg-accent/15 flex items-center gap-2 rounded-xl border border-dashed p-2.5 text-xs font-bold transition-colors"
                >
                  <UserPlusIcon size={16} className="shrink-0" />
                  <span>ثبت برای معامله‌گر: «{traderSearch.trim()}»</span>
                </button>
              )}

              {/* Scrollable list of active traders */}
              <div
                data-base-ui-swipe-ignore
                className="border-border/80 bg-surface-secondary/30 flex max-h-48 flex-col gap-1 overflow-y-auto rounded-xl border p-1.5"
                role="listbox"
                aria-label="فهرست معامله‌گران فعال"
              >
                {tradersQuery.isLoading && (
                  <div className="text-muted py-6 text-center text-xs">
                    در حال بارگذاری لیست معامله‌گران…
                  </div>
                )}

                {!tradersQuery.isLoading &&
                  filteredTraders.length === 0 &&
                  !traderSearch.trim() && (
                    <div className="text-muted py-6 text-center text-xs">
                      هیچ معامله‌گری یافت نشد.
                    </div>
                  )}

                {filteredTraders.map((t) => {
                  const isSelected = traderAlias === t.alias;
                  return (
                    <button
                      data-base-ui-swipe-ignore
                      key={t.alias}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        setTraderAlias(t.alias);
                        setIsSelectingTrader(false);
                        setTraderSearch("");
                        setErrorText(null);
                      }}
                      className={cn(
                        "flex items-center justify-between rounded-lg p-2.5 text-right text-xs transition-colors",
                        "hover:bg-surface-secondary focus-visible:ring-accent focus-visible:outline-none focus-visible:ring-2",
                        isSelected
                          ? "bg-accent/15 text-accent font-bold"
                          : "text-foreground",
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="bg-surface text-foreground border-border/80 grid size-7 shrink-0 place-items-center rounded-lg border text-xs font-bold">
                          {t.alias.slice(0, 1)}
                        </span>
                        <span className="font-semibold">{t.alias}</span>
                      </div>
                      <span className="text-muted text-[11px]">
                        {t.totalTrades
                          ? `${formatNumber(t.totalTrades)} معامله`
                          : "فعال"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Section 2: Trigger Condition & Side */}
        <section
          aria-labelledby="trigger-condition-heading"
          className="border-border bg-surface shadow-xs flex flex-col gap-5 rounded-2xl border p-5"
        >
          {/* Trigger Event Segmented Picker */}
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-col gap-1">
              <span
                id="trigger-condition-heading"
                className="text-foreground text-sm font-bold"
              >
                رویداد محرک قانون
              </span>
              <span className="text-muted text-xs">
                چه رویدادی در گروه، اجرای این قانون را فعال کند؟
              </span>
            </div>

            <div
              role="radiogroup"
              aria-label="نوع رویداد محرک"
              className="grid grid-cols-2 gap-3"
            >
              <button
                data-base-ui-swipe-ignore
                type="button"
                role="radio"
                aria-checked={trigger === "ORDER_PLACED"}
                onClick={() => setTrigger("ORDER_PLACED")}
                className={cn(
                  "flex min-h-[54px] flex-col justify-center rounded-xl border p-3 text-right transition-all",
                  "focus-visible:ring-accent focus-visible:outline-none focus-visible:ring-2",
                  trigger === "ORDER_PLACED"
                    ? "border-accent bg-accent/12 text-accent ring-accent font-bold ring-1"
                    : "border-border bg-surface-secondary/40 text-muted hover:text-foreground hover:bg-surface-secondary",
                )}
              >
                <div className="flex items-center gap-2 text-xs font-bold">
                  <DocumentTextIcon size={17} className="shrink-0" />
                  <span>لفظ سفارش</span>
                </div>
                <span className="text-muted mt-1 text-[11px]">
                  به‌محض ارسال لفظ در گروه
                </span>
              </button>

              <button
                data-base-ui-swipe-ignore
                type="button"
                role="radio"
                aria-checked={trigger === "TRADE_CONFIRMED"}
                onClick={() => setTrigger("TRADE_CONFIRMED")}
                className={cn(
                  "flex min-h-[54px] flex-col justify-center rounded-xl border p-3 text-right transition-all",
                  "focus-visible:ring-accent focus-visible:outline-none focus-visible:ring-2",
                  trigger === "TRADE_CONFIRMED"
                    ? "border-accent bg-accent/12 text-accent ring-accent font-bold ring-1"
                    : "border-border bg-surface-secondary/40 text-muted hover:text-foreground hover:bg-surface-secondary",
                )}
              >
                <div className="flex items-center gap-2 text-xs font-bold">
                  <CheckCircleIcon size={17} className="shrink-0" />
                  <span>حواله معامله قطعی</span>
                </div>
                <span className="text-muted mt-1 text-[11px]">
                  به‌محض ثبت حواله توسط بات
                </span>
              </button>
            </div>
          </div>

          {/* Trade Side Selector with Domain Semantics */}
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-col gap-1">
              <Label className="text-foreground text-sm font-bold">
                جهت معامله مدنظر
              </Label>
              <span className="text-muted text-xs">
                قانون فقط روی سفارش‌های این سمت از تریدر اعمال شود
              </span>
            </div>

            <div
              role="radiogroup"
              aria-label="جهت معامله تریدر"
              className="grid grid-cols-3 gap-2.5"
            >
              {/* BUY */}
              <button
                data-base-ui-swipe-ignore
                type="button"
                role="radio"
                aria-checked={side === "BUY"}
                onClick={() => setSide("BUY")}
                className={cn(
                  "flex min-h-[46px] items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition-all",
                  "focus-visible:ring-success focus-visible:outline-none focus-visible:ring-2",
                  side === "BUY"
                    ? "border-success bg-success/15 text-success ring-success ring-1"
                    : "border-border bg-surface-secondary/40 text-muted hover:text-foreground hover:bg-surface-secondary",
                )}
              >
                <AltArrowUpIcon size={17} className="shrink-0" />
                <span>خرید</span>
              </button>

              {/* SELL */}
              <button
                data-base-ui-swipe-ignore
                type="button"
                role="radio"
                aria-checked={side === "SELL"}
                onClick={() => setSide("SELL")}
                className={cn(
                  "flex min-h-[46px] items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition-all",
                  "focus-visible:ring-danger focus-visible:outline-none focus-visible:ring-2",
                  side === "SELL"
                    ? "border-danger bg-danger/15 text-danger ring-danger ring-1"
                    : "border-border bg-surface-secondary/40 text-muted hover:text-foreground hover:bg-surface-secondary",
                )}
              >
                <AltArrowDownIcon size={17} className="shrink-0" />
                <span>فروش</span>
              </button>

              {/* BOTH */}
              <button
                data-base-ui-swipe-ignore
                type="button"
                role="radio"
                aria-checked={side === "BOTH"}
                onClick={() => setSide("BOTH")}
                className={cn(
                  "flex min-h-[46px] items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition-all",
                  "focus-visible:ring-accent focus-visible:outline-none focus-visible:ring-2",
                  side === "BOTH"
                    ? "border-accent bg-accent/15 text-accent ring-accent ring-1"
                    : "border-border bg-surface-secondary/40 text-muted hover:text-foreground hover:bg-surface-secondary",
                )}
              >
                <RepeatIcon size={17} className="shrink-0" />
                <span>هر دو جهت</span>
              </button>
            </div>
          </div>

          {/* Min Volume Filter with Inline Compact Presets */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-foreground text-xs font-bold">
                حداقل حجم رویداد (واحد معامله)
              </Label>
              {/* Compact Inline Presets */}
              <div
                className="flex items-center gap-1"
                role="group"
                aria-label="مقادیر پیش‌فرض حداقل حجم"
              >
                {[1, 2, 5, 10, 20].map((val) => (
                  <button
                    data-base-ui-swipe-ignore
                    key={val}
                    type="button"
                    onClick={() => setMinQuantity(val)}
                    className={cn(
                      "h-6 min-w-7 rounded-md px-1.5 text-[11px] font-semibold transition-all",
                      minQuantity === val
                        ? "bg-accent/20 text-accent ring-accent/40 font-bold ring-1"
                        : "bg-surface-secondary/80 text-muted hover:text-foreground",
                    )}
                  >
                    {formatNumber(val)}
                  </button>
                ))}
              </div>
            </div>

            <NumberField
              value={minQuantity}
              onChange={(val) => setMinQuantity(Number(val) || 1)}
              minValue={1}
              variant="secondary"
              className="h-auto"
              aria-label="حداقل حجم رویداد برای تحریک قانون"
            >
              <NumberField.Group className="ring-0! flex h-11">
                <NumberField.IncrementButton
                  aria-label="افزایش حداقل حجم"
                  className="w-12 rounded-2xl rounded-e-none border-e border-s-0 font-bold"
                />
                <NumberField.Input
                  data-base-ui-swipe-ignore
                  className="flex-1 text-center text-sm font-bold"
                />
                <NumberField.DecrementButton
                  aria-label="کاهش حداقل حجم"
                  className="w-12 rounded-e-2xl rounded-s-none border-e-0 border-s font-bold"
                />
              </NumberField.Group>
            </NumberField>
          </div>
        </section>

        {/* Section 3: Actions & Responses */}
        <section
          aria-labelledby="actions-heading"
          className="flex flex-col gap-4"
        >
          <div className="flex items-center gap-2 px-1">
            <BoltIcon size={20} className="text-accent shrink-0" />
            <span
              id="actions-heading"
              className="text-foreground text-sm font-bold"
            >
              اقدامات و واکنش‌ها
            </span>
          </div>

          {/* Action 1: Telegram Alert Card with Interactive Clickable Header */}
          <div
            onClick={() => setAlertEnabled((prev) => !prev)}
            className={cn(
              "border-border bg-surface shadow-xs flex cursor-pointer select-none items-center justify-between gap-3.5 rounded-2xl border p-5 transition-colors",
              alertEnabled && "border-accent/40 bg-accent/2",
            )}
          >
            <div className="pointer-events-none flex items-start gap-3.5">
              <span className="bg-accent/10 text-accent mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl">
                <BellIcon size={20} />
              </span>
              <div className="flex flex-col gap-1">
                <span className="text-foreground text-sm font-bold">
                  هشدار فوری در تلگرام
                </span>
                <span className="text-muted text-xs leading-relaxed">
                  ارسال پیام خصوصی به ربات تلگرام در لحظه وقوع رویداد (بدون ریسک
                  مالی)
                </span>
              </div>
            </div>
            <div onClick={(e) => e.stopPropagation()}>
              <Switch
                isSelected={alertEnabled}
                onChange={setAlertEnabled}
                aria-label="فعال‌سازی هشدار تلگرامی"
              >
                <Switch.Content>
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                </Switch.Content>
              </Switch>
            </div>
          </div>

          {/* Action 2: Follow Order Card (Clean Separators, No Nested Boxes) */}
          <div
            className={cn(
              "border-border bg-surface shadow-xs flex flex-col rounded-2xl border p-5 transition-colors",
              followEnabled && "border-accent/40 bg-accent/2",
            )}
          >
            {/* Header Row */}
            <div
              onClick={() => setFollowEnabled((prev) => !prev)}
              className="flex cursor-pointer select-none items-center justify-between gap-3.5"
            >
              <div className="pointer-events-none flex items-start gap-3.5">
                <span className="bg-accent/10 text-accent mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl">
                  <BoltIcon size={20} />
                </span>
                <div className="flex flex-col gap-1">
                  <span className="text-foreground text-sm font-bold">
                    ارسال سفارش تعقیبی (کپی هوشمند)
                  </span>
                  <span className="text-muted text-xs leading-relaxed">
                    ارسال خودکار لفظ به گروه تلگرام با سشن متصل شما
                  </span>
                </div>
              </div>
              <div onClick={(e) => e.stopPropagation()}>
                <Switch
                  isSelected={followEnabled}
                  onChange={setFollowEnabled}
                  aria-label="فعال‌سازی ارسال سفارش تعقیبی"
                >
                  <Switch.Content>
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                  </Switch.Content>
                </Switch>
              </div>
            </div>

            {/* Follow Sub-settings when enabled (Separated by Divider Lines) */}
            {followEnabled && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="gap-4.5 mt-4 flex flex-col"
              >
                <div className="border-border/60 border-t" />

                {/* Sub-item 1: Direction */}
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-0.5">
                    <Label className="text-foreground text-xs font-bold">
                      جهت سفارش ارسالی به گروه
                    </Label>
                    <span className="text-muted text-[11px]">
                      جهت معامله شما نسبت به تصمیم تریدر هدف
                    </span>
                  </div>

                  <div
                    role="radiogroup"
                    aria-label="جهت سفارش ارسالی"
                    className="grid grid-cols-2 gap-2.5"
                  >
                    <button
                      data-base-ui-swipe-ignore
                      type="button"
                      role="radio"
                      aria-checked={followDirection === "DIRECT"}
                      onClick={() => setFollowDirection("DIRECT")}
                      className={cn(
                        "flex min-h-[52px] flex-col justify-center rounded-xl border p-2.5 text-right transition-all",
                        "focus-visible:ring-accent focus-visible:outline-none focus-visible:ring-2",
                        followDirection === "DIRECT"
                          ? "border-accent bg-accent/15 text-accent ring-accent font-bold ring-1"
                          : "border-border bg-surface-secondary/40 text-muted hover:text-foreground",
                      )}
                    >
                      <div className="flex items-center gap-1.5 text-xs font-bold">
                        <RepeatIcon size={16} className="shrink-0" />
                        <span>هم‌جهت با تریدر</span>
                      </div>
                      <span className="text-muted mt-0.5 text-[10px]">
                        ثبت در همان سمت معامله‌گر
                      </span>
                    </button>

                    <button
                      data-base-ui-swipe-ignore
                      type="button"
                      role="radio"
                      aria-checked={followDirection === "INVERSE"}
                      onClick={() => setFollowDirection("INVERSE")}
                      className={cn(
                        "flex min-h-[52px] flex-col justify-center rounded-xl border p-2.5 text-right transition-all",
                        "focus-visible:ring-accent focus-visible:outline-none focus-visible:ring-2",
                        followDirection === "INVERSE"
                          ? "border-accent bg-accent/15 text-accent ring-accent font-bold ring-1"
                          : "border-border bg-surface-secondary/40 text-muted hover:text-foreground",
                      )}
                    >
                      <div className="flex items-center gap-1.5 text-xs font-bold">
                        <RefreshIcon size={16} className="shrink-0" />
                        <span>معکوس (خلاف جهت)</span>
                      </div>
                      <span className="text-muted mt-0.5 text-[10px]">
                        ثبت در سمت مخالف معامله‌گر
                      </span>
                    </button>
                  </div>
                </div>

                <div className="border-border/60 border-t" />

                {/* Sub-item 2: Sizing Model */}
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-0.5">
                    <Label className="text-foreground text-xs font-bold">
                      نحوه تعیین حجم سفارش
                    </Label>
                    <span className="text-muted text-[11px]">
                      محاسبه حجم سفارش ارسالی به گروه
                    </span>
                  </div>

                  <div
                    role="radiogroup"
                    aria-label="نحوه تعیین حجم سفارش"
                    className="grid grid-cols-2 gap-2.5"
                  >
                    <button
                      data-base-ui-swipe-ignore
                      type="button"
                      role="radio"
                      aria-checked={followSizing === "FIXED"}
                      onClick={() => setFollowSizing("FIXED")}
                      className={cn(
                        "flex min-h-[52px] flex-col justify-center rounded-xl border p-2.5 text-right transition-all",
                        "focus-visible:ring-accent focus-visible:outline-none focus-visible:ring-2",
                        followSizing === "FIXED"
                          ? "border-accent bg-accent/15 text-accent ring-accent font-bold ring-1"
                          : "border-border bg-surface-secondary/40 text-muted hover:text-foreground",
                      )}
                    >
                      <div className="flex items-center gap-1.5 text-xs font-bold">
                        <LockIcon size={16} className="shrink-0" />
                        <span>حجم ثابت</span>
                      </div>
                      <span className="text-muted mt-0.5 text-[10px]">
                        ارسال همیشگی یک مقدار مشخص
                      </span>
                    </button>

                    <button
                      data-base-ui-swipe-ignore
                      type="button"
                      role="radio"
                      aria-checked={followSizing === "SAME"}
                      onClick={() => setFollowSizing("SAME")}
                      className={cn(
                        "flex min-h-[52px] flex-col justify-center rounded-xl border p-2.5 text-right transition-all",
                        "focus-visible:ring-accent focus-visible:outline-none focus-visible:ring-2",
                        followSizing === "SAME"
                          ? "border-accent bg-accent/15 text-accent ring-accent font-bold ring-1"
                          : "border-border bg-surface-secondary/40 text-muted hover:text-foreground",
                      )}
                    >
                      <div className="flex items-center gap-1.5 text-xs font-bold">
                        <CopyIcon size={16} className="shrink-0" />
                        <span>عین حجم تریدر</span>
                      </div>
                      <span className="text-muted mt-0.5 text-[10px]">
                        ارسال دقیقاً به اندازه حجم تریدر
                      </span>
                    </button>
                  </div>

                  {/* Fixed Quantity Input with Inline Presets */}
                  {followSizing === "FIXED" && (
                    <div className="mt-2 flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <Label className="text-foreground text-xs font-semibold">
                          حجم ثابت سفارش (واحد)
                        </Label>
                        <div
                          className="flex items-center gap-1"
                          role="group"
                          aria-label="مقادیر پیش‌فرض حجم ثابت"
                        >
                          {[1, 2, 5, 10].map((val) => (
                            <button
                              data-base-ui-swipe-ignore
                              key={val}
                              type="button"
                              onClick={() => setFixedQuantity(val)}
                              className={cn(
                                "h-6 min-w-7 rounded-md px-1.5 text-[11px] font-semibold transition-all",
                                fixedQuantity === val
                                  ? "bg-accent/20 text-accent ring-accent/40 font-bold ring-1"
                                  : "bg-surface-secondary text-muted hover:text-foreground",
                              )}
                            >
                              {formatNumber(val)}
                            </button>
                          ))}
                        </div>
                      </div>

                      <NumberField
                        value={fixedQuantity}
                        onChange={(val) => setFixedQuantity(Number(val) || 1)}
                        minValue={1}
                        variant="secondary"
                        className="h-auto"
                        aria-label="حجم ثابت سفارش ارسالی"
                      >
                        <NumberField.Group className="ring-0! flex h-10">
                          <NumberField.IncrementButton
                            aria-label="افزایش حجم ثابت"
                            className="w-10 rounded-xl rounded-e-none border-e border-s-0 font-bold"
                          />
                          <NumberField.Input
                            data-base-ui-swipe-ignore
                            className="flex-1 text-center text-sm font-bold"
                          />
                          <NumberField.DecrementButton
                            aria-label="کاهش حجم ثابت"
                            className="w-10 rounded-e-xl rounded-s-none border-e-0 border-s font-bold"
                          />
                        </NumberField.Group>
                      </NumberField>
                    </div>
                  )}
                </div>

                <div className="border-border/60 border-t" />

                {/* Sub-item 3: Risk Guardrail / Max Quantity Circuit Breaker */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <ShieldWarningIcon
                        size={16}
                        className="text-warning shrink-0"
                      />
                      <Label className="text-foreground text-xs font-bold">
                        سپر ایمنی: حداکثر سقف مجاز (واحد)
                      </Label>
                    </div>

                    {/* Inline presets */}
                    <div
                      className="flex items-center gap-1"
                      role="group"
                      aria-label="مقادیر پیش‌فرض سقف مجاز حجم"
                    >
                      {[5, 10, 20, 50].map((val) => (
                        <button
                          data-base-ui-swipe-ignore
                          key={val}
                          type="button"
                          onClick={() => setMaxQuantity(val)}
                          className={cn(
                            "h-6 min-w-7 rounded-md px-1.5 text-[11px] font-semibold transition-all",
                            maxQuantity === val
                              ? "bg-warning/25 text-warning ring-warning/40 font-bold ring-1"
                              : "bg-surface-secondary text-muted hover:text-foreground",
                          )}
                        >
                          {formatNumber(val)}
                        </button>
                      ))}
                      {maxQuantity !== null && (
                        <button
                          data-base-ui-swipe-ignore
                          type="button"
                          onClick={() => setMaxQuantity(null)}
                          className="text-muted hover:text-foreground border-border h-6 rounded-md border border-dashed px-1.5 text-[10px]"
                        >
                          حذف
                        </button>
                      )}
                    </div>
                  </div>

                  <span className="text-muted text-[11px] leading-relaxed">
                    جلوگیری از ارسال حجم‌های سنگین در صورت سفارش‌های بزرگ تریدر
                    هدف.
                  </span>

                  <NumberField
                    value={maxQuantity ?? undefined}
                    onChange={(val) => setMaxQuantity(val ? Number(val) : null)}
                    minValue={1}
                    variant="secondary"
                    className="h-auto"
                    aria-label="حداکثر سقف مجاز حجم سفارش"
                  >
                    <NumberField.Group className="ring-0! flex h-10">
                      <NumberField.IncrementButton
                        aria-label="افزایش سقف مجاز"
                        className="w-10 rounded-xl rounded-e-none border-e border-s-0 font-bold"
                      />
                      <NumberField.Input
                        data-base-ui-swipe-ignore
                        placeholder="بدون سقف (نامحدود)"
                        className="flex-1 text-center text-sm font-bold"
                      />
                      <NumberField.DecrementButton
                        aria-label="کاهش سقف مجاز"
                        className="w-10 rounded-e-xl rounded-s-none border-e-0 border-s font-bold"
                      />
                    </NumberField.Group>
                  </NumberField>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Section 4: Live Structured Scenario Summary (Clear Flow Logic) */}
        <section
          aria-label="خلاصه سناریوی تنظیمی"
          className="border-accent/30 bg-accent/6 shadow-xs flex flex-col gap-3 rounded-2xl border p-5"
        >
          <div className="flex items-center gap-2">
            <InfoCircleIcon size={18} className="text-accent shrink-0" />
            <span className="text-foreground text-xs font-bold">
              خلاصه سناریوی تنظیمی
            </span>
          </div>

          {!summaryScenario.hasAlias ? (
            <p className="text-muted text-xs">
              ابتدا معامله‌گر هدف را انتخاب نمایید تا خلاصه عملکرد قانون فعال
              شود.
            </p>
          ) : (
            <div className="flex flex-col gap-2.5 text-xs leading-relaxed">
              {/* Trigger Condition Statement */}
              <div className="flex items-start gap-2">
                <span className="bg-accent/20 text-accent shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold">
                  اگر
                </span>
                <span className="text-foreground">
                  <strong className="text-accent font-bold">
                    {summaryScenario.alias}
                  </strong>{" "}
                  اقدام به ثبت <strong>{summaryScenario.triggerLabel}</strong> (
                  <strong className={summaryScenario.sideColorClass}>
                    {summaryScenario.sideLabel}
                  </strong>
                  ) با حجم حداقل{" "}
                  <strong className="text-foreground font-bold">
                    {summaryScenario.volumeLabel}
                  </strong>{" "}
                  کرد:
                </span>
              </div>

              {/* Action Reactions Statement */}
              <div className="flex items-start gap-2">
                <span className="bg-surface-secondary text-foreground shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold">
                  آنگاه
                </span>
                <div className="text-foreground/90 flex flex-col gap-1.5">
                  {summaryScenario.alertAction ? (
                    <div className="flex items-center gap-1.5">
                      <BellIcon size={14} className="text-accent shrink-0" />
                      <span>{summaryScenario.alertAction}</span>
                    </div>
                  ) : null}

                  {summaryScenario.followAction ? (
                    <div className="flex items-center gap-1.5">
                      <BoltIcon size={14} className="text-accent shrink-0" />
                      <span>
                        سفارش{" "}
                        <strong className="font-bold">
                          {summaryScenario.followAction.directionLabel}
                        </strong>{" "}
                        با حجم{" "}
                        <strong className="font-bold">
                          {summaryScenario.followAction.sizingLabel}
                        </strong>{" "}
                        در گروه ارسال شود{" "}
                        <span className="text-muted font-normal">
                          ({summaryScenario.followAction.capLabel})
                        </span>
                        .
                      </span>
                    </div>
                  ) : null}

                  {!summaryScenario.hasAction ? (
                    <span className="text-danger font-bold">
                      هیچ واکنشی فعال نشده است (حداقل یک واکنش را فعال کنید).
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Error Announcement */}
        {errorText ? (
          <div
            role="alert"
            aria-live="assertive"
            className="border-danger/40 bg-danger/10 text-danger flex items-center gap-2.5 rounded-xl border p-3.5 text-xs font-medium"
          >
            <DangerCircleIcon size={18} className="shrink-0" />
            <span>{errorText}</span>
          </div>
        ) : null}
      </Form>
    </DrawerSheet>
  );
}
