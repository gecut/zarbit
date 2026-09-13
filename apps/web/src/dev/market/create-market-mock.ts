import { createORPCClient } from "@orpc/client";
import {
  AppError,
  createRequestInputSchema,
  requestDetailSchema,
  requestHistoryPageSchema,
  telegramSessionStatusSchema,
  marketSnapshotSchema,
  type MarketLiveEvent,
  type RequestDetail,
} from "@zarbit/contracts";
import { rpcContract, type RpcClient } from "@zarbit/contracts/rpc";
import { applyMarketEvent } from "../../shared/api/merge-market-snapshot";
import { createMockLiveIterator } from "./mock-live-iterator";
import {
  createMarketFixtures,
  mockEpoch,
  type MarketScenario,
} from "./market-scenarios";

export function createMarketMock(
  scenario: MarketScenario = "normal",
  options: { now?: number; delayMs?: number } = {},
) {
  let clock = options.now ?? mockEpoch;
  const fixtures = createMarketFixtures(scenario, clock);
  let snapshot = fixtures.snapshot;
  let streamFailed = scenario === "fallback" || scenario === "recovery";
  let failure: string | undefined;
  let sequence = 0;
  const streams = new Set<ReturnType<typeof createMockLiveIterator>>();
  const rows: RequestDetail[] = [];
  const iso = () => new Date(clock).toISOString();
  const request = (id: string) =>
    requestDetailSchema.parse({
      id,
      action: "ALERT",
      condition: "LTE",
      targetPrice: 102_000,
      units: null,
      status: "ACTIVE",
      executing: false,
      triggeredQuote: null,
      triggeredMessageId: null,
      outgoingMessageId: null,
      completedAt: null,
      failureReason: null,
      cancellationReason: null,
      createdAt: iso(),
      updatedAt: iso(),
    });
  for (
    let i = 0;
    i <
    (scenario === "requests-one"
      ? 1
      : scenario === "requests-multiple"
        ? 3
        : 0);
    i++
  )
    rows.push(request(`request-${++sequence}`));
  const emit = (event: MarketLiveEvent) => {
    snapshot = applyMarketEvent(snapshot, event);
    for (const stream of streams) {
      if (stream.closed) streams.delete(stream);
      else stream.emit(event);
    }
  };
  const disconnect = () => {
    streamFailed = true;
    for (const stream of streams) stream.close(new Error("Mock disconnect"));
    streams.clear();
  };
  const client = createORPCClient<RpcClient>({
    async call(path, input, callOptions) {
      const procedure = path.join(".");
      if (options.delayMs)
        await new Promise<void>((resolve) =>
          setTimeout(resolve, options.delayMs),
        );
      if (callOptions.signal?.aborted)
        throw new DOMException("Aborted", "AbortError");
      if (failure === procedure)
        throw new AppError("UNAVAILABLE", "دریافت اطلاعات ناموفق بود.", 503);
      switch (procedure) {
        case "auth.identity":
          return rpcContract.auth.identity["~orpc"].outputSchema?.parse({
            telegramUserId: "mock-user",
            firstName: "کاربر نمونه",
          });
        case "market.snapshot":
          return marketSnapshotSchema.parse(snapshot);
        case "market.live": {
          if (streamFailed)
            throw new AppError("UNAVAILABLE", "ارتباط زنده قطع است.", 503);
          if (scenario === "delayed")
            await new Promise<void>((resolve) => setTimeout(resolve, 6_000));
          const stream = createMockLiveIterator(
            {
              type: callOptions.lastEventId ? "RECONCILE_REQUIRED" : "SYNC",
              revision: snapshot.revision,
            },
            callOptions.signal,
          );
          streams.add(stream);
          return stream.iterator;
        }
        case "requests.active":
          return rows
            .filter((row) => row.status === "ACTIVE")
            .map((row) => requestDetailSchema.parse(row));
        case "requests.history":
          return requestHistoryPageSchema.parse({
            items: rows.filter((row) => row.status !== "ACTIVE"),
            nextCursor: null,
          });
        case "requests.create": {
          const row = requestDetailSchema.parse({
            ...request(`request-${++sequence}`),
            ...createRequestInputSchema.parse(input),
          });
          rows.push(row);
          return row;
        }
        case "requests.detail":
        case "requests.update":
        case "requests.cancel":
        case "requests.forceSend": {
          const parsed =
            procedure === "requests.update"
              ? rpcContract.requests.update["~orpc"].inputSchema?.parse(input)
              : rpcContract.requests.detail["~orpc"].inputSchema?.parse(input);
          if (!parsed) throw new Error("Missing request input");
          const { id } = parsed;
          const row = rows.find((item) => item.id === id);
          if (!row) throw new AppError("NOT_FOUND", "درخواست پیدا نشد.", 404);
          if ("data" in parsed)
            Object.assign(row, createRequestInputSchema.parse(parsed.data));
          if (procedure === "requests.cancel") row.status = "CANCELLED";
          if (procedure === "requests.forceSend") {
            row.status = "DONE";
            row.completedAt = iso();
          }
          return requestDetailSchema.parse(row);
        }
        case "telegram.status":
        case "telegram.command": {
          if (scenario === "telegram-unavailable")
            throw new AppError(
              "UNAVAILABLE",
              "وضعیت تلگرام در دسترس نیست.",
              503,
            );
          const transitional = scenario === "telegram-transitional";
          return telegramSessionStatusSchema.parse({
            kind: transitional ? "REVOKING" : "ACTIVE",
            connection: "CONNECTED",
            reasonCode: "NONE",
            observedAt: iso(),
            stateChangedAt: iso(),
            retryAt: null,
            capabilities: {
              canLogin: false,
              canCreateRequest: !transitional,
              canCheckMembership: false,
              canRevoke: !transitional,
            },
            groupId: null,
            quoteSenderId: null,
            connectedTelegramUserId: "mock-user",
            membershipCheckedAt: iso(),
            login: null,
          });
        }
        case "analytics.traders":
          return [];
        case "analytics.traderDetail":
          return null;
        default:
          throw new AppError("NOT_FOUND", "مسیر پیدا نشد.", 404);
      }
    },
  });
  return {
    client,
    emit,
    disconnect,
    recover: () => {
      streamFailed = false;
    },
    advance: (milliseconds: number) => {
      clock += milliseconds;
    },
    fail: (procedure?: string) => {
      failure = procedure;
    },
    now: () => clock,
    revision: () => snapshot.revision,
  };
}
