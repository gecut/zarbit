import { AppError } from "@zarbit/contracts";

export function authErrorMessage(error: unknown): string {
  if (error instanceof AppError) {
    if (error.status === 401)
      return "ورود معتبر نیست؛ برنامه را ببندید و از بات زربیت در تلگرام دوباره باز کنید.";
    if (error.status === 403) return "دسترسی این حساب تلگرام مجاز نیست.";
    if (error.status === 429)
      return "تعداد تلاش‌ها زیاد است؛ کمی صبر کنید و دوباره تلاش کنید.";
    if (error.code === "NETWORK")
      return "ارتباط برقرار نشد؛ اتصال اینترنت را بررسی و دوباره تلاش کنید.";
    if (error.status >= 500)
      return "سرویس موقتاً در دسترس نیست؛ دوباره تلاش کنید.";
  }
  return "پاسخ سرویس معتبر نیست؛ برنامه را به‌روز کنید و دوباره تلاش کنید.";
}
