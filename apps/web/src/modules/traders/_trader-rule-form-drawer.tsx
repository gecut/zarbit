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
import { useIdentity } from "../../shared/auth/auth";
import { useApi } from "../../shared/api/api-context";
import { DrawerSheet } from "../../shared/ui/drawer";
import { ShieldCheckIcon } from "@solar-icons/react/linear";

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

  // Query cached active traders to offer quick 1-tap selection chips
  const tradersQuery = useQuery(
    api.analytics.tradersV2.queryOptions({
      input: { sortBy: "TRADE_COUNT", sortOrder: "DESC", limit: 30 },
      staleTime: 60_000,
    }),
  );
  const traders = useMemo(() => tradersQuery.data ?? [], [tradersQuery.data]);
  const topTraders = useMemo(() => traders.slice(0, 5), [traders]);

  const [traderAlias, setTraderAlias] = useState(initialTraderAlias ?? "");
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
    }
  }, [initialTraderAlias]);

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

  return (
    <DrawerSheet
      open={open}
      onOpenChange={onOpenChange}
      icon={<ShieldCheckIcon size={22} />}
      title="ثبت قانون معامله‌گر"
      description="رصد خودکار رفتار تریدرهای گروه، دریافت هشدار یا ارسال سفارش تعقیبی"
      footer={
        <div className="flex w-full gap-4">
          <Button
            data-base-ui-swipe-ignore
            form="create-trader-rule-form"
            isPending={createMutation.isPending}
            type="submit"
            fullWidth
          >
            {createMutation.isPending ? "در حال ثبت…" : "ثبت و فعال‌سازی قانون"}
          </Button>
          <Button
            data-base-ui-swipe-ignore
            isDisabled={createMutation.isPending}
            onPress={() => onOpenChange(false)}
            variant="secondary"
          >
            انصراف
          </Button>
        </div>
      }
    >
      <Form
        id="create-trader-rule-form"
        onSubmit={handleSubmit}
        className="flex flex-col gap-5 pb-2"
      >
        {/* Section 1: Target Trader Selection */}
        <div className="flex flex-col gap-2">
          <Label className="text-foreground text-xs font-bold">
            معامله‌گر هدف
          </Label>

          {/* Quick-tap Chips for top traders */}
          {topTraders.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pb-0.5">
              <span className="text-muted text-[11px]">پرتراکنش:</span>
              {topTraders.map((t) => (
                <Button
                  data-base-ui-swipe-ignore
                  key={t.alias}
                  type="button"
                  size="sm"
                  variant={traderAlias === t.alias ? "primary" : "secondary"}
                  onPress={() => setTraderAlias(t.alias)}
                  className={cn(
                    "h-7 rounded-xl px-2.5 text-xs font-semibold transition-colors",
                    traderAlias === t.alias && "font-bold",
                  )}
                >
                  {t.alias}
                </Button>
              ))}
            </div>
          )}

          <Input
            data-base-ui-swipe-ignore
            value={traderAlias}
            onChange={(e) => setTraderAlias(e.target.value)}
            placeholder="نام یا شناسه معامله‌گر (مثلاً: سناتور، رسول)"
            className="w-full text-sm"
            required
          />
        </div>

        {/* Section 2: Trigger Event & Trade Side */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label className="text-foreground text-xs font-bold">
              رویداد محرک
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                data-base-ui-swipe-ignore
                type="button"
                onPress={() => setTrigger("ORDER_PLACED")}
                className="h-10 text-xs font-bold"
                variant={trigger === "ORDER_PLACED" ? "primary" : "secondary"}
              >
                لفظ سفارش
              </Button>
              <Button
                data-base-ui-swipe-ignore
                type="button"
                onPress={() => setTrigger("TRADE_CONFIRMED")}
                className="h-10 text-xs font-bold"
                variant={
                  trigger === "TRADE_CONFIRMED" ? "primary" : "secondary"
                }
              >
                معامله قطعی
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-foreground text-xs font-bold">
              جهت معامله تریدر
            </Label>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { id: "BUY", label: "خرید" },
                  { id: "SELL", label: "فروش" },
                  { id: "BOTH", label: "هر دو" },
                ] as const
              ).map((item) => (
                <Button
                  data-base-ui-swipe-ignore
                  key={item.id}
                  type="button"
                  onPress={() => setSide(item.id)}
                  className="h-10 text-xs font-bold"
                  variant={side === item.id ? "primary" : "secondary"}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Section 3: Min Volume Filter */}
        <div className="flex flex-col gap-2">
          <NumberField
            value={minQuantity}
            onChange={(val) => setMinQuantity(Number(val) || 1)}
            minValue={1}
            variant="secondary"
            className="h-auto"
          >
            <Label>حداقل حجم رویداد برای تحریک قانون (واحد)</Label>
            <NumberField.Group className="ring-0! flex h-11">
              <NumberField.IncrementButton className="w-11 rounded-2xl rounded-e-none border-e border-s-0" />
              <NumberField.Input
                data-base-ui-swipe-ignore
                className="flex-1 text-center font-mono font-bold"
              />
              <NumberField.DecrementButton className="w-11 rounded-e-2xl rounded-s-none border-e-0 border-s" />
            </NumberField.Group>
          </NumberField>
        </div>

        {/* Section 4: Actions (Alert & Follow) */}
        <div className="flex flex-col gap-3">
          <Label className="text-foreground text-xs font-bold">
            واکنش‌ها و اقدامات
          </Label>

          {/* Alert Toggle */}
          <div className="border-border bg-surface flex items-center justify-between rounded-2xl border p-3.5 transition-colors">
            <div className="flex flex-col gap-0.5">
              <span className="text-foreground text-sm font-bold">
                🔔 هشدار تلگرامی
              </span>
              <span className="text-muted text-xs">
                ارسال پیام خصوصی به تلگرام شما در لحظه وقوع رویداد
              </span>
            </div>
            <Switch isSelected={alertEnabled} onChange={setAlertEnabled}>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch>
          </div>

          {/* Follow Toggle */}
          <div className="border-border bg-surface flex flex-col gap-3 rounded-2xl border p-3.5 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <span className="text-foreground text-sm font-bold">
                  ⚡ ارسال سفارش تعقیبی
                </span>
                <span className="text-muted text-xs">
                  ارسال خودکار لفظ به گروه با اکانت متصل شما
                </span>
              </div>
              <Switch isSelected={followEnabled} onChange={setFollowEnabled}>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch>
            </div>

            {/* Follow Sub-settings */}
            {followEnabled && (
              <div className="border-border/60 bg-surface-secondary/40 flex flex-col gap-3.5 rounded-xl border p-3">
                {/* Direction */}
                <div className="flex flex-col gap-1.5">
                  <Label className="text-muted text-xs font-semibold">
                    جهت سفارش ارسالی
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      data-base-ui-swipe-ignore
                      type="button"
                      onPress={() => setFollowDirection("DIRECT")}
                      className="h-9 text-xs font-bold"
                      variant={
                        followDirection === "DIRECT" ? "primary" : "secondary"
                      }
                    >
                      هم‌جهت با تریدر
                    </Button>
                    <Button
                      data-base-ui-swipe-ignore
                      type="button"
                      onPress={() => setFollowDirection("INVERSE")}
                      className="h-9 text-xs font-bold"
                      variant={
                        followDirection === "INVERSE" ? "primary" : "secondary"
                      }
                    >
                      معکوس (خلاف جهت)
                    </Button>
                  </div>
                </div>

                {/* Sizing Model */}
                <div className="flex flex-col gap-1.5">
                  <Label className="text-muted text-xs font-semibold">
                    نحوه تعیین حجم
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      data-base-ui-swipe-ignore
                      type="button"
                      onPress={() => setFollowSizing("FIXED")}
                      className="h-9 text-xs font-bold"
                      variant={
                        followSizing === "FIXED" ? "primary" : "secondary"
                      }
                    >
                      حجم ثابت
                    </Button>
                    <Button
                      data-base-ui-swipe-ignore
                      type="button"
                      onPress={() => setFollowSizing("SAME")}
                      className="h-9 text-xs font-bold"
                      variant={
                        followSizing === "SAME" ? "primary" : "secondary"
                      }
                    >
                      عین حجم تریدر
                    </Button>
                  </div>
                </div>

                {/* Quantity Inputs */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  {followSizing === "FIXED" ? (
                    <div className="col-span-2 flex flex-col gap-1 sm:col-span-1">
                      <Label className="text-muted text-xs font-semibold">
                        حجم ثابت (واحد)
                      </Label>
                      <NumberField
                        value={fixedQuantity}
                        onChange={(val) => setFixedQuantity(Number(val) || 1)}
                        minValue={1}
                        variant="secondary"
                        className="h-auto"
                      >
                        <NumberField.Group className="ring-0! flex h-10">
                          <NumberField.IncrementButton className="w-10 rounded-xl rounded-e-none border-e border-s-0" />
                          <NumberField.Input
                            data-base-ui-swipe-ignore
                            className="flex-1 text-center font-mono"
                          />
                          <NumberField.DecrementButton className="w-10 rounded-e-xl rounded-s-none border-e-0 border-s" />
                        </NumberField.Group>
                      </NumberField>
                    </div>
                  ) : null}

                  <div
                    className={cn(
                      "flex flex-col gap-1",
                      followSizing === "FIXED"
                        ? "col-span-2 sm:col-span-1"
                        : "col-span-2",
                    )}
                  >
                    <Label className="text-muted text-xs font-semibold">
                      حداکثر سقف مجاز (اختیاری)
                    </Label>
                    <NumberField
                      value={maxQuantity ?? undefined}
                      onChange={(val) =>
                        setMaxQuantity(val ? Number(val) : null)
                      }
                      minValue={1}
                      variant="secondary"
                      className="h-auto"
                    >
                      <NumberField.Group className="ring-0! flex h-10">
                        <NumberField.IncrementButton className="w-10 rounded-xl rounded-e-none border-e border-s-0" />
                        <NumberField.Input
                          data-base-ui-swipe-ignore
                          placeholder="بدون سقف"
                          className="flex-1 text-center font-mono"
                        />
                        <NumberField.DecrementButton className="w-10 rounded-e-xl rounded-s-none border-e-0 border-s" />
                      </NumberField.Group>
                    </NumberField>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {errorText ? (
          <div className="border-danger bg-danger/10 text-danger rounded-xl border p-3 text-center text-xs font-medium">
            {errorText}
          </div>
        ) : null}
      </Form>
    </DrawerSheet>
  );
}
