import { AddCircleIcon } from "@solar-icons/react/linear/add-circle";
import { BellIcon } from "@solar-icons/react/linear/bell";
import { ChartIcon } from "@solar-icons/react/linear/chart";
import { CheckCircleIcon } from "@solar-icons/react/linear/check-circle";
import { ClipboardAddIcon } from "@solar-icons/react/linear/clipboard-add";
import { DangerCircleIcon } from "@solar-icons/react/linear/danger-circle";
import { PenIcon } from "@solar-icons/react/linear/pen";
import { TrashBinMinimalisticIcon } from "@solar-icons/react/linear/trash-bin-minimalistic";
import { WalletIcon } from "@solar-icons/react/linear/wallet";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";

import type { RequestAction, RequestCondition, RequestPayload, RequestStatus, ZarbitRequest } from "../lib/api";
import { useCancelRequest, useCreateRequest, useRequest, useRequests, useUpdateRequest } from "../lib/requests";

const statusLabels = { ACTIVE: "فعال", DONE: "انجام‌شده", CANCELLED: "لغوشده", FAILED: "ناموفق" } as const;
const actionLabels = { ALERT: "فقط هشدار", BUY: "خرید", SELL: "فروش" } as const;
const conditionLabels = { LTE: "قیمت کمتر یا مساوی", GTE: "قیمت بیشتر یا مساوی" } as const;

function formatPrice(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function digits(value: string) {
  return value.replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit))).replace(/\D/g, "");
}

function ActionIcon({ action, size = 19 }: { action: RequestAction; size?: number }) {
  if (action === "BUY") return <WalletIcon size={size} />;
  if (action === "SELL") return <ChartIcon size={size} />;
  return <BellIcon size={size} />;
}

function StatusBadge({ status }: { status: RequestStatus }) {
  const tone = status === "ACTIVE" ? "active" : status === "DONE" ? "done" : status.toLowerCase();
  return <span className={`status-badge status-badge--${tone}`}><span aria-hidden="true">{status === "ACTIVE" ? "●" : "•"}</span>{statusLabels[status]}</span>;
}

function PriceInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const update = (next: string) => {
    const raw = digits(next);
    onChange(raw ? new Intl.NumberFormat("en-US").format(Number(raw)) : "");
  };

  return <label>
    <span className="form-label">قیمت هدف</span>
    <input className="form-input" dir="ltr" inputMode="numeric" value={value} onChange={(event) => update(event.target.value)} placeholder="95,900,000" aria-describedby="price-hint" />
    <span id="price-hint" className="form-hint">قیمت را به ریال وارد کنید.</span>
  </label>;
}

function RequestForm({ initial, onSubmit, isPending, error }: {
  initial?: ZarbitRequest;
  onSubmit: (input: RequestPayload) => void;
  isPending: boolean;
  error?: string;
}) {
  const [condition, setCondition] = useState<RequestCondition>(initial?.condition ?? "LTE");
  const [action, setAction] = useState<RequestAction>(initial?.action ?? "ALERT");
  const [targetPrice, setTargetPrice] = useState(initial ? formatPrice(initial.targetPrice) : "");
  const [units, setUnits] = useState(initial?.units?.toString() ?? "");
  const canTrade = action !== "ALERT";
  const title = initial ? "ویرایش درخواست" : "درخواست جدید";

  const submit = () => {
    const price = Number(digits(targetPrice));
    const unitCount = units ? Number(units) : null;
    if (!Number.isSafeInteger(price) || price <= 0) return;
    onSubmit({ condition, action, targetPrice: price, units: canTrade ? unitCount : null });
  };

  return <section className="page-stack">
    <div className="page-heading"><div><h1>{title}</h1><p>شرط و عملیات موردنظر خود را مشخص کنید.</p></div></div>
    <form className="surface form-card" onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <div className="form-card__header">
        <span className="form-card__icon" aria-hidden="true"><ClipboardAddIcon size={23} /></span>
        <div><h1>{title}</h1><p>هر درخواست فقط یک‌بار و پس از رسیدن مظنه اجرا می‌شود.</p></div>
      </div>
      <div className="form-fields">
        <fieldset>
          <legend className="form-legend">شرط قیمت</legend>
          <div className="segment-grid segment-grid--two">
            {(Object.keys(conditionLabels) as RequestCondition[]).map((key) => <button key={key} className={`segment ${condition === key ? "segment--selected" : ""}`} type="button" aria-pressed={condition === key} onClick={() => setCondition(key)}>{conditionLabels[key]}</button>)}
          </div>
        </fieldset>
        <PriceInput value={targetPrice} onChange={setTargetPrice} />
        <fieldset>
          <legend className="form-legend">عملیات پس از رسیدن قیمت</legend>
          <div className="segment-grid segment-grid--three">
            {(Object.keys(actionLabels) as RequestAction[]).map((key) => <button key={key} className={`segment ${action === key ? "segment--selected" : ""}`} type="button" aria-pressed={action === key} onClick={() => setAction(key)}><ActionIcon action={key} size={18} />{actionLabels[key]}</button>)}
          </div>
        </fieldset>
        {canTrade ? <label>
          <span className="form-label">تعداد واحد</span>
          <input className="form-input" inputMode="numeric" type="number" min="1" value={units} onChange={(event) => setUnits(event.target.value)} placeholder="مثلاً ۱" />
          <span className="form-hint">سفارش از حساب تلگرام متصل‌شده شما ارسال می‌شود.</span>
        </label> : null}
        {error ? <p role="alert" className="form-error"><DangerCircleIcon size={18} />{error}</p> : null}
      </div>
      <div className="form-footer"><button className="button button--primary button--full" type="submit" disabled={isPending || !targetPrice || (canTrade && !units)}>{isPending ? "در حال ثبت…" : <><CheckCircleIcon size={19} />{initial ? "ذخیره تغییرات" : "ثبت درخواست"}</>}</button></div>
    </form>
  </section>;
}

function RequestCard({ request, allowActions = false }: { request: ZarbitRequest; allowActions?: boolean }) {
  const cancel = useCancelRequest();
  const navigate = useNavigate();

  return <article className="surface request-card">
    <div className="request-card__top">
      <strong className="request-card__title"><span className="request-card__icon" aria-hidden="true"><ActionIcon action={request.action} /></span>{actionLabels[request.action]}</strong>
      <StatusBadge status={request.status} />
    </div>
    <p className="request-card__price">{formatPrice(request.targetPrice)}</p>
    <p className="request-card__condition">{conditionLabels[request.condition]}</p>
    <div className="request-card__details">
      {request.units ? <span>تعداد: {request.units} واحد</span> : <span>فقط هشدار</span>}
      {request.triggeredQuote ? <span>مظنه اجرا: {formatPrice(request.triggeredQuote)}</span> : null}
    </div>
    {request.failureReason ? <p className="request-card__error">{request.failureReason}</p> : null}
    {request.cancellationReason ? <p className="request-card__error">{request.cancellationReason}</p> : null}
    {allowActions ? <div className="request-actions">
      <button className="button button--secondary button--compact" onClick={() => navigate({ to: "/requests/$id/edit", params: { id: request.id } })}><PenIcon size={17} />ویرایش</button>
      <button className="button button--danger button--compact" disabled={cancel.isPending} onClick={() => cancel.mutate(request.id)}><TrashBinMinimalisticIcon size={17} />لغو</button>
    </div> : null}
  </article>;
}

function QueryState({ isLoading, error, isEmpty, children }: { isLoading: boolean; error: Error | null; isEmpty: boolean; children: ReactNode }) {
  if (isLoading) return <p className="query-state">در حال دریافت اطلاعات…</p>;
  if (error) return <p role="alert" className="query-state query-state--error">{error.message}</p>;
  if (isEmpty) return <p className="empty-state">هنوز موردی ثبت نشده است.</p>;
  return <>{children}</>;
}

export function Dashboard() {
  const requests = useRequests();
  const navigate = useNavigate();
  const active = requests.data?.filter((item) => item.status === "ACTIVE") ?? [];

  return <section className="page-stack">
    <article className="hero-card">
      <p className="eyebrow">مدیریت هوشمند مظنه</p>
      <h1>در لحظه‌ای که قیمت به هدف شما رسید، آماده باشید.</h1>
      <div className="hero-card__meta"><div><span className="hero-card__count">{active.length}</span><span className="hero-card__label">درخواست فعال</span></div><button className="button button--light" onClick={() => navigate({ to: "/requests/new" })}><AddCircleIcon size={20} />درخواست جدید</button></div>
    </article>
    <div className="section-title"><h2>آخرین درخواست‌ها</h2><Link to="/requests/active" className="section-link">مشاهده همه</Link></div>
    <div className="request-list"><QueryState isLoading={requests.isLoading} error={requests.error} isEmpty={!requests.data?.length}>{requests.data?.slice(0, 4).map((request) => <RequestCard key={request.id} request={request} />)}</QueryState></div>
  </section>;
}

export function NewRequest() {
  const create = useCreateRequest();
  const navigate = useNavigate();
  return <RequestForm isPending={create.isPending} error={create.error?.message} onSubmit={(input) => create.mutate(input, { onSuccess: () => navigate({ to: "/requests/active" }) })} />;
}

export function ActiveRequests() {
  const requests = useRequests("ACTIVE");
  const navigate = useNavigate();
  return <section className="page-stack"><div className="page-heading"><div><h1>درخواست‌های فعال</h1><p>می‌توانید پیش از اجرا، آن‌ها را ویرایش یا لغو کنید.</p></div><button className="button button--primary button--compact" onClick={() => navigate({ to: "/requests/new" })}><AddCircleIcon size={17} />جدید</button></div><div className="request-list"><QueryState isLoading={requests.isLoading} error={requests.error} isEmpty={!requests.data?.length}>{requests.data?.map((request) => <RequestCard key={request.id} request={request} allowActions />)}</QueryState></div></section>;
}

export function History() {
  const requests = useRequests();
  const terminal = requests.data?.filter((item) => item.status !== "ACTIVE") ?? [];
  return <section className="page-stack"><div className="page-heading"><div><h1>سوابق درخواست‌ها</h1><p>نتیجه درخواست‌های اجراشده و لغوشده را اینجا می‌بینید.</p></div></div><div className="request-list"><QueryState isLoading={requests.isLoading} error={requests.error} isEmpty={!terminal.length}>{terminal.map((request) => <RequestCard key={request.id} request={request} />)}</QueryState></div></section>;
}

export function EditRequest({ id }: { id: string }) {
  const request = useRequest(id);
  const update = useUpdateRequest(id);
  const navigate = useNavigate();
  if (request.isLoading) return <p className="query-state">در حال دریافت درخواست…</p>;
  if (request.error || !request.data) return <p role="alert" className="query-state query-state--error">{request.error?.message ?? "درخواست پیدا نشد."}</p>;
  return <RequestForm initial={request.data} isPending={update.isPending} error={update.error?.message} onSubmit={(input) => update.mutate(input, { onSuccess: () => navigate({ to: "/requests/active" }) })} />;
}
