import { sessionFixture } from "./telegram-fixture";
import assert from "node:assert/strict";
import test from "node:test";

import {
  AppError,
  createRequestInputSchema,
  updateRequestInputSchema,
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
import { registerApiErrorHandlers } from "../src/transport/http/register-api-error-handlers";

const baseRow = {
  id: "request-1",
  userId: "user-1",
  action: "ALERT" as const,
  targetPrice: 96_000,
  units: null,
  priceMode: "TARGET_PRICE" as const,
  status: "ACTIVE" as const,
  claimToken: null,
  armedAt: new Date(0),
  armedAfterMessageId: 0,
  triggeredChatId: null,
  triggeredPrice: null,
  triggerSource: null,
  triggeredTradeId: null,
  triggeredAt: null,
  triggeredMessageId: null,
  outgoingMessageId: null,
  completedAt: null,
  failureReason: null,
  cancellationReason: null,
  creationKey: null,
  creationPayloadHash: null,
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
      creationKey: crypto.randomUUID(),
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
    acceptCommand: async (_id, input) => ({
      operationId: input.operationId,
      acceptedAt: new Date().toISOString(),
    }),
    command: async (_userId, command) => {
      commands.push(command);
      return sessionFixture();
    },
  });
  return { app, commands, inputs };
}

async function responseData<T>(response: Response, schema: z.ZodType<T>) {
  return z.object({ data: schema }).parse(await response.json()).data;
}

test("request routes preserve condition across read and mutation responses", async () => {
  const { app, commands, inputs } = requestApp();
  const createInput = {
    action: "ALERT",
    condition: "GTE",
    targetPrice: 96_000,
    units: null,
    creationKey: "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
  } as const;
  const updateInput = {
    action: "ALERT",
    condition: "LTE",
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
    body: JSON.stringify(createInput),
  });
  assert.equal(created.status, 201);
  assert.equal(
    (await responseData(created, requestDetailSchema)).condition,
    "GTE",
  );

  const updated = await app.request("http://server/api/requests/request-GTE", {
    method: "PATCH",
    body: JSON.stringify(updateInput),
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

test("create and update request schemas enforce creationKey separation", () => {
  const validUUID = "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d";
  const baseInput = {
    action: "ALERT",
    condition: "GTE",
    targetPrice: 96_000,
    units: null,
  } as const;

  // create requires creationKey UUID
  const createValid = createRequestInputSchema.safeParse({
    ...baseInput,
    creationKey: validUUID,
  });
  assert.equal(createValid.success, true);

  const createMissingKey = createRequestInputSchema.safeParse(baseInput);
  assert.equal(createMissingKey.success, false);

  const createInvalidUUID = createRequestInputSchema.safeParse({
    ...baseInput,
    creationKey: "not-a-uuid",
  });
  assert.equal(createInvalidUUID.success, false);

  // update rejects creationKey
  const updateValid = updateRequestInputSchema.safeParse(baseInput);
  assert.equal(updateValid.success, true);

  const updateWithKey = updateRequestInputSchema.safeParse({
    ...baseInput,
    creationKey: validUUID,
  });
  assert.equal(updateWithKey.success, false);
});

test("idempotent replay returns existing request on matching creationKey", async () => {
  const existingRow = {
    ...baseRow,
    id: "existing-req-id",
    condition: "GTE" as const,
    creationKey: "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
  };
  let createCalls = 0;
  let sessionCalls = 0;
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("user", { id: "user-1", telegramUserId: "telegram-user-1" });
    await next();
  });
  registerRequestRoutes(app, {
    store: {
      findRequestCreation: async (
        _userId: string,
        input: CreateRequestInput,
      ) => {
        if (input.creationKey === existingRow.creationKey) {
          if (input.targetPrice !== existingRow.targetPrice) {
            throw new AppError(
              "REQUEST_CREATION_CONFLICT",
              "این تلاش ثبت با اطلاعات دیگری انجام شده است؛ وضعیت درخواست را بررسی کنید.",
              409,
            );
          }
          return existingRow;
        }
        return null;
      },
      createRequest: async () => {
        createCalls++;
        return existingRow;
      },
    } as unknown as AppDependencies["store"],
    authenticate: () => ({ telegramUserId: "telegram-user-1" }),
    acceptCommand: async () => ({ operationId: "1", acceptedAt: "" }),
    command: async () => {
      sessionCalls++;
      return sessionFixture();
    },
  });
  registerApiErrorHandlers(app);

  const res = await app.request("http://server/api/requests", {
    method: "POST",
    body: JSON.stringify({
      action: "ALERT",
      condition: "GTE",
      targetPrice: 96_000,
      units: null,
      creationKey: "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
    }),
  });
  assert.equal(res.status, 200);
  const data = await responseData(res, requestDetailSchema);
  assert.equal(data.id, "existing-req-id");
  assert.equal(createCalls, 0);
  assert.equal(sessionCalls, 0);

  const conflictRes = await app.request("http://server/api/requests", {
    method: "POST",
    body: JSON.stringify({
      action: "ALERT",
      condition: "GTE",
      targetPrice: 99_000,
      units: null,
      creationKey: "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
    }),
  });
  assert.equal(conflictRes.status, 409);
});

test("idempotent replay succeeds even when telegram session is offline", async () => {
  const existingRow = {
    ...baseRow,
    id: "existing-req-id",
    condition: "GTE" as const,
    creationKey: "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
  };
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("user", { id: "user-1", telegramUserId: "telegram-user-1" });
    await next();
  });
  registerRequestRoutes(app, {
    store: {
      findRequestCreation: async () => existingRow,
      createRequest: async () => {
        throw new Error("should not be called");
      },
    } as unknown as AppDependencies["store"],
    authenticate: () => ({ telegramUserId: "telegram-user-1" }),
    acceptCommand: async () => ({ operationId: "1", acceptedAt: "" }),
    command: async () => {
      return {
        ...sessionFixture(),
        connection: "OFFLINE",
        authorization: "DISCONNECTED",
      };
    },
  });

  const res = await app.request("http://server/api/requests", {
    method: "POST",
    body: JSON.stringify({
      action: "ALERT",
      condition: "GTE",
      targetPrice: 96_000,
      units: null,
      creationKey: "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
    }),
  });
  assert.equal(res.status, 200);
  const data = await responseData(res, requestDetailSchema);
  assert.equal(data.id, "existing-req-id");
});
