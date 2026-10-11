import assert from "node:assert/strict";
import test from "node:test";

import { parseTradeReceipt } from "../src/index";

test("parses standard trade receipts with integer thousands", () => {
  const rawText = `.
🔵 خریدار : مرداد
🔴 فروشنده : سناتور
✅ تعداد: 2 قیمت: 105٬120٬000 ✅
⏱️ ساعت: 15:18:50 1405/06/19
🔖 شماره حواله: 9368`;

  const result = parseTradeReceipt(rawText);
  assert.equal(result.status, "parsed");
  if (result.status === "parsed") {
    assert.equal(result.data.buyerAlias, "مرداد");
    assert.equal(result.data.sellerAlias, "سناتور");
    assert.equal(result.data.quantity, 2);
    assert.equal(result.data.displayedPrice, 105120000);
    assert.equal(result.data.compactPrice, 105120);
    assert.equal(result.data.referenceNumber, "9368");
  }
});

test("parses trade receipts with fractional / cents prices", () => {
  const rawText = `.
🔵 خریدار : أمیر
🔴 فروشنده : سانی
✅ تعداد: 1 قیمت: 113٬750٬370 ✅
⏱️ ساعت: 10:19:40 1405/07/19
🔖 شماره حواله: 5757`;

  const result = parseTradeReceipt(rawText);
  assert.equal(result.status, "parsed");
  if (result.status === "parsed") {
    assert.equal(result.data.buyerAlias, "أمیر");
    assert.equal(result.data.sellerAlias, "سانی");
    assert.equal(result.data.quantity, 1);
    assert.equal(result.data.displayedPrice, 113750370);
    assert.equal(result.data.compactPrice, 113750.37);
    assert.equal(result.data.referenceNumber, "5757");
  }
});
