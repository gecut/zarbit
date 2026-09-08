import assert from "node:assert/strict";
import test from "node:test";
import { ResponseCache } from "../src/response-cache";
import { ReadCapacity, RpcRateLimit } from "../src/rpc-capacity";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
test("cold requests coalesce, null is cached, and stale refresh is bounded", async () => {
  let now = 0,
    calls = 0;
  const cache = new ResponseCache<number | null>({
    ttlMs: 100,
    staleMs: 100,
    now: () => now,
  });
  const cold = deferred<number | null>();
  const load = () => {
    calls++;
    return cold.promise;
  };
  const pending = Array.from({ length: 50 }, () => cache.get("quote", load));
  cold.resolve(null);
  assert.deepEqual(await Promise.all(pending), Array(50).fill(null));
  assert.equal(calls, 1);
  assert.equal(await cache.get("quote", load), null);
  now = 101;
  const fresh = deferred<number | null>();
  assert.equal(await cache.get("quote", () => fresh.promise), null);
  assert.equal(
    await cache.get("quote", () => {
      throw new Error("must coalesce");
    }),
    null,
  );
  now = 201;
  const hard = cache.get("quote", () => {
    throw new Error("must wait");
  });
  fresh.resolve(42);
  assert.equal(await hard, 42);
});
test("failed background refresh is handled; expired snapshots are never returned", async () => {
  let now = 0;
  const cache = new ResponseCache<number>({
    ttlMs: 10,
    staleMs: 10,
    now: () => now,
  });
  await cache.get("a", async () => 1);
  now = 11;
  assert.equal(
    await cache.get("a", async () => {
      throw new Error("offline");
    }),
    1,
  );
  await new Promise((resolve) => setImmediate(resolve));
  now = 21;
  await assert.rejects(
    cache.get("a", async () => {
      throw new Error("offline");
    }),
    /offline/,
  );
});
test("invalidation prevents a late read from overwriting a mutation; values are bounded", async () => {
  const cache = new ResponseCache<number>({ ttlMs: 1000, maxEntries: 1 });
  const old = deferred<number>();
  const pending = cache.get("a", () => old.promise);
  cache.invalidate("a");
  assert.equal(await cache.get("a", async () => 2), 2);
  old.resolve(1);
  await pending;
  assert.equal(await cache.get("a", async () => 3), 2);
  await cache.get("b", async () => 4);
  assert.equal(await cache.get("a", async () => 3), 3);
});
test("deadline does not release concurrency until underlying work settles", async () => {
  const limiter = new ReadCapacity(1, 10);
  const slow = deferred<number>();
  await assert.rejects(
    limiter.run(() => slow.promise),
    { code: "READ_TIMEOUT" },
  );
  await assert.rejects(
    limiter.run(async () => 2),
    { code: "RATE_LIMITED" },
  );
  slow.resolve(1);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(await limiter.run(async () => 2), 2);
});
test("rate budgets isolate users and preserve mutation budget when reads flood", () => {
  let now = 0;
  const limiter = new RpcRateLimit(() => now);
  for (let i = 0; i < 30; i++) limiter.consume("a", false);
  assert.throws(() => limiter.consume("a", false), { code: "RATE_LIMITED" });
  limiter.consume("a", true);
  limiter.consume("b", false);
  now = 100;
  limiter.consume("a", false);
});
