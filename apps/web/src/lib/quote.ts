import { useQuery } from "@tanstack/react-query";

import { useApi } from "./api-provider";
import { useIdentity } from "./auth";

export function useLatestQuote() {
  const api = useApi();
  const identity = useIdentity();
  return useQuery({
    queryKey: ["latest-quote", identity.telegramUserId],
    queryFn: api.getLatestQuote,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: "always",
  });
}
