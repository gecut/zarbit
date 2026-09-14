import type { QueryClient } from "@tanstack/react-query";
import type { RequestDetail } from "@zarbit/contracts";
import type { RpcUtils } from "../../shared/api/orpc";

export function requestMutationOptions(api: RpcUtils, client: QueryClient) {
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
  return {
    create: api.requests.create.mutationOptions({
      ...callbacks,
      onSuccess: (data: RequestDetail) => {
        callbacks.onSuccess(data);
        if (data.status !== "ACTIVE") return;
        // Resume polling immediately, even if the following refetch fails.
        client.setQueryData(api.requests.active.queryKey(), (rows) => [
          data,
          ...(rows ?? []).filter((row) => row.id !== data.id),
        ]);
      },
    }),
    update: api.requests.update.mutationOptions(callbacks),
    cancel: api.requests.cancel.mutationOptions(callbacks),
    forceSend: api.requests.forceSend.mutationOptions(callbacks),
  };
}
