import { Button, Card, Chip, Input } from "@heroui/react";
import { requestInputSchema, normalizeDigits } from "@zarbit/contracts";
import { useTelegramSession } from "../lib/telegram-session";
import { ConfirmAction } from "./confirm-action";
import { AddCircleIcon } from "@solar-icons/react/linear/add-circle";
import { BellIcon } from "@solar-icons/react/linear/bell";
import { ChartIcon } from "@solar-icons/react/linear/chart";
import { CheckCircleIcon } from "@solar-icons/react/linear/check-circle";
import { ClipboardAddIcon } from "@solar-icons/react/linear/clipboard-add";
import { DangerCircleIcon } from "@solar-icons/react/linear/danger-circle";
import { PenIcon } from "@solar-icons/react/linear/pen";
import { WalletIcon } from "@solar-icons/react/linear/wallet";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";

import type {
  RequestAction,
  RequestCondition,
  RequestPayload,
  RequestStatus,
  ZarbitRequest,
} from "../lib/api";
import {
  useCancelRequest,
  useCreateRequest,
  useRequest,
  useRequests,
  useUpdateRequest,
} from "../lib/requests";

const statusLabels = {
  ACTIVE: "فعال",
  DONE: "انجام‌شده",
  CANCELLED: "لغوشده",
  FAILED: "ناموفق",
} as const;
const actionLabels = { ALERT: "فقط هشدار", BUY: "خرید", SELL: "فروش" } as const;
const conditionLabels = {
  LTE: "قیمت کمتر یا مساوی",
  GTE: "قیمت بیشتر یا مساوی",
} as const;

function formatPrice(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function digits(value: string) {
  return normalizeDigits(value).replace(/\D/g, "");
}

function ActionIcon({
  action,
  size = 19,
}: {
  action: RequestAction;
  size?: number;
}) {
  if (action === "BUY") return <WalletIcon size={size} />;
  if (action === "SELL") return <ChartIcon size={size} />;
  return <BellIcon size={size} />;
}

function StatusBadge({ status }: { status: RequestStatus }) {
  const tone =
    status === "ACTIVE"
      ? "active"
      : status === "DONE"
        ? "done"
        : status.toLowerCase();
  return (
    <Chip className={`status-badge status-badge--${tone}`} size="sm">
      <span aria-hidden="true">{status === "ACTIVE" ? "●" : "•"}</span>
      {statusLabels[status]}
    </Chip>
  );
}

function PriceInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const update = (next: string) => {
    const raw = digits(next);
    onChange(raw ? new Intl.NumberFormat("en-US").format(Number(raw)) : "");
  };

  return (
    <label>
      <span className="form-label">قیمت هدف</span>
      <Input
        className="form-input"
        dir="ltr"
        inputMode="numeric"
        value={value}
        maxLength={24}
        onChange={(event) => update(event.target.value)}
        placeholder="95,900,000"
        aria-describedby="price-hint"
      />
      <span id="price-hint" className="form-hint">
        قیمت را به ریال وارد کنید.
      </span>
    </label>
  );
}

function RequestForm({
  initial,
  onSubmit,
  isPending,
  error,
}: {
  initial?: ZarbitRequest;
  onSubmit: (input: RequestPayload) => void;
  isPending: boolean;
  error?: string;
}) {
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
    const price = Number(digits(targetPrice));
    const unitCount = units ? Number(normalizeDigits(units)) : null;
    if (isPending) return;
    const result = requestInputSchema.safeParse({
      condition,
      action,
      targetPrice: price,
      units: canTrade ? unitCount : null,
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
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <h1>{title}</h1>
          <p>شرط و عملیات موردنظر خود را مشخص کنید.</p>
        </div>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Card className="zb-surface form-card">
        <div className="form-card__header">
          <span className="form-card__icon" aria-hidden="true">
            <ClipboardAddIcon size={23} />
          </span>
          <div>
            <h1>{title}</h1>
            <p>هر درخواست فقط یک‌بار و پس از رسیدن مظنه اجرا می‌شود.</p>
          </div>
        </div>
        <div className="form-fields">
          <fieldset>
            <legend className="form-legend">شرط قیمت</legend>
            <div className="segment-grid segment-grid--two">
              {(Object.keys(conditionLabels) as RequestCondition[]).map(
                (key) => (
                  <Button
                    key={key}
                    className={`zb-segment ${condition === key ? "zb-segment--selected" : ""}`}
                    type="button"
                    aria-pressed={condition === key}
                    onPress={() => setCondition(key)}
                  >
                    {conditionLabels[key]}
                  </Button>
                ),
              )}
            </div>
          </fieldset>
          <PriceInput value={targetPrice} onChange={setTargetPrice} />
          <fieldset>
            <legend className="form-legend">عملیات پس از رسیدن قیمت</legend>
            <div className="segment-grid segment-grid--three">
              {(Object.keys(actionLabels) as RequestAction[]).map((key) => (
                <Button
                  key={key}
                  className={`zb-segment ${action === key ? "zb-segment--selected" : ""}`}
                  type="button"
                  aria-pressed={action === key}
                  onPress={() => setAction(key)}
                >
                  <ActionIcon action={key} size={18} />
                  {actionLabels[key]}
                </Button>
              ))}
            </div>
          </fieldset>
          {canTrade ? (
            <label>
              <span className="form-label">تعداد واحد</span>
              <Input
                className="form-input"
                dir="ltr"
                inputMode="numeric"
                value={units}
                maxLength={10}
                onChange={(event) =>
                  setUnits(normalizeDigits(event.target.value))
                }
                placeholder="مثلاً ۱"
              />
              <span className="form-hint">
                سفارش از حساب تلگرام متصل‌شده شما ارسال می‌شود.
              </span>
            </label>
          ) : null}
          {validation || error ? (
            <p role="alert" className="form-error">
              <DangerCircleIcon size={18} />
              {validation ?? error}
            </p>
          ) : null}
          {!connection.data?.canManageRequests ? (
            <p className="form-error">
              اتصال تلگرام آماده نیست. <Link to="/telegram">بررسی اتصال</Link>
            </p>
          ) : null}
        </div>
        <div className="form-footer">
          <Button
            className="zb-button zb-button--primary zb-button--full"
            type="submit"
            isDisabled={isPending || !connection.data?.canManageRequests}
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

function RequestCard({
  request,
  allowActions = false,
}: {
  request: ZarbitRequest;
  allowActions?: boolean;
}) {
  const cancel = useCancelRequest();
  const navigate = useNavigate();

  return (
    <article>
      <Card className="zb-surface request-card">
      <div className="request-card__top">
        <strong className="request-card__title">
          <span className="request-card__icon" aria-hidden="true">
            <ActionIcon action={request.action} />
          </span>
          {actionLabels[request.action]}
        </strong>
        {request.isExecuting ? (
          <Chip className="status-badge status-badge--warning" size="sm">
            در حال اجرا
          </Chip>
        ) : (
          <StatusBadge status={request.status} />
        )}
      </div>
      <p className="request-card__price">{formatPrice(request.targetPrice)}</p>
      <p className="request-card__condition">
        {conditionLabels[request.condition]}
      </p>
      <div className="request-card__details">
        {request.units ? (
          <span>تعداد: {request.units} واحد</span>
        ) : (
          <span>فقط هشدار</span>
        )}
        {request.triggeredQuote ? (
          <span>مظنه اجرا: {formatPrice(request.triggeredQuote)}</span>
        ) : null}
      </div>
      {request.failureReason ? (
        <p className="request-card__error">{request.failureReason}</p>
      ) : null}
      {request.cancellationReason ? (
        <p className="request-card__error">{request.cancellationReason}</p>
      ) : null}
      {allowActions && !request.isExecuting ? (
        <div className="request-actions">
          <Button
            className="zb-button zb-button--secondary zb-button--compact"
            onPress={() =>
              navigate({ to: "/requests/$id/edit", params: { id: request.id } })
            }
          >
            <PenIcon size={17} />
            ویرایش
          </Button>
          <ConfirmAction
            title="درخواست لغو شود؟"
            description="درخواست لغوشده دوباره فعال نمی‌شود."
            label="لغو درخواست"
            pending={cancel.isPending}
            onConfirm={() => cancel.mutateAsync(request.id)}
          />
        </div>
      ) : null}
      {cancel.error ? (
        <p role="alert" className="form-error">
          {cancel.error.message}
        </p>
      ) : null}
      <div className="request-card__details">
        <span>ثبت: {new Date(request.createdAt).toLocaleString("fa-IR")}</span>
        {request.completedAt ? (
          <span>
            پایان: {new Date(request.completedAt).toLocaleString("fa-IR")}
          </span>
        ) : null}
      </div>
      </Card>
    </article>
  );
}

function QueryState({
  isLoading,
  error,
  isEmpty,
  children,
}: {
  isLoading: boolean;
  error: Error | null;
  isEmpty: boolean;
  children: ReactNode;
}) {
  if (isLoading) return <p className="query-state">در حال دریافت اطلاعات…</p>;
  if (error)
    return (
      <p role="alert" className="query-state query-state--error">
        {error.message}
      </p>
    );
  if (isEmpty) return <p className="empty-state">هنوز موردی ثبت نشده است.</p>;
  return <>{children}</>;
}

export function Dashboard() {
  const requests = useRequests();
  const navigate = useNavigate();
  const activeCount = requests.data?.activeCount;

  return (
    <section className="page-stack">
      <article className="hero-card">
        <p className="eyebrow">مدیریت هوشمند مظنه</p>
        <h1>در لحظه‌ای که قیمت به هدف شما رسید، آماده باشید.</h1>
        <div className="hero-card__meta">
          <div>
            <span className="hero-card__count">{activeCount ?? "—"}</span>
            <span className="hero-card__label">درخواست فعال</span>
          </div>
          <Button
            className="zb-button zb-button--light"
            onPress={() => navigate({ to: "/requests/new" })}
          >
            <AddCircleIcon size={20} />
            درخواست جدید
          </Button>
        </div>
      </article>
      <div className="section-title">
        <h2>آخرین درخواست‌ها</h2>
        <Link to="/requests/active" className="section-link">
          مشاهده همه
        </Link>
      </div>
      <div className="request-list">
        <QueryState
          isLoading={requests.isLoading}
          error={requests.error}
          isEmpty={!requests.data?.items.length}
        >
          {requests.data?.items.slice(0, 4).map((request) => (
            <RequestCard key={request.id} request={request} />
          ))}
        </QueryState>
      </div>
    </section>
  );
}

export function NewRequest() {
  const create = useCreateRequest();
  const navigate = useNavigate();
  return (
    <RequestForm
      isPending={create.isPending}
      error={create.error?.message}
      onSubmit={(input) =>
        create.mutate(input, {
          onSuccess: () => navigate({ to: "/requests/active" }),
        })
      }
    />
  );
}

export function ActiveRequests() {
  const [page, setPage] = useState(1);
  const requests = useRequests("ACTIVE", page);
  const navigate = useNavigate();
  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <h1>درخواست‌های فعال</h1>
          <p>می‌توانید پیش از اجرا، آن‌ها را ویرایش یا لغو کنید.</p>
        </div>
        <Button
          className="zb-button zb-button--primary zb-button--compact"
          onPress={() => navigate({ to: "/requests/new" })}
        >
          <AddCircleIcon size={17} />
          جدید
        </Button>
      </div>
      <div className="request-list">
        <QueryState
          isLoading={requests.isLoading}
          error={requests.error}
          isEmpty={!requests.data?.items.length}
        >
          {requests.data?.items.map((request) => (
            <RequestCard key={request.id} request={request} allowActions />
          ))}
        </QueryState>
      </div>
      <PageControls
        page={page}
        total={requests.data?.total ?? 0}
        setPage={setPage}
      />
    </section>
  );
}

function PageControls({
  page,
  total,
  setPage,
}: {
  page: number;
  total: number;
  setPage: (page: number) => void;
}) {
  return (
    <nav className="connection-actions" aria-label="صفحه‌بندی">
      <Button
        variant="secondary"
        isDisabled={page <= 1}
        onPress={() => setPage(page - 1)}
      >
        قبلی
      </Button>
      <span>صفحه {page}</span>
      <Button
        variant="secondary"
        isDisabled={page * 20 >= total}
        onPress={() => setPage(page + 1)}
      >
        بعدی
      </Button>
    </nav>
  );
}
export function History() {
  const [status, setStatus] = useState<RequestStatus | "HISTORY">("HISTORY");
  const [page, setPage] = useState(1);
  const requests = useRequests(status, page);
  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <h1>سوابق درخواست‌ها</h1>
          <p>نتیجه درخواست‌ها و مظنه اجرا به ریال</p>
        </div>
      </div>
      <div className="history-filters" role="group" aria-label="فیلتر وضعیت">
        {(["HISTORY", "DONE", "FAILED", "CANCELLED"] as const).map((key) => (
          <Button
            key={key}
            variant={status === key ? "primary" : "secondary"}
            aria-pressed={status === key}
            onPress={() => {
              setStatus(key);
              setPage(1);
            }}
          >
            {key === "HISTORY" ? "همه" : statusLabels[key]}
          </Button>
        ))}
      </div>
      <div className="request-list">
        <QueryState
          isLoading={requests.isLoading}
          error={requests.error}
          isEmpty={!requests.data?.items.length}
        >
          {requests.data?.items.map((request) => (
            <RequestCard key={request.id} request={request} />
          ))}
        </QueryState>
      </div>
      <PageControls
        page={page}
        total={requests.data?.total ?? 0}
        setPage={setPage}
      />
    </section>
  );
}
export function EditRequest({ id }: { id: string }) {
  const request = useRequest(id);
  const update = useUpdateRequest(id);
  const navigate = useNavigate();
  if (request.isLoading)
    return <p className="query-state">در حال دریافت درخواست…</p>;
  if (request.error || !request.data)
    return (
      <p role="alert" className="query-state query-state--error">
        {request.error?.message ?? "درخواست پیدا نشد."}
      </p>
    );
  if (request.data.status !== "ACTIVE" || request.data.isExecuting)
    return (
      <p className="query-state">
        این درخواست اجرا شده یا در حال اجراست و قابل ویرایش نیست.
      </p>
    );
  return (
    <RequestForm
      key={id}
      initial={request.data}
      isPending={update.isPending}
      error={update.error?.message}
      onSubmit={(input) =>
        update.mutate(input, {
          onSuccess: () => navigate({ to: "/requests/active" }),
        })
      }
    />
  );
}
