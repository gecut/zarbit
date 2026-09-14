import { z } from "zod";

export const normalizeDigits = (value: string): string =>
  value
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));

export const phoneSchema = z
  .string()
  .max(40)
  .transform((value) => normalizeDigits(value).replace(/[ ()-]/g, ""))
  .pipe(
    z
      .string()
      .regex(
        /^\+[1-9]\d{6,14}$/,
        "شماره را با کد کشور وارد کنید؛ مثلاً ‎+989121234567.",
      ),
  );
export const loginSchema = z.object({ phone: phoneSchema }).strict();
export const codeSchema = z
  .object({
    code: z.string().trim().min(1).max(128).transform(normalizeDigits),
  })
  .strict();
export const passwordSchema = z
  .object({ password: z.string().min(1).max(1024) })
  .strict();
