import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "@zarbit/contracts";
import { formatWorkerFailure, sessionRef } from "../src/logger";

test("creates a stable non-sensitive session reference", () => {
  assert.equal(sessionRef("user-1"), sessionRef("user-1"));
  assert.notEqual(sessionRef("user-1"), "user-1");
  assert.equal(sessionRef("user-1").length, 12);
});

test("redacts secrets and phone numbers from error logs", () => {
  const error = new AppError(
    "NETWORK_ERROR",
    "Bearer secret-token password=hunter2 phone=+989121234567",
    503,
  );
  error.stack = "Error: Bearer secret-token\\n  at password=hunter2";
  const line = formatWorkerFailure("telegram.sessions.sync_failed", error);

  assert.match(line, /telegram\.sessions\.sync_failed/);
  assert.doesNotMatch(line, /secret-token|hunter2|989121234567/);
  assert.match(line, /errorStack/);
});
