import { eventIterator, oc, type ContractRouterClient } from "@orpc/contract";
import { z } from "zod";
import {
  createRequestInputSchema,
  updateRequestInputSchema,
  requestDetailSchema,
  requestHistoryPageSchema,
  marketSnapshotSchema,
  marketLiveEventSchema,
  telegramSessionStatusSchema,
  sessionCommandSchema,
  participantAnalyticsSummarySchema,
  participantAnalyticsDetailSchema,
  traderListQuerySchema,
  traderDetailQuerySchema,
} from "./index";

export const rpcErrorDataSchema = z
  .object({
    appCode: z.string(),
    reasonCode: z.string(),
    messageKey: z.string(),
    requestId: z.string().min(1),
    retryAt: z.string().optional(),
    retryAfter: z.number().nonnegative().optional(),
  })
  .strict();
const base = oc.errors({
  BAD_REQUEST: { status: 400, data: rpcErrorDataSchema },
  UNAUTHORIZED: { status: 401, data: rpcErrorDataSchema },
  FORBIDDEN: { status: 403, data: rpcErrorDataSchema },
  NOT_FOUND: { status: 404, data: rpcErrorDataSchema },
  CONFLICT: { status: 409, data: rpcErrorDataSchema },
  TOO_MANY_REQUESTS: { status: 429, data: rpcErrorDataSchema },
  SERVICE_UNAVAILABLE: { status: 503, data: rpcErrorDataSchema },
});
const idInput = z.object({ id: z.string().min(1).max(100) }).strict();
export const rpcContract = {
  auth: {
    identity: base.route({ method: "GET", path: "/auth/identity" }).output(
      z
        .object({
          telegramUserId: z.string(),
          firstName: z.string().optional(),
          username: z.string().optional(),
        })
        .strict(),
    ),
  },
  market: {
    snapshot: base
      .route({ method: "GET", path: "/market/snapshot" })
      .output(marketSnapshotSchema),
    live: base
      .route({ method: "GET", path: "/market/live" })
      .output(eventIterator(marketLiveEventSchema)),
  },
  telegram: {
    status: base
      .route({ method: "GET", path: "/telegram/status" })
      .output(telegramSessionStatusSchema),
    command: base
      .route({ method: "POST", path: "/telegram/command" })
      .input(sessionCommandSchema)
      .output(telegramSessionStatusSchema),
  },
  requests: {
    active: base
      .route({ method: "GET", path: "/requests/active" })
      .output(z.array(requestDetailSchema)),
    history: base
      .route({ method: "GET", path: "/requests/history" })
      .input(
        z.object({ cursor: z.string().min(1).max(512).optional() }).strict(),
      )
      .output(requestHistoryPageSchema),
    detail: base
      .route({ method: "GET", path: "/requests/{id}" })
      .input(idInput)
      .output(requestDetailSchema),
    create: base
      .route({ method: "POST", path: "/requests" })
      .input(createRequestInputSchema)
      .output(requestDetailSchema),
    update: base
      .route({ method: "PATCH", path: "/requests/{id}" })
      .input(
        z
          .object({ id: idInput.shape.id, data: updateRequestInputSchema })
          .strict(),
      )
      .output(requestDetailSchema),
    cancel: base
      .route({ method: "POST", path: "/requests/{id}/cancel" })
      .input(idInput)
      .output(requestDetailSchema),
    forceSend: base
      .route({ method: "POST", path: "/requests/{id}/force-send" })
      .input(idInput)
      .output(requestDetailSchema),
  },
  analytics: {
    traders: base
      .route({ method: "GET", path: "/analytics/traders" })
      .input(traderListQuerySchema.optional())
      .output(z.array(participantAnalyticsSummarySchema)),
    traderDetail: base
      .route({ method: "GET", path: "/analytics/traders/{alias}" })
      .input(traderDetailQuerySchema)
      .output(participantAnalyticsDetailSchema.nullable()),
  },
};
export type RpcClient = ContractRouterClient<typeof rpcContract>;
