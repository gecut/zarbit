import {
  Alert,
  Button,
  Chip,
  Spinner,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AddIcon } from "@solar-icons/react/linear";
import type { CreateRequestInput, RequestDetail } from "@zarbit/contracts";
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

type FilterAction = "ALL" | "BUY" | "SELL" | "ALERT";

interface RequestListProps {
  history?: boolean;
  requestId?: string;
  onCloseLinkedRequest?: () => void;
  createOpen?: boolean;
  onOpenCreateChange?: (open: boolean) => void;
  initialAction?: CreateRequestInput["action"];
  currentQuote?: number;
}

export function RequestList({
  history = false,
  requestId,
  onCloseLinkedRequest,
  createOpen: externalCreateOpen,
  onOpenCreateChange: externalOnOpenCreateChange,
  initialAction,
  currentQuote,
}: RequestListProps) {
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
  const rows = useMemo(
    () =>
      history
        ? (past.data?.pages.flatMap((page) => page.items) ?? [])
        : (active.data ?? []),
    [history, past.data, active.data],
  );
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

  const [internalCreateOpen, setInternalCreateOpen] = useState(false);
  const isCreateOpenControlled = externalCreateOpen !== undefined;
  const createOpen = isCreateOpenControlled
    ? externalCreateOpen
    : internalCreateOpen;
  const setCreateOpen = (nextOpen: boolean) => {
    if (isCreateOpenControlled) {
      externalOnOpenCreateChange?.(nextOpen);
    } else {
      setInternalCreateOpen(nextOpen);
    }
  };
  const [selectedRequest, setSelectedRequest] = useState<RequestDetail | null>(
    null,
  );
  const [activeFilter, setActiveFilter] = useState<FilterAction>("ALL");

  const filteredRows = useMemo(() => {
    if (activeFilter === "ALL") return rows;
    return rows.filter((r) => r.action === activeFilter);
  }, [rows, activeFilter]);

  const counts = useMemo(() => {
    return {
      all: rows.length,
      buy: rows.filter((r) => r.action === "BUY").length,
      sell: rows.filter((r) => r.action === "SELL").length,
      alert: rows.filter((r) => r.action === "ALERT").length,
    };
  }, [rows]);

  const sectionClasses = "grid gap-3";

  const innerClasses = "flex flex-col gap-3";

  return (
    <section className={sectionClasses}>
      <div className={innerClasses}>
        {/* Header */}
        <div className="border-separator/40 flex items-center justify-between gap-2 border-b pb-2.5">
          <div className="flex items-center gap-2">
            <h2 className="text-foreground text-sm font-bold sm:text-base">
              {history ? "سوابق درخواست‌ها" : "درخواست‌های فعال"}
            </h2>
            {!history && active.data && active.data.length > 0 && (
              <Chip color="accent" variant="soft" size="sm">
                <Chip.Label>
                  {new Intl.NumberFormat("fa-IR").format(active.data.length)}
                </Chip.Label>
              </Chip>
            )}
          </div>

          {!history && !isCreateOpenControlled && (
            <Button
              onPress={() => setCreateOpen(true)}
              variant="secondary"
              size="sm"
              className="h-7 gap-1 rounded-xl px-2.5 text-xs font-medium"
            >
              <AddIcon className="size-3.5" />
              <span>ثبت درخواست</span>
            </Button>
          )}
        </div>

        {(rows.length > 1 || activeFilter !== "ALL") && (
          <ToggleButtonGroup
            aria-label="فیلتر درخواست‌ها"
            selectionMode="single"
            disallowEmptySelection
            size="sm"
            selectedKeys={[activeFilter]}
            onSelectionChange={(keys) => {
              const key = Array.from(keys)[0];
              if (
                key === "ALL" ||
                key === "BUY" ||
                key === "SELL" ||
                key === "ALERT"
              )
                setActiveFilter(key);
            }}
          >
            {(
              [
                { id: "ALL", label: "همه", count: counts.all },
                { id: "BUY", label: "خرید", count: counts.buy },
                { id: "SELL", label: "فروش", count: counts.sell },
                { id: "ALERT", label: "هشدار", count: counts.alert },
              ] as const
            ).map((tab) => (
              <ToggleButton key={tab.id} id={tab.id}>
                {tab.label} {new Intl.NumberFormat("fa-IR").format(tab.count)}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        )}

        <RequestFormDrawer
          initialAction={initialAction}
          onDone={async () => {
            setCreateOpen(false);
          }}
          onOpenChange={setCreateOpen}
          open={createOpen}
        />

        {query.isPending ? (
          <div className="text-muted flex items-center justify-center py-6 text-xs">
            <Spinner size="sm" />
            در حال بارگذاری درخواست‌ها…
          </div>
        ) : null}

        {query.error ? (
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>دریافت درخواست‌ها ناموفق بود.</Alert.Title>
              <Button
                onPress={() => void query.refetch()}
                variant="secondary"
                size="sm"
              >
                تلاش دوباره
              </Button>
            </Alert.Content>
          </Alert>
        ) : null}

        {filteredRows.length > 0 ? (
          <div className="flex flex-col gap-2">
            {filteredRows.map((row) => (
              <RequestCard
                key={row.id}
                onDetails={() => setSelectedRequest(row)}
                row={row}
                currentQuote={currentQuote}
                compact={!history}
              />
            ))}
          </div>
        ) : !query.isPending && !query.error ? (
          <div className="text-muted grid gap-1 py-3 text-xs">
            <strong className="text-foreground text-xs font-semibold">
              {activeFilter !== "ALL"
                ? "در این فیلتر درخواستی وجود ندارد"
                : history
                  ? "هنوز سابقه‌ای ثبت نشده است"
                  : "هیچ درخواست یا هشدار فعالی در جریان نیست"}
            </strong>
            <p className="text-muted max-w-xs text-[0.7rem] leading-relaxed">
              {history
                ? "سفارش‌ها و هشدارهای تکمیل‌شده یا لغوشده در اینجا نمایش داده می‌شوند."
                : "برای شروع، خرید، فروش یا هشدار را انتخاب کنید."}
            </p>
          </div>
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
      </div>
    </section>
  );
}
