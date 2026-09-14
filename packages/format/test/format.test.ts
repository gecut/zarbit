import assert from "node:assert/strict";
import test from "node:test";
import {
  formatCompactPrice,
  formatDateTime,
  formatNumber,
  formatRelativeDateTime,
  formatTime,
  formatTomanFromCompactPrice,
} from "../src/index";

const reference = new Date("2026-09-14T12:53:45.000Z");

test("formats Persian numbers and compact prices with a Persian grouping separator", () => {
  assert.equal(formatNumber(105020), "۱۰۵٬۰۲۰");
  assert.equal(formatCompactPrice(105020), "۱۰۵٬۰۲۰");
  assert.equal(formatTomanFromCompactPrice(105020), "۱۰۵٬۰۲۰٬۰۰۰");
});

test("formats Tehran clock time and Persian calendar date-time", () => {
  assert.equal(formatTime(reference), "۱۶:۲۳:۴۵");
  assert.equal(formatDateTime(reference), "۱۴۰۵/۰۶/۲۳، ۱۶:۲۳");
});

test("formats relative time at each threshold and includes a clock after one day", () => {
  const now = reference.getTime();
  assert.equal(formatRelativeDateTime(now + 1_000, now), "همین حالا");
  assert.equal(formatRelativeDateTime(now - 19_000, now), "همین حالا");
  assert.equal(formatRelativeDateTime(now - 20_000, now), "۲۰ ثانیه پیش");
  assert.equal(formatRelativeDateTime(now - 59_000, now), "۵۹ ثانیه پیش");
  assert.equal(formatRelativeDateTime(now - 60_000, now), "۱ دقیقه پیش");
  assert.equal(formatRelativeDateTime(now - 3_599_000, now), "۵۹ دقیقه پیش");
  assert.equal(formatRelativeDateTime(now - 3_600_000, now), "۱ ساعت پیش");
  assert.equal(formatRelativeDateTime(now - 86_399_000, now), "۲۳ ساعت پیش");
  assert.equal(
    formatRelativeDateTime(now - 86_400_000, now),
    "۱ روز پیش، ساعت ۱۶:۲۳",
  );
});

test("uses a stable placeholder for invalid dates", () => {
  assert.equal(formatTime("invalid"), "—");
  assert.equal(formatDateTime("invalid"), "—");
  assert.equal(formatRelativeDateTime("invalid", reference), "—");
});
