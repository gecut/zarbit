import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "@zarbit/contracts";
import { createPrismaClient, createStore } from "../src/index";

const prisma = createPrismaClient();
const store = createStore(prisma);

async function clean() {
  await prisma.request.deleteMany();
  await prisma.telegramSession.deleteMany();
  await prisma.loginRateLimit.deleteMany();
  await prisma.telegramUser.deleteMany();
}

test.beforeEach(clean);
test.after(async () => {
  await clean();
  await prisma.$disconnect();
});

test("PostgreSQL preserves atomic request claims and cascade cleanup", async () => {
  const owner = await store.user({
    telegramUserId: "10000001",
    firstName: "Test",
    username: undefined,
  });
  const session = await store.beginSession(owner.id, "a".repeat(64));
  await store.activateSession(owner.id, session.revision, {
    state: "ACTIVE",
    connectedTelegramUserId: owner.telegramUserId,
    runtimeReady: true,
    runtimeCheckedAt: new Date(),
    membershipCheckedAt: new Date(),
  });
  const request = await store.create(owner.id, {
    condition: "LTE",
    targetPrice: 1_000_000,
    action: "ALERT",
    units: null,
  });
  const quoteAt = new Date();
  const [first, second] = await Promise.all([
    store.claim(owner.id, request.id, 900, quoteAt, session.revision),
    store.claim(owner.id, request.id, 900, quoteAt, session.revision),
  ]);

  assert.equal([first, second].filter(Boolean).length, 1);

  await prisma.telegramUser.delete({ where: { id: owner.id } });
  assert.equal(await prisma.request.count(), 0);
  assert.equal(await prisma.telegramSession.count(), 0);
});

test("PostgreSQL recovers incomplete sessions and unfinished claims", async () => {
  const owner = await store.user({
    telegramUserId: "10000002",
    firstName: "Recovery",
    username: undefined,
  });
  const session = await store.beginSession(owner.id, "b".repeat(64));
  await store.activateSession(owner.id, session.revision, {
    state: "ACTIVE",
    connectedTelegramUserId: owner.telegramUserId,
    runtimeReady: true,
    runtimeCheckedAt: new Date(),
    membershipCheckedAt: new Date(),
  });
  const request = await store.create(owner.id, {
    condition: "LTE",
    targetPrice: 1_000_000,
    action: "ALERT",
    units: null,
  });
  await store.claim(owner.id, request.id, 900, new Date(), session.revision);

  await store.recover();

  assert.equal((await store.request(owner.id, request.id))?.status, "FAILED");
  assert.equal((await store.session(owner.id))?.runtimeReady, false);
});

test("PostgreSQL retains login rate limits", async () => {
  const now = new Date();
  await store.consumeSend(["ip:test"], now);
  await store.consumeSend(["ip:test"], now);
  await store.consumeSend(["ip:test"], now);

  await assert.rejects(
    () => store.consumeSend(["ip:test"], now),
    (error: unknown) => error instanceof AppError && error.code === "RATE_LIMITED",
  );
});

test("PostgreSQL has the intended candidate and list indexes", async () => {
  const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = current_schema() AND tablename = 'Request'
  `;
  const names = new Set(indexes.map(({ indexname }) => indexname));

  assert.deepEqual(
    new Set([
      "Request_active_gte_candidate_idx",
      "Request_active_lte_candidate_idx",
      "Request_userId_status_createdAt_id_idx",
    ]),
    new Set(
      [...names].filter((name) =>
        [
          "Request_active_gte_candidate_idx",
          "Request_active_lte_candidate_idx",
          "Request_userId_status_createdAt_id_idx",
        ].includes(name),
      ),
    ),
  );
});

test("runtime database role cannot alter the schema", async () => {
  const [privileges] = await prisma.$queryRaw<
    Array<{ canCreateSchemaObjects: boolean }>
  >`
    SELECT has_schema_privilege(current_user, 'public', 'CREATE')
      AS "canCreateSchemaObjects"
  `;

  assert.equal(privileges?.canCreateSchemaObjects, false);
});
