import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "@zarbit/contracts";
import {
  formatWorkerDiagnostic,
  formatWorkerFailure,
  challengeRef,
  sessionRef,
} from "../src/logger";

test("creates a stable non-sensitive session reference", () => {
  assert.equal(sessionRef("user-1"), sessionRef("user-1"));
  assert.notEqual(sessionRef("user-1"), "user-1");
  assert.equal(sessionRef("user-1").length, 12);
});

test("creates a stable non-sensitive challenge reference", () => {
  assert.equal(challengeRef("challenge-1"), challengeRef("challenge-1"));
  assert.notEqual(challengeRef("challenge-1"), "challenge-1");
  assert.equal(challengeRef("challenge-1").length, 12);
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

test("keeps a safe source code in diagnostic logs", () => {
  const error = Object.assign(new Error("database operation timed out"), {
    code: "P2024",
    name: "PrismaClientKnownRequestError",
  });
  const line = formatWorkerDiagnostic("telegram.login.failed", error);

  assert.match(line, /"failureCategory":"database"/);
  assert.match(line, /"sourceCode":"P2024"/);
  assert.match(line, /"errorMessage":"database operation timed out"/);
});

test("keeps redacted diagnostic causes for native errors", () => {
  const cause = Object.assign(new Error("password=hunter2"), {
    code: "ECONNRESET",
  });
  const error = Object.assign(
    new Error("phone=+989121234567 upstream failure"),
    {
      cause,
      code: "ETIMEDOUT",
    },
  );
  const line = formatWorkerDiagnostic("telegram.login.failed", error);

  assert.match(line, /"failureCategory":"network"/);
  assert.match(line, /"sourceCode":"ETIMEDOUT"/);
  assert.match(line, /"cause1Code":"ECONNRESET"/);
  assert.doesNotMatch(line, /hunter2|989121234567/);
});

test("classifies native DNS failures without leaking an OTP", () => {
  const error = Object.assign(new Error("code=12345 lookup failed"), {
    code: "EAI_AGAIN",
    errno: "EAI_AGAIN",
    syscall: "getaddrinfo",
  });
  const line = formatWorkerFailure("telegram.client.error", error);

  assert.match(line, /"failureCategory":"network"/);
  assert.match(line, /"errno":"EAI_AGAIN"/);
  assert.match(line, /"syscall":"getaddrinfo"/);
  assert.doesNotMatch(line, /12345/);
});
