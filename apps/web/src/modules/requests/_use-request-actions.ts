import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { RequestDetail } from "@zarbit/contracts";
import { useApi } from "../../shared/api/api-context";
import { useIdentity } from "../../shared/auth/auth";

export function useRequestActions() {
  const api = useApi(useIdentity().telegramUserId);
  const client = useQueryClient();
  const callbacks = {
    onMutate: async () => {
      await client.cancelQueries({ queryKey: api.requests.key() });
    },
    onSuccess: (data: RequestDetail) => {
      client.setQueryData(
        api.requests.detail.queryKey({ input: { id: data.id } }),
        data,
      );
    },
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: api.requests.key() });
    },
  };
  const create = useMutation(api.requests.create.mutationOptions(callbacks));
  const update = useMutation(api.requests.update.mutationOptions(callbacks));
  const cancel = useMutation(api.requests.cancel.mutationOptions(callbacks));
  const forceSend = useMutation(
    api.requests.forceSend.mutationOptions(callbacks),
  );
  return { create, update, cancel, forceSend };
}
