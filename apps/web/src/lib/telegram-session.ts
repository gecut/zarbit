import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createTelegramQrChallenge,
  disconnectTelegramSession,
  getTelegramSession,
} from "./api";

export const telegramSessionKey = ["telegram-session"] as const;

export function useTelegramSession() {
  return useQuery({
    queryKey: telegramSessionKey,
    queryFn: getTelegramSession,
    refetchInterval: (query) => query.state.data?.state === "PENDING_QR" ? 1_000 : false,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: "always",
  });
}

export function useCreateTelegramQrChallenge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createTelegramQrChallenge,
    onSuccess: (data) => queryClient.setQueryData(telegramSessionKey, data),
  });
}

export function useDisconnectTelegramSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: disconnectTelegramSession,
    onSuccess: (data) => queryClient.setQueryData(telegramSessionKey, data),
  });
}
