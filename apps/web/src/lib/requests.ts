import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  cancelRequest,
  createRequest,
  getRequest,
  getRequests,
  updateRequest,
  type RequestPayload,
  type RequestStatus,
} from "./api";
import { useIdentity } from "./auth";
export function useRequests(status?: RequestStatus | "HISTORY", page = 1) {
  const user = useIdentity();
  return useQuery({
    queryKey: ["requests", user.telegramUserId, "list", status, page],
    queryFn: () => getRequests(status, page),
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: "always",
  });
}
export function useRequest(id: string) {
  const user = useIdentity();
  return useQuery({
    queryKey: ["requests", user.telegramUserId, "detail", id],
    queryFn: () => getRequest(id),
    refetchInterval: 10000,
  });
}
function useRefresh() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ["requests"] });
}
export function useCreateRequest() {
  return useMutation({
    mutationFn: (input: RequestPayload) => createRequest(input),
    onSuccess: useRefresh(),
    retry: false,
  });
}
export function useUpdateRequest(id: string) {
  return useMutation({
    mutationFn: (input: RequestPayload) => updateRequest(id, input),
    onSuccess: useRefresh(),
    retry: false,
  });
}
export function useCancelRequest() {
  return useMutation({
    mutationFn: cancelRequest,
    onSettled: useRefresh(),
    retry: false,
  });
}
