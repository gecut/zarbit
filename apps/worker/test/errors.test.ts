import assert from "node:assert/strict";
import test from "node:test";
import { tl } from "@mtcute/node";
import { AppError } from "@zarbit/contracts";
import { errorDetails, rpcCode, safeError } from "../src/errors";

test("reads MTcute RpcError.text as the Telegram RPC code", () => {
  const error = tl.RpcError.create(401, "SESSION_PASSWORD_NEEDED");

  assert.equal(rpcCode(error), "SESSION_PASSWORD_NEEDED");
  assert.deepEqual(errorDetails(error), {
    errorCode: "SESSION_PASSWORD_NEEDED",
    failureCategory: "telegram_rpc",
    sourceCode: "SESSION_PASSWORD_NEEDED",
  });
});

test("keeps raw RPC and native socket errors in separate categories", () => {
  const raw = Object.assign(new Error("raw RPC"), {
    errorMessage: "PHONE_CODE_INVALID",
  });
  const native = Object.assign(new Error("socket reset"), {
    code: "ECONNRESET",
  });

  assert.equal(rpcCode(raw), "PHONE_CODE_INVALID");
  assert.equal(safeError(raw).code, "PHONE_CODE_INVALID");
  assert.deepEqual(errorDetails(native), {
    errorCode: "ECONNRESET",
    failureCategory: "network",
    sourceCode: "ECONNRESET",
  });
});

test("preserves application and database categories", () => {
  const application = new AppError("FORBIDDEN", "forbidden", 403);
  const database = Object.assign(new Error("query timed out"), {
    code: "P1008",
    name: "PrismaClientKnownRequestError",
  });

  assert.equal(errorDetails(application).failureCategory, "application");
  assert.deepEqual(errorDetails(database), {
    errorCode: "P1008",
    failureCategory: "database",
    sourceCode: "P1008",
  });
});

test("turns expired hashes and revoked keys into a safe fresh-login response", () => {
  for (const code of ["PHONE_CODE_HASH_INVALID", "SESSION_REVOKED"]) {
    const error = tl.RpcError.create(401, code);
    const safe = safeError(error);
    assert.equal(safe.code, "LOGIN_EXPIRED");
    assert.equal(safe.status, 400);
  }
});
