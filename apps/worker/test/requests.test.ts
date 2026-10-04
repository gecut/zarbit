import assert from "node:assert/strict";
import test from "node:test";

import { AppError } from "@zarbit/contracts";
import { createRequestExecutor } from "../src/requests";

type ExecutorStore = Parameters<typeof createRequestExecutor>[0];
type RequestRow = NonNullable<
  Awaited<ReturnType<ExecutorStore["claimRequest"]>>
>;
const example: RequestRow = {
  id: "request-2",
  userId: "user-1",
  condition: "GTE",
  action: "ALERT",
  targetPrice: 96155,
  units: null,
  status: "ACTIVE",
  claimToken: "auto-token",
  executionPhase: "CLAIMED",
  outcomeCode: null,
  deliveryStartedAt: null,
  unknownReason: null,
  resolutionState: "NOT_APPLICABLE",
  armedAt: new Date(0),
  armedAfterMessageId: 0,
  triggeredChatId: -1001n,
  triggeredPrice: null,
  triggerSource: null,
  triggeredTradeId: null,
  triggeredAt: null,
  triggeredMessageId: null,
  outgoingMessageId: null,
  completedAt: null,
  failureReason: null,
  cancellationReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const trigger: RequestRow = {
  ...example,
  triggeredPrice: 96200,
  triggeredMessageId: 42,
  triggerSource: "TRADE",
  triggeredTradeId: "trade-42",
  triggeredAt: new Date("2026-09-08T10:00:00Z"),
};
function setup(
  options: {
    row?: RequestRow;
    claim?: boolean;
    markSendingResult?: {
      count: number;
      row: RequestRow | null;
      reason?: string;
    };
    complete?: ExecutorStore["completeRequest"];
    sendError?: unknown;
    notifyError?: unknown;
    ready?: () => Promise<void>;
    timeout?: boolean;
  } = {},
) {
  const messages: string[] = [];
  const groups: string[] = [];
  const results: Array<Parameters<ExecutorStore["completeRequest"]>[2]> = [];
  const row = options.row ?? example;
  const store: ExecutorStore = {
    markSending: async () =>
      options.markSendingResult ??
      (options.claim === false
        ? { count: 0, row: null }
        : {
            count: 1,
            row: { ...row, ...trigger, action: row.action, units: row.units },
          }),
    owner: async () => ({
      id: "user-1",
      telegramUserId: "100",
      firstName: null,
      username: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    claimRequest: async () => (options.claim === false ? null : row),
    completeRequest:
      options.complete ??
      (async (_id, _token, result) => {
        results.push(result);
        return { count: 1 };
      }),
  };
  const executor = createRequestExecutor(
    store,
    {
      ready: options.ready ?? (async () => undefined),
      group: async (_id, text) => {
        groups.push(text);
        if (options.sendError) throw options.sendError;
        if (options.timeout) return new Promise<number>(() => {});
        return 5;
      },
      private: async (_id, text) => {
        messages.push(text);
        if (options.notifyError) throw options.notifyError;
        return 6;
      },
    },
    5,
  );
  return { executor, messages, groups, results };
}

test("successful automatic ALERT delivers only its alert and persists its message id", async () => {
  const run = setup();
  await run.executor.execute("user-1", example.id, trigger);
  assert.equal(run.messages.length, 1);
  assert.match(run.messages[0]!, /۹۶٬۲۰۰/);
  assert.equal(run.results[0]?.status, "DONE");
  assert.equal(run.results[0]?.outgoingMessageId, 6);
  assert.equal(run.groups.length, 0);
});

test("BUY and SELL use unchanged group commands and one result notification", async () => {
  for (const [action, text] of [
    ["BUY", "2خ96155"],
    ["SELL", "2ف96155"],
  ] as const) {
    const run = setup({ row: { ...example, action, units: 2 } });
    await run.executor.execute("user-1", example.id);
    assert.deepEqual(run.groups, [text]);
    assert.equal(run.messages.length, 1);
    assert.ok(run.messages[0]!.includes("`" + text + "`"));
    assert.match(run.messages[0]!, /اجرای دستی/);
  }
});

test("definitive rejection and timeout remain FAILED and UNKNOWN respectively", async () => {
  for (const timeout of [false, true]) {
    const run = setup({
      row: { ...example, action: "BUY", units: 2 },
      timeout,
      ...(!timeout
        ? { sendError: { errorMessage: "CHAT_WRITE_FORBIDDEN" } }
        : {}),
    });
    await run.executor.execute("user-1", example.id, trigger);
    assert.equal(run.groups.length, 1);
    assert.equal(run.results[0]?.status, timeout ? "UNKNOWN" : "FAILED");
    assert.equal(run.messages.length, 1);
    assert.match(
      run.messages[0]!,
      timeout ? /ممکن است پیام ارسال شده باشد/ : /مجوز ارسال در گروه/,
    );
  }
});

test("notification failures do not roll back or repeat a successful group send", async () => {
  const run = setup({
    row: { ...example, action: "BUY", units: 2 },
    notifyError: new Error("offline"),
  });
  await run.executor.execute("user-1", example.id, trigger);
  assert.equal(run.results[0]?.status, "DONE");
  assert.equal(run.groups.length, 1);
  assert.equal(run.messages.length, 1);
});

test("persistence failure after delivery never emits a success result or repeats delivery", async () => {
  for (const action of ["ALERT", "BUY"] as const) {
    const run = setup({
      row: { ...example, action, units: action === "BUY" ? 2 : null },
      complete: async () => {
        throw new Error("database offline");
      },
    });
    await assert.rejects(
      run.executor.execute("user-1", example.id, trigger),
      /database offline/,
    );
    assert.equal(run.messages.length, action === "ALERT" ? 1 : 0);
    assert.equal(run.groups.length, action === "BUY" ? 1 : 0);
  }
});

test("unclaimed requests and lost completion ownership emit no result", async () => {
  const unclaimed = setup({ claim: false });
  await unclaimed.executor.execute("user-1", example.id, trigger);
  assert.equal(unclaimed.messages.length, 0);
  assert.equal(unclaimed.results.length, 0);
  const lost = setup({
    row: { ...example, action: "BUY", units: 2 },
    complete: async () => ({ count: 0 }),
  });
  await lost.executor.execute("user-1", example.id, trigger);
  assert.equal(lost.messages.length, 0);
});

test("private alert rejection cannot be recorded as successful delivery", async () => {
  const run = setup({ notifyError: { error_code: 403 } });
  await run.executor.execute("user-1", example.id, trigger);
  assert.equal(run.results[0]?.status, "FAILED");
  assert.match(run.results[0]!.failureReason!, /ارسال پیام خصوصی را نپذیرفت/);
});

test("manual execution fails closed when financial review is required", async () => {
  const run = setup({
    markSendingResult: {
      count: 0,
      row: null,
      reason: "FINANCIAL_REVIEW_REQUIRED",
    },
  });
  await assert.rejects(
    run.executor.execute("user-1", example.id),
    (err: unknown) =>
      err instanceof AppError && err.code === "FINANCIAL_REVIEW_REQUIRED",
  );
  assert.equal(run.messages.length, 0);
  assert.equal(run.groups.length, 0);
});
