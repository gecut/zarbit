import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi } from "./api-provider";
import { useIdentity } from "./auth";
export function useTelegramSession() {
  const api = useApi();
  const identity = useIdentity();
  return useQuery({
    queryKey: ["telegram-session", identity.telegramUserId],
    queryFn: api.getTelegramSession,
    refetchInterval: (query) =>
      query.state.data?.login || query.state.data?.state === "REVOKING"
        ? 1000
        : 10000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: "always",
  });
}
export function useSessionCommand() {
  const api = useApi();
  const client = useQueryClient();
  const identity = useIdentity();
  return useMutation({
    mutationFn: api.sessionCommand,
    gcTime: 0,
    retry: false,
    onSuccess: (data) => {
      client.setQueryData(["telegram-session", identity.telegramUserId], data);
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ["telegram-session"] });
      void client.invalidateQueries({ queryKey: ["requests"] });
    },
  });
}
