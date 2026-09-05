import { Button } from "@heroui/react";
import { useState } from "react";
import type { RequestStatus } from "../../lib/api";
import { useRequests } from "../../lib/requests";
import { PageControls } from "./page-controls";
import { QueryState } from "./query-state";
import { RequestCard } from "./request-card";
import { statusLabels } from "./request-labels";

export function History() {
  const [status, setStatus] = useState<RequestStatus | "HISTORY">("HISTORY");
  const [page, setPage] = useState(1);
  const requests = useRequests(status, page);
  return <section className="grid gap-[1.05rem]"><div className="flex items-start justify-between gap-[0.9rem]"><div><h1 className="m-0 text-base leading-[1.55] font-semibold text-foreground">سوابق درخواست‌ها</h1><p className="mt-[0.18rem] text-xs leading-[1.7] text-muted">نتیجه درخواست‌ها و مظنه اجرا به ریال</p></div></div><div aria-label="فیلتر وضعیت" className="flex flex-wrap gap-2" role="group">{(["HISTORY", "DONE", "FAILED", "CANCELLED"] as const).map((key) => <Button aria-pressed={status === key} key={key} onPress={() => { setStatus(key); setPage(1); }} variant={status === key ? "primary" : "secondary"}>{key === "HISTORY" ? "همه" : statusLabels[key]}</Button>)}</div><div className="grid gap-[0.7rem] sm:grid-cols-2"><QueryState error={requests.error} isEmpty={!requests.data?.items.length} isLoading={requests.isLoading}>{requests.data?.items.map((request) => <RequestCard key={request.id} request={request} />)}</QueryState></div><PageControls page={page} setPage={setPage} total={requests.data?.total ?? 0} /></section>;
}
