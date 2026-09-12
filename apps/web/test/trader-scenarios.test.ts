import assert from "node:assert/strict";
import test from "node:test";
import {
  participantAnalyticsDetailSchema,
  participantAnalyticsSummarySchema,
} from "@zarbit/contracts";
import {
  createMockTraderDetail,
  getMockTradersList,
  getTradersScenario,
  mockWhalesList,
} from "../src/dev/trader-scenarios";

test("all mock whales strictly validate against contract schema", () => {
  for (const whale of mockWhalesList) {
    const parsed = participantAnalyticsSummarySchema.safeParse(whale);
    assert.ok(
      parsed.success,
      `Whale "${whale.alias}" failed schema validation: ${JSON.stringify(parsed.error?.format())}`,
    );
  }
});

test("parses trader scenarios correctly from query string", () => {
  assert.equal(getTradersScenario("?tradersScenario=empty"), "empty");
  assert.equal(getTradersScenario("?tradersScenario=loading"), "loading");
  assert.equal(getTradersScenario("?tradersScenario=error"), "error");
  assert.equal(getTradersScenario(""), "normal");
  assert.equal(getTradersScenario("?tradersScenario=other"), "normal");
});

test("returns empty list under empty scenario", () => {
  const list = getMockTradersList("?tradersScenario=empty");
  assert.equal(list.length, 0);
});

test("sorts traders list by P&L, volume, and trade count", () => {
  const byPnlDesc = getMockTradersList("", "REALIZED_PNL", "DESC");
  assert.equal(byPnlDesc[0]?.alias, "اسکان"); // Top profit (+420 points)

  const byVolumeDesc = getMockTradersList("", "VOLUME", "DESC");
  assert.equal(byVolumeDesc[0]?.alias, "اسکان"); // 20 units

  const byTradesDesc = getMockTradersList("", "TRADE_COUNT", "DESC");
  assert.equal(byTradesDesc[0]?.alias, "عرفاان"); // 17 trades
});

test("creates valid trader detail matching contract schema", () => {
  const detail = createMockTraderDetail("اسکان");
  assert.ok(detail, "Detail for اسکان should exist");
  const parsed = participantAnalyticsDetailSchema.safeParse(detail);
  assert.ok(
    parsed.success,
    `Detail failed schema validation: ${JSON.stringify(parsed.error?.format())}`,
  );
  assert.equal(detail.recentTrades.length, 3);
});

test("returns null for non-existent trader alias", () => {
  const detail = createMockTraderDetail("ناشناس_وجود_ندارد");
  assert.equal(detail, null);
});
