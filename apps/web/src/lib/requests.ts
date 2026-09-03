import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { cancelRequest, createRequest, getRequest, getRequests, updateRequest, type RequestPayload, type RequestStatus } from "./api";

export const requestKeys = {
  all: ["requests"] as const,
  detail: (id: string) => ["requests", id] as const,
};

export function useRequests(status?: RequestStatus) {
  return useQuery({ queryKey: [...requestKeys.all, status], queryFn: () => getRequests(status) });
}

export function useRequest(id: string) {
  return useQuery({ queryKey: requestKeys.detail(id), queryFn: () => getRequest(id) });
}

function useRefreshRequests() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: requestKeys.all });
}

export function useCreateRequest() {
  const refresh = useRefreshRequests();
  return useMutation({ mutationFn: (payload: RequestPayload) => createRequest(payload), onSuccess: refresh });
}

export function useUpdateRequest(id: string) {
  const refresh = useRefreshRequests();
  return useMutation({ mutationFn: (payload: RequestPayload) => updateRequest(id, payload), onSuccess: refresh });
}

export function useCancelRequest() {
  const refresh = useRefreshRequests();
  return useMutation({ mutationFn: (id: string) => cancelRequest(id), onSuccess: refresh });
}
