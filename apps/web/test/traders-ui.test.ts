import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToString } from "react-dom/server";
import type { ParticipantAnalyticsSummary } from "@zarbit/contracts";
import { DataCoverageBadge } from "../src/modules/traders/_data-coverage-badge";
import { TraderSortBar } from "../src/modules/traders/_trader-sort-bar";
import { TraderCard } from "../src/modules/traders/_trader-card";
import { mockWhalesList } from "../src/dev/trader-scenarios";

test("DataCoverageBadge renders appropriate Persian badge for each confidence level", () => {
  const highHtml = renderToString(
    React.createElement(DataCoverageBadge, { confidence: "HIGH" }),
  );
  assert.ok(highHtml.includes("کامل"), "HIGH confidence should render 'کامل'");

  const estimatedHtml = renderToString(
    React.createElement(DataCoverageBadge, { confidence: "ESTIMATED" }),
  );
  assert.ok(
    estimatedHtml.includes("تخمینی"),
    "ESTIMATED confidence should render 'تخمینی'",
  );

  const unverifiedHtml = renderToString(
    React.createElement(DataCoverageBadge, {
      confidence: "UNVERIFIED_INVENTORY",
    }),
  );
  assert.ok(
    unverifiedHtml.includes("موجودی اولیه نامشخص"),
    "UNVERIFIED_INVENTORY confidence should render 'موجودی اولیه نامشخص'",
  );
});

test("TraderSortBar renders all 3 sort dimensions with Persian labels", () => {
  const html = renderToString(
    React.createElement(TraderSortBar, {
      sortBy: "REALIZED_PNL",
      sortOrder: "DESC",
      onChange: () => {},
    }),
  );

  assert.ok(
    html.includes("سود محقق‌شده"),
    "Should include label for REALIZED_PNL",
  );
  assert.ok(html.includes("حجم"), "Should include label for VOLUME");
  assert.ok(html.includes("تعداد"), "Should include label for TRADE_COUNT");
});

test("TraderCard renders rank, alias, P&L, volume, and observed position correctly", () => {
  const eskan = mockWhalesList[0]!; // اسکان: +42,000 Tomans, 20 units volume, +420 points
  const html = renderToString(
    React.createElement(TraderCard, {
      trader: eskan,
      rank: 1,
      onSelect: () => {},
    }),
  );

  assert.ok(html.includes("اسکان"), "Must include alias");
  assert.ok(html.includes("تومان"), "Must include currency label");
  assert.ok(html.includes("پوینت"), "Must include points label");
  assert.ok(html.includes("واحد"), "Must include units label");
  assert.ok(html.includes("معاملات:"), "Must include trades label");
  // Position is 0 (closed)
  assert.ok(
    html.includes("موقعیت باز: بسته"),
    "Should indicate closed position",
  );
});

test("TraderCard renders open long and short positions accurately", () => {
  const longTrader: ParticipantAnalyticsSummary = {
    alias: "خریدار_بزرگ",
    realizedPnlTomans: 10000,
    realizedPnlPoints: 100,
    buyVolume: 5,
    sellVolume: 0,
    totalVolume: 5,
    totalTrades: 1,
    buyTrades: 1,
    sellTrades: 0,
    averageTradeSize: 5,
    observedPosition: 5,
    currentCostBasis: 105000,
    confidence: "HIGH",
    hasZeroCrossing: false,
    unmatchedUnits: 0,
    firstTradeAt: "2026-09-05T10:00:00.000Z",
  };

  const longHtml = renderToString(
    React.createElement(TraderCard, {
      trader: longTrader,
      rank: 2,
      onSelect: () => {},
    }),
  );
  assert.ok(longHtml.includes("خرید:"), "Should show long position chip");

  const shortTrader: ParticipantAnalyticsSummary = {
    alias: "فروشنده_بزرگ",
    realizedPnlTomans: -5000,
    realizedPnlPoints: -50,
    buyVolume: 0,
    sellVolume: 3,
    totalVolume: 3,
    totalTrades: 1,
    buyTrades: 0,
    sellTrades: 1,
    averageTradeSize: 3,
    observedPosition: -3,
    currentCostBasis: 105200,
    confidence: "ESTIMATED",
    hasZeroCrossing: false,
    unmatchedUnits: 0,
    firstTradeAt: "2026-09-05T10:00:00.000Z",
  };

  const shortHtml = renderToString(
    React.createElement(TraderCard, {
      trader: shortTrader,
      rank: 3,
      onSelect: () => {},
    }),
  );
  assert.ok(shortHtml.includes("فروش:"), "Should show short position chip");
});
