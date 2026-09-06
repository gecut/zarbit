import { Button, Card, Input } from "@heroui/react";
import { requestInputSchema, normalizeDigits } from "@zarbit/contracts";
import { CheckCircleIcon } from "@solar-icons/react/linear/check-circle";
import { ClipboardAddIcon } from "@solar-icons/react/linear/clipboard-add";
import { DangerCircleIcon } from "@solar-icons/react/linear/danger-circle";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import type {
  RequestAction,
  RequestCondition,
  RequestPayload,
  ZarbitRequest,
} from "../../lib/api";
import { useTelegramSession } from "../../lib/telegram-session";
import {
  ActionIcon,
  actionLabels,
  conditionLabels,
  formatPrice,
} from "./request-labels";
import { PriceInput } from "./price-input";

type RequestFormProps = {
  initial?: ZarbitRequest;
  onSubmit: (input: RequestPayload) => void;
  isPending: boolean;
  error?: string;
};

function digits(value: string) {
  return normalizeDigits(value).replace(/\D/g, "");
}

export function RequestForm({
  initial,
  onSubmit,
  isPending,
  error,
}: RequestFormProps) {
  const [condition, setCondition] = useState<RequestCondition>(
    initial?.condition ?? "LTE",
  );
  const [action, setAction] = useState<RequestAction>(
    initial?.action ?? "ALERT",
  );
  const [targetPrice, setTargetPrice] = useState(
    initial ? formatPrice(initial.targetPrice) : "",
  );
  const [units, setUnits] = useState(initial?.units?.toString() ?? "");
  const [validation, setValidation] = useState<string | null>(null);
  const connection = useTelegramSession();
  const canTrade = action !== "ALERT";
  const title = initial ? "ویرایش درخواست" : "درخواست جدید";

  const submit = () => {
    if (isPending) return;
    const result = requestInputSchema.safeParse({
      condition,
      action,
      targetPrice: Number(digits(targetPrice)),
      units: canTrade ? (units ? Number(normalizeDigits(units)) : null) : null,
    });
    if (!result.success) {
      setValidation(
        result.error.issues.find((issue) =>
          /[\u0600-\u06ff]/.test(issue.message),
        )?.message ?? "قیمت و تعداد واحد را بررسی کنید.",
      );
      return;
    }
    setValidation(null);
    onSubmit(result.data);
  };

  return (
    <section className="grid gap-[1.05rem]">
      <div className="flex items-start justify-between gap-[0.9rem]">
        <div>
          <h1 className="text-foreground m-0 text-base font-semibold leading-[1.55]">
            {title}
          </h1>
          <p className="text-muted mt-[0.18rem] text-xs leading-[1.7]">
            شرط و عملیات موردنظر خود را مشخص کنید.
          </p>
        </div>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Card className="border-border bg-surface shadow-surface overflow-hidden rounded-[var(--radius-2xl)] border p-[1.15rem] sm:p-[1.45rem]">
          <div className="mb-[1.3rem] flex items-start gap-3">
            <span
              aria-hidden="true"
              className="bg-accent-soft text-accent grid size-10 shrink-0 place-items-center rounded-[var(--radius-2xl)]"
            >
              <ClipboardAddIcon size={23} />
            </span>
            <div>
              <h1 className="text-foreground m-0 text-base font-semibold">
                {title}
              </h1>
              <p className="text-muted mt-[0.18rem] text-xs leading-[1.7]">
                هر درخواست فقط یک‌بار و پس از رسیدن مظنه اجرا می‌شود.
              </p>
            </div>
          </div>
          <div className="grid gap-5">
            <fieldset>
              <legend className="text-foreground mb-[0.55rem] block text-sm font-semibold">
                شرط قیمت
              </legend>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(conditionLabels) as RequestCondition[]).map(
                  (key) => (
                    <Button
                      key={key}
                      aria-pressed={condition === key}
                      className={`min-h-[3.15rem] text-xs font-semibold ${condition === key ? "border-focus bg-accent-soft text-accent-soft-foreground shadow-surface" : "border-border bg-surface text-muted"}`}
                      onPress={() => setCondition(key)}
                      type="button"
                    >
                      {conditionLabels[key]}
                    </Button>
                  ),
                )}
              </div>
            </fieldset>
            <PriceInput value={targetPrice} onChange={setTargetPrice} />
            <fieldset>
              <legend className="text-foreground mb-[0.55rem] block text-sm font-semibold">
                عملیات پس از رسیدن قیمت
              </legend>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(actionLabels) as RequestAction[]).map((key) => (
                  <Button
                    key={key}
                    aria-pressed={action === key}
                    className={`min-h-[3.15rem] text-xs font-semibold ${action === key ? "border-focus bg-accent-soft text-accent-soft-foreground shadow-surface" : "border-border bg-surface text-muted"}`}
                    onPress={() => setAction(key)}
                    type="button"
                  >
                    <ActionIcon action={key} size={18} />
                    {actionLabels[key]}
                  </Button>
                ))}
              </div>
            </fieldset>
            {canTrade ? (
              <label>
                <span className="text-foreground mb-[0.55rem] block text-sm font-semibold">
                  تعداد واحد
                </span>
                <Input
                  className="min-h-[3.1rem] w-full text-base"
                  dir="ltr"
                  inputMode="numeric"
                  maxLength={10}
                  onChange={(event) =>
                    setUnits(normalizeDigits(event.target.value))
                  }
                  placeholder="مثلاً ۱"
                  value={units}
                />
                <span className="text-muted mt-1 block text-xs leading-6">
                  سفارش از حساب تلگرام متصل‌شده شما ارسال می‌شود.
                </span>
              </label>
            ) : null}
            {validation || error ? (
              <p
                role="alert"
                className="text-danger-soft-foreground -mt-1 flex items-start gap-2 text-xs leading-7"
              >
                <DangerCircleIcon size={18} />
                {validation ?? error}
              </p>
            ) : null}
            {!connection.data?.canManageRequests ? (
              <p className="text-danger-soft-foreground -mt-1 flex items-start gap-2 text-xs leading-7">
                اتصال تلگرام آماده نیست. <Link to="/telegram">بررسی اتصال</Link>
              </p>
            ) : null}
          </div>
          <div className="mt-[1.45rem] grid gap-[0.65rem]">
            <Button
              className="min-h-11 w-full text-sm font-semibold"
              isDisabled={isPending || !connection.data?.canManageRequests}
              type="submit"
            >
              {isPending ? (
                "در حال ثبت…"
              ) : (
                <>
                  <CheckCircleIcon size={19} />
                  {initial ? "ذخیره تغییرات" : "ثبت درخواست"}
                </>
              )}
            </Button>
          </div>
        </Card>
      </form>
    </section>
  );
}
