import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi } from "../../shared/api/api-context";
import { MarketLive } from "./_market-live";

export function useMarket() {
  const api = useApi("market");
  const client = useQueryClient();
  const live = useMemo(() => new MarketLive(api, client), [api, client]);
  const view = useSyncExternalStore(live.subscribe, live.getSnapshot);
  useEffect(() => live.start(), [live]);
  const snapshot = useQuery(
    api.market.snapshot.queryOptions({
      refetchInterval: view.connection === "degraded" ? 10_000 : false,
    }),
  );
  return { snapshot, connection: view.connection };
}
