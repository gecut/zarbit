import { allowedTelegramUserIds, env } from "@zarbit/env/server";
import type { TelegramIdentity } from "./telegram-identity";
import { verifyTelegramInitData } from "./verify-telegram-init-data";

type VerifyTelegramInitData = (initData: string) => TelegramIdentity;

export interface TelegramAuthenticationOptions {
  allowedTelegramUserIds: ReadonlySet<string>;
  devTelegramUserId?: string;
  nodeEnv: "development" | "production" | "test";
  verifyTelegramInitData?: VerifyTelegramInitData;
}

export function createTelegramAuthenticator({
  allowedTelegramUserIds,
  devTelegramUserId,
  nodeEnv,
  verifyTelegramInitData: verify = verifyTelegramInitData,
}: TelegramAuthenticationOptions) {
  return (initData: string | undefined): TelegramIdentity => {
    const identity = initData
      ? verify(initData)
      : nodeEnv === "development" && devTelegramUserId
        ? { telegramUserId: devTelegramUserId, firstName: "کاربر توسعه" }
        : (() => {
            throw new Error("برای ورود، برنامه را از داخل تلگرام باز کنید.");
          })();
    if (!allowedTelegramUserIds.has(identity.telegramUserId))
      throw new Error("دسترسی این حساب تلگرام مجاز نیست.");
    return identity;
  };
}

const authenticate = createTelegramAuthenticator({
  allowedTelegramUserIds,
  devTelegramUserId: env.DEV_TELEGRAM_USER_ID,
  nodeEnv: env.NODE_ENV,
});

export function authenticateTelegramRequest(
  initData: string | undefined,
): TelegramIdentity {
  return authenticate(initData);
}
