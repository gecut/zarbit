import assert from "node:assert/strict";
import test from "node:test";

import { parseCanonicalBotOrder } from "../src/index";

test("parses canonical bot orders (standard)", () => {
  const buy = parseCanonicalBotOrder("🔵 رسول اُف 1 خ 104900 (مانده: 1)");
  assert.equal(buy.status, "parsed");
  if (buy.status === "parsed") {
    assert.equal(buy.data.participantAlias, "رسول اُف");
    assert.equal(buy.data.quantity, 1);
    assert.equal(buy.data.side, "BUY");
    assert.equal(buy.data.compactPrice, 104900);
    assert.equal(buy.data.remaining, 1);
  }

  const sell = parseCanonicalBotOrder("🔴 سناتور 2 ف 105120 (مانده: 2)");
  assert.equal(sell.status, "parsed");
  if (sell.status === "parsed") {
    assert.equal(sell.data.participantAlias, "سناتور");
    assert.equal(sell.data.quantity, 2);
    assert.equal(sell.data.side, "SELL");
    assert.equal(sell.data.compactPrice, 105120);
    assert.equal(sell.data.remaining, 2);
  }
});

test("parses canonical bot orders (margin call automatic orders)", () => {
  const marginCallBuy = parseCanonicalBotOrder(
    "🔵 ⚠️ کال مارجین (آزمان 1 خ 115120 (مانده: 1)) 🤖 آگهی خودکار",
  );
  assert.equal(marginCallBuy.status, "parsed");
  if (marginCallBuy.status === "parsed") {
    assert.equal(marginCallBuy.data.participantAlias, "آزمان");
    assert.equal(marginCallBuy.data.quantity, 1);
    assert.equal(marginCallBuy.data.side, "BUY");
    assert.equal(marginCallBuy.data.compactPrice, 115120);
    assert.equal(marginCallBuy.data.remaining, 1);
  }

  const marginCallSell = parseCanonicalBotOrder(
    "🔴 ⚠️ کال مارجین (رضا 5 ف 115000 (مانده: 5)) 🤖 آگهی خودکار",
  );
  assert.equal(marginCallSell.status, "parsed");
  if (marginCallSell.status === "parsed") {
    assert.equal(marginCallSell.data.participantAlias, "رضا");
    assert.equal(marginCallSell.data.quantity, 5);
    assert.equal(marginCallSell.data.side, "SELL");
    assert.equal(marginCallSell.data.compactPrice, 115000);
    assert.equal(marginCallSell.data.remaining, 5);
  }
});
