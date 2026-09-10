import assert from "node:assert/strict";
import test from "node:test";
import { SessionOutages } from "../src/session-outages";

test("outage threshold is measured from first failure, independent of retry backoff", async () => {
  const outages = new SessionOutages();
  let sends = 0;
  const send = async () => {
    sends++;
    return true;
  };
  assert.equal(outages.connected("u", 1), false);
  outages.failed("u", 1, 1000);
  await outages.check("u", 1, 120999, send);
  assert.equal(sends, 0);
  outages.failed("u", 1, 120999);
  await outages.check("u", 1, 121000, send);
  await outages.check("u", 1, 900000, send);
  assert.equal(sends, 1);
  assert.equal(outages.connected("u", 1), true);
  assert.equal(outages.connected("u", 1), false);
  outages.failed("u", 1, 900000);
  await outages.check("u", 1, 1020000, send);
  assert.equal(sends, 2);
});

test("short outages, initial login and failed notices do not produce recovery notices", async () => {
  const outages = new SessionOutages();
  let sends = 0;
  const send = async () => {
    sends++;
    return false;
  };
  outages.failed("u", 1, 0);
  await outages.check("u", 1, 500000, send);
  assert.equal(sends, 0);
  outages.connected("u", 1);
  outages.failed("u", 1, 0);
  assert.equal(outages.connected("u", 1), false);
  outages.failed("u", 1, 1000);
  await outages.check("u", 1, 121000, send);
  await outages.check("u", 1, 500000, send);
  assert.equal(sends, 1);
  assert.equal(outages.connected("u", 1), false);
});

test("revision changes and explicit cleanup discard outage state", async () => {
  const outages = new SessionOutages();
  outages.connected("u", 1);
  outages.failed("u", 1, 0);
  await outages.check("u", 2, 200000, async () => {
    assert.fail("stale revision");
  });
  assert.equal(outages.connected("u", 2), false);
  outages.failed("u", 2, 0);
  await outages.check("u", 2, 200000, async () => true);
  outages.clear("u");
  assert.equal(outages.connected("u", 2), false);
});
