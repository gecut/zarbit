import type { RpcClient } from "@zarbit/contracts/rpc";
import type {
  CreateRequestInput,
  UpdateRequestInput,
  WorkerCommand,
} from "@zarbit/contracts";
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
      command: (input: Exclude<WorkerCommand, { type: "status" }>) =>
        api.sessionCommand(input),
    },
    requests: {
      active: () => api.getActiveRequests(),
      history: (input?: { cursor?: string }) =>
        api.getRequestHistory(input?.cursor),
      detail: ({ id }: { id: string }) => api.getRequest(id),
      create: (input: CreateRequestInput) => api.createRequest(input),
      update: ({ id, data }: { id: string; data: UpdateRequestInput }) =>
        api.updateRequest(id, data),
      cancel: ({ id }: { id: string }) => api.cancelRequest(id),
      forceSend: ({ id }: { id: string }) => api.forceSendRequest(id),
    },
  } as unknown as RpcClient;
}
