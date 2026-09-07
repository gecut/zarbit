import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { useApi } from "./api-provider";
import { useIdentity } from "./auth";

const foregroundIntervalMs = 15_000;
const backgroundIntervalMs = 60_000;

export function useQuoteDashboard() {
  const api = useApi();
  const identity = useIdentity();
  const query = useQuery({
    queryKey: ["quote-dashboard", identity.telegramUserId],
    queryFn: api.getQuoteDashboard,
    refetchInterval: () =>
      document.visibilityState === "visible"
        ? foregroundIntervalMs
        : backgroundIntervalMs,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: "always",
  });

  const { refetch } = query;

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [refetch]);

  return query;
}
