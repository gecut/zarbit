import { sessionFixture } from "./telegram-fixture";
import assert from "node:assert/strict";
import test from "node:test";
import { probeWorker } from "../src/integrations/worker/probe-worker";
import { sendWorkerCommand } from "../src/integrations/worker/send-worker-command";
import type {
  WorkerDiagnostic,
  WorkerTransportDependencies,
} from "../src/integrations/worker/worker-types";
import { createSessionCommand } from "../src/modules/telegram/create-session-command";

const status = sessionFixture();

function dependencies(
  fetch: typeof globalThis.fetch,
): WorkerTransportDependencies {
  return {
    fetch,
    workerInternalToken: "private-token",
    workerInternalUrl: "http://worker:3002?secret=hidden",
  };
}
test("startup validates a correlated real status command without fallback storage", async () => {
  const events: Array<{ event: string; details: WorkerDiagnostic }> = [];
  let requestId: string | undefined;
  const result = await probeWorker(
    dependencies(async (url, init) => {
      assert.equal(String(url), "http://worker:3002/internal/command");
      requestId = new Headers(init?.headers).get("X-Request-Id") ?? undefined;
      assert.equal(
        new Headers(init?.headers).get("Authorization"),
        "Bearer private-token",
      );
      assert.deepEqual(JSON.parse(String(init?.body)), {
        userId: "__zarbit_worker_diagnostic__",
        command: { type: "status" },
      });
      return Response.json({ data: status });
    }),
    (event, details) => events.push({ event, details }),
  );
  assert.equal(result.workerHealth, "ok");
  assert.deepEqual(
    events.map((e) => e.event),
    ["worker.startup_check.started", "worker.startup_check.completed"],
  );
  assert.ok(events.every((e) => e.details.requestId === requestId));
  assert.doesNotMatch(JSON.stringify(events), /private-token|hidden/);
});
test("startup degrades without throwing when worker is down or response is invalid", async () => {
  for (const fetch of [
    async () => {
      throw new Error("down");
    },
    async () => Response.json({ data: {} }),
  ]) {
    const events: string[] = [];
    assert.equal(
      (await probeWorker(dependencies(fetch), (event) => events.push(event)))
        .workerHealth,
      "degraded",
    );
    assert.equal(events.at(-1), "worker.startup_check.failed");
  }
});
test("classifies fetch cause chains and timeouts", async () => {
  for (const [code, failure] of [
    ["ENOTFOUND", "dns"],
    ["EAI_AGAIN", "dns"],
    ["ECONNREFUSED", "connection_refused"],
    ["ETIMEDOUT", "timeout"],
    ["CERT_HAS_EXPIRED", "tls"],
    ["ECONNRESET", "network"],
  ]) {
    const result = await sendWorkerCommand(
      dependencies(async () => {
        throw new TypeError("fetch failed", {
          cause: Object.assign(new Error("secret"), { code }),
        });
      }),
      "user",
      { type: "status" },
    );
    assert.equal(result.ok, false);
    assert.equal(result.diagnostic.failure, failure);
    assert.equal(result.diagnostic.stage, "fetch");
  }
  const result = await sendWorkerCommand(
    dependencies(async () => {
      throw new DOMException("secret", "TimeoutError");
    }),
    "user",
    { type: "status" },
  );
  assert.equal(result.diagnostic.failure, "timeout");
});
test("separates authentication, HTTP, JSON and schema failures", async () => {
  for (const [response, failure, stage] of [
    [new Response("no", { status: 401 }), "unauthorized", "http"],
    [new Response("no", { status: 403 }), "unauthorized", "http"],
    [new Response("no", { status: 404 }), "http_error", "http"],
    [Response.json({}, { status: 500 }), "http_error", "schema"],
    [
      new Response("{", { headers: { "content-type": "application/json" } }),
      "invalid_response",
      "json",
    ],
    [Response.json({ data: {} }), "invalid_response", "schema"],
    [
      Response.json(
        { error: { code: "UNAVAILABLE", message: "failed" } },
        { status: 503 },
      ),
      "worker_error",
      "worker",
    ],
  ] as const) {
    const result = await sendWorkerCommand(
      dependencies(async () => response),
      "user",
      { type: "status" },
    );
    assert.equal(result.diagnostic.failure, failure);
    assert.equal(result.diagnostic.stage, stage);
    assert.equal(result.diagnostic.httpStatus, response.status);
  }
});
test("configuration failures never send a request", async () => {
  const deps = dependencies(async () => {
    throw new Error("should not fetch");
  });
  for (const override of [
    { workerInternalToken: undefined },
    { workerInternalUrl: "invalid" },
    { workerInternalUrl: "http://user:secret@worker" },
  ]) {
    const result = await sendWorkerCommand({ ...deps, ...override }, "user", {
      type: "status",
    });
    assert.equal(result.diagnostic.failure, "unconfigured");
    assert.doesNotMatch(result.diagnostic.workerUrl ?? "", /secret/);
  }
});
test("reachable worker errors degrade status; recovery resets suppression", async () => {
  let healthy = false;
  const events: string[] = [];
  const command = createSessionCommand({
    ...dependencies(async () =>
      healthy
        ? Response.json({ data: status })
        : Response.json(
            { error: { code: "UNAVAILABLE", message: "failed" } },
            { status: 503 },
          ),
    ),
    store: {
      session: async () => null,
      activeTelegramOperation: async () => null,
    },
    log: (event) => events.push(event),
    observe: (event) => events.push(event),
  });
  assert.equal(
    (await command("user", { type: "status" })).worker,
    "UNAVAILABLE",
  );
  await command("user", { type: "status" });
  assert.deepEqual(events, ["worker.command.failed"]);
  healthy = true;
  await command("user", { type: "status" });
  assert.ok(events.includes("worker.connection.recovered"));
  healthy = false;
  await command("user", { type: "status" });
  assert.equal(events.filter((e) => e === "worker.command.failed").length, 2);
});
