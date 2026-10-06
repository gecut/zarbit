# جداسازی موتور اجرای معاملات از گیت تسویه و رفع توقف تریگرهای بازار

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** جداسازی کامل و اصولی موتور اجرای سفارشات و تریگرهای زندهٔ بازار (`Request Engine`) از گیت بررسی حسابداری تسویه (`Settlement Gate`)، جلوگیری از توقف سیستم به دلیل حذف پیام‌های تلگرام در گذشته، و بازگشایی پردازش معاملات روی پروداکشن.

**Architecture:** جریان اجرای سفارشات منحصراً به دریافت رسیدهای معتبر معامله (`Trade` با نوع `NORMAL`) و آمادگی سشن وابسته است. گیت تسویه صرفاً برای صحت‌سنجی پوشش P&L معامله‌گران در لایهٔ تحلیل هفتگی استفاده می‌شود و هیچ کنترلی روی ثبت یا اجرای سفارشات ندارد. همچنین حذف پیام‌های خارج از بازهٔ تسویهٔ جاری، گیت را فعال نمی‌کند.

**Tech Stack:** TypeScript strict, Prisma, PostgreSQL, Hono, Node.js.

**Spec:** `docs/BUSINESS-RULES.md`, `docs/TELEGRAM.md`, `docs/adr/0006-settlement-ledger-and-reviewed-coverage.md`.

## Global Constraints

- بدون تغییر در ساختار دیتابیس (بدون نیاز به مایگریشن جدید).
- حفظ استانداردهای nexload-code و صحت تایپ‌ها.
- کلیهٔ تست‌های مونوپو باید پاس شوند.

---

### Task 1: اصلاح `packages/db/src/requests.ts`

- [ ] حذف شرط `if (ingestion?.gateStatus === "REVIEW_REQUIRED") return;` از `claimTradeRequests`.
- [ ] حذف بررسی `gateStatus === "REVIEW_REQUIRED"` از متد `markSending`.

### Task 2: اصلاح `packages/db/src/settlement.ts`

- [ ] در متد `observeFinancialMessage`: نادیده گرفتن حذف پیام‌هایی که شناسه‌شان `<= appliedThroughMessageId` است.
- [ ] در متد `completeFinancialRecovery`: مقید کردن بررسی خطاها به پیام‌های بازهٔ جاری (`sourceMessageId > appliedThroughMessageId`).

### Task 3: اصلاح `apps/worker`

- [ ] در `apps/worker/src/requests.ts`: پاک‌سازی بررسی خطای `FINANCIAL_REVIEW_REQUIRED`.
- [ ] در `apps/worker/test/requests.test.ts`: به‌روزرسانی آزمون‌های مرتبط.

### Task 4: اعتبارسنجی محلی

- [ ] اجرای `VITE_SERVER_URL="https://api.zarbit.ir" pnpm check-types`.
- [ ] اجرای `pnpm test`.
- [ ] اجرای `pnpm build`.

### Task 5: ریکاوری و بازگشایی دیتابیس سرور پروداکشن

- [ ] اجرای اسکریپت SQL روی دیتابیس سرور برای ست کردن `gateStatus = 'OPEN'` و رساندن کرسر معاملات به آخرین پیام جاری.
- [ ] تست اجرای سفارش در ورکر سرور و بررسی لاگ‌ها.
