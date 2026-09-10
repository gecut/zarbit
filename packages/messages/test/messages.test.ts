import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMessageButtons,
  formatAlertMessage,
  formatRequestResultMessage,
  formatSessionMessage,
  formatWelcomeMessage,
  groupMessageUrl,
  type SessionNotification,
} from "../src/index";
import { escapeMarkdown, inlineCode } from "../src/format";

const request = {
  action: "ALERT" as const,
  condition: "GTE" as const,
  targetPrice: 96155,
  units: null,
};

test("Markdown escapes every reserved character and keeps code contents intact", () => {
  const reserved = "_*[]()~`>#+-=|{}.!\\";
  for (const char of reserved) assert.equal(escapeMarkdown(char), "\\" + char);
  assert.equal(escapeMarkdown("سلام ۹۶٬۱۵۵"), "سلام ۹۶٬۱۵۵");
  assert.equal(inlineCode("2خ96155"), "`2خ96155`");
  assert.equal(inlineCode("2ف96155"), "`2ف96155`");
  assert.equal(inlineCode("a`b\\c"), "`a\\`b\\\\c`");
});

test("automatic alert distinguishes source quote, target and Tehran time; manual has no source", () => {
  const automatic = formatAlertMessage({
    ...request,
    trigger: {
      compactQuote: 96200,
      announcedAt: new Date("2026-09-08T11:02:00Z"),
    },
  });
  assert.match(automatic, /۹۶٬۲۰۰/);
  assert.match(automatic, /۹۶٬۱۵۵/);
  assert.match(automatic, /۱۴:۳۲/);
  const manual = formatAlertMessage({ ...request, condition: "LTE" });
  assert.match(manual, /اجرای دستی/);
  assert.match(manual, /برابر یا کمتر/);
  assert.doesNotMatch(manual, /مظنه دریافتی|زمان مظنه/);
});

test("results describe delivery, preserve group text and distinguish private uncertainty", () => {
  for (const [action, groupText] of [
    ["BUY", "2خ96155"],
    ["SELL", "2ف96155"],
  ] as const) {
    const text = formatRequestResultMessage({
      ...request,
      action,
      units: 2,
      status: "DONE",
      groupText,
    });
    assert.ok(text.includes(inlineCode(groupText)));
    assert.match(text, /به معنی تأیید معامله نیست/);
  }
  assert.match(
    formatRequestResultMessage({ ...request, status: "UNKNOWN" }),
    /گفت‌وگوی بات/,
  );
  assert.match(
    formatRequestResultMessage({
      ...request,
      action: "BUY",
      status: "UNKNOWN",
      recovered: true,
    }),
    /سرویس هنگام اجرا متوقف شد/,
  );
});

test("all message variants remain compact and do not claim cancellation", () => {
  const events: SessionNotification[] = [
    { type: "connected", member: true },
    { type: "connected", member: false },
    { type: "membership_lost" },
    { type: "revoked" },
    { type: "outage" },
    { type: "recovered" },
  ];
  const messages = [
    formatWelcomeMessage({ configured: true }),
    formatWelcomeMessage({ configured: false }),
    ...events.map(formatSessionMessage),
    formatAlertMessage(request),
  ];
  for (const action of ["BUY", "SELL", "ALERT"] as const)
    for (const status of ["DONE", "FAILED", "UNKNOWN"] as const)
      for (const failure of [
        "connection",
        "group_permission",
        "private_permission",
        "unknown",
      ] as const)
        messages.push(
          formatRequestResultMessage({
            ...request,
            action,
            status,
            failure,
            manual: true,
            units: 999999,
            targetPrice: Number.MAX_SAFE_INTEGER,
            groupText: "2خ96155",
            recovered: true,
          }),
        );
  for (const text of messages) {
    assert.ok(text.length <= 650, text);
    assert.ok(text.split("\n").filter(Boolean).length <= 7, text);
    assert.doesNotMatch(text, /لغو شدند/);
  }
});

test("buttons only use valid HTTPS app targets and supported group message links", () => {
  assert.equal(
    groupMessageUrl(-1001234567890, 42),
    "https://t.me/c/1234567890/42",
  );
  for (const group of [-123, 123, -1000, NaN])
    assert.equal(groupMessageUrl(group, 42), undefined);
  for (const id of [0, -1, 1.2, NaN])
    assert.equal(groupMessageUrl(-1001234567890, id), undefined);
  assert.equal(
    buildMessageButtons({ webAppUrl: "javascript:alert(1)" }),
    undefined,
  );
  assert.equal(
    buildMessageButtons({
      webAppUrl: "https://example.com",
      privateChat: false,
    }),
    undefined,
  );
  assert.equal(
    buildMessageButtons({ webAppUrl: "https://user:secret@example.com" }),
    undefined,
  );
  const buttons = buildMessageButtons({
    webAppUrl: "https://app.example.com/?old=1#x",
    requestId: "request/a?b",
    groupId: -1001234567890,
    groupMessageId: 42,
  })!.inline_keyboard[0]!;
  assert.equal(buttons.length, 2);
  const detail = buttons[1]!;
  assert.ok("web_app" in detail);
  const url = new URL(detail.web_app.url);
  assert.equal(url.pathname, "/history");
  assert.equal(url.searchParams.get("requestId"), "request/a?b");
  assert.equal(url.searchParams.has("old"), false);
  assert.equal(url.hash, "");
});
