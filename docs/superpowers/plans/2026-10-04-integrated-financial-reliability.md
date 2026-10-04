# برنامهٔ یکپارچهٔ اصلاح قابلیت اعتماد مالی ZarBit

> **برای عامل اجراکننده:** این برنامه را با مهارت `executing-plans`، به‌ترتیب checklistها اجرا کن. مالکیت قرارداد، persistence و recovery یکپارچه باشد. اجرای حاضر فقط برنامه‌ریزی است.

**Goal:** رفع ثبت تکراری یک قصد مالی، آمادگی کاذب session پس از قطع اتصال، و تفسیر نادرست قیمت shorthand در پیام‌های خارج از ترتیب.

**Architecture:** PostgreSQL هویت ثبت درخواست و تاریخچهٔ quote را نگه می‌دارد. Worker آمادگی ارسال را فقط پس از اتصال، احراز هویت، عضویت و پایان recovery اعلام می‌کند. قرارداد تجاری Settlement، WACB، rounding و مسیر NORMAL-only درخواست‌ها حفظ می‌شوند.

**Tech Stack:** TypeScript strict، Prisma 7.10.0، PostgreSQL، Hono/oRPC، mtcute نصب‌شدهٔ 0.26.3، React/HeroUI و TanStack Query موجود؛ بدون dependency یا package جدید.

**Spec:** درخواست کاربر برای راه‌حل سه finding بررسی یکپارچه؛ `docs/BUSINESS-RULES.md`، `docs/TELEGRAM.md`، `docs/RPC.md`، `docs/GROUP-TRADING-PROTOCOL.md`، `docs/MARKET-DATA.md`، `docs/OPERATIONS.md` و `docs/adr/0006-settlement-ledger-and-reviewed-coverage.md`. قرارداد مصوب Settlement مقدم است؛ اسناد را در checkout اجرا بازخوانی کن.

## محدوده و وضعیت شواهد

این برنامه سه finding تأییدشدهٔ audit را اصلاح می‌کند؛ ادعای بی‌نقص شدن کل پروژه نیست. source در شاخهٔ `codex/settlement-implementation` و commit `f0c71d671` بررسی شده است. هنگام اجرا HEAD و diff دوباره کنترل شوند؛ تغییرات دیگر کاربر محفوظ بمانند.

| نقص                                         | شاهد source و بازتولید                                                                                                                                                                            | نتیجهٔ لازم                                                             |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| P1: retry ثبت درخواست، رکورد جدید می‌سازد   | `packages/db/src/requests.ts:createRequest`، `packages/contracts/src/index.ts:requestFields` و `apps/web/src/modules/requests/_request-form-drawer.tsx:submit`؛ دو فراخوانی همان قصد دو ID ساختند | همان کلید و payload فقط یک Request؛ قصد جدید با کلید جدید مجاز          |
| P1: disconnect معمولی recovery را رد می‌کند | `apps/worker/src/sessions.ts:observeTransport`، `requireConnected` و `setMembership`؛ `offline → connected` بدون client error، recovery اجرا نکرد                                                 | offline فوراً آمادگی حافظه را باطل کند؛ reconnect barrier را طی کند     |
| P2: quote قدیمی مرجع shorthand می‌شود       | `authoritative-handler.ts:createAuthoritativeHandler` و `market-ingestion.ts:createMarketIngestion`؛ quote ID20 با قیمت 102980، سپس ID10 با 101980، سفارش ID21 با `خ980` به 101980 تفسیر شد       | مرجع هر سفارش، آخرین quote ثبت‌شدهٔ همان گروه با ID کوچک‌تر از ID سفارش |

دو بازتولید حافظه‌ای و source شاهد audit هستند؛ Telegram زنده، browser و production را اثبات نمی‌کنند. شرط محافظه‌کارانهٔ confidence V2 و اختلاف Analytics V1 در این برنامه تغییر نمی‌کنند؛ اصلاح آن‌ها نیازمند scope جداست.

## قیود سراسری

- رفتار مالی موجود، request trigger، WACB، واحد compact price و تبدیل تومان ثابت بمانند.
- Settlement outbound Telegram order تولید نکند؛ parser بدون شواهد واقعی فعال نشود.
- source، migrations و محیط تولید در نوبت برنامه‌ریزی تغییر نمی‌کنند. اجرای بعدی migration فقط با مجوز و روی محیط مشخص انجام شود.
- duplicate قصد با duplicate payload متفاوت است؛ دو سفارش عمدی با شرایط یکسان و کلیدهای متفاوت مجازند.
- هر پاسخ retry وضعیت **فعلی** همان Request را برگرداند؛ DONE/CANCELLED/UNKNOWN هرگز دوباره arm نشوند.
- شکست transport اثبات عدم commit یا عدم ارسال Telegram نیست. وضعیت UNKNOWN اجرای سفارش خودکار retry نشود.
- فایل‌های UI و پیام‌های خطا فارسی، RTL و ساختار موجود HeroUI را حفظ کنند.

## تمرکز review

1. پاسخ ثبت پس از commit گم شده و کاربر reload کرده است: همان intent بازیابی شود.
2. Request پس از ثبت edit یا execute شده است: retry اولیه همان ID و وضعیت جاری را برگرداند.
3. disconnect بدون `onError` یا هنگام recovery رخ داده است: completion قدیمی آمادگی را باز نکند.
4. تنها session موجود هنوز request-ready نیست: history catch-up بدون deadlock قابل اجرا باشد.
5. quote جدیدتر از سفارش، quote گروه دیگر یا quote با `chatId=null` وجود دارد: shorthand از آن تفسیر نشود.

---

## تصمیم ۱: هویت پایدار برای ثبت درخواست

### قرارداد و persistence

**انتخاب:** فیلد اجباری `creationKey` از نوع UUID برای create. `createRequestInputSchema` و `updateRequestInputSchema` از هم جدا شوند: update فقط condition/action/targetPrice/units دارد. کلید به همهٔ ورودی‌ها به‌صورت optional اضافه نشود؛ caller فاقد کلید خطای validation فارسی بگیرد.

در `Request` دو ستون nullable اضافه شود: `creationKey String? @db.Uuid` و `creationPayloadHash String?`. unique مرکب `(userId, creationKey)` و CHECK هم‌زمان null/non-null بودن دو ستون در migration افزوده شود. رکوردهای قدیمی null می‌مانند؛ backfill، dedup حدسی یا حذف انجام نشود. برای hash غیرnull، قالب lowercase SHA-256 با ۶۴ رقم hex اعتبارسنجی شود. index دیگری روی همان کلید لازم نیست.

hash از ترتیب ثابت فیلدهای اعتبارسنجی‌شدهٔ condition/action/targetPrice/units، با units=null برای ALERT، ساخته شود. `userId` scope unique است؛ `creationKey`، timestamps و وضعیت Request وارد hash نشوند. hash اولیه پس از edit ثابت بماند؛ hash گرفتن از فیلدهای mutable رکورد در زمان retry غلط است.

**Interface پیشنهادی در store:**

- `findRequestCreation(userId: string, input: CreateRequestInput): Promise<RequestRecord | null>`: lookup scoped و مقایسهٔ hash اولیه؛ همان key با payload متفاوت → `REQUEST_CREATION_CONFLICT`، HTTP 409، پیام «این تلاش ثبت با اطلاعات دیگری انجام شده است؛ وضعیت درخواست را بررسی کنید.»
- `createRequest(userId: string, input: CreateRequestInput): Promise<RequestRecord>`: transaction، قفل session موجود، lookup مجدد intent، سپس فقط برای intent جدید بررسی session و arm/create.
- `editRequest(userId: string, id: string, input: UpdateRequestInput)`؛ creation identity تغییر نکند.

Replay موجود باید قبل از شرط session-ready بررسی شود؛ کاربری که درخواستش ثبت شده و سپس disconnected شده، بتواند نتیجه را بازیابی کند. authentication و allowlist معمول endpoint همچنان اجرا می‌شوند. نبود Request به معنی مجاز بودن create بدون session نیست.

در router ابتدا `findRequestCreation`؛ اگر موجود است پاسخ همان رکورد، وگرنه `requireLiveSession` و `createRequest`. بررسی دوم داخل transaction race دو فراخوانی را می‌بندد؛ unique DB مرجع نهایی است. اگر رقابت unique رخ داد، نتیجهٔ scoped دوباره خوانده و hash مقایسه شود؛ خطاهای DB نامرتبط بلعیده نشوند. replay transaction هیچ rearm یا wake جدیدی انجام ندهد. شبکهٔ Worker/Telegram داخل transaction قرار نگیرد.

`create-requests-router.ts` و REST قدیمی هر دو این semantics را داشته باشند. invalidation cache در replay هم حفظ شود. خروجی `RequestDetail` تغییر لازم ندارد؛ یک جدول عمومی idempotency و response snapshot جدا لازم نیست.

**دلیل و trade-off:** دو ستون immutable کنار Request از intent مالی مستقل در چند endpoint جلوگیری می‌کنند و retry پس از edit را درست نگه می‌دارند. dedup بر اساس قیمت/تعداد، UUID جدید در هر retry، debounce UI و in-memory cache رد می‌شوند؛ هیچ‌کدام durable identity نیستند. create بدون کلید دیگر سازگار نیست؛ این شکست قرارداد عمدی و امن است و cutover client/server لازم دارد.

### چرخهٔ intent در UI

قبل از اولین ارسال، `crypto.randomUUID()` و snapshot payload ساخته و **قبل از network call** در storage مرورگر تحت owner واقعی ذخیره شوند. فایل پیشنهادی `_request-creation-intent.ts` فقط storage و اعتبارسنجی draft را مالک شود؛ نوع public از قرارداد گرفته شود. session/initData/token در این storage ذخیره نشوند. یک pending intent به‌ازای owner کافی است.

- submit هم‌زمان با guard همگام ref مسدود شود؛ `setPending` تنها guard نباشد.
- retry همان key و همان snapshot را بفرستد. پس از failure نامشخص، فیلدها برای این intent ثابت و متن «نتیجهٔ ثبت مشخص نیست؛ با تلاش دوباره، همان درخواست بررسی می‌شود.» نمایش داده شود.
- reload یا بستن/بازکردن drawer draft را بازیابی کند؛ هیچ ارسال خودکاری انجام نشود. کاربر صریحاً retry کند.
- پس از پاسخ موفق، intent پاک شود؛ شکست `onDone`/refetch به‌عنوان شکست ثبت معرفی نشود. ID پاسخ قبلاً در query cache قرار می‌گیرد.
- خطای قطعی validation یا SESSION_REQUIRED پیش از create، با قرارداد مشخص server، اجازهٔ اصلاح draft و key جدید بدهد. network timeout، 5xx و پاسخ نامفهوم چنین اجازه‌ای نمی‌دهند.
- ترک intent نامعلوم باید صریحاً هشدار دهد که حذف draft درخواست احتمالی را لغو نمی‌کند. ثبت قصد جدید پس از این اقدام آگاهانه است؛ cancellation فقط بر Request ID موجود انجام می‌شود.
- schema storage نامعتبر fail-closed شود؛ silently ساختن key جدید و submit همان payload ممنوع. unavailable بودن storage قبل از ارسال خطای ساده بدهد تا ضمانت reload از بین نرود.

Mock بازار نیز intent identity را نگه دارد؛ update در mock از update schema استفاده کند.

## تصمیم ۲: اتصال و recovery قبل از آمادگی ارسال

**واقعیت فعلی:** `setMembership` ابتدا `runtimeReady=true` و `online=true` می‌کند و `onReady` را fire-and-forget اجرا می‌کند. `history/latestMessageId` فقط runtimeهای online را انتخاب می‌کنند. صرف await کردن callback با online=false باعث نبود history session می‌شود؛ این coupling باید اصلاح شود.

**انتخاب:** در Runtime، سه مفهوم جدا باشند: وضعیت connection transport، صلاحیت خواندن history پس از identity/membership (`historyReady`)، و آمادگی ارسال (`online` موجود). یک epoch حافظه‌ای برای رد completion قدیمی کافی است؛ این epoch credential یا session revision نیست.

1. `offline`، `connecting` و `updating` فوراً و همگام `online=false` و `historyReady=false` کنند و epoch را افزایش دهند. persistence وضعیت runtimeReady=false و connectionState متناظر از مسیر serial همان user انجام شود. state ACTIVE به‌معنای authorization حفظ شود؛ disconnect باعث revoke، حذف SQLite یا cancel درخواست‌ها نشود.
2. handler connected و synchronize فقط یک recovery مؤثر برای همان runtime/epoch اجرا کنند. callback به Runtime خودش bound باشد، نه فقط userId؛ event client بسته‌شده نباید runtime جایگزین را تغییر دهد.
3. identity و membership با epoch captured بررسی شوند؛ subscription یک‌بار متصل شود؛ سپس historyReady=true اما online/runtimeReady=false بماند.
4. `onReady` فعلی awaited شود و فقط پس از موفقیت و کنترل مجدد epoch، Runtime identity، revision، stopped/abort و connection=connected، session request-ready گردد. خطای catch-up در log گم نشود؛ آمادگی بسته و retry با backoff موجود انجام شود.
5. `history` و `latestMessageId` از historyReady استفاده کنند؛ `requireConnected`، `sendGroup` و presentation از online/request-ready استفاده کنند. history helperها نباید دوباره serial user را بگیرند؛ recovery در همان serial منتظر coordinator است.
6. disconnect حین DB activation با کنترل پس از await کشف و runtimeReady دوباره false شود. کنترل local پیش از dispatch حفظ شود. هیچ ادعای atomically synchronous شدن رویداد شبکه و DB مطرح نشود.

### recovery گروهی و catch-up

`financial-ingestion-coordinator.ts` مالک ترتیب گروهی باقی بماند. callback پیشنهادی `onUnavailable` در Sessions به `financialIngestion.invalidateRecovery` متصل شود: recovered=false همگام و آغاز recovery پایدار در DB. خطای این ثبت readiness را باز نکند. یک session دیگر می‌تواند history را بازیابی کند؛ قطع یک client مجوز mark-ready برای همان client نیست.

برای جلوگیری از completion قدیمی، `GroupIngestionState.historyRecoveryGeneration Int @default(0)` افزوده شود. `beginFinancialRecovery(chat): Promise<number>` زیر `lockTradeStream` generation را افزایش دهد و token برگرداند؛ `completeFinancialRecovery(chat, expectedGeneration): Promise<boolean>` فقط generation برابر را تکمیل کند. gate به OPEN فقط با قواعد فعلی نبود flagged inbox و pending/review Settlement برگردد. تمام callerها، از جمله error path coordinator، با Interface جدید هماهنگ شوند. generation هیچ معنای coverage confidence ندارد.

نتیجهٔ false از completion یا برگشت زودهنگام قبل از پایان scan، موفقیت `onReady` نیست؛ coordinator خطای recovery-incomplete بدهد و session آماده نشود. پس از پایان موفق scan، gate ممکن است به دلیل review مالی همچنان بسته بماند؛ این وضعیت با شکست history متفاوت است. `online` اثبات پوشش مالی نیست و قواعد DB مربوط به request dispatch مستقل حفظ شوند. branch غیرفعال Settlement نیز پیش از return باید recovery token را تکمیل کند؛ guard پایدار معلق باقی نماند.

history catch-up به reconnect در حالت `SETTLEMENT_ENABLED=false` هم متصل شود؛ اجرای callback فعلی در این حالت فقط unprocessed observations را بررسی می‌کند و تضمین دریافت پیام‌های مشاهده‌نشده نیست. scan مرحله‌ای `(durableCursor, fixedHead]`، اعتبار head، pagination و cap موجود را reuse کند. cursor فقط پس از persistence پیام‌های بازه جلو برود؛ به live delivery تنها تکیه نکند.

- با Settlement فعال، bootstrap anchor و gateهای قبلی حفظ شوند.
- بدون Settlement و cursor قبلی، آخرین NORMAL receipt همان گروه anchor شود. اگر receipt موجود نیست، fixed head به‌عنوان آغاز ingestion جدید ثبت شود؛ موجودی و تاریخچهٔ قبل از آن trustworthy اعلام نشود. این حالت اولیه با gap پس از cursor معتبر متفاوت است.
- scan ناموفق یا cap ناقص cursor را جلو نبرد و درخواست خودکار را آزاد نکند. پیام زیر مرز Settlement اعمال‌شده طبق quarantine موجود بماند.
- شناسهٔ گپ، اثبات receipt مفقود نیست؛ scan موفق نیز اثبات نبود پیام حذف‌شده نیست. baseline/coverage/confidence و review دستی Settlement عوض نشوند.
- نسل recovery جدید، completion قبلی را ناکارآمد کند. این رفتار با دو session، reconnect پی‌درپی و restart آزموده شود.

**Trade-off:** جداسازی transport و request readiness اندکی state اضافه می‌کند، اما false CONNECTED و deadlock catch-up را با یک مالک روشن حل می‌کند. آفلاین کردن فقط در onError، اتکا به TTL پانزده‌دقیقه‌ای و آماده کردن session پیش از recovery رد می‌شوند. سازوکار ارسال Telegram و UNKNOWN همان است؛ reconnect دستور ارسال مجدد نمی‌سازد.

## تصمیم ۳: quote مرجع هر سفارش از تاریخچهٔ پیش از آن

**انتخاب:** حذف قیمت مرجع scalar از حافظهٔ `createMarketIngestion`. یک query محدود در store اضافه شود:

`quoteBeforeMessage(chatId: bigint | number, sourceMessageId: number): Promise<QuoteRecord | null>`

شرط `chatId` دقیق و `sourceMessageId < orderMessageId`؛ ترتیب `sourceMessageId DESC` و take یک. `chatId=null` برای احراز گروه کافی نیست و fallback آن ممنوع است. این query صرفاً برای حل shorthand است؛ ترتیب timestamp-based فعلی dashboard/quote history در این scope بازطراحی نشود.

`createTradingActionHandler` وابستگی پیشنهادی `getReferenceCompactQuote(event: QuoteEvent): Promise<number | null>` بگیرد. ابتدا parse بدون reference: اگر سفارش parsed و resolvedCompactPrice=null است، query اجرا و همان `parseHumanOrder` با reference دوباره فراخوانی شود. full compact price نیاز به query ندارد. فرمول suffix یا price unit جدید ساخته نشود.

`authoritative-handler` ابتدا quote را persist کند؛ callback `onQuoteRecorded` scalar حذف شود چون دیگر مصرفی ندارد. ingest مشترک coordinator ترتیب live/catch-up را نگه دارد. هر duplicate یا DB failure مرجع ساختگی تولید نکند.

نبود quote معتبر، shorthand را AMBIGUOUS با compactPrice=null نگه دارد؛ query failure قابل retry است و پیام successful/deduplicated اعلام نشود. مرجع از آخرین quote **شناخته‌شده و ثبت‌شده** پیش از سفارش است؛ پوشش کامل Telegram از این query نتیجه نمی‌شود. TradingActionهای قبلاً غلط خودکار rewrite نشوند؛ audit دستی با message IDs جداگانه انجام شود.

**دلیل:** callback بعد از persistence و شرط latestUpdated فقط عقب رفتن latest را کم می‌کند، ولی سفارش دیررس را از quote آینده محافظت نمی‌کند. انتخاب predecessor DB هم نمونهٔ ID20→ID10→ID21 را حل می‌کند و هم quote ID30 قبل از رسیدن سفارش ID21 را. یک cache تاریخچهٔ جدید لازم نیست. unique فعلی sourceMessageId برای range scan قابل استفاده است؛ index تازه فقط در صورت plan واقعی query و `EXPLAIN` نامناسب افزوده شود، بدون benchmark حدسی.

---

## نقشهٔ فایل و ۶ فاز اجرا

### فاز ۱: schema و قرارداد foundation

**فایل‌ها:** `packages/db/prisma/schema/schema.prisma`؛ migration جدید پیشنهادی `packages/db/prisma/migrations/20261004010000_financial_reliability/migration.sql`؛ `packages/contracts/src/index.ts`؛ `packages/contracts/src/rpc.ts` در صورت نیاز به error declaration موجود.

**وابستگی:** ندارد؛ وضعیت migration قبلی باید read-only بررسی شود. migration قدیمی Settlement بازنویسی نشود.

- [ ] تست failing در `packages/db/test/trade-migration.test.ts` برای حفظ Request قدیمی، unique owner/key، CHECK identity و generation default بنویس.
- [ ] create و update schemas را جدا کن؛ creationKey در create اجباری و در update ممنوع باشد. تست schema در `apps/server/test/request-routes.test.ts` ورودی‌ها را pin کند.
- [ ] migration additive با دو ستون Request، unique/CHECK و یک generation در ingestion state ایجاد کن؛ حذف یا backfill حدسی نکن.
- [ ] روی DB آزمون خالی و DB آزمون تاریخی rehearsal، Prisma validate/generate و typecheck قرارداد/DB انجام بده.

**اتمام:** رکوردهای فعلی حفظ، ورودی بدون key رد، update بدون key صحیح، invariants در DB enforced. compile callerها تا فازهای بعد ممکن است موقتاً fail شود؛ release این فاز به‌تنهایی مجاز نیست.

### فاز ۲: persistence و endpointهای idempotent

**فایل‌ها:** `packages/db/src/requests.ts`؛ فایل جدید `packages/db/src/request-creation.ts` برای canonical hash و comparison؛ `apps/server/src/modules/requests/create-requests-router.ts`؛ `apps/server/src/legacy/rest/register-request-routes.ts`؛ `packages/db/test/postgres.test.ts`؛ `apps/server/test/request-routes.test.ts` و `orpc.test.ts`.

**وابستگی:** فاز ۱.

- [ ] تست failing duplicate concurrent، payload conflict، same-key/different-user، edit سپس retry، DONE/CANCELLED سپس retry و disconnected replay بنویس.
- [ ] Interface تصمیم ۱ را اجرا کن؛ lookup اول برای replay، lookup اتمیک دوم برای race، current row برای response و no rearm.
- [ ] مسیر legacy و oRPC را همسان کن؛ parse helper دیگر نباید create/update را یک schema فرض کند.
- [ ] cache invalidation موجود را در success و replay حفظ و conflict را 409 با appCode ثابت ارائه کن.
- [ ] اتصال واقعی PostgreSQL آزمون برای concurrency اجرا شود؛ mock دو create به‌تنهایی اثبات unique نیست.

**اتمام:** N retry concurrent از یک intent فقط یک Request و یک arm دارند؛ intentهای متفاوت با payload یکسان دو رکورد مجاز دارند؛ replay بدون session جدید ممکن است ولی create جدید نیست.

### فاز ۳: چرخهٔ intent و بازیابی UI

**فایل‌ها:** `apps/web/src/modules/requests/_request-form-drawer.tsx`؛ فایل جدید `_request-creation-intent.ts` در همان پوشه؛ `_request-mutation-options.ts` در صورت نیاز؛ `apps/web/src/dev/market/create-market-mock.ts`؛ `apps/web/test/request-creation-intent.test.ts` جدید؛ `apps/web/test/rpc-query.test.ts`.

**وابستگی:** فاز ۲ و قرارداد تثبیت‌شده.

- [ ] تست storage owner scope، reload، key ثابت retry، payload immutable، storage failure و clearing فقط پس از پاسخ قطعی بنویس.
- [ ] قبل از POST intent را پایدار کن؛ retry صریح، pending ref و رفتار خطای نامعلوم تصمیم ۱ را اجرا کن.
- [ ] موفقیت ثبت را از شکست refresh جدا کن؛ update/mock قرارداد مستقل خود را استفاده کنند.
- [ ] در مرورگر با قطع پاسخ بعد از commit و reload، یک ID و بدون ارسال خودکار ثابت کن. RTL، loading و پیام فارسی بررسی شوند.

**اتمام:** پاسخ گم‌شده مسیر key جدید را بی‌صدا باز نمی‌کند و retry بعد از reload همان Request را بازیابی می‌کند.

### فاز ۴: lifecycle، history و barrier بازیابی

**فایل‌ها:** `apps/worker/src/sessions.ts`؛ `apps/worker/src/index.ts`؛ `apps/worker/src/financial-ingestion-coordinator.ts`؛ `packages/db/src/settlement.ts`؛ تست‌های موجود `sessions.test.ts`، `financial-ingestion-coordinator.test.ts`، `requests.test.ts`، `mtcute.test.ts` و `packages/db/test/postgres.test.ts`.

**وابستگی:** generation فاز ۱؛ از فازهای ۲ و ۳ منطقی مستقل است، ولی توسط همان مالک integration اجرا شود.

- [ ] تست failing offline→connected بدون onError، updating، old-client event، disconnect حین membership/catch-up، single-session history و دو recovery generation بنویس.
- [ ] Runtime transport state/historyReady/epoch را تعریف و `observeTransport` و requireConnected/presentation را هماهنگ کن.
- [ ] `setMembership` recovery را await کند؛ historyReady قبل و online/runtimeReady بعد از callback، با کنترل epoch.
- [ ] invalidateRecovery و generation token را متصل کن؛ تمام begin/complete callerها سازگار شوند و review gate حفظ شود.
- [ ] scan receipt بعد از durable cursor در هر دو حالت enabled/disabled را اجرا کن؛ cursor initialization و fail-closed cap/error را آزمون کن.
- [ ] خطای subscribe/history/identity/session replacement نباید startup/reconnect را ready معرفی کند. UNKNOWN سفارش از reconnect دوباره ارسال نشود.

**اتمام:** تا barrier موفق، status و dispatch آماده نیستند؛ history بدون نیاز به آمادگی ارسال کار می‌کند؛ completion قدیمی نمی‌تواند guard نسل تازه را پاک کند؛ restart از cursor پایدار ادامه می‌دهد.

### فاز ۵: مرجع quote وابسته به ID سفارش

**فایل‌ها:** `packages/db/src/index.ts` برای `quoteBeforeMessage` کنار queryهای quote؛ `apps/worker/src/authoritative-handler.ts`، `market-ingestion.ts` و `trading-action-handler.ts`؛ `packages/db/test/postgres.test.ts` و `apps/worker/test/quote.test.ts`.

**وابستگی:** schema فعلی QuoteHistory کافی است. با فاز ۴ فایل worker مشترک دارد؛ edit هم‌زمان توصیه نمی‌شود.

- [ ] تست failing ID20=102980، ID10=101980، سفارش ID21=`خ980` → 102980 بنویس؛ تست quote ID30 پیش از سفارش ID21 هم نتیجهٔ predecessor را الزام کند.
- [ ] query تصمیم ۳ و Interface async handler را اجرا کن؛ seed/callback حافظه‌ای scalar حذف شود.
- [ ] full price، نبود quote، گروه دیگر، null chat، duplicate و DB failure آزموده شوند؛ snapshot بازار و NORMAL request trigger تغییر نکنند.
- [ ] query plan range lookup را روی دادهٔ آزمون نماینده مشاهده کن؛ index اضافه فقط با نیاز ثابت‌شده.

**اتمام:** تفسیر قیمت از arrival order مستقل است؛ quote آینده/گروه نامعلوم مصرف نمی‌شود؛ تاریخچهٔ action غلط خودکار بازنویسی نشده است.

### فاز ۶: integration، مستندات و release gate

**فایل‌ها:** `docs/RPC.md`، `docs/TELEGRAM.md`، `docs/GROUP-TRADING-PROTOCOL.md`، `docs/OPERATIONS.md` و `docs/GLOSSARY.md` فقط بخش‌های متأثر؛ تست integration موجود `apps/worker/test/trade-requests.integration.test.ts` و `telegram-integration.test.ts` در صورت نیاز به fixture تغییرکرده.

**وابستگی:** همهٔ فازها. scope اجرای نهایی همان سه نقص است؛ redesign UI و accounting دوم اضافه نشود.

- [ ] سناریوی end-to-end: commit create، response loss، retry/reload، یک Request، یک trigger NORMAL و حداکثر یک dispatch همان Request؛ retry ثبت درخواست با retry ارسال Telegram اشتباه نشود.
- [ ] سناریوی reconnect با receiptهای جاافتاده، quote خارج از ترتیب، review Settlement و session دوم؛ cursor، gate و presentation همسو باشند.
- [ ] docs قرارداد key، خطای 409، آمادگی/historyReady، نسل recovery و unknown-result draft را ثبت کنند.
- [ ] با DB آزمون loopback و credentials غیرتولیدی checks زیر اجرا و نتیجهٔ واقعی ثبت شود؛ تست skipped پاس محسوب نشود.

**Commands:** `pnpm check-types`، `pnpm lint`، `pnpm test --force --concurrency=1 --env-mode=loose`، `pnpm --filter server build`، `pnpm --filter worker build`، `pnpm --filter web build`. برای web مقدار HTTPS عمومی `VITE_SERVER_URL` و برای integration، `DATABASE_URL` و `TEST_DATABASE_URL` آزمون لازم‌اند؛ در shell موقت، بدون تغییر فایل secrets. Prisma validate/generate مطابق scripts موجود `@zarbit/db` انجام شوند. runtime imports خروجی server/worker و browser critical path جدا بررسی شوند.

**اتمام:** regression tests واقعاً fail→pass، checks بدون خطای جدید، baseline debt تفکیک‌شده، release laneهای Telegram/PG16/Docker/production واقعاً اجراشده یا صریحاً تأییدنشده گزارش شوند.

## ترتیب، استقرار و rollback

ترتیب پیشنهادی inline: **۱ → ۲ → ۳ → ۴ → ۵ → ۶**. فاز ۴ پس از ۱ از نظر dependency قابل پیشروی هم‌زمان با ۲/۳ است؛ به دلیل invariants مالی یک مالک integration داشته باشد. فاز ۵ و ۴ در worker هم‌زمان edit نشوند. release فقط artifact یکپارچهٔ همهٔ فازهاست.

1. backup قابل بازیابی و وضعیت migrations فعلی بررسی شود؛ production عملیات این برنامه‌ریزی نیست.
2. migration additive اعمال و Prisma Client در build تولید شود. تا server جدید، web جدیدی که key می‌فرستد منتشر نشود؛ server قدیمی strict ورودی جدید را رد می‌کند.
3. create mutation در cutover کوتاه متوقف و server جدید سپس web سازگار منتشر شود؛ readها قابل ادامه‌اند. worker قدیمی drain/stop و worker جدید با generation/recovery نصب شود. browser قدیمی فاقد key باید update-required/validation واضح بگیرد؛ fallback ساخت key سمت server ممنوع است.
4. replay ذخیره‌شده، offline→connected، catch-up و quote predecessor در staging بررسی شوند؛ Settlement همچنان مطابق evidence gate قبلی باقی بماند.
5. پس از استفادهٔ کلیدها rollback به server قدیمی مجاز نیست: آن نسخه uniqueness intent را نمی‌شناسد و retry را رکورد جدید می‌کند. forward fix یا نسخهٔ سازگارِ حفظ‌کنندهٔ کلید لازم است. columns حذف نشوند. rollback worker نیز guard جدید را بی‌اثر می‌کند و باید admission ارسال بسته بماند.

## شرط تحویل

عامل اجراکننده فقط پس از عبور از ۶ فاز اعلام تکمیل کند. وضعیت هر phase، migrations واقعاً اعمال‌شده، fail→pass تست‌ها، خروجی checks، laneهای زندهٔ بررسی‌نشده و محدودیت coverage Telegram گزارش شود. وجود parser غیرفعال Settlement نقص این اصلاحات نیست و مجوز فعال‌سازی آن را نمی‌دهد. این سند راه‌حل و پلن است؛ هیچ implementation، test suite یا migration در زمان نوشتن آن اجرا نشده است.
