import { useQuery } from "@tanstack/react-query";
import { useApi } from "../../shared/api/api-context";
import { marketPolling } from "../../shared/api/query-policy";

export function useMarket() {
  const api = useApi("market");
  const snapshot = useQuery(api.market.snapshot.queryOptions(marketPolling));
  const connection: "connecting" | "healthy" | "degraded" = snapshot.isFetching
    ? "connecting"
    : snapshot.isError
      ? "degraded"
      : "healthy";
  return { snapshot, connection };
}
