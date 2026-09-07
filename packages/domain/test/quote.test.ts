import assert from "node:assert/strict";
import test from "node:test";

import { compactQuoteToDisplayPrice, parseQuoteMessage } from "../src/index";

test("parses standalone and labeled compact quotes across digit scripts", () => {
  assert.equal(parseQuoteMessage("95900"), 95_900);
  assert.equal(parseQuoteMessage("مظنه: ۹۵٬۹۰۰"), 95_900);
  assert.equal(parseQuoteMessage("مظنه - ٩٥,٩٠٠"), 95_900);
});

test("rejects unrelated quote text and maps compact values to the display amount", () => {
  assert.equal(parseQuoteMessage("مظنه امروز 95900 است"), null);
  assert.equal(parseQuoteMessage("95900 و 96000"), null);
  assert.equal(compactQuoteToDisplayPrice(95_900), 95_900_000);
});
