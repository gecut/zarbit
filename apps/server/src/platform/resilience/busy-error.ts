import { AppError } from "@zarbit/contracts";

export function busyError(): AppError {
  return new AppError(
    "RATE_LIMITED",
    "سرویس شلوغ است؛ چند لحظه بعد تلاش کنید.",
    429,
    new Date(Date.now() + 1000).toISOString(),
  );
}
