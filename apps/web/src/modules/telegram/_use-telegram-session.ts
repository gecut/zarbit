import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi } from "../../shared/api/api-context";
import { useIdentity } from "../../shared/auth/auth";
import { sessionInterval } from "../../shared/api/query-policy";
export function useTelegramSession() {
  const api = useApi(useIdentity().telegramUserId);
  return useQuery(
    api.telegram.status.queryOptions({
      refetchInterval: (query) => sessionInterval(query.state.data),
      refetchIntervalInBackground: false,
    }),
  );
}
export function useSessionCommand() {
  const api = useApi(useIdentity().telegramUserId);
  const client = useQueryClient();
  return useMutation(
    api.telegram.command.mutationOptions({
      onMutate: async () => {
        await client.cancelQueries({ queryKey: api.telegram.status.key() });
      },
      onSuccess: (data) => {
        client.setQueryData(api.telegram.status.queryKey(), data);
      },
      onSettled: async () => {
        await Promise.all([
          client.invalidateQueries({ queryKey: api.telegram.key() }),
          client.invalidateQueries({ queryKey: api.requests.key() }),
        ]);
      },
    }),
  );
}
