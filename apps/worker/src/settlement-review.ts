import { prisma, store } from "@zarbit/db";

async function main() {
  const [command, chatArg, messageArg, digest, reviewer] =
    process.argv.slice(2);
  const chatId = Number(chatArg);
  const messageId = Number(messageArg);
  if (
    !Number.isSafeInteger(chatId) ||
    !Number.isSafeInteger(messageId) ||
    messageId <= 0 ||
    !["inspect", "apply"].includes(command ?? "")
  ) {
    throw new Error(
      "کاربرد: settlement:review inspect|apply <chatId> <messageId> [digest] [reviewer]",
    );
  }
  const settlement = await store.settlementByMessage(chatId, messageId);
  if (!settlement) throw new Error("تسویه یافت نشد.");
  const previous = (await store.appliedSettlements())
    .filter(
      (row) => row.chatId === BigInt(chatId) && row.sourceMessageId < messageId,
    )
    .at(-1);
  const evidence = await store.coverageEvidence(
    chatId,
    previous?.sourceMessageId ?? 0,
    messageId,
  );
  const state = await store.ingestionState(chatId);
  const result = {
    chatId,
    messageId,
    status: settlement.status,
    isBootstrap: settlement.isBootstrap,
    reviewReason: settlement.reviewReason,
    previousMessageId: previous?.sourceMessageId ?? null,
    scannedThroughMessageId: state?.scannedThroughMessageId ?? 0,
    historyRecoveryRequired: state?.historyRecoveryRequired ?? false,
    observationCount: evidence.observationCount,
    tradeCount: evidence.tradeCount,
    unresolvedCount: evidence.unresolvedCount,
    coverageDigest: evidence.digest,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (command === "inspect") return;
  if (settlement.status === "APPLIED" || settlement.reviewReason) {
    throw new Error(
      "تسویهٔ اعمال‌شده یا متعارض فقط با رویهٔ تطبیق دستی بررسی می‌شود.",
    );
  }
  if (
    process.env.SETTLEMENT_REVIEW_EXECUTE !== "1" ||
    !digest ||
    digest !== evidence.digest ||
    !reviewer?.trim() ||
    evidence.unresolvedCount > 0
  ) {
    throw new Error(
      "اعمال نیازمند بررسی مستقل پوشش، digest یکسان، نام بازبین و SETTLEMENT_REVIEW_EXECUTE=1 است.",
    );
  }
  await store.applySettlement(chatId, messageId, {
    coverageDigest: digest,
    reviewedBy: reviewer.trim(),
  });
  process.stdout.write("تسویه پس از بررسی پوشش اعمال شد.\n");
}

main()
  .catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "خطای نامشخص"}\n`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
