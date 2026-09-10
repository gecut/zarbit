import { allowedTelegramUserIds, env } from "@zarbit/env/server";
import type { TelegramIdentity } from "./telegram-identity";
import { verifyTelegramInitData } from "./verify-telegram-init-data";

export function authenticateTelegramRequest(
  initData: string | undefined,
): TelegramIdentity {
  const identity = initData
    ? verifyTelegramInitData(initData)
    : env.NODE_ENV !== "production" && env.DEV_TELEGRAM_USER_ID
      ? { telegramUserId: env.DEV_TELEGRAM_USER_ID, firstName: "کاربر توسعه" }
      : (() => {
          throw new Error("برای ورود، برنامه را از داخل تلگرام باز کنید.");
        })();
  if (!allowedTelegramUserIds.has(identity.telegramUserId))
    throw new Error("دسترسی این حساب تلگرام مجاز نیست.");
  return identity;
}
