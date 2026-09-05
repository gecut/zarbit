import { Button } from "@heroui/react";
import { AddCircleIcon } from "@solar-icons/react/linear/add-circle";
import { Link, useNavigate } from "@tanstack/react-router";

import { useRequests } from "../../lib/requests";
import { QueryState } from "./query-state";
import { RequestCard } from "./request-card";

export function Dashboard() {
  const requests = useRequests();
  const navigate = useNavigate();
  return (
    <section className="grid gap-[1.05rem]">
      <article className="relative overflow-hidden rounded-[var(--radius-2xl)] bg-[linear-gradient(132deg,var(--accent),var(--accent-hover)_56%,var(--accent))] p-5 text-accent-foreground shadow-surface sm:p-[1.65rem]"><span aria-hidden="true" className="absolute -top-[4.5rem] -left-[3.5rem] size-48 rounded-full border-[1.5rem] border-surface" /><p className="relative m-0 text-xs font-semibold">مدیریت هوشمند مظنه</p><h1 className="relative mt-[0.34rem] max-w-[17rem] text-xl leading-[1.55] font-semibold sm:max-w-none">در لحظه‌ای که قیمت به هدف شما رسید، آماده باشید.</h1><div className="relative mt-[1.6rem] flex items-end justify-between gap-4"><div><span className="block text-right text-4xl leading-none font-semibold tracking-[-0.08em]" dir="ltr">{requests.data?.activeCount ?? "—"}</span><span className="mt-[0.32rem] block text-xs">درخواست فعال</span></div><Button className="min-h-11 text-sm font-semibold" onPress={() => navigate({ to: "/requests/new" })} variant="secondary"><AddCircleIcon size={20} />درخواست جدید</Button></div></article>
      <div className="flex items-center justify-between gap-3"><h2 className="text-base font-semibold text-foreground">آخرین درخواست‌ها</h2><Link className="text-xs font-semibold text-accent" to="/requests/active">مشاهده همه</Link></div>
      <div className="grid gap-[0.7rem]"><QueryState error={requests.error} isEmpty={!requests.data?.items.length} isLoading={requests.isLoading}>{requests.data?.items.slice(0, 4).map((request) => <RequestCard key={request.id} request={request} />)}</QueryState></div>
    </section>
  );
}
