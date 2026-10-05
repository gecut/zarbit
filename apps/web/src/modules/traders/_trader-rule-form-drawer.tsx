import { useState, useEffect } from "react";
import {
  Button,
  Card,
  Form,
  Input,
  Label,
  NumberField,
  cn,
} from "@heroui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
      setErrorText("نام معامله‌گر الزامی است.");
      return;
    }

    if (!alertEnabled && !followEnabled) {
      setErrorText("حداقل یکی از اقدامات هشدار یا دنبال‌کردن باید انتخاب شود.");
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
    >
      <Form onSubmit={handleSubmit} className="space-y-4">
        {/* Trader Alias */}
        <div className="space-y-1.5">
          <Label className="text-muted text-xs font-semibold">
            نام معامله‌گر (Alias)
          </Label>
          <Input
            value={traderAlias}
            onChange={(e) => setTraderAlias(e.target.value)}
            placeholder="مثلاً: سناتور، رسول"
            className="w-full"
            required
          />
        </div>

        {/* Trigger Selection */}
        <div className="space-y-1.5">
          <Label className="text-muted text-xs font-semibold">
            رفتار محرک (Trigger)
          </Label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTrigger("ORDER_PLACED")}
              className={cn(
                "border-border bg-surface flex flex-col items-center justify-center rounded-2xl border p-3 text-center transition-colors",
                trigger === "ORDER_PLACED" &&
                  "border-accent bg-accent/10 text-accent font-semibold",
              )}
            >
              <span className="text-sm font-semibold">لفظ معامله‌گر</span>
              <span className="text-muted mt-1 text-[11px]">
                ثبت سفارش در تابلوی گروه
              </span>
            </button>

            <button
              type="button"
              onClick={() => setTrigger("TRADE_CONFIRMED")}
              className={cn(
                "border-border bg-surface flex flex-col items-center justify-center rounded-2xl border p-3 text-center transition-colors",
                trigger === "TRADE_CONFIRMED" &&
                  "border-accent bg-accent/10 text-accent font-semibold",
              )}
            >
              <span className="text-sm font-semibold">معامله قطعی</span>
              <span className="text-muted mt-1 text-[11px]">
                صدور حواله رسمی توسط ربات
              </span>
            </button>
          </div>
        </div>

        {/* Filters: Side & Min Quantity */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-muted text-xs font-semibold">
              جهت معامله
            </Label>
            <div className="grid grid-cols-3 gap-1">
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
                    "border-border bg-surface rounded-xl border py-2 text-center text-xs transition-colors",
                    side === item.id &&
                      "border-accent bg-accent/15 text-accent font-bold",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-muted text-xs font-semibold">
              حداقل حجم (واحد)
            </Label>
            <NumberField
              value={minQuantity}
              onChange={(val) => setMinQuantity(Number(val) || 1)}
              minValue={1}
              className="w-full"
            />
          </div>
        </div>

        {/* Action 1: Alert */}
        <Card className="border-border bg-surface rounded-2xl border p-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-foreground text-sm font-semibold">
                هشدار تلگرامی (Alert)
              </span>
              <p className="text-muted text-[11px]">
                ارسال پیام خصوصی به تلگرام در لحظه وقوع رویداد
              </p>
            </div>
            <input
              type="checkbox"
              checked={alertEnabled}
              onChange={(e) => setAlertEnabled(e.target.checked)}
              className="accent-accent size-5 rounded"
            />
          </div>
        </Card>

        {/* Action 2: Follow */}
        <Card className="border-border bg-surface space-y-3 rounded-2xl border p-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-foreground text-sm font-semibold">
                دنبال‌کردن خودکار (Follow)
              </span>
              <p className="text-muted text-[11px]">
                ارسال خودکار لفظ به گروه از طریق اکانت تلگرام شما
              </p>
            </div>
            <input
              type="checkbox"
              checked={followEnabled}
              onChange={(e) => setFollowEnabled(e.target.checked)}
              className="accent-accent size-5 rounded"
            />
          </div>

          {followEnabled && (
            <div className="border-border/60 space-y-3 border-t pt-3">
              {/* Follow Direction */}
              <div className="space-y-1.5">
                <Label className="text-muted text-xs">جهت دنبال‌کردن</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFollowDirection("DIRECT")}
                    className={cn(
                      "border-border rounded-xl border py-2 text-xs transition-colors",
                      followDirection === "DIRECT" &&
                        "border-accent bg-accent/15 text-accent font-bold",
                    )}
                  >
                    مستقیم (همان جهت تریدر)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFollowDirection("INVERSE")}
                    className={cn(
                      "border-border rounded-xl border py-2 text-xs transition-colors",
                      followDirection === "INVERSE" &&
                        "border-accent bg-accent/15 text-accent font-bold",
                    )}
                  >
                    معکوس (خلاف جهت تریدر)
                  </button>
                </div>
              </div>

              {/* Sizing Model */}
              <div className="space-y-1.5">
                <Label className="text-muted text-xs">مدل تعیین حجم</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFollowSizing("FIXED")}
                    className={cn(
                      "border-border rounded-xl border py-2 text-xs transition-colors",
                      followSizing === "FIXED" &&
                        "border-accent bg-accent/15 text-accent font-bold",
                    )}
                  >
                    حجم ثابت
                  </button>
                  <button
                    type="button"
                    onClick={() => setFollowSizing("SAME")}
                    className={cn(
                      "border-border rounded-xl border py-2 text-xs transition-colors",
                      followSizing === "SAME" &&
                        "border-accent bg-accent/15 text-accent font-bold",
                    )}
                  >
                    هم‌حجم تریدر
                  </button>
                </div>
              </div>

              {/* Sizing inputs */}
              <div className="grid grid-cols-2 gap-2">
                {followSizing === "FIXED" && (
                  <div className="space-y-1">
                    <Label className="text-muted text-[11px]">
                      حجم ثابت (واحد)
                    </Label>
                    <NumberField
                      value={fixedQuantity}
                      onChange={(val) => setFixedQuantity(Number(val) || 1)}
                      minValue={1}
                      className="w-full"
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <Label className="text-muted text-[11px]">
                    حداکثر سقف مجاز (واحد)
                  </Label>
                  <NumberField
                    value={maxQuantity ?? undefined}
                    onChange={(val) => setMaxQuantity(val ? Number(val) : null)}
                    minValue={1}
                    className="w-full"
                  />
                </div>
              </div>
            </div>
          )}
        </Card>

        {errorText && (
          <div className="text-danger bg-danger/10 rounded-xl p-2.5 text-center text-xs font-medium">
            {errorText}
          </div>
        )}

        <Button
          type="submit"
          variant="primary"
          className="w-full rounded-2xl py-3 text-sm font-bold"
          isDisabled={createMutation.isPending}
        >
          {createMutation.isPending
            ? "در حال ثبت قانون…"
            : "ثبت قانون معامله‌گر"}
        </Button>
      </Form>
    </DrawerSheet>
  );
}
