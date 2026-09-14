import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { AppError } from "@zarbit/contracts";
import { retryDelay, retryQuery, slowQuery } from "./query-policy";

export function createQueryClient() {
  const unauthorized = (error: unknown) => {
    if (!(error instanceof AppError) || ![401, 403].includes(error.status))
      return;
    // Discard private snapshots and force the authentication gate to recheck.
    void client.cancelQueries();
    client.removeQueries({
      predicate: (query) => query.meta?.authGate !== true,
    });
    for (const query of client.getQueryCache().getAll()) {
      if (query.meta?.authGate === true)
        query.setState({ data: undefined, error, status: "error" });
    }
  };
  const client = new QueryClient({
    queryCache: new QueryCache({ onError: unauthorized }),
    mutationCache: new MutationCache({ onError: unauthorized }),
    defaultOptions: {
      queries: {
        ...slowQuery,
        networkMode: "online",
        retry: retryQuery,
        retryDelay,
      },
      mutations: { retry: false, gcTime: 0, networkMode: "always" },
    },
  });
  return client;
}
