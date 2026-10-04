import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { tl } from "@mtcute/node";
import { SessionFiles } from "../src/session-files";
import { AppError } from "@zarbit/contracts";
import type { SessionNotification } from "@zarbit/messages";
import { Sessions, type SessionStore } from "../src/sessions";
import type {
  TelegramLifecycleObserver,
  TelegramTransport,
  TransportFactory,
} from "../src/transport";

const userId = "user-1";
const telegramUserId = "100";
const now = new Date("2026-09-06T00:00:00.000Z");

function transportFactory(transport: TelegramTransport): TransportFactory {
  return () => transport;
}

function createStore(): SessionStore {
  let record: Awaited<ReturnType<SessionStore["session"]>> = null;
  const applyUpdate = (data: Parameters<SessionStore["updateSession"]>[2]) => {
    if (record) Object.assign(record, data);
  };
  return {
    activeTelegramOperation: async () => null,
    finishTelegramCleanup: async () => [],
    recoverTelegramOperations: async () => ({ count: 0 }),
    pruneTelegramOperations: async () => ({ count: 0 }),
    owner: async () => ({
      id: userId,
      telegramUserId,
      firstName: null,
      username: null,
      createdAt: now,
      updatedAt: now,
    }),
    session: async () => record,
    sessions: async () =>
      record ? [{ ...record, user: { telegramUserId } }] : [],
    consumeSend: async () => undefined,
    blockLogin: async () => [],
    beginSession: async (id, storageKey, loginId) => {
      record = {
        id: "session-1",
        userId: id,
        storageKey,
        loginId,
        version: 1,
        connectedTelegramUserId: null,
        state: "PENDING_OTP",
        revision: 1,
        runtimeReady: false,
        runtimeCheckedAt: null,
        membershipCheckedAt: null,
        lastError: null,
        stateChangedAt: now,
        createdAt: now,
        updatedAt: now,
      };
      return record;
    },
    updateSession: async (_, revision, data) => {
      if (
        !record ||
        record.revision !== revision ||
        (data.state &&
          data.state !== "REVOKED" &&
          ["REVOKING", "REVOKED"].includes(record.state))
      )
        return { count: 0 };
      applyUpdate(data);
      return { count: 1 };
    },
    activateSession: async (_, revision, data) => {
      if (
        !record ||
        record.revision !== revision ||
        !["ACTIVE", "PENDING_OTP", "NOT_IN_GROUP"].includes(record.state)
      )
        return { count: 0 };
      applyUpdate(data);
      return { count: 1 };
    },
    disableSession: async (_, state, error) => {
      if (record) Object.assign(record, { state, lastError: error });
      return true;
    },
    recover: async () => undefined,
  };
}

function baseTransport(
  overrides: Partial<TelegramTransport>,
): TelegramTransport {
  return {
    sendCode: async () => ({
      code: {
        type: "app",
        hash: "phone-code-hash",
        length: 5,
        timeout: 60,
        canResend: false,
      },
    }),
    resendCode: async () => ({
      code: {
        type: "app",
        hash: "phone-code-hash-2",
        length: 5,
        timeout: 60,
        canResend: false,
      },
    }),
    signIn: async () => ({ id: telegramUserId }),
    password: async () => ({ id: telegramUserId }),
    getMe: async () => ({ id: telegramUserId }),
    membership: async () => true,
    subscribe: async () => () => undefined,
    logout: async () => undefined,
    close: async () => undefined,
    ...overrides,
  };
}

async function createSessions(
  transport: TelegramTransport,
  options?: {
    clock?: { value: number };
    timeoutMs?: number;
    membershipTtlMs?: number;
    notify?: (userId: string, event: SessionNotification) => Promise<void>;
    factory?: TransportFactory;
  },
) {
  const directory = await mkdtemp(path.join(tmpdir(), "zarbit-worker-test-"));
  const files = new SessionFiles(directory);
  await files.prepare();
  const clock = options?.clock ?? { value: now.getTime() };
  return {
    clock,
    directory,
    sessions: new Sessions(createStore(), {
      groupId: -1001234567890,
      quoteSenderId: "123456789",
      max: 1,
      secret: "test-secret",
      allowlist: new Set([telegramUserId]),
      files,
      factory: options?.factory ?? transportFactory(transport),
      now: () => clock.value,
      notify: options?.notify,
      membershipTtlMs: options?.membershipTtlMs ?? 30_000,
      ...(options?.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
    }),
  };
}

test("moves an MTcute 2FA response to PASSWORD without closing the challenge", async (t) => {
  const transport = baseTransport({
    signIn: async () => {
      throw tl.RpcError.create(401, "SESSION_PASSWORD_NEEDED");
    },
    password: async () => {
      throw tl.RpcError.create(400, "PASSWORD_HASH_INVALID");
    },
  });
  const { directory, sessions } = await createSessions(transport);
  t.after(async () => rm(directory, { recursive: true, force: true }));

  const started = await sessions.command(userId, {
    type: "login",
    phone: "+989121234567",
  });
  const challengeId = started.login?.id;
  assert.ok(challengeId);
  assert.equal(started.login?.step, "CODE");

  const passwordRequired = await sessions.command(userId, {
    type: "code",
    id: challengeId,
    code: "12345",
  });
  assert.equal(passwordRequired.login?.id, challengeId);
  assert.equal(passwordRequired.login?.step, "PASSWORD");
  assert.equal(passwordRequired.login?.error, null);

  await assert.rejects(
    sessions.command(userId, {
      type: "password",
      id: challengeId,
      password: "incorrect-password",
    }),
    { code: "PASSWORD_HASH_INVALID" },
  );
  const afterInvalidPassword = await sessions.status(userId);
  assert.equal(afterInvalidPassword.login?.id, challengeId);
  assert.equal(afterInvalidPassword.login?.step, "PASSWORD");
  assert.equal(afterInvalidPassword.login?.error, "رمز دوم درست نیست.");
});

test("completes the existing challenge after a valid two-step password", async (t) => {
  const transport = baseTransport({
    signIn: async () => {
      throw tl.RpcError.create(401, "SESSION_PASSWORD_NEEDED");
    },
  });
  const { directory, sessions } = await createSessions(transport);
  t.after(async () => rm(directory, { recursive: true, force: true }));

  const started = await sessions.command(userId, {
    type: "login",
    phone: "+989121234567",
  });
  const challengeId = started.login?.id;
  assert.ok(challengeId);
  await sessions.command(userId, {
    type: "code",
    id: challengeId,
    code: "12345",
  });

  const completed = await sessions.command(userId, {
    type: "password",
    id: challengeId,
    password: "correct-password",
  });
  assert.equal(completed.login, null);
  assert.equal(completed.authorization, "AUTHORIZED");
  assert.equal(completed.connection, "CONNECTED");
});

test("discards a challenge after five invalid codes", async (t) => {
  const transport = baseTransport({
    signIn: async () => {
      throw tl.RpcError.create(400, "PHONE_CODE_INVALID");
    },
  });
  const { directory, sessions } = await createSessions(transport);
  t.after(async () => rm(directory, { recursive: true, force: true }));

  const started = await sessions.command(userId, {
    type: "login",
    phone: "+989121234567",
  });
  const challengeId = started.login?.id;
  assert.ok(challengeId);
  for (let attempt = 0; attempt < 5; attempt++)
    await assert.rejects(
      sessions.command(userId, {
        type: "code",
        id: challengeId,
        code: "00000",
      }),
      { code: "PHONE_CODE_INVALID" },
    );
  assert.equal((await sessions.status(userId)).login, null);
});

test("enforces Telegram flood wait without replaying sign in", async (t) => {
  let signInCalls = 0;
  const transport = baseTransport({
    signIn: async () => {
      signInCalls++;
      throw tl.RpcError.create(420, "FLOOD_WAIT_60");
    },
  });
  const { directory, sessions } = await createSessions(transport);
  t.after(async () => rm(directory, { recursive: true, force: true }));

  const started = await sessions.command(userId, {
    type: "login",
    phone: "+989121234567",
  });
  const challengeId = started.login?.id;
  assert.ok(challengeId);
  await assert.rejects(
    sessions.command(userId, { type: "code", id: challengeId, code: "12345" }),
    { code: "RATE_LIMITED" },
  );
  await assert.rejects(
    sessions.command(userId, { type: "code", id: challengeId, code: "12345" }),
    { code: "RATE_LIMITED" },
  );
  assert.equal(signInCalls, 1);
  assert.equal((await sessions.status(userId)).login?.step, "CODE");
});

test("allows resend only after Telegram's deadline", async (t) => {
  let resendCalls = 0;
  const clock = { value: now.getTime() };
  const transport = baseTransport({
    sendCode: async () => ({
      code: {
        type: "sms",
        hash: "phone-code-hash",
        length: 5,
        timeout: 60,
        canResend: true,
      },
    }),
    resendCode: async () => {
      resendCalls++;
      return {
        code: {
          type: "call",
          hash: "phone-code-hash-2",
          length: 5,
          timeout: 60,
          canResend: false,
        },
      };
    },
  });
  const { directory, sessions } = await createSessions(transport, { clock });
  t.after(async () => rm(directory, { recursive: true, force: true }));

  const started = await sessions.command(userId, {
    type: "login",
    phone: "+989121234567",
  });
  const challengeId = started.login?.id;
  assert.ok(challengeId);
  await assert.rejects(
    sessions.command(userId, { type: "resend", id: challengeId }),
    { code: "RESEND_WAIT" },
  );
  clock.value += 60_000;
  const resent = await sessions.command(userId, {
    type: "resend",
    id: challengeId,
  });
  assert.equal(resendCalls, 1);
  assert.equal(resent.login?.delivery, "call");
  assert.equal(resent.login?.resendAvailableAt, null);
});

test("cleans up a timed out login and an identity mismatch", async (t) => {
  const delayed = baseTransport({
    sendCode: async () => new Promise(() => undefined),
  });
  const timeout = await createSessions(delayed, { timeoutMs: 5 });
  t.after(async () => rm(timeout.directory, { recursive: true, force: true }));
  await assert.rejects(
    timeout.sessions.command(userId, {
      type: "login",
      phone: "+989121234567",
    }),
    { code: "TIMEOUT" },
  );
  assert.equal((await timeout.sessions.status(userId)).login, null);

  let logoutCalls = 0;
  const mismatched = baseTransport({
    signIn: async () => ({ id: "different-account" }),
    logout: async () => {
      logoutCalls++;
    },
  });
  const mismatch = await createSessions(mismatched);
  t.after(async () => rm(mismatch.directory, { recursive: true, force: true }));
  const started = await mismatch.sessions.command(userId, {
    type: "login",
    phone: "+989121234567",
  });
  const challengeId = started.login?.id;
  assert.ok(challengeId);
  await assert.rejects(
    mismatch.sessions.command(userId, {
      type: "code",
      id: challengeId,
      code: "12345",
    }),
    { code: "IDENTITY_MISMATCH" },
  );
  assert.equal(logoutCalls, 1);
  assert.equal((await mismatch.sessions.status(userId)).login, null);
});

test("preserves the authorized session but disables execution for non-members", async (t) => {
  const transport = baseTransport({ membership: async () => false });
  const { directory, sessions } = await createSessions(transport);
  t.after(async () => rm(directory, { recursive: true, force: true }));

  const started = await sessions.command(userId, {
    type: "login",
    phone: "+989121234567",
  });
  const challengeId = started.login?.id;
  assert.ok(challengeId);
  const completed = await sessions.command(userId, {
    type: "code",
    id: challengeId,
    code: "12345",
  });
  assert.equal(completed.login, null);
  assert.equal(completed.membership, "NOT_MEMBER");
  assert.equal(completed.connection, "OFFLINE");
});

test("discards unsupported Telegram delivery without exposing delivery data", async (t) => {
  const transport = baseTransport({
    sendCode: async () => ({
      code: {
        type: "email",
        hash: "sensitive-phone-code-hash",
        length: 6,
        timeout: 60,
        canResend: false,
      },
    }),
  });
  const { directory, sessions } = await createSessions(transport);
  t.after(async () => rm(directory, { recursive: true, force: true }));

  await assert.rejects(
    sessions.command(userId, { type: "login", phone: "+989121234567" }),
    { code: "UNSUPPORTED_DELIVERY" },
  );
  assert.equal((await sessions.status(userId)).login, null);
});

test("session integration announces long outage once and recovery after readiness checks", async (t) => {
  let offline = false;
  const events: SessionNotification[] = [];
  const transport = baseTransport({
    getMe: async () => {
      if (offline) throw new Error("network offline");
      return { id: telegramUserId };
    },
  });
  const { directory, sessions, clock } = await createSessions(transport, {
    notify: async (_userId, event) => {
      events.push(event);
    },
  });
  t.after(async () => {
    await sessions.stop();
    await rm(directory, { recursive: true, force: true });
  });
  const login = await sessions.command(userId, {
    type: "login",
    phone: "+989121234567",
  });
  await sessions.command(userId, {
    type: "code",
    id: login.login!.id,
    code: "12345",
  });
  assert.deepEqual(
    events.map((e) => e.type),
    ["connected"],
  );
  offline = true;
  clock.value += 31000;
  await sessions.synchronize();
  clock.value += 119999;
  await sessions.synchronize();
  assert.deepEqual(
    events.map((e) => e.type),
    ["connected"],
  );
  clock.value += 1;
  await sessions.synchronize();
  assert.deepEqual(
    events.map((e) => e.type),
    ["connected", "outage"],
  );
  clock.value += 300000;
  await sessions.synchronize();
  assert.equal(events.filter((e) => e.type === "outage").length, 1);
  offline = false;
  clock.value += 300000;
  await sessions.synchronize();
  assert.deepEqual(
    events.map((e) => e.type),
    ["connected", "outage", "recovered"],
  );
  assert.equal(
    (await sessions.command(userId, { type: "status" })).connection,
    "CONNECTED",
  );
});

test("manual revocation clears pending outage without claiming cancellation", async (t) => {
  let offline = false;
  const events: SessionNotification[] = [];
  const transport = baseTransport({
    getMe: async () => {
      if (offline) throw new Error("network offline");
      return { id: telegramUserId };
    },
  });
  const { directory, sessions, clock } = await createSessions(transport, {
    notify: async (_id, event) => {
      events.push(event);
    },
  });
  t.after(async () => {
    await sessions.stop();
    await rm(directory, { recursive: true, force: true });
  });
  const login = await sessions.command(userId, {
    type: "login",
    phone: "+989121234567",
  });
  await sessions.command(userId, {
    type: "code",
    id: login.login!.id,
    code: "12345",
  });
  offline = true;
  clock.value += 31000;
  await sessions.synchronize();
  await sessions.command(userId, { type: "revoke" });
  clock.value += 300000;
  await sessions.synchronize();
  assert.deepEqual(
    events.map((e) => e.type),
    ["connected"],
  );
});

test("an empty worker permits first login and reports available capacity", async (t) => {
  const { directory, sessions } = await createSessions(baseTransport({}));
  t.after(async () => rm(directory, { recursive: true, force: true }));
  const status = await sessions.command(userId, { type: "status" });
  assert.equal(status.authorization, "DISCONNECTED");
  assert.equal(status.connection, "OFFLINE");
  assert.deepEqual(sessions.runtimeHealth(), {
    activeSessions: 0,
    reservedSessions: 0,
    remainingCapacity: 1,
  });
  const login = await sessions.command(userId, {
    type: "login",
    phone: "+989121234567",
  });
  assert.equal(login.login?.step, "CODE");
  assert.equal(sessions.runtimeHealth().remainingCapacity, 0);
});

test("transport offline event synchronously invalidates canSend and historyReady", async (t) => {
  let observer: TelegramLifecycleObserver | undefined;
  const transport = baseTransport({
    latestMessageId: async () => 42,
    history: async () => [],
    sendGroup: async () => 101,
  });
  const { directory, sessions } = await createSessions(transport, {
    factory: (_path, obs) => {
      observer = obs;
      return transport;
    },
  });
  t.after(async () => rm(directory, { recursive: true, force: true }));

  const login = await sessions.command(userId, {
    type: "login",
    phone: "+989121234567",
  });
  const completed = await sessions.command(userId, {
    type: "code",
    id: login.login!.id,
    code: "12345",
  });
  assert.equal(completed.connection, "CONNECTED");
  assert.equal(await sessions.latestMessageId(), 42);

  // Trigger offline event synchronously
  observer?.({ type: "connection_state", state: "offline" });

  const offlineStatus = await sessions.command(userId, { type: "status" });
  assert.equal(offlineStatus.connection, "OFFLINE");

  // requireConnected throws SESSION_REQUIRED
  await assert.rejects(
    sessions.requireConnected(userId),
    (err: unknown) =>
      err instanceof AppError && err.code === "SESSION_REQUIRED",
  );

  // latestMessageId throws No active Telegram history session
  await assert.rejects(
    sessions.latestMessageId(),
    /No active Telegram history session/,
  );
});

test("transport disconnect during onReady aborts session activation due to epoch increment", async (t) => {
  let observer: TelegramLifecycleObserver | undefined;
  const transport = baseTransport({});
  const { directory, sessions } = await createSessions(transport, {
    factory: (_path, obs) => {
      observer = obs;
      return transport;
    },
  });
  t.after(async () => rm(directory, { recursive: true, force: true }));

  let onReadyStarted = false;
  sessions.onReady = async () => {
    onReadyStarted = true;
    // Simulate transport disconnect during onReady execution
    observer?.({ type: "connection_state", state: "offline" });
  };

  const login = await sessions.command(userId, {
    type: "login",
    phone: "+989121234567",
  });
  const completed = await sessions.command(userId, {
    type: "code",
    id: login.login!.id,
    code: "12345",
  });
  assert.equal(onReadyStarted, true);
  // Activation should have aborted: connection must be OFFLINE, not CONNECTED
  assert.equal(completed.connection, "OFFLINE");
  await assert.rejects(
    sessions.requireConnected(userId),
    (err: unknown) =>
      err instanceof AppError && err.code === "SESSION_REQUIRED",
  );
});

test("latestMessageId and history are accessible during onReady when historyReady is true", async (t) => {
  const transport = baseTransport({
    latestMessageId: async () => 99,
    history: async () => [
      {
        chatId: -1001234567890,
        senderId: "123456789",
        messageId: 98,
        text: "test",
        date: new Date(),
      },
    ],
  });
  const { directory, sessions } = await createSessions(transport);
  t.after(async () => rm(directory, { recursive: true, force: true }));

  let capturedHead: number | undefined;
  let capturedHistoryLen: number | undefined;
  sessions.onReady = async () => {
    // During onReady, canSend is false, but historyReady is true
    capturedHead = await sessions.latestMessageId();
    const items = await sessions.history(90, 100);
    capturedHistoryLen = items.length;
  };

  const login = await sessions.command(userId, {
    type: "login",
    phone: "+989121234567",
  });
  const completed = await sessions.command(userId, {
    type: "code",
    id: login.login!.id,
    code: "12345",
  });
  assert.equal(capturedHead, 99);
  assert.equal(capturedHistoryLen, 1);
  assert.equal(completed.connection, "CONNECTED");
});
