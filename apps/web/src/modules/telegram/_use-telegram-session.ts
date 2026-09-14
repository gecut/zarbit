import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  telegramSessionStatusSchema,
  isTelegramOperationPending,
} from "@zarbit/contracts";
import { useApi } from "../../shared/api/api-context";
import { useIdentity } from "../../shared/auth/auth";
import { sessionInterval } from "../../shared/api/query-policy";
export function useTelegramSession() {
  const api = useApi(useIdentity().telegramUserId);
  return useQuery(
    api.telegram.status.queryOptions({
      refetchInterval: (query) => sessionInterval(query.state.data),
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: "always",
      structuralSharing: (previous, next) => {
        const before = telegramSessionStatusSchema.safeParse(previous);
        const after = telegramSessionStatusSchema.safeParse(next);
        if (
          before.success &&
          after.success &&
          (after.data.revision < before.data.revision ||
            (after.data.revision === before.data.revision &&
              (after.data.version < before.data.version ||
                (after.data.version === before.data.version &&
                  after.data.observedAt < before.data.observedAt))))
        )
          return previous;
        return next;
      },
    }),
  );
}
export function useTelegramOperation(id: string | null, reconcile: boolean) {
  const api = useApi(useIdentity().telegramUserId);
  return useQuery(
    api.telegram.operation.queryOptions({
      input: { id: id ?? "00000000-0000-4000-8000-000000000000" },
      enabled: !!id,
      refetchInterval: (query) =>
        query.state.data
          ? isTelegramOperationPending(query.state.data)
            ? 2000
            : false
          : reconcile
            ? 2000
            : false,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: "always",
      staleTime: 0,
    }),
  );
}
export function useSessionCommand() {
  const api = useApi(useIdentity().telegramUserId);
  const client = useQueryClient();
  return useMutation(
    api.telegram.command.mutationOptions({
      onMutate: () =>
        client.cancelQueries({ queryKey: api.telegram.status.key() }),
      onSettled: () => {
        // Admission ends independently of observation and unrelated request refreshes.
        void client.invalidateQueries({ queryKey: api.telegram.key() });
        void client.invalidateQueries({ queryKey: api.requests.key() });
      },
    }),
  );
}
