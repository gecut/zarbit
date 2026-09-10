import assert from "node:assert/strict";
import test from "node:test";

import {
  createRequestInputSchema,
  requestDetailSchema,
  requestHistoryPageSchema,
  type CreateRequestInput,
  type WorkerCommand,
} from "@zarbit/contracts";
import { requestView } from "@zarbit/db/requests";
import { Hono } from "hono";
import { z } from "zod";

import type { AppDependencies } from "../src/app-dependencies";
import type { AppEnv } from "../src/transport/http/app-env";
import { registerRequestRoutes } from "../src/legacy/rest/register-request-routes";

const baseRow = {
  id: "request-1",
  userId: "user-1",
  action: "ALERT" as const,
  targetPrice: 96_000,
  units: null,
  status: "ACTIVE" as const,
  claimToken: null,
  triggeredQuote: null,
  triggeredMessageId: null,
  outgoingMessageId: null,
  completedAt: null,
  failureReason: null,
  cancellationReason: null,
  createdAt: new Date("2026-09-07T08:00:00.000Z"),
  updatedAt: new Date("2026-09-07T08:00:00.000Z"),
};

test("request input accepts both execution conditions", () => {
  for (const condition of ["LTE", "GTE"] as const) {
    const result = createRequestInputSchema.safeParse({
      action: "ALERT",
      condition,
      targetPrice: 96_000,
      units: null,
    });
    assert.equal(result.success, true);
  }
});

test("request view preserves the execution condition", () => {
  for (const condition of ["LTE", "GTE"] as const) {
    const view = requestView({ ...baseRow, condition });
    assert.equal(view.condition, condition);
  }
});

function requestRow(condition: "LTE" | "GTE", id = `request-${condition}`) {
  return { ...baseRow, condition, id };
}

function requestApp() {
  const inputs: CreateRequestInput[] = [];
  const commands: WorkerCommand[] = [];
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("user", { id: "user-1", telegramUserId: "telegram-user-1" });
    await next();
  });
  registerRequestRoutes(app, {
    store: {
      activeRequests: async () => [requestRow("LTE"), requestRow("GTE")],
      requestHistory: async () => ({
        items: [requestView(requestRow("LTE")), requestView(requestRow("GTE"))],
        nextCursor: null,
      }),
      request: async (_userId: string, id: string) => requestRow("GTE", id),
      createRequest: async (_userId: string, input: CreateRequestInput) => {
        inputs.push(input);
        return requestRow(input.condition, "created");
      },
      editRequest: async (
        _userId: string,
        id: string,
        input: CreateRequestInput,
      ) => {
        inputs.push(input);
        return requestRow(input.condition, id);
      },
      cancelRequest: async (_userId: string, id: string) =>
        requestRow("LTE", id),
    } as unknown as AppDependencies["store"],
    authenticate: () => ({ telegramUserId: "telegram-user-1" }),
    command: async (_userId, command) => {
      commands.push(command);
      return {
        state: "ACTIVE",
        connection: "CONNECTED",
        groupId: null,
        quoteSenderId: null,
        connectedTelegramUserId: "telegram-user-1",
        membershipCheckedAt: null,
        error: null,
        login: null,
      };
    },
  });
  return { app, commands, inputs };
}

async function responseData<T>(response: Response, schema: z.ZodType<T>) {
  return z.object({ data: schema }).parse(await response.json()).data;
}

test("request routes preserve condition across read and mutation responses", async () => {
  const { app, commands, inputs } = requestApp();
  const input = {
    action: "ALERT",
    condition: "GTE",
    targetPrice: 96_000,
    units: null,
  } as const;

  const active = await app.request("http://server/api/requests/active");
  assert.equal(active.status, 200);
  assert.deepEqual(
    (await responseData(active, requestDetailSchema.array())).map(
      (row) => row.condition,
    ),
    ["LTE", "GTE"],
  );

  const history = await app.request("http://server/api/requests/history");
  assert.equal(history.status, 200);
  assert.deepEqual(
    (await responseData(history, requestHistoryPageSchema)).items.map(
      (row) => row.condition,
    ),
    ["LTE", "GTE"],
  );

  const detail = await app.request("http://server/api/requests/request-GTE");
  assert.equal(detail.status, 200);
  assert.equal(
    (await responseData(detail, requestDetailSchema)).condition,
    "GTE",
  );

  const created = await app.request("http://server/api/requests", {
    method: "POST",
    body: JSON.stringify(input),
  });
  assert.equal(created.status, 201);
  assert.equal(
    (await responseData(created, requestDetailSchema)).condition,
    "GTE",
  );

  const updated = await app.request("http://server/api/requests/request-GTE", {
    method: "PATCH",
    body: JSON.stringify({ ...input, condition: "LTE" }),
  });
  assert.equal(updated.status, 200);
  assert.equal(
    (await responseData(updated, requestDetailSchema)).condition,
    "LTE",
  );

  const cancelled = await app.request(
    "http://server/api/requests/request-LTE/cancel",
    { method: "POST" },
  );
  assert.equal(cancelled.status, 200);
  assert.equal(
    (await responseData(cancelled, requestDetailSchema)).condition,
    "LTE",
  );

  const forceSent = await app.request(
    "http://server/api/requests/request-GTE/force-send",
    { method: "POST" },
  );
  assert.equal(forceSent.status, 200);
  assert.equal(
    (await responseData(forceSent, requestDetailSchema)).condition,
    "GTE",
  );
  assert.deepEqual(
    inputs.map((value) => value.condition),
    ["GTE", "LTE"],
  );
  assert.deepEqual(commands.at(-1), { type: "force-send", id: "request-GTE" });
});
