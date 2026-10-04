import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "@zarbit/contracts";
import {
  computeCreationPayloadHash,
  findRequestCreation,
} from "../src/request-creation";

type MockDb = Parameters<typeof findRequestCreation>[0];

test("computeCreationPayloadHash is deterministic and normalizes ALERT units", () => {
  const hash1 = computeCreationPayloadHash({
    action: "ALERT",
    condition: "GTE",
    targetPrice: 98_000,
    units: 5, // units ignored for ALERT
  });
  const hash2 = computeCreationPayloadHash({
    action: "ALERT",
    condition: "GTE",
    targetPrice: 98_000,
    units: null,
  });
  assert.equal(hash1, hash2);

  const hashBuy = computeCreationPayloadHash({
    action: "BUY",
    condition: "LTE",
    targetPrice: 98_000,
    units: 2,
  });
  const hashBuyDifferentUnits = computeCreationPayloadHash({
    action: "BUY",
    condition: "LTE",
    targetPrice: 98_000,
    units: 3,
  });
  assert.notEqual(hashBuy, hashBuyDifferentUnits);
  assert.notEqual(hash1, hashBuy);
});

test("findRequestCreation returns null when identity does not exist", async () => {
  const mockDb = {
    requestCreationIdentity: {
      findUnique: async () => null,
    },
    request: {
      findUnique: async () => null,
    },
  };

  const result = await findRequestCreation(
    mockDb as unknown as MockDb,
    "user-1",
    {
      action: "BUY",
      condition: "LTE",
      targetPrice: 98_000,
      units: 1,
      creationKey: "11111111-2222-3333-4444-555555555555",
    },
  );
  assert.equal(result, null);
});

test("findRequestCreation throws 409 conflict when payload hash does not match", async () => {
  const originalInput = {
    action: "BUY" as const,
    condition: "LTE" as const,
    targetPrice: 98_000,
    units: 1,
    creationKey: "11111111-2222-3333-4444-555555555555",
  };
  const originalHash = computeCreationPayloadHash(originalInput);

  const mockDb = {
    requestCreationIdentity: {
      findUnique: async () => ({
        id: "ident-1",
        userId: "user-1",
        creationKey: originalInput.creationKey,
        creationPayloadHash: originalHash,
        requestId: "req-1",
        status: "ACTIVE",
        completedAt: null,
        createdAt: new Date(),
      }),
    },
    request: {
      findUnique: async () => null,
    },
  };

  // Replay with modified targetPrice using the same creationKey
  await assert.rejects(
    findRequestCreation(mockDb as unknown as MockDb, "user-1", {
      ...originalInput,
      targetPrice: 99_000,
    }),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === "REQUEST_CREATION_CONFLICT" &&
      error.status === 409,
  );
});

test("findRequestCreation returns existing row when present", async () => {
  const input = {
    action: "BUY" as const,
    condition: "LTE" as const,
    targetPrice: 98_000,
    units: 1,
    creationKey: "11111111-2222-3333-4444-555555555555",
  };
  const hash = computeCreationPayloadHash(input);

  const existingRow = {
    id: "req-1",
    userId: "user-1",
    condition: "LTE",
    action: "BUY",
    targetPrice: 98_000,
    units: 1,
    status: "ACTIVE",
    executionPhase: "WAITING_TRADE",
    outcomeCode: null,
    deliveryStartedAt: null,
    unknownReason: null,
    resolutionState: "NOT_APPLICABLE",
    claimToken: null,
    armedAt: new Date(),
    armedAfterMessageId: 0,
    triggeredPrice: null,
    triggerSource: null,
    triggeredTradeId: null,
    triggeredChatId: null,
    triggeredAt: null,
    triggeredMessageId: null,
    outgoingMessageId: null,
    completedAt: null,
    failureReason: null,
    cancellationReason: null,
    creationKey: input.creationKey,
    creationPayloadHash: hash,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockDb = {
    requestCreationIdentity: {
      findUnique: async () => ({
        id: "ident-1",
        userId: "user-1",
        creationKey: input.creationKey,
        creationPayloadHash: hash,
        requestId: "req-1",
        status: "ACTIVE",
        completedAt: null,
        createdAt: new Date(),
      }),
    },
    request: {
      findUnique: async () => existingRow,
    },
  };

  const result = await findRequestCreation(
    mockDb as unknown as MockDb,
    "user-1",
    input,
  );
  assert.deepEqual(result, existingRow);
});

test("findRequestCreation synthesizes tombstone when Request row is pruned after 30 days", async () => {
  const input = {
    action: "BUY" as const,
    condition: "LTE" as const,
    targetPrice: 98_000,
    units: 1,
    creationKey: "11111111-2222-3333-4444-555555555555",
  };
  const hash = computeCreationPayloadHash(input);
  const completedAt = new Date("2026-08-01T12:00:00Z");
  const createdAt = new Date("2026-08-01T10:00:00Z");

  const mockDb = {
    requestCreationIdentity: {
      findUnique: async () => ({
        id: "ident-1",
        userId: "user-1",
        creationKey: input.creationKey,
        creationPayloadHash: hash,
        requestId: "req-pruned",
        status: "DONE",
        completedAt,
        createdAt,
      }),
    },
    request: {
      findUnique: async () => null, // Pruned from heavy table
    },
  };

  const result = await findRequestCreation(
    mockDb as unknown as MockDb,
    "user-1",
    input,
  );
  assert.ok(result);
  assert.equal(result.id, "req-pruned");
  assert.equal(result.status, "DONE");
  assert.equal(result.executionPhase, "DONE");
  assert.deepEqual(result.completedAt, completedAt);
  assert.equal(result.creationKey, input.creationKey);
  assert.equal(result.creationPayloadHash, hash);
});
