import assert from "node:assert/strict";
import test from "node:test";

import { compactQuoteToDisplayPrice, parseQuoteMessage } from "../src/index";

test("parses labelled quotes surrounded by formatting across digit scripts", () => {
  assert.equal(parseQuoteMessage("🟡 مظنه: 950104  🟡"), 950_104);
  assert.equal(parseQuoteMessage("مظنه: ۹۵۹۰۰"), 95_900);
  assert.equal(parseQuoteMessage("اطلاعیه — مظنه: ٩٥٩٠٠ ✅"), 95_900);
});

test("rejects unrelated quote text and maps compact values to the display amount", () => {
  assert.equal(parseQuoteMessage("95900"), null);
  assert.equal(parseQuoteMessage("مظنه امروز 95900 است"), null);
  assert.equal(parseQuoteMessage("مظنه: 959"), null);
  assert.equal(parseQuoteMessage("مظنه: 95900 و 96000"), 95_900);
  assert.equal(parseQuoteMessage("نامظنه: 95900"), null);
  assert.equal(compactQuoteToDisplayPrice(95_900), 95_900_000);
});
