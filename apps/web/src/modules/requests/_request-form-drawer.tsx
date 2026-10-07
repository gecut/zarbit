import { useQueryClient } from "@tanstack/react-query";
import { useIdentity } from "../../shared/auth/auth";
import { useRequestActions } from "./_use-request-actions";
import { AlertDialog, Button, cn, Form } from "@heroui/react";
import { useEffect, useRef, useState } from "react";
import { AddCircleIcon } from "@solar-icons/react/linear/add-circle";
import {
  type CreateRequestInput,
  type RequestPriceMode,
} from "@zarbit/contracts";
import { formatNumber } from "@zarbit/format";
import { toAsciiDigits } from "@zarbit/domain";

import { useApi } from "../../shared/api/api-context";
import { DrawerSheet } from "../../shared/ui/drawer";
import {
  actionIcons,
  actionLabels,
  conditionOptions,
  userMessage,
} from "./_request-view-model";
import {
  clearCreationIntent,
  getOrCreateCreationIntent,
  loadCreationIntent,
} from "./_request-creation-intent";
import { RequestPreviewCard } from "./_request-preview-card";

const emptyTargetPrice = Number.NaN;

const conditionDescriptions: Record<
  CreateRequestInput["condition"],
  { title: string; desc: string }
> = {
  LTE: {
    title: "مظنه کمتر یا مساوی (≤)",
    desc: "اجرا هنگام رسیدن یا افت قیمت بازار به کمتر از قیمت هدف",
  },
  GTE: {
    title: "مظنه بیشتر یا مساوی (≥)",
    desc: "اجرا هنگام رسیدن یا رشد قیمت بازار به بیشتر از قیمت هدف",
  },
};

export function RequestFormDrawer({
  open,
  onOpenChange,
  onDone,
  initialAction = "ALERT",
  currentTradePrice,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => Promise<void>;
  initialAction?: CreateRequestInput["action"];
  currentTradePrice?: number;
}) {
  const identity = useIdentity();
  const api = useApi(identity.telegramUserId);
  const queryClient = useQueryClient();
  const { create } = useRequestActions();

  const defaultCondition = initialAction === "SELL" ? "GTE" : "LTE";

  const [action, setAction] =
    useState<CreateRequestInput["action"]>(initialAction);
  const [condition, setCondition] =
    useState<CreateRequestInput["condition"]>(defaultCondition);
  const [priceMode, setPriceMode] = useState<RequestPriceMode>("TARGET_PRICE");
  const [price, setPrice] = useState(emptyTargetPrice);
  const [units, setUnits] = useState(1);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const submittingRef = useRef(false);
  const forceClosingRef = useRef(false);
  const wasOpenRef = useRef(false);
  const initialPriceRef = useRef(emptyTargetPrice);
  const priceEditedRef = useRef(false);
  const quoteRequestRef = useRef(0);

  const isDirty =
    !forceClosingRef.current &&
    (action !== initialAction ||
      condition !== defaultCondition ||
      priceMode !== "TARGET_PRICE" ||
      (Number.isFinite(price) &&
        Number.isFinite(initialPriceRef.current) &&
        price !== initialPriceRef.current) ||
      units !== 1);

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return;
    }

    // If the drawer was already open, do not re-initialize on background prop changes
    if (wasOpenRef.current) {
      return;
    }
    wasOpenRef.current = true;
    forceClosingRef.current = false;

    const saved = loadCreationIntent(identity.telegramUserId);
    if (saved) {
      setAction(saved.action);
      setCondition(saved.condition);
      setPrice(saved.targetPrice);
      setUnits(saved.units ?? 1);
      if (saved.priceMode) setPriceMode(saved.priceMode);
      priceEditedRef.current = true;
      initialPriceRef.current = saved.targetPrice;
      setError(null);
      return;
    }

    setAction(initialAction);
    setCondition(initialAction === "SELL" ? "GTE" : "LTE");
    setPriceMode("TARGET_PRICE");
    setUnits(1);
    const requestId = ++quoteRequestRef.current;
    priceEditedRef.current = false;
    setError(null);

    const fallbackPrice =
      typeof currentTradePrice === "number" &&
      Number.isSafeInteger(currentTradePrice) &&
      currentTradePrice > 0
        ? currentTradePrice
        : emptyTargetPrice;

    initialPriceRef.current = fallbackPrice;
    setPrice(fallbackPrice);

    void queryClient
      .fetchQuery(api.market.snapshot.queryOptions())
      .then((dashboard) => {
        if (requestId !== quoteRequestRef.current || priceEditedRef.current)
          return;

        const latestPrice = dashboard.trade?.compactPrice;
        const nextPrice =
          typeof latestPrice === "number" &&
          Number.isSafeInteger(latestPrice) &&
          latestPrice > 0
            ? latestPrice
            : fallbackPrice;

        if (Number.isFinite(nextPrice) && nextPrice > 0) {
          initialPriceRef.current = nextPrice;
          setPrice(nextPrice);
        }
      })
      .catch(() => {
        if (requestId !== quoteRequestRef.current || priceEditedRef.current)
          return;
        initialPriceRef.current = fallbackPrice;
        setPrice(fallbackPrice);
      });

    return () => {
      quoteRequestRef.current += 1;
    };
  }, [
    api,
    currentTradePrice,
    identity.telegramUserId,
    initialAction,
    open,
    queryClient,
  ]);

  const reset = () => {
    clearCreationIntent(identity.telegramUserId);
    setAction(initialAction);
    setCondition(initialAction === "SELL" ? "GTE" : "LTE");
    setPriceMode("TARGET_PRICE");
    const defaultP =
      typeof currentTradePrice === "number" && currentTradePrice > 0
        ? currentTradePrice
        : emptyTargetPrice;
    initialPriceRef.current = defaultP;
    priceEditedRef.current = false;
    setPrice(defaultP);
    setUnits(1);
    setError(null);
  };

  const close = () => {
    forceClosingRef.current = true;
    reset();
    onOpenChange(false);
  };

  const requestClose = () => {
    if (pending) return;
    if (isDirty) {
      setDiscardOpen(true);
      return;
    }
    close();
  };

  const handleDiscard = () => {
    forceClosingRef.current = true;
    setDiscardOpen(false);
    reset();
    onOpenChange(false);
  };

  const adjustPrice = (delta: number) => {
    priceEditedRef.current = true;
    setPrice((prev) => {
      const base =
        Number.isSafeInteger(prev) && prev > 0
          ? prev
          : initialPriceRef.current > 0
            ? initialPriceRef.current
            : typeof currentTradePrice === "number" && currentTradePrice > 0
              ? currentTradePrice
              : 100_000;
      return Math.max(10, Math.round(base + delta));
    });
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current || pending) return;

    const targetPrice = price;
    const requestedUnits = units;

    if (!Number.isInteger(targetPrice) || targetPrice <= 0) {
      setError("قیمت هدف را به‌صورت عدد صحیح و مثبت وارد کنید.");
      return;
    }
    if (
      action !== "ALERT" &&
      (!Number.isInteger(requestedUnits) || requestedUnits <= 0)
    ) {
      setError("تعداد را به‌صورت عدد صحیح و مثبت وارد کنید.");
      return;
    }

    submittingRef.current = true;
    setPending(true);
    setError(null);

    const intent = getOrCreateCreationIntent(identity.telegramUserId, {
      action,
      condition,
      targetPrice,
      units: action === "ALERT" ? null : requestedUnits,
      priceMode: action === "ALERT" ? "TARGET_PRICE" : priceMode,
    });

    try {
      await create.mutateAsync({
        action: intent.action,
        condition: intent.condition,
        targetPrice: intent.targetPrice,
        units: intent.units,
        priceMode: intent.priceMode,
        creationKey: intent.creationKey,
      });
      forceClosingRef.current = true;
      clearCreationIntent(identity.telegramUserId);
      reset();
      try {
        await onDone();
      } catch (doneError) {
        console.error(
          "onDone callback failed after request creation:",
          doneError,
        );
      }
    } catch (submitError) {
      setError(userMessage(submitError));
    } finally {
      submittingRef.current = false;
      setPending(false);
    }
  };

  return (
    <>
      <DrawerSheet
        onOpenChange={(nextOpen, details) => {
          if (!nextOpen && !forceClosingRef.current && (pending || isDirty)) {
            details.cancel();
            if (!pending) setDiscardOpen(true);
            return;
          }
          if (!nextOpen) {
            forceClosingRef.current = false;
            reset();
          }
          onOpenChange(nextOpen);
        }}
        open={open}
        icon={<AddCircleIcon size={22} />}
        title="ثبت درخواست جدید"
        description="با معاملهٔ تأییدشدهٔ بعدی، شرط بررسی و سفارش با قیمت هدف شما ارسال می‌شود."
        footer={
          <div className="flex w-full gap-3">
            <Button
              data-base-ui-swipe-ignore
              form="create-request-form"
              isPending={pending}
              type="submit"
              className="flex-1 grow"
              variant="primary"
            >
              ذخیره درخواست
            </Button>
            <Button
              data-base-ui-swipe-ignore
              isDisabled={pending}
              onPress={requestClose}
              className="flex-1 grow"
              variant="secondary"
            >
              انصراف
            </Button>
          </div>
        }
      >
        <Form
          className="flex flex-col gap-5 py-1"
          id="create-request-form"
          onSubmit={submit}
          validationBehavior="aria"
        >
          {/* Action selection */}
          <div
            className={cn(
              "flex flex-col gap-2",
              pending && "pointer-events-none opacity-70",
            )}
          >
            <h3 className="text-foreground text-xs font-semibold">
              نوع درخواست
            </h3>

            <div className="flex w-full gap-2">
              {(
                Object.keys(actionLabels) as CreateRequestInput["action"][]
              ).map((value) => {
                const Icon = actionIcons[value];
                const label = actionLabels[value];
                const isSelected = action === value;

                return (
                  <Button
                    data-base-ui-swipe-ignore
                    key={value}
                    aria-pressed={isSelected}
                    onPress={() => {
                      setAction(value);
                      if (value === "BUY") setCondition("LTE");
                      else if (value === "SELL") setCondition("GTE");
                    }}
                    className={cn(
                      "flex h-auto flex-1 grow flex-col gap-1 py-2.5 text-xs font-semibold transition-all",
                      isSelected &&
                        value === "BUY" &&
                        "border-success bg-success/15 text-success",
                      isSelected &&
                        value === "SELL" &&
                        "border-danger bg-danger/15 text-danger",
                      isSelected &&
                        value === "ALERT" &&
                        "border-warning bg-warning/15 text-warning",
                    )}
                    type="button"
                    variant={isSelected ? "primary" : "secondary"}
                  >
                    <Icon className="size-5" />
                    <span>{label}</span>
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Condition selection: 1 button per row with short title and compact description */}
          <div
            className={cn(
              "flex flex-col gap-2",
              pending && "pointer-events-none opacity-70",
            )}
          >
            <h3 className="text-foreground text-xs font-semibold">شرط اجرا</h3>

            <div className="flex flex-col gap-2">
              {conditionOptions.map((option) => {
                const isSelected = condition === option.value;
                const details = conditionDescriptions[option.value];
                const Icon = option.Icon;

                return (
                  <Button
                    data-base-ui-swipe-ignore
                    key={option.value}
                    onPress={() => setCondition(option.value)}
                    type="button"
                    className={cn(
                      "flex h-auto w-full items-center justify-between gap-3 rounded-2xl p-3 text-start transition-all",
                      isSelected
                        ? "border-accent bg-accent/12 text-foreground shadow-xs border"
                        : "border-border bg-surface-secondary/50 text-muted hover:text-foreground border",
                    )}
                    variant={isSelected ? "primary" : "secondary"}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "grid size-9 shrink-0 place-items-center rounded-xl",
                          isSelected
                            ? "bg-accent/20 text-accent"
                            : "bg-surface-tertiary text-muted",
                        )}
                      >
                        <Icon className="size-5" />
                      </span>

                      <div className="flex flex-col gap-0.5">
                        <span className="text-foreground text-xs font-bold">
                          {details.title}
                        </span>
                        <span className="text-muted text-[11px] leading-relaxed">
                          {details.desc}
                        </span>
                      </div>
                    </div>

                    <div
                      className={cn(
                        "size-4 shrink-0 rounded-full border-2 transition-all",
                        isSelected
                          ? "border-accent bg-accent ring-accent/30 ring-2"
                          : "border-muted/40 bg-transparent",
                      )}
                    />
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Target Price input and quick increment/decrement buttons */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label
                htmlFor="target-price-input"
                className="text-foreground text-xs font-semibold"
              >
                قیمت هدف (هزار تومان)
              </label>
              {Number.isFinite(price) && price > 0 && (
                <span className="text-muted text-[11px] tabular-nums">
                  معادل {formatNumber(price * 1000)} تومان
                </span>
              )}
            </div>

            {/* Custom Stepper Input Group */}
            <div className="border-border bg-surface-secondary/50 focus-within:border-accent relative flex h-12 w-full items-stretch rounded-2xl border transition-colors">
              <button
                data-base-ui-swipe-ignore
                type="button"
                aria-label="افزایش ۱۰ هزار تومان"
                onClick={() => adjustPrice(10)}
                className="text-muted hover:text-foreground active:bg-surface-secondary border-border flex w-12 shrink-0 select-none items-center justify-center rounded-s-2xl border-e text-lg font-bold transition-colors"
              >
                +
              </button>

              <input
                data-base-ui-swipe-ignore
                id="target-price-input"
                type="text"
                inputMode="numeric"
                value={
                  Number.isFinite(price)
                    ? price === 0
                      ? ""
                      : formatNumber(price)
                    : ""
                }
                onChange={(e) => {
                  priceEditedRef.current = true;
                  const raw = toAsciiDigits(e.target.value).replace(
                    /[^0-9]/g,
                    "",
                  );
                  if (!raw) {
                    setPrice(emptyTargetPrice);
                    return;
                  }
                  const val = Number.parseInt(raw, 10);
                  setPrice(Number.isSafeInteger(val) ? val : emptyTargetPrice);
                }}
                placeholder="مثلاً: ۲۴,۱۵۰"
                className="text-foreground min-w-0 flex-1 bg-transparent px-3 text-center text-base font-bold tabular-nums tracking-wide outline-none"
              />

              <button
                data-base-ui-swipe-ignore
                type="button"
                aria-label="کاهش ۱۰ هزار تومان"
                onClick={() => adjustPrice(-10)}
                className="text-muted hover:text-foreground active:bg-surface-secondary border-border flex w-12 shrink-0 select-none items-center justify-center rounded-e-2xl border-s text-lg font-bold transition-colors"
              >
                −
              </button>
            </div>

            {/* Quick Delta Chips: [۵۰۰-] [۱۰۰-] [۵۰-] [مظنه بازار] [۵۰+] [۱۰۰+] [۵۰۰+] */}
            <div className="flex w-full items-center gap-1 pt-0.5">
              <button
                data-base-ui-swipe-ignore
                type="button"
                onClick={() => adjustPrice(-500)}
                className="border-danger/30 bg-danger/10 text-danger hover:bg-danger/20 flex h-8 flex-1 grow select-none items-center justify-center rounded-xl border text-xs font-bold transition-all active:scale-95"
              >
                <bdi dir="rtl">۵۰۰-</bdi>
              </button>
              <button
                data-base-ui-swipe-ignore
                type="button"
                onClick={() => adjustPrice(-100)}
                className="border-danger/30 bg-danger/10 text-danger hover:bg-danger/20 flex h-8 flex-1 grow select-none items-center justify-center rounded-xl border text-xs font-bold transition-all active:scale-95"
              >
                <bdi dir="rtl">۱۰۰-</bdi>
              </button>
              <button
                data-base-ui-swipe-ignore
                type="button"
                onClick={() => adjustPrice(-50)}
                className="border-danger/30 bg-danger/10 text-danger hover:bg-danger/20 flex h-8 flex-1 grow select-none items-center justify-center rounded-xl border text-xs font-bold transition-all active:scale-95"
              >
                <bdi dir="rtl">۵۰-</bdi>
              </button>
              <button
                data-base-ui-swipe-ignore
                type="button"
                disabled={
                  (currentTradePrice == null || currentTradePrice <= 0) &&
                  (initialPriceRef.current == null ||
                    initialPriceRef.current <= 0)
                }
                onClick={() => {
                  const marketP =
                    currentTradePrice && currentTradePrice > 0
                      ? currentTradePrice
                      : initialPriceRef.current > 0
                        ? initialPriceRef.current
                        : undefined;
                  if (marketP) {
                    priceEditedRef.current = true;
                    setPrice(marketP);
                  }
                }}
                className="border-accent/40 bg-accent/10 text-accent hover:bg-accent/20 flex h-8 flex-1 grow select-none items-center justify-center whitespace-nowrap rounded-xl border px-1 text-[11px] font-bold transition-all active:scale-95 disabled:opacity-40"
                title="تنظیم مجدد قیمت به آخرین معامله بازار"
              >
                مظنه بازار
              </button>
              <button
                data-base-ui-swipe-ignore
                type="button"
                onClick={() => adjustPrice(50)}
                className="border-success/30 bg-success/10 text-success hover:bg-success/20 flex h-8 flex-1 grow select-none items-center justify-center rounded-xl border text-xs font-bold transition-all active:scale-95"
              >
                <bdi dir="rtl">۵۰+</bdi>
              </button>
              <button
                data-base-ui-swipe-ignore
                type="button"
                onClick={() => adjustPrice(100)}
                className="border-success/30 bg-success/10 text-success hover:bg-success/20 flex h-8 flex-1 grow select-none items-center justify-center rounded-xl border text-xs font-bold transition-all active:scale-95"
              >
                <bdi dir="rtl">۱۰۰+</bdi>
              </button>
              <button
                data-base-ui-swipe-ignore
                type="button"
                onClick={() => adjustPrice(500)}
                className="border-success/30 bg-success/10 text-success hover:bg-success/20 flex h-8 flex-1 grow select-none items-center justify-center rounded-xl border text-xs font-bold transition-all active:scale-95"
              >
                <bdi dir="rtl">۵۰۰+</bdi>
              </button>
            </div>
          </div>

          {/* Submission Price Mode (Target Price vs Last Trade) */}
          {action !== "ALERT" && (
            <div
              className={cn(
                "flex flex-col gap-2",
                pending && "pointer-events-none opacity-70",
              )}
            >
              <h3 className="text-foreground text-xs font-semibold">
                مظنه ارسالی به گروه
              </h3>
              <div className="flex w-full gap-2">
                <Button
                  data-base-ui-swipe-ignore
                  type="button"
                  onPress={() => setPriceMode("TARGET_PRICE")}
                  className="flex h-auto flex-1 grow flex-col items-start gap-1 p-2.5 text-start"
                  variant={
                    priceMode === "TARGET_PRICE" ? "primary" : "secondary"
                  }
                >
                  <span className="text-xs font-bold">مظنه تعیین‌شده</span>
                  <span className="text-[11px] opacity-80">
                    ارسال با قیمت هدف (
                    {Number.isFinite(price) && price > 0
                      ? formatNumber(price)
                      : "—"}
                    )
                  </span>
                </Button>

                <Button
                  data-base-ui-swipe-ignore
                  type="button"
                  onPress={() => setPriceMode("LAST_TRADE")}
                  className="flex h-auto flex-1 grow flex-col items-start gap-1 p-2.5 text-start"
                  variant={priceMode === "LAST_TRADE" ? "primary" : "secondary"}
                >
                  <span className="text-xs font-bold">مظنه آخرین معامله</span>
                  <span className="text-[11px] opacity-80">
                    ارسال با مظنه معامله محرک
                  </span>
                </Button>
              </div>
            </div>
          )}

          {/* Units input (for BUY / SELL) */}
          {action !== "ALERT" && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="units-input"
                  className="text-foreground text-xs font-semibold"
                >
                  تعداد واحد طلا
                </label>
                <span className="text-muted text-[11px] tabular-nums">
                  حجم کل: {formatNumber(units)} واحد
                </span>
              </div>

              <div className="border-border bg-surface-secondary/50 focus-within:border-accent relative flex h-12 w-full items-stretch rounded-2xl border transition-colors">
                <button
                  data-base-ui-swipe-ignore
                  type="button"
                  aria-label="افزایش یک واحد"
                  onClick={() => setUnits((u) => u + 1)}
                  className="text-muted hover:text-foreground active:bg-surface-secondary border-border flex w-14 shrink-0 select-none items-center justify-center rounded-s-2xl border-e text-lg font-bold transition-colors"
                >
                  +
                </button>

                <input
                  data-base-ui-swipe-ignore
                  id="units-input"
                  type="text"
                  inputMode="numeric"
                  value={units === 0 ? "" : formatNumber(units)}
                  onChange={(e) => {
                    const raw = toAsciiDigits(e.target.value).replace(
                      /[^0-9]/g,
                      "",
                    );
                    if (!raw) {
                      setUnits(0);
                      return;
                    }
                    const val = Number.parseInt(raw, 10);
                    if (Number.isSafeInteger(val)) {
                      setUnits(val);
                    }
                  }}
                  onBlur={() => {
                    if (units < 1) {
                      setUnits(1);
                    }
                  }}
                  className="text-foreground min-w-0 flex-1 bg-transparent px-3 text-center text-base font-bold tabular-nums outline-none"
                />

                <button
                  data-base-ui-swipe-ignore
                  type="button"
                  aria-label="کاهش یک واحد"
                  disabled={units <= 1}
                  onClick={() => setUnits((u) => Math.max(1, u - 1))}
                  className="text-muted hover:text-foreground active:bg-surface-secondary border-border flex w-14 shrink-0 select-none items-center justify-center rounded-e-2xl border-s text-lg font-bold transition-colors disabled:opacity-30"
                >
                  −
                </button>
              </div>
            </div>
          )}

          {/* Live Request Preview */}
          <RequestPreviewCard
            action={action}
            condition={condition}
            targetPrice={price}
            units={action === "ALERT" ? null : units}
            priceMode={priceMode}
            currentTradePrice={currentTradePrice}
          />

          {error ? (
            <p className="border-danger bg-danger-soft text-danger-soft-foreground rounded-xl border px-3 py-2 text-sm">
              {error}
            </p>
          ) : null}
        </Form>
      </DrawerSheet>

      <AlertDialog isOpen={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialog.Backdrop>
          <AlertDialog.Container>
            <AlertDialog.Dialog dir="rtl">
              <AlertDialog.Header>
                <AlertDialog.Heading>
                  تغییرات ذخیره نشده‌اند
                </AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                اگر خارج شوید، اطلاعات واردشده برای این درخواست پاک می‌شود.
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button
                  onPress={() => setDiscardOpen(false)}
                  className="flex-1 grow"
                  variant="secondary"
                >
                  بازگشت
                </Button>
                <Button
                  onPress={handleDiscard}
                  className="flex-1 grow"
                  variant="danger"
                >
                  دور ریختن
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </>
  );
}
