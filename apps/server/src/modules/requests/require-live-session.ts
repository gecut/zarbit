import { AppError } from "@zarbit/contracts";
import type { AppDependencies } from "../../app-dependencies";
export async function requireLiveSession(
  command: AppDependencies["command"],
  userId: string,
): Promise<void> {
  const status = await command(userId, { type: "status" });
  if (status.capabilities.canCreateRequest) return;
  if (status.worker === "UNAVAILABLE")
    throw new AppError(
      "WORKER_UNAVAILABLE",
      "سرویس اتصال در دسترس نیست؛ کمی بعد تلاش کنید.",
      503,
    );
  if (status.authorization === "REVOKING")
    throw new AppError("SESSION_REVOKING", "قطع اتصال در حال انجام است.");
  if (status.authorization === "LOGIN_PENDING")
    throw new AppError("LOGIN_PENDING", "مراحل ورود تلگرام را کامل کنید.");
  if (status.authorization === "AUTHORIZED") {
    if (status.membership === "NOT_MEMBER")
      throw new AppError(
        "GROUP_MEMBERSHIP_REQUIRED",
        "عضویت این حساب در گروه هدف تأیید نشده است.",
      );
    throw new AppError(
      "SESSION_DEGRADED",
      "اتصال تلگرام آماده نیست؛ کمی بعد تلاش کنید.",
    );
  }
  throw new AppError(
    "SESSION_DISCONNECTED",
    "ابتدا اتصال تلگرام را برقرار کنید.",
  );
}
