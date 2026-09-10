import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@zarbit/env/server";
import type { TelegramIdentity } from "./telegram-identity";

function invalidInitData(): never {
  throw new Error("اطلاعات ورود تلگرام معتبر نیست.");
}

export function verifyTelegramInitData(initData: string): TelegramIdentity {
  if (!env.TELEGRAM_BOT_TOKEN)
    throw new Error("اعتبارسنجی تلگرام روی سرور پیکربندی نشده است.");

  const params = new URLSearchParams(initData);
  if (
    initData.length > 12_000 ||
    new Set(params.keys()).size !== [...params.keys()].length
  )
    invalidInitData();
  const providedHash = params.get("hash");
  const userValue = params.get("user");
  const authDate = Number(params.get("auth_date"));
  if (
    !providedHash ||
    !/^[a-f0-9]{64}$/i.test(providedHash) ||
    !userValue ||
    !Number.isSafeInteger(authDate) ||
    authDate <= 0
  )
    invalidInitData();
  if (
    Math.floor(Date.now() / 1_000) - authDate > 86_400 ||
    authDate > Math.floor(Date.now() / 1_000) + 60
  )
    invalidInitData();

  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData")
    .update(env.TELEGRAM_BOT_TOKEN)
    .digest();
  const expectedHash = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest();
  const receivedHash = Buffer.from(providedHash, "hex");
  if (
    receivedHash.length !== expectedHash.length ||
    !timingSafeEqual(receivedHash, expectedHash)
  )
    invalidInitData();

  let user: unknown;
  try {
    user = JSON.parse(userValue);
  } catch {
    invalidInitData();
  }
  if (!user || typeof user !== "object" || !("id" in user)) invalidInitData();
  const record = user as {
    id: unknown;
    first_name?: unknown;
    username?: unknown;
  };
  if (
    typeof record.id !== "number" ||
    !Number.isSafeInteger(record.id) ||
    record.id <= 0
  )
    invalidInitData();

  return {
    telegramUserId: String(record.id),
    firstName:
      typeof record.first_name === "string" ? record.first_name : undefined,
    username: typeof record.username === "string" ? record.username : undefined,
  };
}
