import { useState, useEffect, useMemo } from "react";
import {
  Button,
  Card,
  Description,
  Form,
  Input,
  Label,
  ListBox,
  NumberField,
  Select,
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
import { useIdentity } from "../../shared/auth/auth";
import { useApi } from "../../shared/api/api-context";
import { DrawerSheet } from "../../shared/ui/drawer";

interface TraderRuleFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTraderAlias?: string | null;
  onSuccess?: () => void;
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

  // Query cached active traders to populate the selector
  const tradersQuery = useQuery(
    api.analytics.tradersV2.queryOptions({
      input: { sortBy: "TRADE_COUNT", sortOrder: "DESC", limit: 50 },
      staleTime: 60_000,
    }),
  );
  const traders = useMemo(() => tradersQuery.data ?? [], [tradersQuery.data]);

  const [traderAlias, setTraderAlias] = useState(initialTraderAlias ?? "");
  const [isManualInput, setIsManualInput] = useState(false);
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
      setIsManualInput(false);
    }
  }, [initialTraderAlias]);

  // Combined options list ensuring any pre-set alias is present
  const allTraderOptions = useMemo<
    {
      alias: string;
      totalTrades?: number;
    }[]
  >(() => {
    const list: { alias: string; totalTrades?: number }[] = traders.map(
      (t) => ({
        alias: t.alias,
        totalTrades: t.totalTrades,
      }),
    );
    if (traderAlias && !list.some((t) => t.alias === traderAlias)) {
      list.unshift({
        alias: traderAlias,
      });
    }
    return list;
  }, [traders, traderAlias]);

  const topTraders = useMemo(() => traders.slice(0, 4), [traders]);

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
      setErrorText("انتخاب یا ورود نام معامله‌گر الزامی است.");
      return;
    }

    if (!alertEnabled && !followEnabled) {
      setErrorText("حداقل یکی از اقدامات هشدار یا دنبال‌کردن باید فعال باشد.");
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

  return (
    <DrawerSheet
      open={open}
      onOpenChange={onOpenChange}
      title="تنظیم قانون معامله‌گر (Trader Rule)"
      description="تنظیم واکنش خودکار، هشدار تلگرامی و ارسال سفارش تعقیبی"
      snapPoints={[0.85, 1]}
      defaultSnapPoint={0.85}
    >
      <Form onSubmit={handleSubmit} className="space-y-6 pb-4">
        {/* Step 1: Target Trader Selection */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-foreground text-xs font-bold">
              معامله‌گر هدف (Trader Alias)
            </Label>
            <button
              type="button"
              onClick={() => setIsManualInput(!isManualInput)}
              className="text-accent text-xs font-medium transition-colors hover:underline"
            >
              {isManualInput ? "← انتخاب از لیست" : "تایپ دستی نام"}
            </button>
          </div>

          {isManualInput ? (
            <Input
              value={traderAlias}
              onChange={(e) => setTraderAlias(e.target.value)}
              placeholder="مثلاً: سناتور، رسول اُف"
              className="min-h-11 w-full"
              required
            />
          ) : (
            <Select
              fullWidth
              placeholder="انتخاب معامله‌گر از لیست فعال…"
              value={traderAlias || null}
              onChange={(val) => setTraderAlias(val ? String(val) : "")}
              className="w-full"
            >
              <Select.Trigger className="border-border bg-surface min-h-11 w-full rounded-2xl px-3">
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover className="border-border bg-surface max-h-60 overflow-y-auto rounded-2xl shadow-lg">
                <ListBox>
                  {allTraderOptions.map((t) => (
                    <ListBox.Item
                      key={t.alias}
                      id={t.alias}
                      textValue={t.alias}
                      className="hover:bg-surface-secondary px-3 py-2.5 text-sm transition-colors"
                    >
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className="text-foreground font-semibold">
                          {t.alias}
                        </span>
                        <span className="text-muted font-mono text-xs">
                          {t.totalTrades
                            ? `${t.totalTrades} معامله`
                            : "معامله‌گر جدید"}
                        </span>
                      </div>
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
          )}

          {/* Quick-tap Chips for top traders */}
          {topTraders.length > 0 && !isManualInput && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-muted text-[11px]">پرتراکنش:</span>
              {topTraders.map((t) => (
                <button
                  key={t.alias}
                  type="button"
                  onClick={() => setTraderAlias(t.alias)}
                  className={cn(
                    "min-h-7 rounded-xl border px-2.5 py-1 text-xs transition-colors",
                    traderAlias === t.alias
                      ? "border-accent bg-accent/20 text-accent font-bold"
                      : "border-border bg-surface-secondary text-foreground hover:bg-surface-tertiary",
                  )}
                >
                  {t.alias}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Step 2: Trigger Selection */}
        <div className="space-y-2">
          <Label className="text-foreground text-xs font-bold">
            رفتار محرک (Trigger Event)
          </Label>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setTrigger("ORDER_PLACED")}
              className={cn(
                "border-border bg-surface flex min-h-16 flex-col items-center justify-center rounded-2xl border p-3 text-center transition-all",
                trigger === "ORDER_PLACED"
                  ? "border-accent bg-accent/15 text-accent shadow-xs font-bold"
                  : "text-foreground hover:bg-surface-secondary",
              )}
            >
              <span className="text-sm font-bold">لفظ سفارش</span>
              <span className="text-muted mt-1 text-xs">
                ثبت سفارش در تابلوی گروه
              </span>
            </button>

            <button
              type="button"
              onClick={() => setTrigger("TRADE_CONFIRMED")}
              className={cn(
                "border-border bg-surface flex min-h-16 flex-col items-center justify-center rounded-2xl border p-3 text-center transition-all",
                trigger === "TRADE_CONFIRMED"
                  ? "border-accent bg-accent/15 text-accent shadow-xs font-bold"
                  : "text-foreground hover:bg-surface-secondary",
              )}
            >
              <span className="text-sm font-bold">معامله قطعی</span>
              <span className="text-muted mt-1 text-xs">
                صدور حواله رسمی ربات
              </span>
            </button>
          </div>
        </div>

        {/* Step 3: Filters: Side & Min Quantity */}
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-foreground text-xs font-bold">
              جهت معامله
            </Label>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { id: "BUY", label: "خرید" },
                  { id: "SELL", label: "فروش" },
                  { id: "BOTH", label: "هر دو" },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSide(item.id)}
                  className={cn(
                    "border-border bg-surface min-h-11 rounded-xl border py-2.5 text-center text-xs font-semibold transition-all",
                    side === item.id
                      ? "border-accent bg-accent/15 text-accent shadow-xs font-bold"
                      : "text-muted hover:bg-surface-secondary hover:text-foreground",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-foreground text-xs font-bold">
              حداقل حجم معامله (واحد)
            </Label>
            <NumberField
              value={minQuantity}
              onChange={(val) => setMinQuantity(Number(val) || 1)}
              minValue={1}
              className="min-h-11 w-full"
            />
          </div>
        </div>

        {/* Step 4: Actions (Alert & Follow) */}
        <div className="space-y-3.5">
          <Label className="text-foreground text-xs font-bold">
            واکنش‌های مدنظر (Actions)
          </Label>

          {/* Action 1: Alert */}
          <Card className="border-border bg-surface rounded-2xl border p-4">
            <Switch
              isSelected={alertEnabled}
              onChange={setAlertEnabled}
              className="flex w-full items-center justify-between gap-3"
            >
              <Switch.Content className="flex flex-col text-start">
                <Label className="text-foreground cursor-pointer text-sm font-bold">
                  هشدار تلگرامی (Alert)
                </Label>
                <Description className="text-muted mt-0.5 text-xs">
                  ارسال پیام خصوصی به تلگرام در لحظه وقوع رویداد
                </Description>
              </Switch.Content>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch>
          </Card>

          {/* Action 2: Follow */}
          <Card className="border-border bg-surface space-y-4 rounded-2xl border p-4">
            <Switch
              isSelected={followEnabled}
              onChange={setFollowEnabled}
              className="flex w-full items-center justify-between gap-3"
            >
              <Switch.Content className="flex flex-col text-start">
                <Label className="text-foreground cursor-pointer text-sm font-bold">
                  دنبال‌کردن خودکار (Follow)
                </Label>
                <Description className="text-muted mt-0.5 text-xs">
                  ارسال خودکار لفظ به گروه از طریق اکانت تلگرام شما
                </Description>
              </Switch.Content>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch>

            {followEnabled && (
              <div className="border-border/60 space-y-4 border-t pt-4">
                {/* Follow Direction */}
                <div className="space-y-2">
                  <Label className="text-muted text-xs font-semibold">
                    جهت سفارش تعقیبی
                  </Label>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setFollowDirection("DIRECT")}
                      className={cn(
                        "border-border min-h-14 rounded-xl border p-2.5 text-center transition-all",
                        followDirection === "DIRECT"
                          ? "border-accent bg-accent/15 text-accent font-bold"
                          : "text-foreground hover:bg-surface-secondary",
                      )}
                    >
                      <span className="block text-xs font-bold">
                        مستقیم (هم‌جهت)
                      </span>
                      <span className="text-muted mt-0.5 block text-[11px]">
                        خرید با خرید، فروش با فروش
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFollowDirection("INVERSE")}
                      className={cn(
                        "border-border min-h-14 rounded-xl border p-2.5 text-center transition-all",
                        followDirection === "INVERSE"
                          ? "border-accent bg-accent/15 text-accent font-bold"
                          : "text-foreground hover:bg-surface-secondary",
                      )}
                    >
                      <span className="block text-xs font-bold">
                        معکوس (خلاف‌جهت)
                      </span>
                      <span className="text-muted mt-0.5 block text-[11px]">
                        خرید با فروش، فروش با خرید
                      </span>
                    </button>
                  </div>
                </div>

                {/* Sizing Model */}
                <div className="space-y-2">
                  <Label className="text-muted text-xs font-semibold">
                    نحوه تعیین حجم
                  </Label>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setFollowSizing("FIXED")}
                      className={cn(
                        "border-border min-h-14 rounded-xl border p-2.5 text-center transition-all",
                        followSizing === "FIXED"
                          ? "border-accent bg-accent/15 text-accent font-bold"
                          : "text-foreground hover:bg-surface-secondary",
                      )}
                    >
                      <span className="block text-xs font-bold">حجم ثابت</span>
                      <span className="text-muted mt-0.5 block text-[11px]">
                        همیشه مقدار معین عددی
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFollowSizing("SAME")}
                      className={cn(
                        "border-border min-h-14 rounded-xl border p-2.5 text-center transition-all",
                        followSizing === "SAME"
                          ? "border-accent bg-accent/15 text-accent font-bold"
                          : "text-foreground hover:bg-surface-secondary",
                      )}
                    >
                      <span className="block text-xs font-bold">
                        هم‌حجم تریدر
                      </span>
                      <span className="text-muted mt-0.5 block text-[11px]">
                        عین حجم رویداد با سقف
                      </span>
                    </button>
                  </div>
                </div>

                {/* Sizing inputs */}
                <div className="grid grid-cols-2 gap-3">
                  {followSizing === "FIXED" && (
                    <div className="space-y-1.5">
                      <Label className="text-muted text-xs font-semibold">
                        حجم ثابت (واحد)
                      </Label>
                      <NumberField
                        value={fixedQuantity}
                        onChange={(val) => setFixedQuantity(Number(val) || 1)}
                        minValue={1}
                        className="min-h-11 w-full"
                      />
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label className="text-muted text-xs font-semibold">
                      حداکثر سقف مجاز (واحد)
                    </Label>
                    <NumberField
                      value={maxQuantity ?? undefined}
                      onChange={(val) =>
                        setMaxQuantity(val ? Number(val) : null)
                      }
                      minValue={1}
                      className="min-h-11 w-full"
                    />
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Step 5: Live Natural Language Summary */}
        <div className="border-border bg-surface-secondary/70 text-foreground/90 rounded-2xl border p-4 text-xs leading-relaxed">
          <div className="text-accent mb-1.5 flex items-center gap-1.5 font-bold">
            <span>⚡ پیش‌نمایش عملکرد قانون:</span>
          </div>
          <p>
            هرگاه{" "}
            <strong className="text-foreground">
              «{traderAlias.trim() || "معامله‌گر انتخابی"}»
            </strong>{" "}
            در گروه {trigger === "ORDER_PLACED" ? "سفارش لفظ" : "معامله قطعی"}{" "}
            {side === "BUY"
              ? "خرید"
              : side === "SELL"
                ? "فروش"
                : "خرید یا فروش"}{" "}
            با حداقل{" "}
            <strong className="text-foreground">{minQuantity} واحد</strong>{" "}
            انجام داد:
          </p>
          <ul className="text-muted mt-2 list-inside list-disc space-y-1">
            {alertEnabled && <li>ارسال پیام هشدار لحظه‌ای در تلگرام</li>}
            {followEnabled && (
              <li>
                ارسال خودکار سفارش{" "}
                <span className="text-foreground font-semibold">
                  {followDirection === "DIRECT" ? "هم‌جهت" : "معکوس"}
                </span>{" "}
                با حجم{" "}
                <span className="text-foreground font-semibold">
                  {followSizing === "FIXED"
                    ? `${fixedQuantity} واحد`
                    : `معادل تریدر ${maxQuantity ? `(تا سقف ${maxQuantity} واحد)` : ""}`}
                </span>
              </li>
            )}
            {!alertEnabled && !followEnabled && (
              <li className="text-danger font-semibold">
                توجه: هیچ واکنشی (هشدار یا دنبال‌کردن) فعال نیست!
              </li>
            )}
          </ul>
        </div>

        {errorText && (
          <div className="text-danger bg-danger/10 rounded-xl p-3 text-center text-xs font-medium">
            {errorText}
          </div>
        )}

        {/* Submit Button */}
        <Button
          type="submit"
          variant="primary"
          className="min-h-12 w-full rounded-2xl py-3 text-sm font-bold"
          isDisabled={createMutation.isPending}
        >
          {createMutation.isPending
            ? "در حال ثبت قانون…"
            : "ثبت و فعال‌سازی قانون"}
        </Button>
      </Form>
    </DrawerSheet>
  );
}
