# مشخصات و قابلیت‌های صفحه اصلی زربیت (Home Page Feature Specification)

این مستند شامل مشخصات دقیق قابلیت‌ها، داده‌ها، جریان‌های پس‌زمینه و تعاملات دیداری موجود در **صفحه اصلی (Home Page)** مینی‌اپلیکیشن زربیت منطبق بر آخرین پیاده‌سازی سورس‌کد است.

---

## ۱. پوسته سراسری و نوار‌های پیرامونی (Global Shell)

**منبع کد:** [`apps/web/src/app/app-shell.tsx`](file:///Users/mm25zamanian/Codes/zarbit/apps/web/src/app/app-shell.tsx)

### الف) سربرگ ثابت فوقانی (Fixed Header)

1. **نشان و عنوان برند:** آیکون زربیت با حرف «ز»، عنوان «زربیت» و زیرعنوان «نمایش آخرین مظنه» که با کلیک به صفحه اصلی (`/`) هدایت می‌کند.
2. **میانبر تنظیمات تلگرام:** دکمه آیکونی چرخ‌دنده در سمت چپ هدر که مستقیماً به صفحه اتصال تلگرام (`/telegram`) لینک شده است.

### ب) گیت احراز هویت ([`AuthGate`](file:///Users/mm25zamanian/Codes/zarbit/apps/web/src/shared/auth/auth.tsx))

- اعتبارسنجی خودکار امضای داده‌های تلگرام (`initData`) و لیست مجاز (`ALLOWED_TELEGRAM_USER_IDS`).
- مدیریت وضعیت‌های قطع اینترنت، بررسی دسترسی، و خطای عدم تطابق نشست.

### ج) اعلان به‌روزرسانی PWA ([`PwaUpdate`](file:///Users/mm25zamanian/Codes/zarbit/apps/web/src/app/pwa-update.tsx))

- کارت اعلام نسخه جدید در صورت فعال شدن سرویس ورکر جدید، با دکمه «بارگذاری نسخه جدید» (با غیرفعال‌سازی در حین انجام موتاسیون‌های فعال).

### د) داک ناوبری پایینی (Bottom Navigation Dock)

نوار ناوبری ثابت با ۴ تب اصلی:

1. **خانه (Home):** صفحه اصلی (`/`).
2. **سوابق (History):** آرشیو سفارشات و درخواست‌ها با صفحه‌بندی نامحدود (`/history`).
3. **معامله‌گران (Traders):** تابلوی رتبه‌بندی ۷ روزه و تحلیل معامله‌گران (`/traders`).
4. **تنظیمات (Settings):** مدیریت نشست و اتصال تلگرام (`/telegram`).

---

## ۲. هدر و ترمینال مظنه رسمی ([`TerminalQuoteHeader`](file:///Users/mm25zamanian/Codes/zarbit/apps/web/src/modules/home/_terminal-quote-header.tsx))

کارت اصلی بالای صفحه که اطلاعات مظنه رسمی و آخرین معامله را یکپارچه نمایش می‌دهد:

1. **نشانگر وضعیت اتصال:**
   - **زنده (`healthy`):** دریافت موفق آخرین هد بازار.
   - **در حال اتصال (`connecting`):** در حال ارسال یا دریافت استعلام.
   - **دریافت دوره‌ای · هر ۳ ثانیه (`degraded`):** افت به حالت بازیابی در صورت خطا.
2. **دکمه تازه‌سازی دستی:** دکمه آیکونی با اسپینر لودینگ جهت استعلام فوری آخرین اطلاعات بازار از سرور.
3. **نمایشگر نرخ اصلی مظنه طلا:**
   - نرخ به تومان کامل با فرمت درشت (مثلاً `۱۰۵.۰۲۰.۰۰۰` تومان).
   - نرخ بنکداری فشرده (مثلاً `مظنه: ۱۰۵.۰۲۰`).
   - زمان اعلام پیام مظنه در تلگرام (`ساعت HH:MM:SS` بر مبنای `Asia/Tehran`).
4. **بخش آخرین معامله قطعی:**
   - نمایش نرخ آخرین معامله به تومان کامل همراه با تعداد واحد معامله‌شده.
   - بج اختلاف قیمت معامله با مظنه (پرمیوم با رنگ سبز، دیسکانت با رنگ قرمز، یا تراز با مظنه).
5. **هشدار کهنگی مظنه ([`QuoteAge`](file:///Users/mm25zamanian/Codes/zarbit/apps/web/src/modules/home/_quote-age.tsx)):**
   - در صورت گذشت بیش از ۵ دقیقه (۳۰۰ ثانیه) از انتشار آخرین مظنه در تلگرام، بنر هشدار کهنگی نرخ ظاهر می‌شود.

---

## ۳. نوار اکشن‌های سریع اجرا ([`ExecutionStrip`](file:///Users/mm25zamanian/Codes/zarbit/apps/web/src/modules/home/_execution-strip.tsx))

نوار عملیات فوری برای ثبت سفارشات معاملاتی:

- دکمه **«خرید» (BUY)**: باز کردن کشوی سفارش خرید با پیش‌پر کردن مظنه جاری.
- دکمه **«فروش» (SELL)**: باز کردن کشوی سفارش فروش با پیش‌پر کردن مظنه جاری.
- دکمه **«هشدار» (ALERT)**: باز کردن کشوی تنظیم آلارم قیمت بر اساس مظنه.

---

## ۴. رادار سفارشات و درخواست‌های فعال ([`RequestList`](file:///Users/mm25zamanian/Codes/zarbit/apps/web/src/modules/requests/requests-page.tsx))

مدیریت درخواست‌های فعال و در انتظار اجرای کاربر:

1. **سربرگ بخش رادار:** عنوان «درخواست‌های فعال و رادار»، شمارنده تعداد سفارشات فعال و دکمه «درخواست جدید».
2. **فیلترهای تب‌بندی:** فیلتر «همه»، «خرید»، «فروش» و «هشدار» همراه با شمارنده مجزا.
3. **کارت‌های سفارش ([`RequestCard`](file:///Users/mm25zamanian/Codes/zarbit/apps/web/src/modules/requests/_request-card.tsx)):**
   - نمایش نوع عملیات (خرید / فروش / هشدار) با آیکون و رنگ سازمانی.
   - شرط اجرا (`کمتر یا مساوی` / `بیشتر یا مساوی`) و نرخ هدف به تومان فشرده.
   - فاز اجرای درخواست (`WAITING_QUOTE`, `CLAIMED`, `SENDING`, `DONE`, `FAILED`, `CANCELLED`).
4. **به‌روزرسانی خودکار:** پولینگ هر ۴ ثانیه تا زمانی که سفارش فعالی در لیست وجود داشته باشد.

---

## ۵. نوار زنده معاملات اخیر ([`RecentTradesTape`](file:///Users/mm25zamanian/Codes/zarbit/apps/web/src/modules/home/_recent-trades-tape.tsx))

نمایش نوار افقی حاوی تا ۱۰ معامله قطعی اخیر ثبت‌شده از رسیدهای معتبر ربات (`Trade`):

- قیمت معامله به تومان کامل.
- حجم معامله (تعداد واحد).
- ساعت دقیق ثبت معامله در تلگرام.
- بج اختلاف قیمت معامله نسبت به آخرین مظنه رسمی.

---

## ۶. کشوهای تعاملی سفارشات

### الف) کشوی ثبت درخواست جدید ([`RequestFormDrawer`](file:///Users/mm25zamanian/Codes/zarbit/apps/web/src/modules/requests/_request-form-drawer.tsx))

- پیش‌پر کردن خودکار قیمت هدف با آخرین مظنه رسمی دریافت شده.
- انتخاب نوع درخواست: «هشدار»، «خرید»، «فروش».
- تعیین شرط اجرا: «کمتر یا مساوی» (`LTE`) یا «بیشتر یا مساوی» (`GTE`).
- تعیین تعداد واحدها (برای خرید و فروش).
- دیالوگ تأیید خروج در صورت وجود تغییرات ذخیره‌نشده.

### ب) کشوی جزئیات سفارش ([`RequestDetailsDrawer`](file:///Users/mm25zamanian/Codes/zarbit/apps/web/src/modules/requests/_request-details-drawer.tsx))

- استعلام وضعیت دقیق، زمان‌بندی ثبت و تغییرات سفارش.
- اکشن **«ارسال فوری» (Force Send)**: ارسال بدون معطلی سفارش به گروه تلگرام.
- اکشن **«لغو درخواست» (Cancel Request)**: ابطال فوری سفارش در حال انتظار.

---

## ۷. جدول ماتریس فیچرهای صفحه اصلی

| ردیف | بخش           | قابلیت                                           | فایل سورس مربوطه                                                                                                                   |
| :--: | :------------ | :----------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------- |
|  ۱   | پوسته سراسری  | هدر برندینگ و میانبر تنظیمات تلگرام              | [`app-shell.tsx`](file:///Users/mm25zamanian/Codes/zarbit/apps/web/src/app/app-shell.tsx)                                          |
|  ۲   | پوسته سراسری  | داک ۴ تب ناوبری (خانه/سوابق/معامله‌گران/تنظیمات) | [`app-shell.tsx`](file:///Users/mm25zamanian/Codes/zarbit/apps/web/src/app/app-shell.tsx)                                          |
|  ۳   | ترمینال مظنه  | نمایش نرخ مظنه رسمی (تومان کامل + بنکداری)       | [`_terminal-quote-header.tsx`](file:///Users/mm25zamanian/Codes/zarbit/apps/web/src/modules/home/_terminal-quote-header.tsx)       |
|  ۴   | ترمینال مظنه  | آخرین معامله تکمیل‌شده و بج اسپرد اختلاف         | [`_terminal-quote-header.tsx`](file:///Users/mm25zamanian/Codes/zarbit/apps/web/src/modules/home/_terminal-quote-header.tsx)       |
|  ۵   | ترمینال مظنه  | نشانگر وضعیت اتصال و دکمه تازه‌سازی دستی         | [`_terminal-quote-header.tsx`](file:///Users/mm25zamanian/Codes/zarbit/apps/web/src/modules/home/_terminal-quote-header.tsx)       |
|  ۶   | ترمینال مظنه  | بنر هشدار کهنگی مظنه رسمی (بیش از ۵ دقیقه)       | [`_quote-age.tsx`](file:///Users/mm25zamanian/Codes/zarbit/apps/web/src/modules/home/_quote-age.tsx)                               |
|  ۷   | اکشن‌های سریع | نوار کلیدهای خرید، فروش و هشدار فوری             | [`_execution-strip.tsx`](file:///Users/mm25zamanian/Codes/zarbit/apps/web/src/modules/home/_execution-strip.tsx)                   |
|  ۸   | رادار سفارشات | لیست و فیلترهای درخواست‌های فعال                 | [`requests-page.tsx`](file:///Users/mm25zamanian/Codes/zarbit/apps/web/src/modules/requests/requests-page.tsx)                     |
|  ۹   | معاملات اخیر  | نوار معاملات اخیر (تا ۱۰ معامله با حجم و ساعت)   | [`_recent-trades-tape.tsx`](file:///Users/mm25zamanian/Codes/zarbit/apps/web/src/modules/home/_recent-trades-tape.tsx)             |
|  ۱۰  | کشوی سفارش    | فرم ثبت درخواست با پیش‌پر مظنه                   | [`_request-form-drawer.tsx`](file:///Users/mm25zamanian/Codes/zarbit/apps/web/src/modules/requests/_request-form-drawer.tsx)       |
|  ۱۱  | کشوی جزئیات   | اکشن «ارسال فوری» و «لغو سفارش»                  | [`_request-details-drawer.tsx`](file:///Users/mm25zamanian/Codes/zarbit/apps/web/src/modules/requests/_request-details-drawer.tsx) |
|  ۱۲  | موتور داده    | هوک پایش بازار با پولینگ ۳ ثانیه                 | [`_use-market.ts`](file:///Users/mm25zamanian/Codes/zarbit/apps/web/src/modules/home/_use-market.ts)                               |
