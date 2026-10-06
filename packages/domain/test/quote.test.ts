import assert from "node:assert/strict";
import test from "node:test";

import { parseCanonicalBotQuote, parseContextCommand } from "../src/index";

test("parses canonical bot quotes across digit scripts", () => {
  const ascii = parseCanonicalBotQuote("🟡 مظنه: 950104 🟡");
  assert.equal(ascii.status, "parsed");
  if (ascii.status === "parsed") {
    assert.equal(ascii.data.compactQuote, 950_104);
  }

  const persian = parseCanonicalBotQuote("مظنه: ۹۵۹۰۰");
  assert.equal(persian.status, "parsed");
  if (persian.status === "parsed") {
    assert.equal(persian.data.compactQuote, 95_900);
  }
});

test("parses context commands and rejects malformed variants", () => {
  const takeAll = parseContextCommand("ب");
  assert.equal(takeAll.status, "parsed");
  if (takeAll.status === "parsed") {
    assert.equal(takeAll.data.command, "TAKE_ALL");
  }

  const cancel = parseContextCommand("ن");
  assert.equal(cancel.status, "parsed");
  if (cancel.status === "parsed") {
    assert.equal(cancel.data.command, "CANCEL");
  }

  const quantity = parseContextCommand("۲");
  assert.equal(quantity.status, "parsed");
  if (quantity.status === "parsed") {
    assert.equal(quantity.data.command, "TAKE_QUANTITY");
    assert.equal(quantity.data.quantity, 2);
  }

  assert.equal(parseContextCommand("ب 1").status, "unsupported");
  assert.equal(parseContextCommand("نن").status, "unsupported");
  assert.equal(parseContextCommand("سلام\nب").status, "unsupported");
});

test("trade freshness rejects future dates and expires strictly after five minutes", async () => {
  const { isFreshTrade } = await import("../src/index");
  const now = new Date("2026-09-15T12:00:00Z");
  for (const [age, expected] of [
    [-1, false],
    [0, true],
    [299999, true],
    [300000, true],
    [300001, false],
  ] as const) {
    assert.equal(isFreshTrade(new Date(now.getTime() - age), now), expected);
  }
});
