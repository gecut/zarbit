# گزارش کار بررسی و برنامه‌ریزی قابلیت اعتماد مالی ZarBit

**تاریخ:** ۲۰۲۶-۱۰-۰۴  
**پلن مرجع:** [برنامهٔ یکپارچهٔ اصلاح قابلیت اعتماد مالی](../superpowers/plans/2026-10-04-integrated-financial-reliability.md)  
**مبنای source:** شاخهٔ `codex/settlement-implementation`، commit `f0c71d671` با عنوان `feat: add gated settlement accounting and analytics v2`.

## ۱. وضعیت واقعی کار

**بررسی، تشخیص نقص‌ها و تدوین پلن انجام شده‌اند؛ هیچ‌یک از شش فاز پیاده‌سازی این پلن اجرا نشده است.** این گزارش تحویل implementation یا تأیید readiness تولید نیست.

commit مربوط به Settlement پیش از این بررسی وجود داشته است. آن implementation با اصلاحات برنامه‌ریزی‌شدهٔ این پلن متفاوت است؛ نتایج تست آن نباید به‌عنوان اثبات اجرای این شش فاز استفاده شوند.

در تهیهٔ پلن فقط سند برنامه ایجاد شد. در نوبت حاضر فقط همین گزارش ایجاد می‌شود. کد application، schema، migration، تنظیمات محیط و دادهٔ DB تغییر نکرده‌اند؛ تغییرات قبلی کاربر در worktree محفوظ مانده‌اند.

## ۲. بررسی‌های انجام‌شده

مسیرهای اصلی به‌صورت متصل بررسی شدند؛ هدف کشف نقص مادی در رفتار مالی، authentication، recovery و قراردادها بود، نه ادعای بررسی تک‌تک خطوط monorepo.

| مسیر                 | کار انجام‌شده                                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------------- |
| Telegram → Worker    | بررسی lifecycle، session readiness، transport events، coordinator، dedup، catch-up، restart و dispatch درخواست  |
| Worker → PostgreSQL  | بررسی persistence receipt/quote، idempotency، lock، gate، cursor، synthetic trade و transaction Settlement      |
| حسابداری → Analytics | تطبیق WACB و rounding، bootstrap، replay و mapperهای V1/V2 با قرارداد مالی                                      |
| Server → RPC/REST    | بررسی ورودی strict، مالکیت درخواست، احراز هویت، session requirement، cache و مسیر ثبت درخواست                   |
| Web → ثبت درخواست    | بررسی mutation، فرم، error/retry، query cache و پیامد گم‌شدن پاسخ                                               |
| runtime و deployment | مرور Compose، Dockerfileهای server/worker/web، startup، ownership و migration sequencing؛ بدون اجرای deployment |

Graphify برای یافتن وابستگی‌ها استفاده شد؛ نتیجهٔ گراف مرجع صحت تلقی نشد و findingهای مهم با source تطبیق داده شدند. بررسی‌های مستقل حسابداری، اجرای Telegram و API/UI نیز تجمیع و موارد تکراری حذف شدند.

## ۳. نقص‌های تأییدشده و شواهد

### ۳.۱. P1 — ثبت تکراری یک قصد مالی پس از گم‌شدن پاسخ

**شاهد:** `packages/db/src/requests.ts:createRequest` هر بار رکورد تازه می‌سازد؛ `packages/contracts/src/index.ts:requestFields` هویت ثبت ندارد؛ `apps/web/src/modules/requests/_request-form-drawer.tsx:submit` پس از خطا submit را آزاد و فرم را حفظ می‌کند.

**سناریو:** commit ثبت موفق است، پاسخ به مرورگر نمی‌رسد و کاربر دوباره تلاش می‌کند. دو Request مستقل ACTIVE می‌توانند روی receipt بعدی trigger شوند.

**بازتولید audit:** فراخوانی واقعی store با transaction ساختگی، بدون DB، نتیجهٔ زیر داشت:

```json
{ "first": "1", "retry": "2", "insertCount": 2 }
```

این بازتولید نبود dedup در مسیر فعلی را نشان می‌دهد؛ آزمون concurrency واقعی PostgreSQL نیست.

### ۳.۲. P1 — آمادگی کاذب session پس از disconnect

**شاهد:** `apps/worker/src/sessions.ts:observeTransport` رویدادهای offline/connecting را فقط log می‌کند. اجرای recovery روی connected به `!rt.online` وابسته است؛ `requireConnected` همان online و runtimeReady را مصرف می‌کند.

**سناریو:** transport بدون `onError` قطع و وصل می‌شود، online هنوز true است و reconnect از recovery/catch-up عبور نمی‌کند. TTL عضویت جایگزین recovery فوری نیست.

**بازتولید حافظه‌ای audit:** دنبالهٔ `offline → connected` به `online=true` و `queuedRecoveries=0` انجامید. source نصب‌شدهٔ mtcute نیز مستقل بودن connection-state events از error events را پشتیبانی می‌کرد. این بررسی آزمایش قطع شبکهٔ Telegram واقعی نبود.

### ۳.۳. P2 — تفسیر shorthand با quote نامعتبر از نظر ترتیب

**شاهد:** `apps/worker/src/authoritative-handler.ts:createAuthoritativeHandler` callback قیمت را پیش از persistence اجرا می‌کند؛ `market-ingestion.ts:createMarketIngestion` آن را scalar مرجع قرار می‌دهد و `trading-action-handler.ts:createTradingActionHandler` از آن برای `parseHumanOrder` استفاده می‌کند.

**بازتولید حافظه‌ای audit:** quote با ID20 و قیمت 102980، سپس quote دیررس ID10 و قیمت 101980، سپس سفارش ID21 با متن `خ980` پردازش شد. TradingAction با قیمت 101980 و وضعیت OBSERVED ثبت شد، درحالی‌که head معتبر 102980 بود.

**حد اثر ثابت‌شده:** قیمت TradingAction غلط می‌شود؛ اثر مستقیم این finding بر outbound order ثابت نشد. به همین دلیل شدت P2 انتخاب شد.

## ۴. راه‌حل‌هایی که طراحی شدند

| موضوع                  | تصمیم ثبت‌شده در پلن                                                                         | دلیل                                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| هویت ثبت درخواست       | creationKey اجباری، hash اولیهٔ immutable، unique owner/key و replay همان Request            | retry و قصد جدید از هم متمایز شوند؛ edit یا execution نتیجهٔ retry را به create تازه تبدیل نکند |
| قرارداد create/update  | schemas مستقل؛ creationKey فقط برای create                                                   | strict schemaهای update و callerهای قدیمی به‌صورت کنترل‌شده مدیریت شوند                         |
| persistence و endpoint | lookup replay قبل از شرط session جدید، بررسی مجدد در transaction و پاسخ وضعیت جاری           | replay پس از disconnect ممکن باشد، ولی create تازه بدون session مجاز نشود                       |
| چرخهٔ UI               | ذخیرهٔ owner-scoped intent قبل از POST، حفظ key/payload در retry و reload، بدون ارسال خودکار | گم‌شدن پاسخ باعث key جدید یا سفارش بی‌اجازه نشود                                                |
| session readiness      | جداسازی transport/historyReady/آمادگی ارسال، ابطال فوری readiness و await recovery           | catch-up بدون deadlock انجام شود و اتصال ناقص آماده گزارش نشود                                  |
| recovery گروهی         | generation پایدار و completion مشروط، catch-up در هر دو حالت Settlement enabled/disabled     | نتیجهٔ recovery قدیمی guard جدید را پاک نکند و پیام‌های مشاهده‌نشده پس از reconnect بررسی شوند  |
| quote مرجع             | query predecessor همان گروه با message ID کوچک‌تر از سفارش                                   | quote قدیمی، quote آینده یا seed حافظه‌ای در تفسیر سفارش اثر غلط نگذارد                         |
| release                | migration additive، cutover سازگار client/server/worker و rollback محدود                     | نسخهٔ قدیمی server بعد از استفاده از intent keys ضمانت idempotency را از بین نبرد               |

گزینه‌های ضعیف مانند debounce به‌عنوان idempotency، dedup بر اساس قیمت/تعداد، آمادگی مبتنی بر TTL و شرط latestUpdated به‌عنوان راه‌حل کامل shorthand رد شدند. dependency جدید، broker یا موتور مالی دوم پیشنهاد نشد.

این‌ها **تصمیم طراحی** هستند؛ methodها، ستون‌ها و رفتارهای پیشنهادی هنوز در source پیاده نشده‌اند.

## ۵. وضعیت شش فاز پلن

| فاز                                  | برنامه‌ریزی انجام‌شده                                                                  | وضعیت اجرا                            |
| ------------------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------- |
| ۱. Schema و قرارداد foundation       | ستون‌های intent/generation، constraints، جداسازی schemas و migration rehearsal مشخص شد | شروع نشده؛ schema/migration ایجاد نشد |
| ۲. Persistence و endpoint idempotent | Interfaceها، transaction، replay، conflict و مالکیت مشخص شد                            | شروع نشده                             |
| ۳. چرخهٔ intent در UI                | ذخیره، reload، retry، خطای نامعلوم، mock و معیار browser تعریف شد                      | شروع نشده                             |
| ۴. Lifecycle و recovery              | stateها، epoch، generation، history selection و fail-closed تعریف شد                   | شروع نشده                             |
| ۵. Quote predecessor                 | query، Interface async و سناریوهای ترتیب پیام تعریف شد                                 | شروع نشده                             |
| ۶. Integration و release gate        | سناریوهای end-to-end، checks، مستندات و cutover تعریف شد                               | شروع نشده                             |

**جمع‌بندی وضعیت:** سه نقص بررسی و راه‌حل‌گذاری شدند؛ شش فاز تعریف شده‌اند؛ صفر فاز پیاده‌سازی تکمیل شده است. ترتیب پیشنهادی ۱ → ۲ → ۳ → ۴ → ۵ → ۶ است؛ استقلال منطقی بعضی فازها در پلن توضیح داده شده، ولی مالکیت integration واحد باقی می‌ماند.

## ۶. فایل‌های خروجی و کنترل انجام‌شده

خروجی برنامه‌ریزی:

- `docs/superpowers/plans/2026-10-04-integrated-financial-reliability.md`

خروجی گزارش حاضر:

- `docs/reports/integrated-financial-reliability-work-report.md`

برای پلن، self-review شامل تطبیق source references، اصلاح مسیر ADR به `docs/adr/0006-settlement-ledger-and-reviewed-coverage.md`، سازگاری Interfaceها، تمایز history failure از review مالی و completion نسل قدیمی انجام شد.

فرمان `pnpm exec prettier --check docs/superpowers/plans/2026-10-04-integrated-financial-reliability.md` ابتدا formatting warning داد؛ فقط همان فایل با Prettier قالب‌بندی شد و check مجدد پیام `All matched files use Prettier code style!` داد. این نتیجه فقط کیفیت قالب سند را اثبات می‌کند.

در آماده‌سازی گزارش، HEAD، worktree و نقاط اصلی source دوباره خوانده شدند. نمادهای پیشنهادی creationKey، creationPayloadHash، historyRecoveryGeneration و quoteBeforeMessage در محدودهٔ source بررسی‌شده یافت نشدند؛ مسیرهای نقص فعلی نیز همچنان قابل مشاهده بودند. گزارش audit قبلی و نتایج بازتولیدهای آن در این نوبت دوباره اجرا نشدند.

## ۷. کارهای انجام‌نشده و محدودیت‌ها

- هیچ تست regression جدید، اجرای suite، typecheck، lint application یا production build برای این اصلاحات انجام نشده است.
- migration یا write به DB، Prisma Client regeneration، تغییر secrets/env، deployment و rollback انجام نشده‌اند.
- اثر اصلاحات بر concurrency واقعی PostgreSQL، Telegram، browser، Docker و production هنوز راستی‌آزمایی نشده است.
- در review مسیرهای بررسی‌شده bypass authentication، نشت cross-user یا فساد transaction Settlement تأیید نشد؛ نبود finding معادل اثبات نبود همهٔ باگ‌ها نیست.
- شرایط محافظه‌کارانهٔ confidence Analytics V2 و اختلاف list/detail در Analytics V1 جزو شش فاز این پلن نیستند.
- شواهد خام اعلان Settlement همچنان شرط فعال‌سازی parser هستند؛ این پلن آن شرط را برنمی‌دارد.

## ۸. تحویل و اقدام باقی‌مانده

سند برنامه برای اجرای اصلاحات آماده شده، اما محصول با این گزارش «اصلاح‌شده» یا «آمادهٔ تولید» اعلام نمی‌شود. تحویل implementation زمانی ممکن است که شش فاز اجرا، regressionها fail→pass، constraints روی DB آزمون، critical path مرورگر و reconnect بررسی و وضعیت deployment جداگانه ثبت شوند.

گزارش اجرای بعدی باید تعداد رکوردها و dispatch در سناریوی retry، رفتار آمادگی و cursor در reconnect، قیمت predecessor در پیام‌های خارج از ترتیب، فرمان‌های واقعاً اجراشده و laneهای تأییدنشده را با شواهد مشخص ارائه دهد.
