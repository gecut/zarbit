import { useQuery } from "@tanstack/react-query";
import { useApi } from "../../shared/api/api-context";
import { useIdentity } from "../../shared/auth/auth";

export function useQuoteDashboard() {
  const api = useApi(useIdentity().telegramUserId);
  return useQuery(api.quote.dashboard.queryOptions());
}
