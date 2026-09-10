import assert from "node:assert/strict";
import test from "node:test";
import { parseRequestSearch } from "../src/modules/requests/_request-search";

test("request deep links accept bounded identifiers and reject malformed URL input", () => {
  assert.deepEqual(parseRequestSearch({ requestId: "request-123" }), {
    requestId: "request-123",
  });
  for (const value of [undefined, {}, [], 1, "", " ", "a/b", "x".repeat(101)]) {
    assert.deepEqual(parseRequestSearch({ requestId: value }), {});
  }
});
