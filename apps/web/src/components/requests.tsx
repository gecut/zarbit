import { Button, Card, Input } from "@heroui/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import type { RequestAction, RequestCondition, RequestPayload, ZarbitRequest } from "../lib/api";
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

function PriceInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const update = (next: string) => {
    const raw = digits(next);
    onChange(raw ? new Intl.NumberFormat("en-US").format(Number(raw)) : "");
  };
  return <label className="block space-y-2"><span className="text-sm font-medium">قیمت هدف</span><Input inputMode="numeric" value={value} onChange={(event) => update(event.target.value)} placeholder="95,900,000" /></label>;
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

  const submit = () => {
    const price = Number(digits(targetPrice));
    const unitCount = units ? Number(units) : null;
    if (!Number.isSafeInteger(price) || price <= 0) return;
    onSubmit({ condition, action, targetPrice: price, units: canTrade ? unitCount : null });
  };

  return <Card className="w-full">
    <Card.Header><Card.Title>{initial ? "ویرایش درخواست" : "درخواست جدید"}</Card.Title><Card.Description>یک درخواست فقط یک‌بار اجرا می‌شود.</Card.Description></Card.Header>
    <Card.Content className="space-y-5">
      <fieldset className="space-y-2"><legend className="text-sm font-medium">شرط</legend><div className="grid grid-cols-2 gap-2">
        {(Object.keys(conditionLabels) as RequestCondition[]).map((key) => <Button key={key} variant={condition === key ? "primary" : "secondary"} onPress={() => setCondition(key)}>{conditionLabels[key]}</Button>)}
      </div></fieldset>
      <PriceInput value={targetPrice} onChange={setTargetPrice} />
      <fieldset className="space-y-2"><legend className="text-sm font-medium">عملیات</legend><div className="grid grid-cols-3 gap-2">
        {(Object.keys(actionLabels) as RequestAction[]).map((key) => <Button key={key} variant={action === key ? "primary" : "secondary"} onPress={() => setAction(key)}>{actionLabels[key]}</Button>)}
      </div></fieldset>
      {canTrade ? <label className="block space-y-2"><span className="text-sm font-medium">تعداد واحد</span><Input inputMode="numeric" type="number" min="1" value={units} onChange={(event) => setUnits(event.target.value)} /></label> : null}
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    </Card.Content>
    <Card.Footer><Button fullWidth isDisabled={isPending || !targetPrice || (canTrade && !units)} onPress={submit}>{isPending ? "در حال ثبت…" : initial ? "ذخیره تغییرات" : "ثبت درخواست"}</Button></Card.Footer>
  </Card>;
}

function RequestCard({ request, allowActions = false }: { request: ZarbitRequest; allowActions?: boolean }) {
  const cancel = useCancelRequest();
  const navigate = useNavigate();
  return <Card className="w-full">
    <Card.Content className="space-y-2">
      <div className="flex items-center justify-between gap-3"><strong>{actionLabels[request.action]}</strong><span className="text-xs text-muted">{statusLabels[request.status]}</span></div>
      <p className="text-sm">{conditionLabels[request.condition]} {formatPrice(request.targetPrice)}</p>
      {request.units ? <p className="text-sm text-muted">تعداد: {request.units} واحد</p> : null}
      {request.triggeredQuote ? <p className="text-sm text-muted">مظنه اجرا: {formatPrice(request.triggeredQuote)}</p> : null}
      {request.failureReason ? <p className="text-sm text-danger">{request.failureReason}</p> : null}
      {request.cancellationReason ? <p className="text-sm text-muted">{request.cancellationReason}</p> : null}
    </Card.Content>
    {allowActions ? <Card.Footer className="grid grid-cols-2 gap-2"><Button variant="secondary" onPress={() => navigate({ to: "/requests/$id/edit", params: { id: request.id } })}>ویرایش</Button><Button isDisabled={cancel.isPending} variant="danger" onPress={() => cancel.mutate(request.id)}>لغو</Button></Card.Footer> : null}
  </Card>;
}

function QueryState({ isLoading, error, isEmpty, children }: { isLoading: boolean; error: Error | null; isEmpty: boolean; children: React.ReactNode }) {
  if (isLoading) return <p className="py-8 text-center text-sm text-muted">در حال دریافت اطلاعات…</p>;
  if (error) return <p role="alert" className="py-8 text-center text-sm text-danger">{error.message}</p>;
  if (isEmpty) return <p className="py-8 text-center text-sm text-muted">هنوز موردی وجود ندارد.</p>;
  return <>{children}</>;
}

export function Dashboard() {
  const requests = useRequests();
  const navigate = useNavigate();
  const active = requests.data?.filter((item) => item.status === "ACTIVE") ?? [];
  return <section className="space-y-5"><Card><Card.Content><p className="text-sm text-muted">درخواست‌های فعال</p><p className="text-3xl font-bold">{active.length}</p></Card.Content><Card.Footer><Button fullWidth onPress={() => navigate({ to: "/requests/new" })}>ثبت درخواست جدید</Button></Card.Footer></Card><div className="flex items-center justify-between"><h2 className="font-semibold">آخرین درخواست‌ها</h2><Link to="/requests/active" className="text-sm text-primary">مشاهده فعال‌ها</Link></div><QueryState isLoading={requests.isLoading} error={requests.error} isEmpty={!requests.data?.length}>{requests.data?.slice(0, 3).map((request) => <RequestCard key={request.id} request={request} />)}</QueryState></section>;
}

export function NewRequest() {
  const create = useCreateRequest();
  const navigate = useNavigate();
  return <RequestForm isPending={create.isPending} error={create.error?.message} onSubmit={(input) => create.mutate(input, { onSuccess: () => navigate({ to: "/requests/active" }) })} />;
}

export function ActiveRequests() {
  const requests = useRequests("ACTIVE");
  const navigate = useNavigate();
  return <section className="space-y-4"><div className="flex items-center justify-between"><h1 className="text-lg font-bold">درخواست‌های فعال</h1><Button size="sm" onPress={() => navigate({ to: "/requests/new" })}>درخواست جدید</Button></div><QueryState isLoading={requests.isLoading} error={requests.error} isEmpty={!requests.data?.length}>{requests.data?.map((request) => <RequestCard key={request.id} request={request} allowActions />)}</QueryState></section>;
}

export function History() {
  const requests = useRequests();
  const terminal = requests.data?.filter((item) => item.status !== "ACTIVE") ?? [];
  return <section className="space-y-4"><h1 className="text-lg font-bold">سوابق</h1><QueryState isLoading={requests.isLoading} error={requests.error} isEmpty={!terminal.length}>{terminal.map((request) => <RequestCard key={request.id} request={request} />)}</QueryState></section>;
}

export function EditRequest({ id }: { id: string }) {
  const request = useRequest(id);
  const update = useUpdateRequest(id);
  const navigate = useNavigate();
  if (request.isLoading) return <p className="py-8 text-center text-sm text-muted">در حال دریافت درخواست…</p>;
  if (request.error || !request.data) return <p role="alert" className="py-8 text-center text-sm text-danger">{request.error?.message ?? "درخواست پیدا نشد."}</p>;
  return <RequestForm initial={request.data} isPending={update.isPending} error={update.error?.message} onSubmit={(input) => update.mutate(input, { onSuccess: () => navigate({ to: "/requests/active" }) })} />;
}
