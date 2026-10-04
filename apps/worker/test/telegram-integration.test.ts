import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { tl } from "@mtcute/node";
import {
  telegramCommandReceiptSchema,
  telegramOperationSchema,
  telegramSessionStatusSchema,
} from "@zarbit/contracts";
import { Sessions } from "../src/sessions";
import { SessionOperations } from "../src/session-operations";
import { SessionFiles } from "../src/session-files";
import { createWorkerApp } from "../src/http";
import type { TelegramTransport } from "../src/transport";

const url = process.env.TEST_DATABASE_URL;
test(
  "RPC → server → worker HTTP → sessions: admission, 2FA, errors, idempotency, offline revoke",
  { skip: !url },
  async (t) => {
    assert.match(
      url!,
      /^postgresql:\/\/[^/]+@(?:127\.0\.0\.1|localhost):\d+\/zarbit_test$/,
    );
    const { createPrismaClient, createStore } = await import("@zarbit/db");
    const { createApp } = await import("../../server/src/app/create-app");
    const { createSessionCommand } =
      await import("../../server/src/modules/telegram/create-session-command");
    const { sendWorkerOperation } =
      await import("../../server/src/integrations/worker/send-worker-operation");
    const db = createPrismaClient(url);
    const store = createStore(db);
    const identity = `integration-${crypto.randomUUID()}`;
    const owner = await store.user({ telegramUserId: identity });
    const directory = await mkdtemp(join(tmpdir(), "zarbit-integration-"));
    let sent = 0;
    let signIns = 0;
    const deferredSignIn: { value?: Promise<{ id: string }> } = {};
    let entered = false;
    const transport: TelegramTransport = {
      sendCode: async () => {
        sent++;
        return {
          code: {
            type: "app",
            hash: "secret-hash",
            length: 5,
            timeout: 0,
            canResend: true,
          },
        };
      },
      resendCode: async () => ({
        code: {
          type: "app",
          hash: "other-hash",
          length: 5,
          timeout: 0,
          canResend: true,
        },
      }),
      signIn: async (_phone, _hash, code) => {
        signIns++;
        if (deferredSignIn.value) {
          entered = true;
          return deferredSignIn.value;
        }
        throw tl.RpcError.create(
          code === "12345" ? 401 : 400,
          code === "12345" ? "SESSION_PASSWORD_NEEDED" : "PHONE_CODE_INVALID",
        );
      },
      password: async (password) => {
        if (password !== "correct-password")
          throw tl.RpcError.create(400, "PASSWORD_HASH_INVALID");
        return { id: identity };
      },
      getMe: async () => ({ id: identity }),
      membership: async () => true,
      subscribe: async () => () => {},
      logout: async () => {},
      close: async () => {},
    };
    const sessions = new Sessions(store, {
      groupId: -1001,
      quoteSenderId: "1",
      max: 20,
      secret: crypto.randomUUID(),
      allowlist: new Set([identity]),
      files: new SessionFiles(directory),
      factory: () => transport,
    });
    const operations = new SessionOperations(store, sessions);
    t.after(async () => {
      await sessions.stop();
      await operations.stop();
      await db.telegramUser.delete({ where: { id: owner.id } });
      await db.$disconnect();
      await rm(directory, { recursive: true, force: true });
    });
    const worker = createWorkerApp(
      sessions,
      "a".repeat(32),
      async () => ({}),
      operations,
    );
    let available = true;
    const wire = {
      workerInternalToken: "a".repeat(32),
      workerInternalUrl: "http://worker",
      fetch: (async (input, init) => {
        if (!available) throw new TypeError("simulated disconnect");
        return worker.request(new Request(input, init));
      }) as typeof fetch,
    };
    const app = createApp({
      store,
      authenticate: () => ({ telegramUserId: identity }),
      command: createSessionCommand({ ...wire, store, log: () => {} }),
      acceptCommand: (id, input, requestId) =>
        sendWorkerOperation(wire, id, input, requestId),
    });
    async function rpc(path: string, input: unknown = {}) {
      if (path === "command")
        await new Promise((resolve) => setTimeout(resolve, 1050));
      const response = await app.request(`http://server/rpc/telegram/${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Zarbit-Telegram-Contract": "3",
        },
        body: JSON.stringify({ json: input }),
      });
      assert.equal(response.status, 200, await response.clone().text());
      const body: unknown = await response.json();
      assert.ok(body && typeof body === "object" && "json" in body);
      return body.json;
    }
    async function outcome(id: string) {
      for (let i = 0; i < 100; i++) {
        const op = telegramOperationSchema.parse(
          await rpc("operation", { id }),
        );
        if (!["ACCEPTED", "RUNNING", "CANCEL_REQUESTED"].includes(op.status))
          return op;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error("Operation did not settle");
    }
    const initial = telegramSessionStatusSchema.parse(await rpc("status"));
    assert.equal(initial.capabilities.canLogin, true);
    // Legacy revocation kept the identity even after deleting the session file.
    await db.telegramSession.create({
      data: {
        userId: owner.id,
        state: "REVOKED",
        connectedTelegramUserId: identity,
        storageKey: null,
        revision: 0,
        reasonCode: "NETWORK_UNAVAILABLE",
      },
    });
    assert.equal((await sessions.status(owner.id)).capabilities.canLogin, true);
    const login = {
      operationId: crypto.randomUUID(),
      command: { type: "login", phone: "+989121234567" },
    };
    telegramCommandReceiptSchema.parse(await rpc("command", login));
    assert.equal((await outcome(login.operationId)).status, "SUCCEEDED");
    await rpc("command", login);
    assert.equal(sent, 1);
    let current = await sessions.status(owner.id);
    assert.equal(current.login?.step, "CODE");
    assert.equal(current.capabilities.canSubmitCode, true);
    const code = {
      operationId: crypto.randomUUID(),
      command: { type: "code", id: login.operationId, code: "00000" },
    };
    await rpc("command", code);
    assert.equal((await outcome(code.operationId)).issue?.field, "code");
    code.operationId = crypto.randomUUID();
    code.command.code = "12345";
    await rpc("command", code);
    assert.equal((await outcome(code.operationId)).status, "SUCCEEDED");
    assert.equal((await sessions.status(owner.id)).login?.step, "PASSWORD");
    const password = {
      operationId: crypto.randomUUID(),
      command: {
        type: "password",
        id: login.operationId,
        password: "incorrect-password",
      },
    };
    await rpc("command", password);
    assert.equal(
      (await outcome(password.operationId)).issue?.field,
      "password",
    );
    password.operationId = crypto.randomUUID();
    password.command.password = "correct-password";
    await rpc("command", password);
    assert.equal((await outcome(password.operationId)).status, "SUCCEEDED");
    current = await sessions.status(owner.id);
    assert.equal(current.authorization, "AUTHORIZED");
    assert.equal(current.capabilities.canCreateRequest, true);
    assert.equal(signIns, 2);
    const request = await store.createRequest(owner.id, {
      action: "ALERT",
      condition: "GTE",
      targetPrice: 96000,
      units: null,
      creationKey: crypto.randomUUID(),
    });
    await new Promise((resolve) => setTimeout(resolve, 1100));
    available = false;
    const revoke = {
      operationId: crypto.randomUUID(),
      command: { type: "revoke" },
    };
    await rpc("command", revoke);
    assert.equal(
      (await store.request(owner.id, request.id))?.status,
      "CANCELLED",
    );
    assert.equal(
      telegramSessionStatusSchema.parse(await rpc("status")).authorization,
      "REVOKING",
    );
    available = true;
    await sessions.synchronize();
    const completed = await outcome(revoke.operationId);
    assert.equal(completed.status, "SUCCEEDED");
    assert.equal(completed.cancelledRequests, 1);

    await new Promise((resolve) => setTimeout(resolve, 1100));
    login.operationId = crypto.randomUUID();
    await rpc("command", login);
    await outcome(login.operationId);
    let resolveSignIn: (value: { id: string }) => void = () => {};
    deferredSignIn.value = new Promise((resolve) => {
      resolveSignIn = resolve;
    });
    const delayed = {
      operationId: crypto.randomUUID(),
      command: { type: "code", id: login.operationId, code: "12345" },
    };
    await rpc("command", delayed);
    for (let i = 0; !entered && i < 100; i++)
      await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(entered, true);
    const cancel = {
      operationId: crypto.randomUUID(),
      command: { type: "cancel", id: login.operationId },
    };
    await rpc("command", cancel);
    assert.equal((await outcome(cancel.operationId)).status, "SUCCEEDED");
    resolveSignIn({ id: identity });
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.notEqual((await outcome(delayed.operationId)).status, "SUCCEEDED");
    assert.equal((await store.session(owner.id))?.state, "REVOKED");
    assert.equal((await sessions.status(owner.id)).capabilities.canLogin, true);
    const rows = await db.telegramOperation.findMany({
      where: { userId: owner.id },
    });
    for (const secret of [
      "+989121234567",
      "secret-hash",
      "correct-password",
      "incorrect-password",
    ])
      assert.equal(JSON.stringify(rows).includes(secret), false);
  },
);
