import { isFreshTrade } from "@zarbit/domain";
import { useQueryClient } from "@tanstack/react-query";
import { useIdentity } from "../../shared/auth/auth";
import { useRequestActions } from "./_use-request-actions";
import {
  AlertDialog,
  Button,
  cn,
  Form,
  Label,
  NumberField,
} from "@heroui/react";
import { useEffect, useRef, useState } from "react";
import { AddCircleIcon } from "@solar-icons/react/linear/add-circle";
import { type CreateRequestInput } from "@zarbit/contracts";

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

const compactPriceFormatOptions = {
  style: "decimal",
  useGrouping: true,
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
} satisfies Intl.NumberFormatOptions;

const emptyTargetPrice = Number.NaN;

export function RequestFormDrawer({
  open,
  onOpenChange,
  onDone,
  initialAction = "ALERT",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => Promise<void>;
  initialAction?: CreateRequestInput["action"];
}) {
  const identity = useIdentity();
  const api = useApi(identity.telegramUserId);
  const queryClient = useQueryClient();
  const { create } = useRequestActions();
  const [action, setAction] =
    useState<CreateRequestInput["action"]>(initialAction);
  const [condition, setCondition] =
    useState<CreateRequestInput["condition"]>("LTE");
  const [price, setPrice] = useState(emptyTargetPrice);
  const [units, setUnits] = useState(1);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const submittingRef = useRef(false);
  const initialPriceRef = useRef(emptyTargetPrice);
  const priceEditedRef = useRef(false);
  const quoteRequestRef = useRef(0);
  const isDirty =
    action !== initialAction ||
    condition !== "LTE" ||
    !Object.is(price, initialPriceRef.current) ||
    units > 0;

  useEffect(() => {
    if (!open) return;

    const saved = loadCreationIntent(identity.telegramUserId);
    if (saved) {
      setAction(saved.action);
      setCondition(saved.condition);
      setPrice(saved.targetPrice);
      setUnits(saved.units ?? 1);
      priceEditedRef.current = true;
      initialPriceRef.current = saved.targetPrice;
      setError(null);
      return;
    }

    setAction(initialAction);
    const requestId = ++quoteRequestRef.current;
    priceEditedRef.current = false;
    initialPriceRef.current = emptyTargetPrice;
    setPrice(emptyTargetPrice);
    setError(null);

    void queryClient
      .fetchQuery(api.market.snapshot.queryOptions())
      .then((dashboard) => {
        if (requestId !== quoteRequestRef.current || priceEditedRef.current)
          return;

        const latestPrice =
          dashboard.trade &&
          isFreshTrade(new Date(dashboard.trade.announcedAt), new Date())
            ? dashboard.trade.compactPrice
            : undefined;
        const nextPrice =
          typeof latestPrice === "number" &&
          Number.isSafeInteger(latestPrice) &&
          latestPrice > 0
            ? latestPrice
            : emptyTargetPrice;
        initialPriceRef.current = nextPrice;
        setPrice(nextPrice);
      })
      .catch(() => {
        if (requestId !== quoteRequestRef.current || priceEditedRef.current)
          return;

        initialPriceRef.current = emptyTargetPrice;
        setPrice(emptyTargetPrice);
      });

    return () => {
      quoteRequestRef.current += 1;
    };
  }, [api, identity.telegramUserId, initialAction, open, queryClient]);

  const reset = () => {
    clearCreationIntent(identity.telegramUserId);
    setAction(initialAction);
    setCondition("LTE");
    initialPriceRef.current = emptyTargetPrice;
    priceEditedRef.current = false;
    setPrice(emptyTargetPrice);
    setUnits(0);
    setError(null);
  };
  const close = () => {
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
    });

    try {
      await create.mutateAsync({
        action: intent.action,
        condition: intent.condition,
        targetPrice: intent.targetPrice,
        units: intent.units,
        creationKey: intent.creationKey,
      });
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
          if (!nextOpen && (pending || isDirty)) {
            details.cancel();
            if (!pending) setDiscardOpen(true);
            return;
          }
          if (!nextOpen) reset();
          onOpenChange(nextOpen);
        }}
        open={open}
        icon={<AddCircleIcon size={22} />}
        title="ثبت درخواست جدید"
        description="با معاملهٔ تأییدشدهٔ بعدی، شرط بررسی و سفارش با قیمت هدف شما ارسال می‌شود."
        footer={
          <div className="flex w-full gap-4">
            <Button
              data-base-ui-swipe-ignore
              form="create-request-form"
              isPending={pending}
              type="submit"
              fullWidth
            >
              ذخیره درخواست
            </Button>
            <Button
              data-base-ui-swipe-ignore
              isDisabled={pending}
              onPress={requestClose}
              variant="secondary"
            >
              انصراف
            </Button>
          </div>
        }
      >
        <Form
          className="flex flex-col gap-6"
          id="create-request-form"
          onSubmit={submit}
        >
          <div
            className={cn(
              "flex flex-col gap-2",
              pending && "pointer-events-none opacity-70",
            )}
          >
            <h3 className="text-sm font-medium">نوع درخواست</h3>

            <div className="flex gap-4">
              {(
                Object.keys(actionLabels) as CreateRequestInput["action"][]
              ).map((value) => {
                const Icon = actionIcons[value];
                const label = actionLabels[value];

                return (
                  <Button
                    data-base-ui-swipe-ignore
                    key={value}
                    aria-pressed={action === value}
                    onPress={() => setAction(value)}
                    className="flex h-auto flex-1 flex-col gap-1 py-2 text-sm"
                    type="button"
                    variant={action === value ? "primary" : "secondary"}
                  >
                    <Icon className="size-6" />

                    {label}
                  </Button>
                );
              })}
            </div>
          </div>

          <div
            className={cn(
              "flex flex-col gap-2",
              pending && "pointer-events-none opacity-70",
            )}
          >
            <h3 className="text-sm font-medium">شرط اجرا</h3>

            <div className="flex flex-col gap-4">
              {conditionOptions.map((option) => (
                <Button
                  data-base-ui-swipe-ignore
                  key={option.value}
                  onPress={() => setCondition(option.value)}
                  type="button"
                  className="flex h-auto w-full gap-4 py-2 text-sm"
                  variant={condition === option.value ? "primary" : "secondary"}
                >
                  <option.Icon className="size-6" />

                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          <NumberField
            formatOptions={compactPriceFormatOptions}
            name="targetPrice"
            variant="secondary"
            step={10}
            value={price}
            className="h-auto"
            onChange={(value) => {
              priceEditedRef.current = true;
              setPrice(value);
            }}
          >
            <Label>قیمت هدف (هزار تومان)</Label>

            <NumberField.Group className="ring-0! flex h-12">
              <NumberField.IncrementButton className="w-12 rounded-e-none rounded-s-2xl border-e border-s-0" />
              <NumberField.Input
                data-base-ui-swipe-ignore
                className="flex-1 text-center"
              />
              <NumberField.DecrementButton className="w-12 rounded-e-2xl rounded-s-none border-e-0 border-s" />
            </NumberField.Group>
          </NumberField>

          <NumberField
            name="units"
            variant="secondary"
            minValue={1}
            value={units}
            className={cn(
              "h-auto overflow-hidden",
              "transition-[max-height,opacity] delay-150 duration-300",
              action === "ALERT" ? "max-h-0 opacity-0" : "max-h-18 opacity-100",
            )}
            onChange={(value) => setUnits(value)}
          >
            <Label>تعداد واحد</Label>

            <NumberField.Group className="ring-0! flex h-12 shrink-0">
              <NumberField.IncrementButton className="w-12 rounded-e-none rounded-s-2xl border-e border-s-0" />
              <NumberField.Input
                data-base-ui-swipe-ignore
                className="flex-1 text-center"
              />
              <NumberField.DecrementButton className="w-12 rounded-e-2xl rounded-s-none border-e-0 border-s" />
            </NumberField.Group>
          </NumberField>

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
                  variant="secondary"
                >
                  بازگشت
                </Button>
                <Button
                  onPress={() => {
                    setDiscardOpen(false);
                    close();
                  }}
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
