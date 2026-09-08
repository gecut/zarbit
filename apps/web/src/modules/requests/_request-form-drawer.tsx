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

const compactPriceFormatOptions = {
  style: "decimal",
  useGrouping: true,
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
} satisfies Intl.NumberFormatOptions;

const fallbackTargetPrice = 10_000;

export function RequestFormDrawer({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => Promise<void>;
}) {
  const api = useApi(useIdentity().telegramUserId);
  const queryClient = useQueryClient();
  const { create } = useRequestActions();
  const [action, setAction] = useState<CreateRequestInput["action"]>("ALERT");
  const [condition, setCondition] =
    useState<CreateRequestInput["condition"]>("LTE");
  const [price, setPrice] = useState(fallbackTargetPrice);
  const [units, setUnits] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const initialPriceRef = useRef(fallbackTargetPrice);
  const priceEditedRef = useRef(false);
  const quoteRequestRef = useRef(0);
  const isDirty =
    action !== "ALERT" ||
    condition !== "LTE" ||
    price !== initialPriceRef.current ||
    units > 0;

  useEffect(() => {
    if (!open) return;

    const requestId = ++quoteRequestRef.current;
    priceEditedRef.current = false;
    initialPriceRef.current = fallbackTargetPrice;
    setPrice(fallbackTargetPrice);
    setError(null);

    void queryClient
      .fetchQuery(api.quote.dashboard.queryOptions())
      .then((dashboard) => {
        if (requestId !== quoteRequestRef.current || priceEditedRef.current)
          return;

        const latestPrice = dashboard.latest?.quote;
        const nextPrice =
          typeof latestPrice === "number" &&
          Number.isSafeInteger(latestPrice) &&
          latestPrice > 0
            ? latestPrice
            : fallbackTargetPrice;
        initialPriceRef.current = nextPrice;
        setPrice(nextPrice);
      })
      .catch(() => {
        if (requestId !== quoteRequestRef.current || priceEditedRef.current)
          return;

        initialPriceRef.current = fallbackTargetPrice;
        setPrice(fallbackTargetPrice);
      });

    return () => {
      quoteRequestRef.current += 1;
    };
  }, [api, open, queryClient]);

  const reset = () => {
    setAction("ALERT");
    setCondition("LTE");
    initialPriceRef.current = fallbackTargetPrice;
    priceEditedRef.current = false;
    setPrice(fallbackTargetPrice);
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

    setPending(true);
    setError(null);
    try {
      await create.mutateAsync({
        action,
        condition,
        targetPrice,
        units: action === "ALERT" ? null : requestedUnits,
      });
      reset();
      await onDone();
    } catch (submitError) {
      setError(userMessage(submitError));
    } finally {
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
        description="با رسیدن قیمت به مقدار هدف، درخواست شما اجرا یا ثبت می‌شود."
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

            <div className="flex gap-4">
              {conditionOptions.map((option) => (
                <Button
                  data-base-ui-swipe-ignore
                  key={option.value}
                  onPress={() => setCondition(option.value)}
                  type="button"
                  className="flex h-auto flex-1 flex-col gap-1 py-2 text-sm"
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
            step={1}
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
