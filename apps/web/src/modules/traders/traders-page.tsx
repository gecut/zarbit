import { useState } from "react";
import { Button, Card, Skeleton } from "@heroui/react";
import { useQuery } from "@tanstack/react-query";
import type { SortOrder, TraderSortField } from "@zarbit/contracts";
import { useIdentity } from "../../shared/auth/auth";
import { useApi } from "../../shared/api/api-context";
import { TraderSortBar } from "./_trader-sort-bar";
import { TraderCard } from "./_trader-card";
import { TraderDetailDrawer } from "./_trader-detail-drawer";

export function TradersPage() {
  const [sortBy, setSortBy] = useState<TraderSortField>("REALIZED_PNL");
  const [sortOrder, setSortOrder] = useState<SortOrder>("DESC");
  const [selectedAlias, setSelectedAlias] = useState<string | null>(null);

  const api = useApi(useIdentity().telegramUserId);
  const tradersQuery = useQuery(
    api.analytics.traders.queryOptions({
      input: { sortBy, sortOrder, limit: 50 },
      refetchInterval: 30000,
    }),
  );

  const traders = tradersQuery.data ?? [];

  return (
    <section className="space-y-4">
      <TraderSortBar
        sortBy={sortBy}
        sortOrder={sortOrder}
        onChange={(field, order) => {
          setSortBy(field);
          setSortOrder(order);
        }}
      />

      {/* Loading Skeleton */}
      {tradersQuery.isLoading && (
        <div className="space-y-2.5">
          {[1, 2, 3, 4, 5].map((i) => (
            <Card
              key={i}
              className="border-border bg-surface space-y-3 rounded-2xl border p-4"
            >
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-24 rounded-lg" />
                <Skeleton className="h-5 w-32 rounded-lg" />
              </div>
              <Skeleton className="h-4 w-full rounded-lg" />
            </Card>
          ))}
        </div>
      )}

      {/* Error State */}
      {tradersQuery.isError && (
        <Card className="border-danger/30 bg-danger/5 space-y-3 rounded-2xl border p-6 text-center">
          <p className="text-danger text-sm font-medium">
            خطا در دریافت لیست فعالان بازار.
          </p>
          <Button
            size="sm"
            variant="tertiary"
            onPress={() => void tradersQuery.refetch()}
            className="text-xs"
          >
            تلاش مجدد
          </Button>
        </Card>
      )}

      {/* Empty State */}
      {!tradersQuery.isLoading &&
        !tradersQuery.isError &&
        traders.length === 0 && (
          <Card className="border-border bg-surface space-y-2 rounded-2xl border p-8 text-center">
            <p className="text-foreground text-sm font-semibold">
              معامله‌گری یافت نشد
            </p>
            <p className="text-muted text-xs">
              در حال حاضر در بازه زمانی ۷ روز گذشته معامله‌ای در سیستم ثبت نشده
              است.
            </p>
          </Card>
        )}

      {/* Traders List */}
      {!tradersQuery.isLoading &&
        !tradersQuery.isError &&
        traders.length > 0 && (
          <div className="space-y-2.5">
            {traders.map((trader, index) => (
              <TraderCard
                key={trader.alias}
                trader={trader}
                rank={index + 1}
                onSelect={(alias) => setSelectedAlias(alias)}
              />
            ))}
          </div>
        )}

      {/* Detail Drawer */}
      <TraderDetailDrawer
        alias={selectedAlias}
        onClose={() => setSelectedAlias(null)}
      />
    </section>
  );
}
