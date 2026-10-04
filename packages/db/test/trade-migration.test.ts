import assert from "node:assert/strict";
import test from "node:test";
import { readdir, readFile } from "node:fs/promises";
import { Pool } from "pg";

// A private schema keeps migration evidence independent of the CRUD test suite.
test("trade migration preserves market history and historical quote triggers", async () => {
  const url = new URL(process.env.DATABASE_URL ?? "http://missing");
  assert.ok(
    ["localhost", "127.0.0.1"].includes(url.hostname) &&
      url.pathname.endsWith("_test"),
  );
  const pool = new Pool({ connectionString: url.toString() });
  const client = await pool.connect();
  const schema = `trade_migration_${crypto.randomUUID().replaceAll("-", "")}`;
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    const directory = new URL("../prisma/migrations/", import.meta.url);
    const migrations = (await readdir(directory))
      .filter((name) => /^\d/.test(name))
      .sort();
    for (const migration of migrations.filter(
      (name) => name < "20260915010000_trade_request_triggers",
    )) {
      await client.query(
        await readFile(
          new URL(`${migration}/migration.sql`, directory),
          "utf8",
        ),
      );
    }
    await client.query(`INSERT INTO "TelegramUser" ("id", "telegramUserId", "updatedAt") VALUES ('owner', 'test-owner', NOW());
      INSERT INTO "Participant" ("id", "updatedAt") VALUES ('buyer', NOW()), ('seller', NOW());
      INSERT INTO "QuoteHistory" ("compactQuote", "sourceMessageId", "announcedAt", "receivedAt", "chatId") VALUES (100010, 10, NOW(), NOW(), -1001);
      INSERT INTO "Trade" ("id", "chatId", "sourceMessageId", "buyerParticipantId", "sellerParticipantId", "quantity", "compactPrice", "rawPrice", "announcedAt") VALUES ('trade', -1001, 11, 'buyer', 'seller', 1, 100000, 100000000, NOW());
      INSERT INTO "Request" ("id", "userId", "condition", "action", "targetPrice", "status", "executionPhase", "triggeredQuote", "triggeredMessageId", "updatedAt") VALUES
      ('historical', 'owner', 'LTE', 'ALERT', 100020, 'DONE', 'DONE', 100010, 10, NOW()),
      ('waiting', 'owner', 'LTE', 'ALERT', 100020, 'ACTIVE', 'WAITING_QUOTE', NULL, NULL, NOW());`);
    const beforeQuotes = (await client.query('SELECT * FROM "QuoteHistory"'))
      .rows;
    const beforeTrades = (await client.query('SELECT * FROM "Trade"')).rows;
    await client.query(
      await readFile(
        new URL(
          "20260915010000_trade_request_triggers/migration.sql",
          directory,
        ),
        "utf8",
      ),
    );
    assert.deepEqual(
      (await client.query('SELECT * FROM "QuoteHistory"')).rows,
      beforeQuotes,
    );
    assert.deepEqual(
      (await client.query('SELECT * FROM "Trade"')).rows,
      beforeTrades,
    );
    const history = (
      await client.query(`SELECT * FROM "Request" WHERE "id" = 'historical'`)
    ).rows[0];
    assert.equal(history.triggerSource, "QUOTE");
    assert.equal(history.triggeredPrice, 100010);
    assert.equal(history.status, "DONE");
    const waiting = (
      await client.query(`SELECT * FROM "Request" WHERE "id" = 'waiting'`)
    ).rows[0];
    assert.equal(waiting.executionPhase, "WAITING_TRADE");
    assert.equal(waiting.armedAfterMessageId, 11);
    assert.equal(
      (await client.query('SELECT * FROM "TradeRequestCursor"')).rows[0]
        .sourceMessageId,
      11,
    );
    await client.query(
      await readFile(
        new URL(
          "20260920010000_settlement_foundation/migration.sql",
          directory,
        ),
        "utf8",
      ),
    );
    const historical = (
      await client.query(
        'SELECT "id", "sourceMessageId", "type", "buyerParticipantId", "sellerParticipantId" FROM "Trade" WHERE "id" = $1',
        ["trade"],
      )
    ).rows[0];
    assert.deepEqual(historical, {
      id: "trade",
      sourceMessageId: 11,
      type: "NORMAL",
      buyerParticipantId: "buyer",
      sellerParticipantId: "seller",
    });
  } finally {
    await client.query("SET search_path TO public");
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    client.release();
    await pool.end();
  }
});
