import type { RpcClient } from "@zarbit/contracts/rpc";
import type { LegacyApi } from "./legacy-api";

/** Compatibility seam for the rollback transport and existing development scenarios. */
export function adaptLegacyApi(api: LegacyApi): RpcClient {
  return {
    auth: { identity: () => api.authenticate() },
    quote: {
      dashboard: () => api.getQuoteDashboard(),
      latest: async () => (await api.getQuoteDashboard()).latest,
    },
    telegram: {
      status: () => api.getTelegramSession(),
      command: (input) => api.sessionCommand(input),
    },
    requests: {
      active: () => api.getActiveRequests(),
      history: (input) => api.getRequestHistory(input.cursor),
      detail: ({ id }) => api.getRequest(id),
      create: (input) => api.createRequest(input),
      update: ({ id, data }) => api.updateRequest(id, data),
      cancel: ({ id }) => api.cancelRequest(id),
      forceSend: ({ id }) => api.forceSendRequest(id),
    },
  };
}
