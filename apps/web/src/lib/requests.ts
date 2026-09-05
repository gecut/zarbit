import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RequestPayload, RequestStatus } from "./api";
import { useApi } from "./api-provider";
import { useIdentity } from "./auth";
export function useRequests(status?: RequestStatus | "HISTORY", page = 1) {
  const api = useApi();
  const user = useIdentity();
  return useQuery({
    queryKey: ["requests", user.telegramUserId, "list", status, page],
    queryFn: () => api.getRequests(status, page),
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: "always",
  });
}
export function useRequest(id: string) {
  const api = useApi();
  const user = useIdentity();
  return useQuery({
    queryKey: ["requests", user.telegramUserId, "detail", id],
    queryFn: () => api.getRequest(id),
    refetchInterval: 10000,
  });
}
function useRefresh() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ["requests"] });
}
export function useCreateRequest() {
  const api = useApi();
  return useMutation({
    mutationFn: (input: RequestPayload) => api.createRequest(input),
    onSuccess: useRefresh(),
    retry: false,
  });
}
export function useUpdateRequest(id: string) {
  const api = useApi();
  return useMutation({
    mutationFn: (input: RequestPayload) => api.updateRequest(id, input),
    onSuccess: useRefresh(),
    retry: false,
  });
}
export function useCancelRequest() {
  const api = useApi();
  return useMutation({
    mutationFn: api.cancelRequest,
    onSettled: useRefresh(),
    retry: false,
  });
}
