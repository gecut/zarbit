import { AppError } from "@zarbit/contracts";
import type { AppDependencies } from "../../app-dependencies";

export async function requireLiveSession(
  command: AppDependencies["command"],
  userId: string,
): Promise<void> {
  const status = await command(userId, { type: "status" });
  const ready =
    "capabilities" in status
      ? (status.capabilities?.canCreateRequest ?? false)
      : status.state === "ACTIVE" && status.connection === "CONNECTED";
  if (!ready) {
    const detail =
      "kind" in status && status.kind
        ? (
            {
              DISCONNECTED: [
                "SESSION_DISCONNECTED",
                "ابتدا اتصال تلگرام را برقرار کنید.",
              ],
              LOGIN_PENDING: [
                "LOGIN_PENDING",
                "مراحل ورود تلگرام را کامل کنید.",
              ],
              NOT_IN_GROUP: [
                "GROUP_MEMBERSHIP_REQUIRED",
                "این حساب عضو گروه هدف نیست.",
              ],
              DEGRADED: [
                "SESSION_DEGRADED",
                "ارتباط تلگرام ناپایدار است؛ کمی بعد دوباره تلاش کنید.",
              ],
              REVOKED: [
                "SESSION_REVOKED",
                "اتصال تلگرام توسط تلگرام قطع شده است؛ دوباره وارد شوید.",
              ],
              REVOKING: ["SESSION_REVOKING", "قطع اتصال در حال انجام است."],
              ERROR: ["SESSION_ERROR", "اتصال تلگرام با خطا روبه‌رو شده است."],
              ACTIVE: [
                "SESSION_REQUIRED",
                "ابتدا اتصال تلگرام را برقرار کنید.",
              ],
            } as const
          )[status.kind]
        : (["SESSION_REQUIRED", "ابتدا اتصال تلگرام را برقرار کنید."] as const);
    throw new AppError(detail[0], detail[1]);
  }
}
