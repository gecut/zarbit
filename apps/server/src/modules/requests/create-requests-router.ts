import {
  AppError,
  type CreateRequestInput,
  type RequestDetail,
  type RequestHistoryPage,
  type UpdateRequestInput,
} from "@zarbit/contracts";
import { requestView } from "@zarbit/db/requests";
import type { AppDependencies } from "../../app-dependencies";
import type { ResponseCache } from "../../platform/cache/response-cache";
import { requireLiveSession } from "./require-live-session";

export interface RequestsRouterDependencies {
  store: AppDependencies["store"];
  command: AppDependencies["command"];
  active: ResponseCache<RequestDetail[]>;
  read: <T>(name: string, load: () => Promise<T>) => Promise<T>;
}

export function createRequestsRouter<
  TActive,
  THistory,
  TDetail,
  TCreate,
  TUpdate,
  TCancel,
  TForceSend,
>(
  builder: {
    active: {
      handler: (
        fn: (opt: {
          context: { user: { id: string } };
        }) => Promise<RequestDetail[]>,
      ) => TActive;
    };
    history: {
      handler: (
        fn: (opt: {
          context: { user: { id: string } };
          input: { cursor?: string };
        }) => Promise<RequestHistoryPage>,
      ) => THistory;
    };
    detail: {
      handler: (
        fn: (opt: {
          context: { user: { id: string } };
          input: { id: string };
        }) => Promise<RequestDetail>,
      ) => TDetail;
    };
    create: {
      handler: (
        fn: (opt: {
          context: { user: { id: string } };
          input: CreateRequestInput;
        }) => Promise<RequestDetail>,
      ) => TCreate;
    };
    update: {
      handler: (
        fn: (opt: {
          context: { user: { id: string } };
          input: { id: string; data: UpdateRequestInput };
        }) => Promise<RequestDetail>,
      ) => TUpdate;
    };
    cancel: {
      handler: (
        fn: (opt: {
          context: { user: { id: string } };
          input: { id: string };
        }) => Promise<RequestDetail>,
      ) => TCancel;
    };
    forceSend: {
      handler: (
        fn: (opt: {
          context: { user: { id: string } };
          input: { id: string };
        }) => Promise<RequestDetail>,
      ) => TForceSend;
    };
  },
  deps: RequestsRouterDependencies,
): {
  active: TActive;
  history: THistory;
  detail: TDetail;
  create: TCreate;
  update: TUpdate;
  cancel: TCancel;
  forceSend: TForceSend;
} {
  const changeRequest = async <T>(id: string, action: () => Promise<T>) => {
    deps.active.invalidate(id);
    try {
      return await action();
    } finally {
      deps.active.invalidate(id);
    }
  };

  return {
    active: builder.active.handler(({ context }) =>
      deps.active.get(context.user.id, () =>
        deps.read("active", async () =>
          (await deps.store.activeRequests(context.user.id)).map(requestView),
        ),
      ),
    ),
    history: builder.history.handler(({ context, input }) =>
      deps.read("history", () =>
        deps.store.requestHistory(context.user.id, input.cursor),
      ),
    ),
    detail: builder.detail.handler(async ({ context, input }) => {
      const row = await deps.read("detail", () =>
        deps.store.request(context.user.id, input.id),
      );
      if (!row) throw new AppError("NOT_FOUND", "درخواست پیدا نشد.", 404);
      return requestView(row);
    }),
    create: builder.create.handler(({ context, input }) =>
      changeRequest(context.user.id, async () => {
        const existing = await deps.store.findRequestCreation?.(
          context.user.id,
          input,
        );
        if (existing) {
          return requestView(existing);
        }
        await requireLiveSession(deps.command, context.user.id);
        return requestView(
          await deps.store.createRequest(context.user.id, input),
        );
      }),
    ),
    update: builder.update.handler(({ context, input }) =>
      changeRequest(context.user.id, async () => {
        await requireLiveSession(deps.command, context.user.id);
        return requestView(
          await deps.store.editRequest(context.user.id, input.id, input.data),
        );
      }),
    ),
    cancel: builder.cancel.handler(({ context, input }) =>
      changeRequest(context.user.id, async () =>
        requestView(await deps.store.cancelRequest(context.user.id, input.id)),
      ),
    ),
    forceSend: builder.forceSend.handler(({ context, input }) =>
      changeRequest(context.user.id, async () => {
        const row = await deps.store.request(context.user.id, input.id);
        if (!row) throw new AppError("NOT_FOUND", "درخواست پیدا نشد.", 404);
        await requireLiveSession(deps.command, context.user.id);
        await deps.command(context.user.id, {
          type: "force-send",
          id: input.id,
        });
        return requestView(
          (await deps.store.request(context.user.id, input.id)) ?? row,
        );
      }),
    ),
  };
}
