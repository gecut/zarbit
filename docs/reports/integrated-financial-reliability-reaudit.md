# ZarBit — Independent Multi-Lane Financial Reliability Re-Audit

**تاریخ:** ۲۰۲۶-۱۰-۰۴  
**محدوده:** Settlement فعلی، تمام مسیرهای مالی مرتبط و correctness راه‌حل‌های پلن reliability.  
**روش:** read-only source inspection، بررسی مستقل سه گروه lane، بازتولید حافظه‌ای با توابع واقعی، اجرای تست‌های خالص موجود و cross-lane review. تنها فایل ایجادشده در این بازرسی همین گزارش است.

## ۱. Executive Verdict

**Verdict: `READY_AFTER_PLAN_PATCH`**

سه finding اصلی audit قبلی دوباره تأیید شدند؛ severity آن‌ها P1/P1/P2 باقی می‌ماند، اما ادعای گم‌شدن قطعی receipt در هر disconnect یا آلودگی مستقیم execution توسط quote اشتباه تأیید نشد. guardهای مالی Settlement واقعاً وجود دارند؛ گزارش قدیمیِ foundation ناقص، شرح source فعلی نیست.

پلن فعلی برای شروع coding بدون اصلاح کافی نیست: identity در برابر pruning پایدار نیست؛ gate بررسی مالی برای forceSend سراسری نیست؛ predecessor ثبت‌شده لزوماً آخرین predecessor واقعی نیست؛ و ناسازگاری/اعتماد کاذب V1 و freshness بازار کنار گذاشته شده‌اند.

| شاخص                             | نتیجه                                                                                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0 count                         | **۰**؛ P0 اثبات‌شده یا فرضیهٔ مشخص unresolved P0 یافت نشد؛ نبود تست تولید تضمین نبود P0 نیست                                                                              |
| P1 count                         | **۳**: FR-01، FR-02، FR-04                                                                                                                                                |
| P2 count                         | **۶**: FR-03، FR-05، FR-06، FR-07، FR-08، FR-10                                                                                                                           |
| P3 count                         | **۱**: FR-09                                                                                                                                                              |
| Refuted previous findings        | **۰ از سه finding اصلی**؛ چند استنتاج و توصیف همراه آن‌ها اصلاح/رد شد، بخش ۱۸                                                                                             |
| New findings                     | **۶ نسبت به یافته‌های رسمی قبلی**: FR-04، FR-06، FR-07، FR-08، FR-09، FR-10؛ FR-05 قبلاً یادداشت ولی از پلن کنار گذاشته شده بود                                           |
| تفکیک مسئلهٔ فعلی/پلن            | ۸ finding روی رفتار/اسناد فعلی؛ FR-06 و FR-07 شکاف راه‌حل پیشنهادی‌اند، نه implementation موجود                                                                           |
| Plan corrections required        | بقای identity؛ gate مشترک manual/auto؛ prefix احرازشدهٔ quote؛ اصلاح V1 projection و confidence؛ freshness بازار؛ scope route/cursor؛ verification و observability متناسب |
| External evidence still required | metadata واقعی اعلان Settlement، وضعیت migration محیط‌های هدف، بررسی coverage هر بازه، آزمون PG16/Telegram/browser/images/cutover                                         |

این verdict آمادگی **اجرای اصلاحات پس از patch پلن** است، نه آمادگی تولید یا فعال‌سازی Settlement. parser فعلی عمداً بسته است؛ evidence خارجی هنوز شرط activation است.

**تعریف statusها:** VERIFIED یعنی رفتار یا نقص طراحی با source و زنجیرهٔ علّی روشن اثبات شده؛ برای finding شرطی فقط وقوع تحت precondition نوشته‌شده اثبات می‌شود. LIKELY یعنی مسیر محتمل اما رخداد کامل اثبات نشده؛ UNRESOLVED یعنی شاهد تعیین‌کننده موجود نیست؛ REFUTED یعنی source خلاف فرضیه را نشان می‌دهد. هیچ‌یک از mockها اثبات concurrency واقعی PostgreSQL نیستند.

## ۲. Repository Reality Check

### ۲.۱. مبنای فعلی Git

- branch: `codex/settlement-implementation`.
- HEAD: `f0c71d671269398f92d99d0188ab76124e2daa8d`.
- commit: `feat: add gated settlement accounting and analytics v2`؛ ۴۹ فایل، ۳۴۹۹ insertion و ۹۰ deletion طبق `git show --stat`.
- commits مرتبط پیشین: `36b2837fa` — Harden analytics caching and worker recovery؛ `2949c3af2` — Prevent concurrent Telegram message processing؛ `78ff6ef2e` — Refactor application architecture and streamline implementation.
- `git diff --name-only HEAD -- apps packages compose.yml deploy .github` خالی بود: در محدودهٔ application/deployment، source فعلی با HEAD تفاوت ثبت‌نشده نداشت.
- worktree تمیز نیست: تغییرات از قبل موجود در `AGENTS.md`، مهارت `nexload-code`، اسناد ARCHITECTURE/BUSINESS-RULES/POSTGRES/PRODUCT/ROADMAP/RPC/TELEGRAM، Graphify و `skills-lock.json` وجود داشت؛ مهارت‌ها، ADRهای ۰۰۰۱ تا ۰۰۰۵، گزارش‌های قبلی و `docs/superpowers/` نیز untracked بودند. هیچ‌یک دست‌کاری نشدند.

### ۲.۲. Migration repository در برابر migration اجراشده

repository دارای ۹ SQL migration است: baseline، compact request prices، lifecycle contracts، market data foundation، participant identity resolver، action-side/Telegram uniqueness، Telegram operations، trade request triggers و `20260920010000_settlement_foundation`.

فایل foundation در HEAD ثبت شده و ۹۳ خط SQL دارد؛ TradeType، Settlement، FinancialInbox، GroupIngestionState، FK/CHECK و unique synthetic را می‌سازد. migration reliability پیشنهادی `20261004010000_financial_reliability` در repository موجود نیست. `_prisma_migrations` هیچ DB، از جمله تولید، خوانده نشد؛ وجود SQL مساوی اعمال migration نیست.

### ۲.۳. موجود / صرفاً طراحی‌شده

| قابلیت                                                             | وضعیت تأییدشده                                                                            |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Settlement/TradeType و one-sided synthetic                         | موجود؛ schema:272–345 و foundation migration:4–93                                         |
| inbox، coordinator، history API، edit/delete محدود                 | موجود؛ coordinator:19–382، mtcute:198–252                                                 |
| transaction apply، bootstrap صفر، coverage review، late quarantine | موجود؛ apply-settlement:97–308 و market-data:133–173                                      |
| WACB، Analytics V2، union counterparty و UI تسویه                  | موجود؛ domain analytics، settlement-analytics-service و contracts analytics               |
| parser قابل استفاده                                                | **موجود نیست**؛ `parse-settlement-announcement.ts:18–25`، READY=false و خروجی همواره null |
| admission فعال Settlement                                          | پیش‌فرض false؛ index:81–90 روشن‌کردن با parser فعلی را رد می‌کند                          |
| creationKey / creationPayloadHash                                  | در source/schema موجود نیستند                                                             |
| historyReady و historyRecoveryGeneration پیشنهادی                  | موجود نیستند؛ online و boolean historyRecoveryRequired فعلی جای آن‌ها نیستند              |
| quoteBeforeMessage                                                 | موجود نیست؛ مرجع فعلی scalar است                                                          |
| شش فاز reliability                                                 | هنوز اجرا نشده‌اند؛ checklist پلن طراحی است                                               |

Graphify برای routing استفاده شد، سپس هر finding با source تطبیق داده شد. گراف ۴۲۴۸ node داشت و traversal محدود بود؛ گراف نه coverage کامل review را ثابت می‌کند و نه صحت کد را. memory قدیمی فقط برای مسیر‌یابی Settlement/WACB خوانده شد؛ ادعای آن دربارهٔ foundation ناقص با HEAD فعلی جایگزین شد.

## ۳. Previous Audit Validation Matrix

| ادعای قبلی                                               | نتیجهٔ مستقل                                             | اصلاح لازم                                                                      |
| -------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------- |
| lost-response retry یک Request دوم می‌سازد               | VERIFIED، FR-01؛ actual store و source                   | قفل session serialization است، نه intent dedup                                  |
| offline→connected بدون onError recovery را bypass می‌کند | VERIFIED، FR-02؛ actual Sessions با fake runtime         | bypass app recovery ثابت است؛ loss دائمی receipt در هر disconnect ثابت نیست     |
| quote دیررس قیمت reference را عقب می‌برد                 | VERIFIED، FR-03؛ actual ingestion                        | قیمت TradingAction/identity correlation؛ آلودگی outbound اثبات نشد              |
| creationKey/hash کافی است                                | ناکافی بدون retention؛ FR-06                             | identity پس از حذف Request هم باید canonical باقی بماند                         |
| states/epoch/generation مسیر recovery را درست می‌کند     | جهت صحیح؛ source coupling شناخته شده                     | gate dispatch تمام مسیرها، completion token و scope cursor هنوز باید روشن باشند |
| predecessor DB مشکل quote را کامل حل می‌کند              | فقط late/future quoteهای **ثبت‌شده** را حل می‌کند؛ FR-07 | completeness مجموعهٔ predecessor پیش از OBSERVED لازم است                       |
| V1 اختلاف مهمی ندارد چون web V2 است                      | رد؛ FR-05 و FR-10                                        | V1 تا قبل از اولین APPLIED از API قابل دسترسی است                               |
| legacy REST دومین ingress فعلی است                       | REFUTED به‌عنوان route فعال                              | createApp فقط RPC/OpenAPI را mount می‌کند؛ source legacy موجود ولی dormant است  |
| نبود finding authentication یعنی امنیت اثبات شده         | چنین نتیجه‌ای مجاز نیست                                  | فقط bypass مشخص در مسیرهای بررسی‌شده یافت نشد                                   |

## ۴. Request Idempotency Audit — Lane A

### [FR-01] پاسخ گم‌شده پس از commit، یک intent را به چند Request تبدیل می‌کند

**Severity:** P1  
**Status:** VERIFIED

**Evidence:** `packages/contracts/src/index.ts:48–67`، requestFields/create/update strict مشترک و فاقد identity؛ `packages/db/src/requests.ts:94–109,175–178`، connected قفل session می‌گیرد ولی create همیشه INSERT تازه است؛ `apps/server/src/modules/requests/create-requests-router.ts:125–131` owner context و session سپس create؛ `_request-form-drawer.tsx:132–164` خطا و submit مجدد؛ `query-client.ts:29` retry mutation خودکار false.

**Current invariant:** هر رکورد Request مالک معتبر و lifecycle مستقل دارد. **Broken invariant:** یک قصد ثبتِ تکرارشده هویت canonical ندارد.

**Failure Sequence:**

```text
1. owner معتبر و session آماده، BUY را ثبت می‌کند؛ commit موفق است.
2. پاسخ به browser نمی‌رسد؛ UI نتیجه را با همان intent پیوند نمی‌دهد.
3. retry صریح، reload و ثبت مجدد، یا دو POST همزمان رخ می‌دهد.
4. قفل session POSTها را سریال می‌کند ولی هر دو رکورد تازه می‌سازند.
5. receipt واجد شرایط می‌تواند هر دو Request مستقل را claim کند.
```

**Impact:** سفارش مالی اضافی؛ وقوع ارسال دو سفارش نیازمند تطبیق receipt، session آماده و موفقیت dispatch هر دو است. صرف دو create، ارسال Telegram را ثابت نمی‌کند.

**Existing Safeguards:** strict/positive input، verified owner، session row lock، UI pending و mutation retry=false. **Missing Safeguard / Root Cause:** identity durable قصد ثبت و replay همان نتیجه.

**Fresh reproduction:** actual `createRequestStore` با fake transaction، بدون DB: `{"first":"1","retry":"2","insertCount":2}`. قفل/concurrency PostgreSQL آزمایش نشد.

**Previous Audit Status:** confirmed.  
**Recommended Resolution:** owner/key unique و hash اولیهٔ canonical immutable، replay وضعیت فعلی بدون arm/wake/send، lookup موجود قبل از شرط session برای create تازه، حفاظت دوباره داخل transaction؛ همراه اصلاح retention در FR-06.  
**Required Decision:** NONE.

### وضعیت canonical lifecycle و solution verdict

| state فعلی                          | create بدون key           | dispatch مجدد همان ID                                     |
| ----------------------------------- | ------------------------- | --------------------------------------------------------- |
| WAITING_TRADE                       | رکورد جدید مستقل ممکن است | atomic claim فقط برای ACTIVE/WAITING/null-token           |
| CLAIMED                             | رکورد جدید مستقل ممکن است | token/phase/row lock مانع شروع دوم است                    |
| SENDING                             | رکورد جدید مستقل ممکن است | deliveryStartedAt و phase مانع send دوم‌اند               |
| DONE / FAILED / UNKNOWN / CANCELLED | رکورد جدید مستقل ممکن است | terminal row claim نمی‌شود؛ UNKNOWN خودکار resend نمی‌شود |

شواهد lifecycle: `requests.ts:220–282,300–313,336–445` و worker `requests.ts:40–76,100–164`. SENDING پیش از external send ثبت می‌شود؛ failure ذخیرهٔ completion مجوز ارسال مجدد نیست. دو executor با همان claim باید زیر row lock فقط یک SENDING داشته باشند؛ این تضمین از source است، نه آزمون concurrent DB این audit.

forceSend owner-scoped است و repeat همان ID duplicate lifecycle نمی‌سازد؛ اما gate گروه را bypass می‌کند، FR-04. owner/key uniqueness برای create کافی است چون owner از context می‌آید؛ hash باید از payload **اولیه** باشد، نه Request ویرایش‌شده. conflict همان owner/key با payload متفاوت باید 409 باشد. key یکسان برای دو owner intent مشترک نیست.

replay DONE/FAILED/UNKNOWN باید همان وضعیت را بخواند، نه Request تازه بسازد یا failure را retry ارسال تعبیر کند. auth/allowlist همچنان enforce شوند. SESSION_REQUIRED در retry نامعلوم فقط وقتی اجازهٔ رها کردن key می‌دهد که lookup همان key عدم commit قبلی را به‌صورت قطعی تعیین کرده باشد.

## ۵. Telegram Lifecycle & Recovery Audit — Lane B

### [FR-02] session پیش از معتبر بودن transport/recovery آماده اعلام می‌شود

**Severity:** P1  
**Status:** VERIFIED

**Evidence:** `apps/worker/src/sessions.ts:310–332`، offline/connecting/updating فقط log و connected recovery مشروط به !online؛ `:169–185` requireConnected بدون history criterion؛ `:737–755` runtimeReady/online قبل از fire-and-forget onReady؛ `:1321–1330` TTL عضویت ۱۵ دقیقه. نصب واقعی `@mtcute/core@0.26.3/highlevel/base.js:29–50` error و state emissions مستقل و internal updating/catch-up دارد.

**Failure Sequence:**

```text
1. Runtime ACTIVE/online است.
2. transport فقط offline سپس connected منتشر می‌کند، بدون onError.
3. آمادگی local/DB باطل نمی‌شود؛ requireConnected قبول می‌کند.
4. شرط !online برقرار نیست؛ app recovery اجرا نمی‌شود.
5. جداگانه، در activation عادی onReady هنوز تمام نشده ولی ready قبلاً true شده است.
```

**Fresh reproduction:** actual observeTransport و requireConnected، fake store/runtime: `{"readyDuringOffline":true,"recoveries":0,"online":true}`.

**Impact:** عملیات می‌تواند با وضعیت کاذب CONNECTED یا history ناقص پذیرفته شود. invocation send هنگام disconnect ممکن است در transport صف شود/شکست بخورد؛ audit ارسال موفق هنگام آفلاین را ادعا نمی‌کند.

**Existing Safeguards:** identity/membership، revision/abort، authorization، synchronize، backoff و catch-up داخلی mtcute؛ با feature فعال، gate DB auto dispatch را محدود می‌کند. **Root Cause:** authorization، اتصال و اتمام recovery در online/runtimeReady ادغام شده‌اند؛ failure callback فقط log می‌شود.

**Previous Audit Status:** confirmed و corrected/broadened از disconnect به readiness قبل از callback.  
**Recommended Resolution:** readiness ارسال به transport معتبر و completion recovery همان runtime/epoch وابسته باشد؛ history session پیش از send-ready قابل استفاده باشد؛ completion نسل قبلی guard جدید را باز نکند؛ admission گروه مستقل از trigger باشد.  
**Required Decision:** NONE.

### reconnect، restart و حدود cursor

restart از `store.recover` و durable inbox/cursor آغاز می‌شود؛ reconnect عادی ممکن است online موجود را حفظ و این مسیر را رد کند. چند session صف گروهی مشترک دارند؛ صف generation فعلی ندارد، ولی recoveryهای coordinator به‌خودی‌خود serial هستند. overwrite نسل تازه یک خطر راه‌حل async بعدی است؛ بدون رخداد اثبات‌شده، آن را فساد فعلی مستقل نمی‌شماریم.

callback lifecycle در `sessions.ts:283–284,305` فقط userId دارد؛ event دیررس client بسته‌شده می‌تواند runtime جایگزین را هدف بگیرد: **LIKELY تحت شرط callback outstanding هنگام replacement**، رخداد live آن آزمایش نشد. Runtime-bound callback در پلن این شرط را پوشش می‌دهد.

با Settlement فعال، full-range scan در coordinator:182–202، guard durable و fixed head وجود دارند؛ parser فعلی مانع اجرای فعال در تولید است. با feature خاموش، `:254–256` پس از بررسی inbox مشاهده‌شده return می‌کند: receipt دیده‌نشده application backfill ندارد. loss واقعی نیازمند عدم replay توسط mtcute یا crash/handler failure پس از advance update state است؛ disconnect تنها برای اثبات آن کافی نیست.

history failure با feature فعال guard مالی را بسته نگه می‌دارد، ولی readiness session فعلی fail-open است؛ در حالت خاموش group recovery guard معمولاً ایجاد نمی‌شود. missed Settlement پس از parser finalization و دسترسی به history قابل بازیابی است؛ پیام unseen حذف‌شده قابل اثبات از تاریخچه نیست.

**Verdict on states/generation solution:** جهت صحیح و necessary است. history انتخاب‌شده از online در `sessions.ts:199–224` coupling واقعی است؛ await callback بدون جداسازی historyReady deadlock/نبود session می‌سازد. generation تنها stale completion را fence می‌کند، نه coverage را اثبات. cursor financial با cursor کامل human activities یکسان نیست.

## ۶. Message Ordering & Settlement Boundary Audit — Lane C

| سازوکار                                        | تضمین واقعی                       | چیزی که تضمین نمی‌کند            |
| ---------------------------------------------- | --------------------------------- | -------------------------------- |
| `Sessions.serial`، sessions:229–244            | serialization per-user            | ترتیب ID گروه بین sessionها      |
| `KeyedSingleFlight`، keyed-single-flight:25–53 | هم‌کلیدها یک کار مشترک            | ترتیب پیام‌های متفاوت            |
| coordinator:33–37                              | صف مشترک process در یک worker     | queue arrival = ترتیب message ID |
| `lockTradeStream`، trade-trigger:5–10          | critical commit مشترک بر chat     | دریافت کامل و enqueue ترتیب‌دار  |
| history، mtcute:235–253                        | بازهٔ bounded، sort ID، cap ۱۰۰۰۰ | نبود پیام حذف‌شدهٔ unseen        |
| inbox unique                                   | durable observation dedup         | exactly-once transport           |

race receipt M100 و Settlement M101 ذاتاً امکان‌پذیر است، اما **فساد اعمال‌شده از این race به‌تنهایی اثبات نمی‌شود**. coordinator:298–325 interval را catch-up/reconcile می‌کند؛ Settlement غیرbootstrap review دستی می‌خواهد؛ apply زیر lock و پوشش/digest انجام می‌شود؛ receipt جدید زیر مرز APPLIED در `market-data.ts:133–173` درج نمی‌شود. duplicate قبلاً موجود بی‌اثر است.

late receipt در inbox errorCode=LATE_RECEIPT، gate=REVIEW_REQUIRED و reviewReason Settlement ثبت می‌شود. DB guard در writer فعلی است؛ CHECK به‌تنهایی comparison بین rowها را انجام نمی‌دهد. write مستقیم/worker قدیمی خارج writer می‌تواند آن ضمانت را دور بزند؛ این دلیل cutover بدون overlap است، نه ادعای رخداد فعلی.

**minimum صحیح:** coordinator گروهی موجود + durable observation/cursor + fixed-boundary catch-up + generation restart-safe + review coverage + late quarantine. Broker برای correctness فعلی لازم نیست. گپ ID مبنای missing receipt نیست؛ حذف/پیام غیرمالی gap طبیعی می‌سازد.

manual reconciliation باید original payload، inbox، NORMAL rows، مرزهای بعدی و P&L را حفظ/مقایسه کند. CLI applied/conflicting را رد می‌کند؛ پاک‌کردن flag یا جلو بردن cursor بدون بررسی، reconciliation نیست. عملیات corrective خارج این audit و بدون rewrite خودکار است.

**cursor scope:** catchUp=true در coordinator:57–59 human messages را ingest نمی‌کند. scan authoritative مالی با «تاریخچهٔ کامل TradingActionهای انسانی» یکسان نیست؛ recovery آن‌ها در محصول حاضر اثبات نشده است.

## ۷. Quote Ordering Audit — Lane D

### [FR-03] scalar مرجع با quote دیررس یا آینده، قیمت action را غلط می‌کند

**Severity:** P2  
**Status:** VERIFIED

**Evidence:** `authoritative-handler.ts:39–51` callback قبل از DB؛ `market-ingestion.ts:35–45,137–149` scalar فاقد ID و latest seed؛ `trading-action-handler.ts:118–139` مصرف آن در parse/persistence؛ `packages/db/src/index.ts:276–309` history insert و latestUpdated flag، نه حذف quote قدیمی.

**Failure Sequence:**

```text
1. M20=102980 مرجع می‌شود.
2. M10=101980 دیر می‌رسد؛ scalar پیش از persistence تغییر می‌کند.
3. M21='خ980' → OBSERVED با 101980.
4. در حالت دیگر M22=103980 پیش از سفارش دیررس M19 پردازش می‌شود.
5. M19='خ980' → OBSERVED با quote آیندهٔ 103980.
```

**Impact:** TradingAction/identity evidence غلط یا ناقص. در sequence خاص M20→M21→M22، اگر M21 قبلاً synchronous parse شده باشد، رسیدن M22 تنها **پیش از پایان persistence** آن را دوباره resolve نمی‌کند؛ race مؤثر وقتی M22 پیش از reference read/parse سفارش پردازش شود. زمان parse و زمان commit را یکی نگیریم.

**Existing Safeguards:** parser pure، canonical correlation در `participant-identity.ts:65–81` قیمت/quantity/chat/source را تطبیق می‌دهد و mismatch را رد می‌کند؛ requests از TradingAction trigger نمی‌شوند. full compact در `parse-human-order.ts:79–96` reference نمی‌خواهد؛ no-reference shorthand در :99–140 null و handler AMBIGUOUS است.

**Root Cause:** latest arrival scalar به‌جای reference مرتبط با ترتیب سفارش.  
**Previous Audit Status:** confirmed؛ P1 outbound contamination رد شد.  
**Recommended Resolution:** predecessor همان گروه/قبل از order، پس از احراز prefix مربوط؛ price formula همان parser باشد. نبود predecessor معتبر یا شکست boundary validation به definitive OBSERVED تبدیل نشود.  
**Required Decision:** NONE.

### [FR-07] predecessor query به‌تنهایی completeness را ثابت نمی‌کند — شکاف پلن

**Severity:** P2  
**Status:** VERIFIED — design gap، هنوز پیاده نشده

**Evidence:** plan:114–128 فقط «شناخته‌شده و ثبت‌شده» را query می‌کند؛ coordinator:33–37 arrival queue است؛ proposal هیچ barrier تا order boundary ندارد.

**Failure Sequence:**

```text
1. فقط M10=101980 در DB است.
2. M20=102980 واقعاً قبل از M21 منتشر شده ولی هنوز مشاهده/persist نشده است.
3. M21 زودتر dequeue می‌شود؛ quoteBeforeMessage فقط M10 را برمی‌گرداند.
4. action OBSERVED با 101980 ماندگار می‌شود.
5. M20 بعداً ثبت می‌شود؛ action بازنویسی خودکار نمی‌شود.
```

**Impact:** شرط سادهٔ «reference ID < order ID» برقرار است، اما انتخاب `max(predecessors)` واقعی غلط است. این فرق با quote آیندهٔ FR-03 است و باقی‌ماندهٔ راه‌حل پیشنهادی را نشان می‌دهد.

**Existing Safeguards:** < predicate quote آینده را حذف، chat predicate گروه دیگر/null را حذف و full price query را حذف می‌کند. **Root Cause:** ترتیب subset ثبت‌شده با completeness prefix یکی گرفته شده است.

**Previous Audit Status:** new finding در proposed solution.  
**Recommended Resolution:** definitive shorthand resolution به prefix قابل دفاع تا order boundary وابسته شود؛ از history/coordinator موجود استفاده و در failure یا prefix نامعلوم AMBIGUOUS/provisional نگهداری شود. ضمانت، آخرین quote معتبر **قابل مشاهده/حفظ‌شده در prefix احرازشده** است؛ وجود quote unseen حذف‌شده را هیچ query اثبات/نفی نمی‌کند. read DB به‌تنهایی کافی نیست و بازنویسی تاریخی خودکار راه‌حل نیست.  
**Required Decision:** NONE برای correctness؛ محدودیت پیام حذف‌شده در contract/operations صریح باشد.

**Index/latency verdict:** QuoteHistory واقعاً `sourceMessageId @unique` سراسری دارد، نه unique(chatId,messageId)؛ آن unique مرکب متعلق به Trade است. range scan و chat filter ممکن است برای گروه واحد کافی باشد. EXPLAIN این audit اجرا نشد؛ index اضافی یا عدد latency توصیهٔ قطعی نیست. overhead query فقط shorthand است؛ full price مستقل بماند.

## ۸. Settlement Persistence Audit — Lane E

| invariant                                                              | enforce فعلی                                                                                           | نتیجه                                                                            |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| NORMAL buyer/seller غیرnull، source غیرnull، settlement null           | SQL Trade_shape_ck:63–70                                                                               | VERIFIED                                                                         |
| NORMAL buyer != seller                                                 | در CHECK نیست؛ writer:181 عمداً alias برابر را تحمل می‌کند؛ parser receipt تازه آن را ambiguous می‌کند | invariant درخواست‌شده در DB کامل نیست؛ historical handling لازم، FR-05           |
| NORMAL source ID مثبت                                                  | shape فقط non-null؛ coordinator:53–55 ID را positive/safe می‌سنجد                                      | DB guarantee ناقص؛ caller فعلی معتبر، exploit یا corruption از ingress اثبات نشد |
| SETTLEMENT type و boundary nonnull، source receipt=null، دقیقاً یک سمت | SQL:67–69                                                                                              | VERIFIED                                                                         |
| quantity/compact/raw مثبت                                              | SQL:71–72                                                                                              | VERIFIED                                                                         |
| synthetic raw=compact×1000                                             | SQL:73–74                                                                                              | VERIFIED                                                                         |
| synthetic compact مساوی Settlement parent                              | writer apply:258–261؛ CHECK cross-row وجود ندارد                                                       | تضمین writer، نه constraint DB؛ caller غلط فعلی یافت نشد                         |
| حد اکثر یک synthetic برای participant/Settlement                       | expression unique COALESCE، SQL:76–82                                                                  | VERIFIED از تعریف SQL؛ concurrent PG این audit اجرا نشد                          |
| Trade/Settlement هم‌گروه                                               | composite FK chatId/settlementMessageId، SQL:60–61                                                     | VERIFIED                                                                         |
| حفظ relation هنگام delete                                              | Settlement/Participant FKها RESTRICT؛ schema:288–290                                                   | VERIFIED                                                                         |
| Settlement بدون Trade                                                  | relation optional list و bootstrap/flat branch                                                         | مجاز و درست                                                                      |
| اولین/bootstrap                                                        | recordSettlement:450–480؛ previous=null و isBootstrap                                                  | با startup gate/config هماهنگ؛ counterexample بخش ۱۸ رد شد                       |
| edit/delete/conflict trace                                             | inbox نوع NEW/EDIT/DELETE، payload hash، reviewReason، original حفظ                                    | VERIFIED؛ detection history محدودیت دارد                                         |

Prisma به‌تنهایی CHECK و expression unique را مدل نمی‌کند؛ SQL authoritative است. unique عادی `(chatId,sourceMessageId)` با PostgreSQL default multiple-NULL semantics برای syntheticها کافی است تا NORMAL unique حفظ شود؛ جایگزین partial index برای NORMAL لازم نیست. partial expression index **synthetic identity** علت مستقل دارد و redundant نیست.

`applySettlement:106–173` lock، APPLIED idempotency، historyRecoveryRequired، flagged inbox/settlement، مرز قبلی و pending قبلی را می‌سنجد. `:176–264` فقط NORMAL میان دو ID replay و یک close per participant می‌سازد؛ flat check قبل از insert، status/cursor/inbox/revision در commit مشترک. failure وسط transaction rollback می‌شود؛ duplicate apply زیر همان chat lock آثار جدید نمی‌سازد. این نتیجه source است؛ isolation/concurrency روی PG16 آزمایش نشده.

bootstrap synthetic حدسی ندارد و قبل از آن را به basis بعدی اضافه نمی‌کند. conflict/deletion اولین payload مالی را overwrite نمی‌کند. raw price مشتق redundant در Settlement ذخیره نشده؛ Trade rawPrice مبلغ نمایشی است.

**minimal schema assessment:** foundation عمدتاً مناسب است؛ buyer!=seller و positive source و parent-price equality حدود DB guarantee هستند. add CHECK روی alias متفاوت بدون بررسی historical rows production-safe نیست؛ اختلاف DB با invariant را با «همه چیز در schema enforce شده» پنهان نکنیم. trigger cross-row صرفاً برای writer اشتباه اثبات‌نشده لازم نیست.

## ۹. Accounting Engine Audit — Lane F

source `calculate-position.ts:24–236` signed WACB است، نه FIFO. long averaging در :63–83، long close/reversal در :88–147، short close/reversal در :178–236. flat costBasis=0؛ reversal فقط مازاد را با basis قیمت جاری باز می‌کند. synthetic quantity دقیقاً abs(net) و side مخالف است؛ apply:235–248 قبل/بعد را کنترل می‌کند و اجازهٔ opposite opening نمی‌دهد.

| سناریو                            | source property / شاهد                                                                                                  |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Long 3 → SELL 3                   | net=0، basis=0، realized سه برابر اختلاف قیمت؛ تست خالص pass                                                            |
| Short 3 → BUY 3                   | net=0 و بدون negative zero؛ تست خالص pass                                                                               |
| Flat                              | calculator هیچ synthetic نمی‌سازد؛ Settlement همچنان APPLIED                                                            |
| Partial close                     | basis باقیمانده ثابت و synthetic فقط باقیمانده را می‌بندد                                                               |
| Reversal پیش از settlement        | close/open atomic WACB؛ settlement side موقعیت نهایی را می‌بندد                                                         |
| چند Settlement در پنجره           | rowهای synthetic هر مرز یک بار در V2 event stream و contributions                                                       |
| نخستین bootstrap و missing قبل آن | rows قبل baseline از position replay کنار می‌روند؛ حجم مشاهده‌شده حفظ و P&L crossing mask می‌شود                        |
| receipt دیررس زیر مرز             | writer quarantine، به stream تاریخی وارد نمی‌شود                                                                        |
| timestamp یکسان syntheticها       | effective ID و row ID tie-break؛ یک event per participant/مرز؛ ترتیب participantهای مستقل basis یکدیگر را تغییر نمی‌دهد |

`settlement-analytics-service.ts:18–52` effectiveMessageId را برای NORMAL از receipt و برای SETTLEMENT از settlementMessageId می‌گیرد؛ nullable source در replay V2 به null ordering تکیه نمی‌کند. SQL data reader اولیه timestamp/source مرتب است، اما V2 دوباره ID مرتب می‌کند. از insertion order استفاده نشده.

window membership با Telegram announcedAt است، boundary با ID. queue delay receivedAt را عوض می‌کند ولی announcedAt/observedAt از event.date می‌آید؛ timestamp receipt دریافت‌شده مبنای دوره نیست. در replayByMessageId، rows پیش از شروع هفت روز برای basis replay ولی برای volume/P&L آن پنجره شمرده نمی‌شوند؛ `calculate-participant-analytics.ts:60–75,90–145`.

**واحد و rounding:** compact=102980، displayed/raw=102980000؛ `realizedPnlPointsToTomans` در constants:1–25، `Math.round(points×100÷4.3318×1000) || 0`. aggregation از unrounded points است؛ contributionها دو engine مستقل نیستند. residual rounding در bucket Settlement حفظ می‌کند normal+settlement=total؛ مقدار bucket settlement ممکن است نسبت به گردکردن مستقل آن حداکثر rounding residual داشته باشد، نه realization دوباره.

**verification تازه:** `pnpm --filter @zarbit/domain exec tsx --test test/analytics.test.ts test/settlement.test.ts` — ۷ pass، ۰ fail، ۰ skip. شامل fractional basis، partial/loss/reversal، time window، conversion/negative zero، long/short Settlement و bootstrap است. این تست‌ها transaction DB، همهٔ interleavingها یا transport را اثبات نمی‌کنند.

## ۱۰. Analytics V1/V2 & Confidence Audit — Lane G

### [FR-05] V1 list و detail برای receipt تاریخی هم‌alias تعریف متفاوت دارند

**Severity:** P2  
**Status:** VERIFIED

**Evidence:** `analytics-service.ts:68–89` list هر دو سمت BUY/SELL را می‌سازد؛ `:173–180` detail فقط یک سمت ternary می‌سازد؛ DB و `recordTrade:175–203` alias برابر را تحمل می‌کنند؛ V1 guard فقط پس از APPLIED، service:40–45,153–158.

**Failure Sequence:**

```text
1. NORMAL تاریخی با buyer=seller=A و quantity=2 موجود است؛ هنوز bootstrap APPLIED نیست.
2. V1 list همان row را BUY2 و SELL2 replay می‌کند.
3. V1 detail آن را فقط BUY2 می‌خواند.
4. count/volume/net و P&L فروش بعدی متفاوت می‌شوند.
```

**Fresh reproduction:** actual services + fake Store: V1 list count=2/net=0؛ detail count=1/net=+2. V2 list/detail هر دو count=2/net=0 بودند.

**Impact:** API مالی supported پیش از bootstrap summary/detail متناقض می‌دهد. **Existing Safeguards:** receipt parser جدید self-alias را رد می‌کند، V2 هر دو طرف را لحاظ و پس از APPLIED، V1 رد می‌شود. **Root Cause:** projection participant-side دوگانه، همراه دادهٔ تاریخی مجاز.

**Previous Audit Status:** corrected؛ مورد قبلاً یادداشت‌شده از scope پلن کنار گذاشته بود، نه discovery کاملاً تازه.  
**Recommended Resolution:** definition یکسان participant-side در list/detail و قرارداد historical NORMAL؛ CHECK جدید بدون audit/backward compatibility تاریخی راه‌حل نیست.  
**Required Decision:** NONE.

### [FR-10] HIGH در V1 پیش از bootstrap، معتبر بودن inventory را ثابت نمی‌کند

**Severity:** P2 — محدود به endpoint legacy فعال؛ corruption DB یا execution جاری نیست  
**Status:** VERIFIED — تحت شرط موجودی اولیهٔ اثبات‌نشده

**Evidence:** `analytics-service.ts:97–103,182–188` baseline/coverage به engine نمی‌دهد؛ `calculate-participant-analytics.ts:162–189` با observed zero، هفت روز و coverageVerified!==false HIGH می‌شود؛ `calculate-position.ts:12–16,35–45` unmatchedUnits صفر و copy-only است؛ `settlement-analytics-service.ts:173–192` V2 بدون baseline P&L را null و confidence را ESTIMATED می‌کند.

**Failure Sequence:**

```text
1. هیچ baseline/Settlement معتبر اعمال‌شده نداریم.
2. ledger مشاهده‌شده BUY1@100 در 24 سپتامبر، SELL1@120 در 3 اکتبر است؛ now=4 اکتبر.
3. V1 واقعی HIGH، pnlPoints=20، net=0 و unmatchedUnits=0 می‌دهد.
4. اگر موجودی قبل مشاهده long1@80 بوده باشد، WACB واقعی همین دو row realized=30 و net=+1/basis=90 می‌دهد.
5. observed flat و طول تاریخ، inventory واقعی یا پوشش را ثابت نکرده‌اند.
```

**Impact:** consumer V1 می‌تواند historical P&L تخمینی را با HIGH ببیند. وجود موجودی پنهان در تولید ادعا نمی‌شود؛ خروجی تحت precondition با actual functions بازتولید شد. current web V2 محافظت دارد.

**Existing Safeguards:** V2 mask/metadata، بسته‌شدن V1 پس از اولین APPLIED. **Root Cause:** معیار ساختاری zero crossing/time با confidence مبتنی بر baseline/coverage یکی گرفته شده؛ unmatchedUnits سنسور missing inventory نیست.

**Previous Audit Status:** new finding رسمی.  
**Recommended Resolution:** endpointهای فعال، از جمله V1 قبل bootstrap، برای P&L فاقد baseline/coverage معتبر reliability قطعی اعلام نکنند؛ الگوریتم WACB حفظ شود و downgrade/disclosure یا versioned rejection سازگار باشد.  
**Required Decision:** NONE؛ قرارداد مصوب موجودی اثبات‌نشده را نامطمئن می‌داند.

### confidence، window و cache

V2 list/detail projection مشترک `participantTrades` دارد؛ list row هم‌alias را یک‌بار به گروه می‌افزاید و projection دو سمت می‌سازد، service:229–237 و :36–52. NORMAL/SETTLEMENT/total یک aggregation دارند و double-count ناشی از دو engine مشاهده نشد؛ counts در context participant-side تعریف می‌شوند، نه شمارش unique row در کل بازار.

baseline، coverage و P&L reliability جدا هستند. window عبوری از bootstrap P&L=null دارد؛ count/volume observed با metadata می‌ماند. هفت روز به‌تنهایی HIGH نیست. earliestSystemDate و firstTradeAt فقط طول دادهٔ مشاهده‌شده‌اند؛ نه proof وجود همهٔ پیام‌ها.

`unmatchedUnits` از مسیر عادی صفر می‌ماند؛ UNVERIFIED_INVENTORY از همین replay معمول عملاً reachable نیست، مگر caller state غیرصفر خارجی بدهد. پوشش نامعلوم V2 با metadata مستقل بیان می‌شود، نه این فیلد.

**محدودیت محافظه‌کارانهٔ VERIFIED:** service:140–153 شرط timestamp مرز reviewed>=windowEnd دارد و هر دو endpoint windowEnd=now می‌گیرند (:217،:276). اعلان واقعی که قبلاً بررسی/اعمال شده در گذشته است؛ live tail معمولاً UNKNOWN/ESTIMATED می‌ماند، حتی اگر بعد مرز trade جدیدی دیده نشود. این رفتار false confidence نمی‌سازد و finding corruption محسوب نشد. پلن باید روشن بگوید گزارش زنده provisional است و verified interval فقط تا مرز reviewed است؛ حذف شرط و HIGH کردن پس از هفت روز غلط است.

cacheهای V1/V2 در `create-analytics-router.ts:92–127` analyticsRevision دارند؛ Settlement apply/review revision را در DB تغییر می‌دهد. queryهای context/rows/earliest در یک snapshot transaction مشترک نیستند؛ **LIKELY transient mixed response** هنگام commit همزمان، اما پاسخ غلط پایدار یا confidence کاذب از این race اثبات نشد. وعدهٔ coherent single-snapshot بدون verification اضافه داده نشود.

هیچ optimization «فقط آخرین Settlement» که engine دوم بسازد دیده نشد؛ replay از bootstrap معتبر با ID انجام می‌شود و context مرز reviewed را جدا بررسی می‌کند.

## ۱۱. Market & Request Isolation Audit — Lane H

Inventory زیر شامل تمام direct Trade query/writeهای production source یافت‌شده در `apps/` و `packages/` با حذف generated/dist/graph/test است؛ callerهای indirect مهم هم مشخص‌اند. queryهای fake tests consumer production نیستند.

| Consumer / exact source                                | دستهٔ لازم                      | وضعیت فعلی / caller                                                                     |
| ------------------------------------------------------ | ------------------------------- | --------------------------------------------------------------------------------------- |
| market-data:recordTrade، :124–207                      | NORMAL write                    | default NORMAL؛ late boundary guard                                                     |
| market-data:latestTrade، :210–217                      | NORMAL فقط                      | filter دارد؛ legacy quote module هم از آن می‌خواند                                      |
| market-data:tradesSince، :219–233                      | tape NORMAL                     | filter دارد                                                                             |
| market-data:participantTrades، :235–251                | هر دو / context                 | هر دو؛ مصرف‌کنندهٔ فعال جدیدی یافت نشد، ترتیب اولیه nullable-safe financial replay نیست |
| market-heads:marketHeads، :19–32                       | NORMAL فقط                      | filter؛ latest/recent، MarketState/snapshot/spread                                      |
| market-heads:marketEvent TRADE، :49–58                 | NORMAL فقط                      | filter؛ event adapter فعلاً به notifier وصل نیست                                        |
| requests:arm، :111–117                                 | NORMAL فقط                      | filter؛ global head در معماری یک گروه                                                   |
| trade-trigger:latestGroupTrade، :13–17                 | NORMAL فقط                      | filter و chat؛ initialize/claim/revalidate                                              |
| trade-trigger:eligibleTrade/tradeTrigger، :20–47       | NORMAL فقط                      | type/source guard و freshness/fences                                                    |
| requests:claimTradeRequests، :220–282                  | NORMAL trigger                  | از latestGroupTrade، gate و cursor استفاده می‌کند                                       |
| requests:markSending، :336–413                         | NORMAL auto؛ manual بدون market | auto revalidation درست؛ manual gate gap، FR-04                                          |
| apply-settlement:coverageEvidence، :27–43              | NORMAL interval                 | filter، digest receiptها؛ نه synthetic                                                  |
| apply-settlement:apply rows، :176–204                  | NORMAL interval                 | filter و ID bounds برای position دوره                                                   |
| apply-settlement:trade.create، :249–263                | SETTLEMENT write                | side/price/quantity/parent درست، در transaction                                         |
| settlement:observeFinancialMessage lookup، :110 به بعد | known NORMAL receipt / event    | unique source غیرnull؛ synthetic source=null از آن lookup match نمی‌شود                 |
| settlement:financialMessageKnown، :283–307             | context، receipt یا Settlement  | receipt lookup و parent Settlement lookup، correction detection                         |
| settlement:normalTradeExists، :308–317                 | NORMAL receipt                  | source غیرnull unique؛ shape تضمین نوع NORMAL می‌دهد                                    |
| analytics:participantTradesChronological، :9–18        | هر دو                           | V2 دوباره effective ID مرتب؛ V1 NORMAL filter/guard                                     |
| analytics:activeParticipantAliasesInWindow، :23–38     | هر دو                           | UNION و null-safe؛ synthetic-only participant در آمار می‌آید                            |
| analytics:tradesForParticipantsChronological، :45–57   | هر دو                           | list V1/V2؛ V2 projection/ordering مستقل                                                |
| analytics:earliestTradeDate، :63–68                    | هر دو / confidence context      | وجود row اول proof پوشش نیست                                                            |
| migration trade_request_triggers:16,24                 | تاریخی NORMAL قبل feature       | migration پیش از افزودن synthetic؛ rerun آن روی DB جدید مجاز نیست                       |
| market-state + merge-market-snapshot                   | snapshot NORMAL                 | از marketHeads؛ nullable synthetic وارد DTO بازار نمی‌شود                               |
| worker onTradeRecorded/wake/logs                       | NORMAL فقط                      | receipt writer true wake؛ synthetic apply callback market ندارد                         |
| legacy register-quote-routes:18–44                     | market NORMAL                   | latestTrade filtered؛ module در createApp mount نیست                                    |

synthetic از source فعلی market head، recent tape، spread یا automatic limit trigger نمی‌شود. forceSend market match را عمداً bypass می‌کند؛ قیمت آن targetPrice است، نه settlement price. این safeguard به معنی رعایت gate integrity نیست.

### [FR-04] forceSend از gate بررسی مالی گروه عبور می‌کند

**Severity:** P1  
**Status:** VERIFIED

**Evidence:** `requests.ts:300–309` manual claim با emptyTrigger، triggeredChatId=null؛ `:340–367` lock/gate فقط روی triggeredChatId غیرnull؛ `:368–411` باقی validation و SENDING؛ worker `requests.ts:40–43,59–99` ارسال؛ index:135–140 delivery.ready فقط requireConnected؛ docs OPERATIONS:102 dispatch paused، TELEGRAM:36 صرفاً bypass matching.

**Failure Sequence:**

```text
1. session سالم، Request ACTIVE/WAITING و گروه REVIEW_REQUIRED است.
2. gate از late receipt، correction، pending Settlement یا recovery بسته شده است.
3. owner forceSend را صریح اجرا می‌کند؛ claim trigger را null می‌کند.
4. markSending check gate را skip می‌کند و SENDING persist می‌شود.
5. فرمان معمول کاربر به گروه ارسال می‌شود، برخلاف financial pause.
```

**Impact:** bypass admission مالی در بازهٔ نیازمند reconciliation. synthetic خود outbound نمی‌سازد و same-ID duplicate نیز لازم نیست؛ نقص، فرستادن در گروه متوقف است.

**Existing Safeguards:** ownership/readiness/claim lifecycle؛ auto trigger gate درست. **Root Cause:** destination group integrity به automatic trigger metadata وابسته شده است.

**Previous Audit Status:** new finding رسمی؛ شک audit قبلی اکنون با قرارداد operational تطبیق داده شد.  
**Recommended Resolution:** chat مقصد پیکربندی‌شده و gate integrity در transaction execution manual/auto مشترک و مستقل از trigger matching باشد؛ ordinary forceSend override مالی نیست.  
**Required Decision:** NONE با قرارداد فعلی؛ override privileged اگر در آینده خواسته شود تصمیم تازه و audit record می‌خواهد.

### [FR-08] snapshot بازار تا TTL بلند stale می‌ماند، بدون notifier فعال

**Severity:** P2  
**Status:** VERIFIED

**Evidence:** `market-state.ts:19–24,71–76` پس از load موفق connected=true و TTL=60000؛ `create-market-runtime.ts:7–24` هیچ اتصال notification ندارد؛ `create-market-router.ts` read بدون force؛ web query-policy:51–54 poll=3000؛ OPERATIONS:68 مشاهدهٔ quote در ۳ ثانیه را مطالبه می‌کند. `marketEvent` وجود دارد ولی caller notifier runtime یافت نشد.

**Failure Sequence:**

```text
1. snapshot M20 hydrate و connected=true می‌شود.
2. DB head به M21 تغییر می‌کند؛ event به MarketState ارسال نمی‌شود.
3. poll سه‌ثانیه‌ای همان snapshot warm را می‌گیرد.
4. فقط پس از TTL بلند hydrate دوباره اتفاق می‌افتد.
```

**Fresh reproduction:** actual MarketState، injected load و clock حافظه‌ای: `{"first":20,"after3s":20,"after60s":21,"loads":2,"connected":true}`. عدد ۶۰ ثانیه از TTL و fixture است، نه benchmark performance/production.

**Impact:** quote/trade/spread نمایشی و قیمت اولیهٔ فرم ممکن است قدیمی باشند؛ worker automatic trigger مستقل از این cache است و settlement pollution رخ نداده است.

**Existing Safeguards:** client monotonic merge، source message IDs و freshness announcedAt؛ آن‌ها دادهٔ جدیدی fetch نمی‌کنند. **Root Cause:** موفقیت DB load با اتصال push سالم یکی گرفته شده و comment lost-notification repair کانال فعال ندارد.

**Previous Audit Status:** new finding رسمی.  
**Recommended Resolution:** freshness budget با serving واقعی همسو باشد؛ connected فقط health اتصال واقعی را نشان دهد، یا fallback authoritative polling bounded استفاده شود. وعدهٔ ۳ ثانیه از poll به‌تنهایی نتیجه نشود.  
**Required Decision:** NONE برای رفع inconsistency؛ budget عملیاتی باید صریح و با اندازه‌گیری تأیید شود.

## ۱۲. RPC/Auth/Ownership Audit — Lane I

Authentication در `verify-telegram-init-data.ts:22–61` length/duplicates/auth_date/HMAC/timingSafeEqual و `authenticate-telegram-request.ts:21–35` allowlist را می‌سنجد؛ dev bypass فقط development. router:87–125 هر procedure authenticate و owner mapping می‌کند؛ userId از client input گرفته نمی‌شود.

| عملیات           | owner و validation                                                                                        |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| auth.identity    | context verified؛ identity cache تنها mapping DB است                                                      |
| requests.create  | context.user.id، strict payload، session guard؛ intent dedup ندارد                                        |
| update           | DB where id/userId/ACTIVE/unclaimed؛ rearm؛ FR-01 از create جدا                                           |
| cancel           | owner-scoped، session-row/request fences؛ unsent فقط                                                      |
| forceSend        | scoped server lookup سپس worker scoped claim؛ gate gap FR-04، نه owner bypass                             |
| Analytics V1/V2  | authenticated group data؛ owner-private درخواست نیست؛ shared cache برای دادهٔ گروه عمومی allowlisted صحیح |
| telegram.command | operation UUID، version3 و owner validation؛ source Request creation identity ندارد                       |

auth cache پنج‌دقیقه‌ای به معنی skip HMAC/allowlist نیست؛ authenticate پیش از users.get اجرا می‌شود. active Request cache با context user ID و web query path با owner scope است؛ cross-user cache collision تأیید نشد.

RPC و OpenAPI در `register-rpc-routes.ts:40–69` **همان router** را اجرا می‌کنند. legacy registerRequestRoutes/registerQuoteRoutes source وجود دارد اما `createApp:14–17` آن‌ها را mount نمی‌کند؛ maintenance آن‌ها route امنیتی دوم فعلی نیست.

client BatchLink فقط snapshot/active reads دارد، `orpc.ts:25–35`؛ server adversarial batch حداکثر۴ دارد ولی locks/owner fences روی mutations باقی‌اند. parallel create همان FR-01 است، نه finding مستقل batch.

strict Zod V1 counterparty/source nonnull نمی‌تواند synthetic را serialize کند؛ service guard پس از APPLIED با CLIENT_UPDATE_REQUIRED از خروجی مخدوش جلوگیری می‌کند. V2 union type/source/settlementMessageId/null-counterparty را صریح می‌پذیرد. old web با new server برای V1 پس از bootstrap error می‌گیرد؛ new web با old server route V2 ندارد. مسیر version header فعلی فقط telegram را version-fence می‌کند، نه release مالی همهٔ سرویس‌ها.

هیچ bypass auth یا cross-user mutation در source بررسی‌شده تأیید نشد؛ این audit penetration test و بررسی همهٔ deploymentهای واقعی نیست.

## ۱۳. Web Reliability Audit — Lane J

Request creation نتیجهٔ network error را از commit lost-response جدا نمی‌کند؛ NETWORK پیام «ارتباط برقرار نشد؛ وضعیت را تازه کنید» دارد، `orpc.ts:66–69`، اما فرم key/draft durable ندارد. double-click معمول با pending button کاهش می‌یابد؛ guard همگام داخل submit نیست. دو submit همان tick/programmatic یا دو POST خارج UI همچنان FR-01 هستند.

mutation retry=false است؛ نسبت دادن duplicate به retry خودکار TanStack اشتباه است. reload state فرم را از بین می‌برد؛ reconnect queryهای مالک را invalidate می‌کند ولی association request با intent گمشده ندارد.

`_request-form-drawer.tsx:152–161` mutate success، reset و onDone در یک try است؛ refetch failure پس از success نیز submitError می‌شود. solution پلن درست می‌خواهد موفقیت مالی را از شکست refresh جدا کند. onSuccess mutation canonical detail و ACTIVE list را seed می‌کند؛ optimistic dispatch/filled success مشاهده نشد.

`_request-view-model.ts:10–24` DONE را «ارسال شد» و UNKNOWN را «نتیجه نامشخص؛ گروه را بررسی کنید» نمایش می‌دهد؛ fill confirmation جعل نمی‌کند. retry forceSend همان ID با lifecycle fences عمل می‌کند، ولی gate FR-04 پابرجاست.

Settlement UI از V2 استفاده می‌کند؛ null P&L «نامطمئن»، null counterparty و label تسویه handled، contributions تفکیک و badge coverage دارد. `_data-coverage-badge.tsx:16–35` baseline/review/unreliable را مقدم بر HIGH نمایش می‌دهد. اسناد یا UI نباید numeric provisional را certified profit بنامند؛ در source فعلی badge عدم coverage وجود دارد. browser runtime این audit اجرا نشد.

**plan assessment:** durable owner/key/payload پیش از network، بدون auto-post، guard ref و unknown-result disclosure مناسب‌اند. رها کردن draft لغو canonical Request نیست. storage unavailable و malformed draft نباید key تازه بسازند. expiration/retention باید server-safe باشد، FR-06؛ هر SESSION_REQUIRED دلیل نفی commit قبلی نیست.

### [FR-06] pruning سی‌روزه هویت پیشنهادی intent را حذف می‌کند — شکاف پلن

**Severity:** P2  
**Status:** VERIFIED — design gap، هنوز creationKey پیاده نشده

**Evidence:** `requests.ts:448–454` non-ACTIVE completed بیش از۳۰روز حذف؛ index worker:201–208 prune startup/ساعتی؛ plan:51–65 key/hash فقط روی Request و :71–79 draft durable بدون expiry؛ هیچ correction pruning در فازها نیست.

**Failure Sequence:**

```text
1. پس از اجرای پلن بدون patch، K commit می‌شود ولی پاسخ گم شده و browser K را نگه می‌دارد.
2. Request terminal می‌شود.
3. prune رکورد و key/hash آن را پس از۳۰روز حذف می‌کند.
4. owner دوباره session آماده و همان K را retry می‌کند.
5. lookup absent → Request canonical دوم با همان K.
```

**Impact:** INV-01/INV-10 پس از retention نقض می‌شوند؛ این replay طولانی روی feature فعلی keyless معنا ندارد و باگ «already implemented creationKey» نیست.

**Existing Safeguards:** proposed unique هنگام وجود row؛ draft browser. **Root Cause:** lifetime identity با history retention یکی گرفته شده است.

**Previous Audit Status:** new finding روی راه‌حل.  
**Recommended Resolution:** هویت حداقلی owner/key/hash/canonical reference از pruning مستقل باقی بماند؛ row/tombstone بدون payload حساس کافی است. پس از حذف detail، retry باید نتیجهٔ سابق/expired canonical را به‌صورت امن گزارش کند، نه create جدید. bounded replay اگر انتخاب شود expiry باید server-verifiable و expired unknown key fail-closed باشد؛ client expiry یا UUID بی‌timestamp کافی نیست.  
**Required Decision:** NONE برای جلوگیری از duplicate؛ مدت نگهداری detail می‌تواند ۳۰روز باقی بماند.

## ۱۴. Deployment & Mixed-Version Audit — Lane K

Compose یک IMAGE_TAG immutable، migrate→worker/server و server→web health dependencies دارد. `deploy/migrate.mjs:7–29` SQLite owner lock shared volume را می‌گیرد؛ `ownership.ts:22–34` worker فعلی همان lock را نگه می‌دارد. این guard، client قدیمی یا process دارای volume دیگر را version-fence نمی‌کند. RELEASE_ID برای logging است؛ handshake سازگاری همهٔ سرویس‌ها از source اثبات نشد.

| ترکیب                              | پیش از synthetic                                                               | پس از synthetic                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| New DB + Old Server                | additive defaults معمولاً NORMAL را حفظ می‌کنند                                | old mapper/null assumptions و market query فاقد type filter unsafe یا error |
| New DB + Old Worker                | NORMAL writer قدیمی با default کار می‌کند، ولی coordinator/late guard را ندارد | مرز applied و query latest قبلی را ممکن است رعایت نکند                      |
| New Server + Old Worker            | API V2 ممکن است کار کند ولی history/recovery گارانتی جدید ندارد                | writer قدیمی می‌تواند quarantine contract را دور بزند                       |
| New Worker + Old Server            | gate off الزام تا cutover                                                      | old API ممکن است synthetic را market یا NORMAL دوطرفه بفهمد                 |
| New Web + Old Server               | V2 endpoint موجود نیست؛ درخواست data fail می‌شود                               | refresh front به‌تنهایی اصلاح backend نیست                                  |
| Old Web + New Server               | V1 تا bootstrap فعال است، FR-05/10                                             | V1 پس از APPLIED صریح 409؛ tab قدیمی باید reload شود                        |
| application rollback بعد migration | schema additive به معنی business compatibility نیست                            | forward fix یا restore هماهنگ؛ sends بیرونی با DB rollback برنمی‌گردند      |
| migration success + deploy failure | DB جدید و app قدیمی ممکن است بمانند؛ gate/stop شرط است                         | release ناقص نباید synthetic admission را باز کند                           |

**cutover عملیاتی توصیه‌شده، اجرا نشده:** admission مالی را موقتاً ببند؛ backup/PITR و migration state را احراز کن؛ worker قدیمی را drain/stop و ownership lock را تأیید کن؛ migration additive را migrate service اعمال کند؛ Prisma Client در build هم‌نسخه تولید شود؛ worker/server/web سازگار با gate خاموش و بدون overlap عرضه شوند؛ health، artifact imports، recovery/cursor، API version و browser refresh تأیید شوند؛ فقط سپس با evidence parser/coverage activation انجام شود. اگر deploy ناکام بود admission بسته بماند و forward fix؛ clear flag یا rollback image جای reconciliation نیست.

بعد creationKey، old server strict آن را رد می‌کند و new server caller بدون key را باید fail-closed رد کند. release موفق registration سپس rollback به keyless server INV-01 را دوباره می‌شکند؛ plan این خطر را درست می‌گوید، ولی retention و force gate را هنوز حل نکرده است.

**Docker evidence:** Dockerfiles Prisma generate در build و runtime smoke checks دارند. workflow multiarch amd64/arm64 است؛ فرض «builder BUILDPLATFORM قطعاً native worker را خراب می‌کند» اثبات نشد: override better-sqlite3=13.0.3 و package نصب‌شده prebuild هر دو target دارد. runtime images این audit ساخته/اجرا نشدند؛ نسخهٔ Node محلی 25.9.0 با container Node24 متفاوت است. migration applied، PG16 و image deployment همچنان UNRESOLVED خارجی‌اند.

## ۱۵. Observability & Recovery Audit — Lane L

logger در `packages/logger/src/index.ts:19–36,59–84` error message خام را serialize نمی‌کند و credentials/body/auth redact دارد. worker context شامل event، release، correlation و error category است؛ raw Telegram text/OTP/password وارد پیشنهادهای logging نشود. payload خام در inbox persistence با log عمومی یکی نیست و دسترسی operational لازم دارد.

| مورد                      | detection موجود                                                       | log/metric/property موردنیاز                                                    | مسیر recovery                                   |
| ------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------- |
| Settlement duplicate      | unique+APPLIED/record equality؛ logging completion کامل service ندارد | info duplicate، chat/message/settlement ID، counter duplicate                   | no financial replay؛ حفظ canonical              |
| Settlement missed         | scan enabled fixed head؛ parser فعلی بسته                             | recovery start/end/failure و cursor lag به‌شکل bounded، نه count missing از gap | catch-up معتبر؛ نبود history review             |
| late receipt              | DB inbox error، Settlement reviewReason و gate                        | warn financial.late_receipt با boundary/receipt ID و counter                    | reconciliation interval؛ درج مستقیم ممنوع       |
| history failure           | `telegram.financial_recovery.failed` در sessions:752–755              | error با recovery generation/chat/cursor/head و شمار failure                    | retry safe؛ guard باز نشود                      |
| coverage ناقص             | review/digest، scanned≠verified                                       | pending/review gauge؛ age و دلیل، بدون raw text                                 | CLI inspect و تأیید مستقل                       |
| request replay            | اکنون هویتی ندارد، feature پیشنهادی است                               | info creation.replayed با ownerRef/keyRef/canonical ID                          | canonical status؛ بدون arm/send                 |
| key conflict              | فعلاً وجود ندارد                                                      | warn creation.conflict، hash مقایسه‌ای محدود/refs؛ counter                      | 409 و بررسی canonical؛ payload log نشود         |
| accounting invariant شکست | throw mismatch/closefailed و rollback                                 | error invariant نامدار، settlement ID/participantRef/count؛ نه فقط UnknownError | commit صفر، gate review و diagnosis             |
| synthetic count غیرمنتظره | count مستقیم در operator DB، service metric ندارد                     | applied summary expectedNonzero/createdCount و invariant equality               | بررسی immutable interval و engine، بدون rewrite |

این جدول طراحی observability لازم را از implementation موجود جدا می‌کند؛ نبود metric feature هنوز پیاده‌نشده «regression فعلی» نیست. late recordTrade false در handler فعلی ممکن است همان `telegram.trade.duplicate` log شود؛ منبع diagnosis قطعی DB review است، نه آن log. مانیتورینگ صرف health=SELECT1 financial-ready را اثبات نمی‌کند.

CLI `settlement-review.ts:18–67` inspect digest/count/state، execution flag، reviewer و unresolvedCount را می‌سنجد؛ applied/conflicting را رد می‌کند. reviewer name و digest اثبات خارجی receipt completeness نیستند؛ operator باید واقعاً مقایسه کند. recovery manual پس از correction تاریخی transaction مستقل، review record و بررسی اثر بر مرزهای بعدی می‌خواهد؛ این audit آن را اجرا نکرد.

offline edit/delete closed NORMAL intervals خودکار exhaustively rescan نمی‌شوند؛ OPERATIONS:110 این محدودیت را صریح دارد. live delete برای basic group فاقد chatId در mtcute:210–218 قابل attribution نیست. رویداد نادیده‌گرفته‌شده، reviewed محسوب نشود.

## ۱۶. Cross-Lane Invariant Analysis

| invariant                                        | وضعیت source فعلی                    | connection بین laneها / شاهد                                                                           |
| ------------------------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| INV-01: یک intent حداکثر یک Request              | **BROKEN VERIFIED**                  | A/J create retry؛ FR-01، identity آینده با prune هم FR-06                                              |
| INV-02: یک canonical Request یک lifecycle فعال   | **SUPPORTED BY SOURCE**              | A/I locks/token/phase و UNKNOWN؛ تست concurrent PG این نوبت نیست                                       |
| INV-03: READY فقط با transport+history معتبر     | **BROKEN VERIFIED**                  | B→A requireConnected و async onReady؛ gate auto همهٔ مسیرها را نمی‌پوشاند                              |
| INV-04: shorthand از quote پیشین معتبر           | **BROKEN VERIFIED فعلی**             | D scalar؛ proposed < predicate درست ولی max کامل بدون prefix proof، FR-07                              |
| INV-05: Settlement حداکثر یک اثر مالی            | **SUPPORTED BY SOURCE**              | C/E unique+lock+APPLIED transaction؛ bypass SQL مستقیم/old binary خارج این تضمین                       |
| INV-06: یک synthetic participant/settlement      | **SUPPORTED BY SQL**                 | E COALESCE unique و shape one-side؛ PG concurrency این نوبت اجرا نشد                                   |
| INV-07: بعد Settlement position صفر              | **SUPPORTED با coverage و baseline** | E/F exact-flat check؛ bootstrap state reset قراردادی است، prior inventory واقعی را reconstruct نمی‌کند |
| INV-08: SETTLEMENT market trigger نیست           | **SUPPORTED فعلی**                   | H تمام market/auto queryها NORMAL؛ mixed old binary شرط جدا K                                          |
| INV-09: bootstrap incomplete را reliable نمی‌کند | **SUPPORTED V2؛ legacy risk**        | F/G V2 mask؛ V1 prebootstrap HIGH، FR-10؛ baseline≠coverage                                            |
| INV-10: restart/browser retry duplicate نسازد    | **BROKEN برای browser intent**       | A/J؛ restart same canonical SENDING→UNKNOWN guard دارد ولی create تازه جلوگیری نمی‌شود                 |

نمونه‌های اتصال که review منفرد نمی‌پوشاند:

- create idempotency درست + هویت حذف‌شده با prune = canonical جدید؛ unique روی row زنده کافی نیست.
- canonical claim درست + forceSend trigger=null = bypass gate بررسی مالی، بدون duplicate lifecycle.
- membership سالم + onReady failed = READY کاذب؛ adding epoch به‌تنهایی تاریخچه را بازیابی نمی‌کند.
- DB Settlement درست + V1 projection متفاوت = dashboard/API P&L متناقض؛ مالیات آن از transaction corruption نیست.
- predecessor query درست روی subset + M20 هنوز مشاهده‌نشده = definitive price غلط؛ صف مشترک arrival-based numeric watermark نیست.
- NORMAL-only heads + cache فاقد notification = market بدون synthetic pollution اما stale؛ isolation و freshness invariantهای جدا هستند.

### اصلاحات لازم پلن، بدون ویرایش آن

1. بقای minimal identity بعد prune یا fail-closed expiry معتبر سمت server را صریح کند؛ detail retention با identity lifetime جدا باشد.
2. chat مقصد و admission مالی را در manual/auto execution مشترک کند؛ test REVIEW_REQUIRED+forceSend مستقل از tests duplicate باشد.
3. prefix quote تا order boundary یا ambiguity/provisional معتبر را پیش از definitive resolution الزام کند؛ cursor مالی را proof همهٔ فعالیت انسانی معرفی نکند.
4. V1 list/detail projection و baseline/coverage confidence را داخل scope ببرد؛ legacy فعال پیش از bootstrap را نادیده نگیرد.
5. freshness serving بازار و معنای connected را به runtime واقعی منطبق و smoke check آن را جدا کند.
6. mounted RPC/OpenAPI را از dormant REST module جدا نام‌گذاری کند؛ type-maintenance dormant به‌عنوان protection ingress فعال گزارش نشود.
7. گزارش زندهٔ provisional V2 را از interval reviewed جدا توضیح دهد؛ HIGH پس از صرف گذشت هفت روز یا حذف شرط coverage ممنوع بماند.
8. آزمون‌های concurrent DB، same-ID auto/manual، lost-response/reload، pruning، stale generation، ناقص بودن predecessor، V1 historical و cutover را با evidence واقعی مطالبه کند؛ application code یا تست جدید در این audit ایجاد نشد.

## ۱۷. Complete P0/P1/P2/P3 Finding Table

| ID    | عنوان                                   | Severity | Status               | سطح         | نسبت به audit قبلی                  |
| ----- | --------------------------------------- | -------- | -------------------- | ----------- | ----------------------------------- |
| FR-01 | duplicate Request برای یک intent        | P1       | VERIFIED             | فعلی        | confirmed                           |
| FR-02 | READY پیش از transport/history معتبر    | P1       | VERIFIED             | فعلی        | confirmed/broadened                 |
| FR-03 | quote scalar action غلط می‌سازد         | P2       | VERIFIED             | فعلی        | confirmed؛ outbound impact محدود شد |
| FR-04 | forceSend financial review gate bypass  | P1       | VERIFIED             | فعلی        | new formal finding                  |
| FR-05 | V1 self-alias list/detail mismatch      | P2       | VERIFIED             | legacy فعلی | previously deferred، اکنون در scope |
| FR-06 | pruning identity پیشنهادی را می‌برد     | P2       | VERIFIED             | پلن         | new                                 |
| FR-07 | DB predecessor بدون complete prefix     | P2       | VERIFIED             | پلن         | new                                 |
| FR-08 | long market TTL بدون notifier           | P2       | VERIFIED             | فعلی        | new formal finding                  |
| FR-09 | اسناد authoritative FIFO/Prisma6 نادرست | P3       | VERIFIED             | اسناد       | new formal finding                  |
| FR-10 | V1 HIGH بدون baseline اثبات‌شده         | P2       | VERIFIED conditional | legacy فعلی | new formal finding                  |

### [FR-09] واژگان مالی/نسخهٔ runtime در اسناد authoritative غلط است

**Severity:** P3  
**Status:** VERIFIED

**Evidence:** `docs/ARCHITECTURE.md:11–12` FIFO و Prisma6؛ `docs/README.md:16,51–52` همان ادعا؛ actual calculate-position signed WACB و lockfile Prisma7.10.0. OPERATIONS:88 scan یک‌ثانیه‌ای می‌گوید، actual trade-request-processor:54–59 default سی‌ثانیه و wake فوری است.

**Failure Sequence:**

```text
1. عامل یا operator مستند authoritative را می‌خواند.
2. آن را با actual WACB/Prisma7 یا زمان‌بندی scan تطبیق نمی‌دهد.
3. design/verification/diagnosis بر فرض نسخه یا engine نادرست انجام می‌شود.
```

**Impact:** ریسک تصمیم توسعه/عملیات غلط؛ corruption runtime از متن سند به‌تنهایی ثابت نیست. **Existing Safeguards:** business contract و source جدید صحیح‌اند. **Root Cause:** اسناد topology/index همگام نشده‌اند.

**Previous Audit Status:** new formal documentation finding.  
**Recommended Resolution:** references authoritative به actual WACB، نسخهٔ lockfile و scheduler واقعی منطبق شوند؛ engine یا cadence به‌خاطر سند قدیمی تغییر نکند.  
**Required Decision:** NONE.

## ۱۸. Findings Refuted From Previous Audit

سه finding اصلی رد نشدند. موارد زیر correction/refutation **استنتاج همراه یا فرضیهٔ تازه** هستند، نه کاهش مصنوعی count findingها:

| فرضیه/ادعا                                                       | status و دلیل                                                                                                                                 |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| هر offline بدون onError به loss دائمی receipt منجر می‌شود        | REFUTED به‌عنوان نتیجهٔ قطعی؛ mtcute update catch-up مستقل دارد؛ only app readiness bypass اثبات شد                                           |
| quote غلط مستقیماً outbound order را آلوده می‌کند                | UNRESOLVED برای اثر تازه؛ مسیر فعلی request→TradingAction یافت نشد و canonical mismatch رد می‌شود؛ P2 باقی                                    |
| DB quote دیررس را reject می‌کند                                  | corrected؛ history ثبت می‌شود، latestUpdated=false یعنی flag تقدم؛ مرجع scalar هنوز غلط است                                                   |
| legacy REST register module production ingress فعال است          | REFUTED؛ createApp فقط registerRpcRoutes/RPC/OpenAPI را mount می‌کند                                                                          |
| stale identity cache auth/allowlist را bypass می‌کند             | REFUTED در source بررسی‌شده؛ authenticate پیش از cache هر procedure اجرا می‌شود                                                               |
| nullable source نیازمند جایگزینی normal unique با partial است    | REFUTED؛ default NULL uniqueness کافی، synthetic expression index مستقل است                                                                   |
| اولین live M103 پیش از configured bootstrap M101 پذیرفته می‌شود  | REFUTED برای clean startup فعلی؛ recovered=false، recover قبل process، history ascending، bootstrap existence check، apply قبل recovered=true |
| BUILDPLATFORM به‌تنهایی ثابت می‌کند worker native arm64 خراب است | REFUTED به‌عنوان استنتاج قطعی؛ package override چند prebuild دارد؛ actual image verification هنوز UNRESOLVED                                  |
| false مقدار recordTrade همیشه duplicate سالم است                 | corrected؛ late receipt نیز false و review flags می‌سازد؛ diagnosis فقط log duplicate کافی نیست                                               |

## ۱۹. Newly Discovered Findings

**شش finding جدید رسمی:** FR-04 gate manual؛ FR-06 pruning/identity design؛ FR-07 predecessor completeness design؛ FR-08 serving freshness؛ FR-09 docs mismatch؛ FR-10 conditional false historical confidence.

FR-05 discovery تازه نیست: audit قبلی آن را دیده بود ولی report/plan از scope کنار گذاشته بود. این re-audit آن را independently بازتولید و به finding رسمی برگرداند. سه finding اصلی هم independently بازتولید شدند. خواندن دو نسخهٔ یک نتیجه به‌عنوان دو finding یا دو proof PG ثبت نشده است.

## ۲۰. Remaining Unknowns

- متن خام دقیق اعلان موفق، chat ID، sender ID، message ID و Telegram timestamp واقعی؛ screenshot amount/authentication/Unicode grammar را ثابت نمی‌کند.
- `_prisma_migrations` و وضعیت foundation در هر محیط؛ این audit هیچ DB را نخواند.
- concurrency واقعی PostgreSQL16، lock interleavings و migration rehearsal جدید؛ SQL/source protection با runtime verification متفاوت است.
- receipt/quote unseen حذف‌شده و موجودی شروع واقعی در تولید؛ history scan صرف نمی‌تواند نبود آن‌ها را ثابت کند.
- operational coverage review واقعی و corrective transaction برای closed interval؛ CLI approval ورودی انسان را می‌پذیرد، صحت review خارجی نیست.
- live mtcute reconnect، basic-group deletion attribution، network uncertainty و session replacement event race.
- browser reload/lost-response/old-tab رفتار واقعی، PWA update، تصاویر Docker targetها و rollout Dokploy.
- multi-group historical data/چند worker با volume متفاوت؛ معماری فعلی گروه واحد/owner واحد است، actual deployment topology بررسی نشده.
- transient mixed Analytics snapshot هنگام همزمانی؛ trace علّی plausible، خروجی مالی غلط قطعی اثبات نشد.

این unknownها به finding verified تبدیل نشده‌اند. شواهد خارجی parser/coverage برای activation لازم‌اند؛ انجام reliability implementation پس از patch پلن به دریافت raw message وابسته نیست.

## ۲۱. Readiness Verdict

**`READY_AFTER_PLAN_PATCH`**

- **P0 count:** ۰.
- **P1 count:** ۳.
- **P2 count:** ۶.
- **P3 count:** ۱.
- **Refuted previous findings:** ۰/۳؛ چند narrative assertion/فرضیه در بخش ۱۸ رد یا محدود شد.
- **New findings:** ۶؛ به‌علاوهٔ بازگرداندن FR-05 که قبلاً deferred بود.
- **Plan corrections required:** هشت مورد بخش ۱۶، با اولویت identity lifetime، gate همهٔ executionها و quote prefix؛ سپس legacy Analytics، freshness، route/cursor scope و verification/observability.
- **External evidence still required:** raw Settlement metadata، migration target state، coverage review و runtime PG16/Telegram/browser/Docker/cutover.

هیچ implementation، patch پلن، test file، migration، DB operation یا deployment در این audit انجام نشد. بعد از تولید همین report متوقف شده است. نتیجهٔ «core financial transaction فساد مشخصی نشان نداد» به معنای آماده‌بودن feature فعال یا production نیست.

## ۲۲. Evidence Index

| کد شاهد | مسیر، symbol و lines                                                                                                 | کاربرد                                                   |
| ------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| E01     | Git HEAD/log/status/show و scoped diff                                                                               | واقعیت repository؛ application/deploy مطابق HEAD         |
| E02     | `packages/contracts/src/index.ts:48–67` request schemas؛ `rpc.ts:85–101` create/update contract                      | FR-01 و schema compatibility                             |
| E03     | `packages/db/src/requests.ts:94–117,175–207,220–454` connected/create/claim/markSending/recover/prune                | A، FR-01/04/06، INV-01/02/10                             |
| E04     | `apps/server/src/modules/requests/create-requests-router.ts:104–157` request handlers                                | verified owner/session/cache                             |
| E05     | `apps/web/src/modules/requests/_request-form-drawer.tsx:132–164` submit؛ `_request-mutation-options.ts:5–35`         | lost result، success/cache                               |
| E06     | `apps/worker/src/requests.ts:35–164` executor؛ `trade-request-processor.ts:19–65`                                    | SENDING، timeout、UNKNOWN، cadence                       |
| E07     | `apps/worker/src/sessions.ts:169–224,229–244,283–353,705–755,1321–1334`                                              | lifecycle、history eligibility، FR-02                    |
| E08     | installed `node_modules/.pnpm/@mtcute+core@0.26.3/node_modules/@mtcute/core/highlevel/base.js:29–50`                 | independent state/error، internal updating               |
| E09     | `apps/worker/src/financial-ingestion-coordinator.ts:33–59,149–211,254–256,298–379`                                   | arrival queue、catch-up、guard، bootstrap refutation     |
| E10     | `apps/worker/src/mtcute.ts:198–252`                                                                                  | edit/delete、history、cap、sort                          |
| E11     | `apps/worker/src/authoritative-handler.ts:39–51,89–119`؛ `market-ingestion.ts:35–45,133–149`                         | quote callback、receipt logs/wake                        |
| E12     | `apps/worker/src/trading-action-handler.ts:118–139`؛ `participant-identity.ts:65–81`                                 | shorthand impact و identity safeguards                   |
| E13     | `packages/domain/src/parse-human-order.ts:79–140`                                                                    | full compact مستقل، shorthand ambiguity                  |
| E14     | `packages/db/prisma/schema/schema.prisma:141–191,272–345`                                                            | actual model، QuoteHistory global unique                 |
| E15     | `packages/db/prisma/migrations/20260920010000_settlement_foundation/migration.sql:4–93`                              | shape、unique、FK、positivity                            |
| E16     | `packages/db/src/apply-settlement.ts:10–94,97–308`                                                                   | coverage digest、atomic WACB closes                      |
| E17     | `packages/db/src/settlement.ts:220–283,318–350,386–497`                                                              | recovery guard、revision、event identity                 |
| E18     | `packages/db/src/market-data.ts:124–251`                                                                             | late quarantine、market-only readers、historical aliases |
| E19     | `packages/db/src/market-heads.ts:19–58`؛ `trade-trigger.ts:5–47`                                                     | NORMAL isolation و critical lock                         |
| E20     | `packages/db/src/analytics.ts:9–68`                                                                                  | تمام Analytics Trade readers و alias UNION               |
| E21     | `packages/domain/src/analytics/calculate-position.ts:9–236`؛ constants:1–29                                          | WACB、unmatched،Toman rounding                           |
| E22     | `packages/domain/src/analytics/calculate-participant-analytics.ts:60–189,204–252`                                    | baseline/window/confidence/contributions                 |
| E23     | `apps/server/src/modules/analytics/analytics-service.ts:40–45,68–103,153–188`                                        | V1 guard/coherence/confidence                            |
| E24     | `apps/server/src/modules/analytics/settlement-analytics-service.ts:18–52,100–210,214–309`                            | V2 effective ID、baseline/coverage、list/detail          |
| E25     | `apps/server/src/modules/analytics/create-analytics-router.ts:73–127`؛ `settlement.ts:342–350`                       | revision keyed cache                                     |
| E26     | `apps/server/src/modules/market/market-state.ts:19–82`؛ `create-market-runtime.ts:7–24`؛ web query-policy:51–54      | FR-08 stale cache                                        |
| E27     | `apps/server/src/app/create-app.ts:14–35`؛ `transport/rpc/register-rpc-routes.ts:20–69`                              | mounted routes،readiness probe                           |
| E28     | `security/telegram/verify-telegram-init-data.ts:22–61`؛ `authenticate-telegram-request.ts:21–35` زیر apps/server/src | HMAC/date/allowlist                                      |
| E29     | `apps/server/src/transport/rpc/create-orpc-router.ts:87–125,162–185`؛ web orpc:25–35,78–85                           | auth قبل cache، owner، batch scope                       |
| E30     | `apps/web/src/modules/traders/_data-coverage-badge.tsx:16–55`؛ `_trader-detail-drawer.tsx:62–79`                     | confidence/null P&L UI                                   |
| E31     | `apps/worker/src/index.ts:81–149,201–211`؛ env worker:17–26؛ domain parser:18–25                                     | feature gate、startup ordering、prune                    |
| E32     | `apps/worker/src/settlement-review.ts:18–67`؛ `docs/OPERATIONS.md:92–112`                                            | manual review،deployment و known limitations             |
| E33     | `compose.yml` dependencies/gates/image tags؛ `deploy/migrate.mjs:7–29`؛ `ownership.ts:22–34`                         | mixed version、migration lock                            |
| E34     | server/worker/web Dockerfiles؛ workflow publish-containers:103–117؛ pnpm-workspace:4–8                               | image/runtime generation و multiarch limits              |
| E35     | plan `2026-10-04-integrated-financial-reliability.md:51–128`                                                         | proposed identity/recovery/predecessor assumptions       |
| E36     | docs ARCHITECTURE:11–12 و README:16,51–52؛ pnpm-lock Prisma7.10/mtcute0.26.3                                         | FR-09 و version facts                                    |

### Fresh checks و بازتولیدهای این audit

| check                                                                                         | نتیجه و محدودیت                                                                  |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Git branch/rev-parse/log/status/show/scoped diff                                              | source snapshot و preservation؛ DB migration state نیست                          |
| Graphify query مالی                                                                           | dependency routing محدود، یافته‌ها با source verify شدند                         |
| `rg` repository-wide direct Trade consumers و proposed reliability symbols                    | inventory بخش ۱۱؛ proposed symbols در source نیستند                              |
| actual createRequestStore memory fixture                                                      | دو canonical ID از retry؛ fake transaction، نه PG concurrency                    |
| actual Sessions state fixture                                                                 | readyDuringOffline=true و recovery0؛ نه live disconnect                          |
| actual createMarketIngestion fixture                                                          | quote late/future دو قیمت غلط؛ نه outbound send                                  |
| actual V1/V2 service fixtures                                                                 | self-alias mismatch V1، coherence V2؛ V1 HIGH با initial inventory ناشناخته شرطی |
| actual MarketState clock/load fixture                                                         | M20 بعد۳ثانیه، M21 بعد۶۰ثانیه؛ config behavior، نه performance benchmark         |
| `pnpm --filter @zarbit/domain exec tsx --test test/analytics.test.ts test/settlement.test.ts` | **۷/۷ pass، ۰ skip**؛ purely domain، بدون DB/Telegram                            |

بازتولیدهای حافظه‌ای در inline tsx و توسط reviewerها اجرا شدند؛ فایل تست یا harness در repository ایجاد نشد و log artifact جدا ذخیره نشد. checks کامل application، build، Prisma generate، migrate و production operations اجرا نشدند. خطای probe مسیر package `@mtcute/sqlite` مشاهده شد؛ package واقعی `@mtcute/node` از better-sqlite3 استفاده می‌کند و آن probe شاهد خرابی worker نیست. formatting همین گزارش جدا کنترل شد؛ formatting شاهد correctness مالی نیست.
