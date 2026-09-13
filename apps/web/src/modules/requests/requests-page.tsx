import { Button, Card } from "@heroui/react";
import { useEffect, useRef, useState } from "react";
import { AddIcon } from "@solar-icons/react/linear";
import type { RequestDetail } from "@zarbit/contracts";
import {
  useQuery,
  useInfiniteQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useIdentity } from "../../shared/auth/auth";

import { useApi } from "../../shared/api/api-context";
import { RequestCard } from "./_request-card";
import { RequestDetailsDrawer } from "./_request-details-drawer";
import { RequestFormDrawer } from "./_request-form-drawer";

export function RequestList({
  history = false,
  requestId,
  onCloseLinkedRequest,
}: {
  history?: boolean;
  requestId?: string;
  onCloseLinkedRequest?: () => void;
}) {
  const api = useApi(useIdentity().telegramUserId);
  const client = useQueryClient();
  const active = useQuery(
    api.requests.active.queryOptions({
      enabled: !history,
      refetchInterval: (query) => (query.state.data?.length ? 4_000 : false),
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: "always",
      refetchOnReconnect: "always",
    }),
  );
  const historyOptions = api.requests.history.infiniteOptions({
    input: (cursor: string | undefined) => ({ cursor }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    queryFn: ({ pageParam, signal }) =>
      client.fetchQuery({
        ...api.requests.history.queryOptions({ input: { cursor: pageParam } }),
        queryFn: () =>
          api.requests.history.call({ cursor: pageParam }, { signal }),
      }),
  });
  const past = useInfiniteQuery({ ...historyOptions, enabled: history });
  const rows = history
    ? (past.data?.pages.flatMap((page) => page.items) ?? [])
    : (active.data ?? []);
  const query = history ? past : active;
  const previousIds = useRef<string[]>([]);
  useEffect(() => {
    if (!active.data) return;
    const ids = active.data.map((row) => row.id);
    if (previousIds.current.some((id) => !ids.includes(id))) {
      void client.invalidateQueries({ queryKey: api.requests.history.key() });
    }
    previousIds.current = ids;
  }, [active.data, api, client]);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<RequestDetail | null>(
    null,
  );

  return (
    <section
      className={
        history
          ? "grid gap-4"
          : "border-accent/20 bg-surface shadow-surface grid gap-4 rounded-3xl border p-4 sm:p-5"
      }
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">
          {history ? "سوابق درخواست‌ها" : "درخواست‌های فعال"}
          {!history && active.data && (
            <span className="bg-surface-secondary text-muted ms-2 rounded-full px-2 py-1 text-xs">
              {new Intl.NumberFormat("fa-IR").format(active.data.length)}
            </span>
          )}
        </h2>

        {!history ? (
          <Button
            onPress={() => setCreateOpen(true)}
            variant="primary"
            size="sm"
          >
            <AddIcon className="size-4" />
            درخواست جدید
          </Button>
        ) : null}
      </div>

      <RequestFormDrawer
        onDone={async () => {
          setCreateOpen(false);
        }}
        onOpenChange={setCreateOpen}
        open={createOpen}
      />

      {query.isPending ? <p role="status">در حال دریافت درخواست‌ها…</p> : null}
      {query.error ? (
        <div role="alert">
          <p>{query.error.message}</p>
          <Button onPress={() => void query.refetch()} variant="secondary">
            تلاش دوباره
          </Button>
        </div>
      ) : null}
      {rows.length ? (
        rows.map((row) => (
          <RequestCard
            key={row.id}
            onDetails={() => setSelectedRequest(row)}
            row={row}
          />
        ))
      ) : !query.isPending && !query.error ? (
        <Card variant="tertiary" className="p-5 text-center text-sm">
          {history
            ? "هنوز سابقه‌ای ثبت نشده است."
            : "درخواست فعالی نیست. با ساخت درخواست جدید، زربیت بازار را برایتان بررسی می‌کند."}
        </Card>
      ) : null}
      {history && past.hasNextPage ? (
        <Button
          onPointerEnter={() => {
            const cursor = past.data?.pages.at(-1)?.nextCursor;
            if (cursor)
              void client.prefetchQuery(
                api.requests.history.queryOptions({ input: { cursor } }),
              );
          }}
          onPress={() => void past.fetchNextPage()}
          isPending={past.isFetchingNextPage}
          variant="secondary"
        >
          سوابق بیشتر
        </Button>
      ) : null}

      <RequestDetailsDrawer
        onClose={() => {
          setSelectedRequest(null);
          if (requestId) onCloseLinkedRequest?.();
        }}
        request={requestId ? null : selectedRequest}
        requestId={requestId}
      />
    </section>
  );
}
