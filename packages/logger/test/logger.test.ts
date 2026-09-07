import assert from "node:assert/strict";
import test from "node:test";
import { Writable } from "node:stream";

import { correlationRef, createLogger } from "../src/index";

test("writes redacted JSON with stable service bindings", () => {
  let line = "";
  const destination = new Writable({
    write(chunk, _encoding, done) {
      line += String(chunk);
      done();
    },
  });
  const logger = createLogger(
    { service: "worker", level: "debug" },
    destination,
  );

  logger.info(
    {
      event: "telegram.login.started",
      password: "secret",
      phone: "+989121234567",
    },
    "telegram.login.started",
  );

  const entry = JSON.parse(line) as Record<string, unknown>;
  assert.equal(entry.service, "worker");
  assert.equal(entry.event, "telegram.login.started");
  assert.equal(entry.password, "[redacted]");
  assert.equal(entry.phone, "[redacted]");
  assert.equal(typeof entry.time, "string");
});

test("creates opaque stable correlation references", () => {
  assert.equal(correlationRef("session-1"), correlationRef("session-1"));
  assert.notEqual(correlationRef("session-1"), "session-1");
});

test("omits raw error text while retaining safe error metadata", () => {
  let line = "";
  const destination = new Writable({
    write(chunk, _encoding, done) {
      line += String(chunk);
      done();
    },
  });
  const logger = createLogger({ service: "server" }, destination);
  const error = Object.assign(new Error("password=not-for-logs"), {
    code: "ECONNRESET",
  });

  logger.error(
    {
      body: { password: "not-for-logs" },
      event: "api.operation.failed",
      err: error,
    },
    "api.operation.failed",
  );

  const entry = JSON.parse(line) as { err: Record<string, unknown> };
  assert.equal(entry.err.name, "Error");
  assert.equal(entry.err.code, "ECONNRESET");
  assert.equal("message" in entry.err, false);
  assert.equal(line.includes('"body":{"password"'), false);
  assert.equal(line.includes("not-for-logs"), false);
});
