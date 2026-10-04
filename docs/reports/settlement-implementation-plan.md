# طرح پیاده‌سازی Settlement در ZarBit

## ۱. خلاصهٔ اجرایی

Settlement یک رویداد حسابداری مستقل از بازار است: پیام معتبر ربات تلگرام trigger می‌شود، ZarBit آثار مالی آن را در `Trade` بازسازی می‌کند و هیچ سفارش تلگرامی برای Settlement ارسال نمی‌کند. موتور فعلی WACB و قواعد گردکردن حفظ می‌شوند.

معماری نهایی شامل `Settlement`، `TradeType`، inbox پایدار PostgreSQL، cursor مرزی، coordinator مشترک همهٔ sessionهای MTProto، recovery مبتنی بر `getHistory` و API تحلیلی نسخه‌دار است. معاملات `SETTLEMENT` هرگز وارد market head، spread یا request trigger نمی‌شوند.

دو پیش‌نیاز هنوز مانع فعال‌سازی خودکار کامل‌اند: متن خام پیام Settlement و شواهد کافی برای اثبات پوشش کامل receiptهای پیش از هر مرز. در نبود پوشش اثبات‌شده، سیستم fail-closed می‌ماند و Settlement را برای بررسی دستی نگه می‌دارد.

## ۲. قرارداد تجاری تأییدشده

- Settlement فقط از پیام معتبر گروه و sender عددی مورداعتماد پذیرفته می‌شود؛ Cron وجود ندارد.
- مقدار `102980000` طبق قرارداد قیمت پروژه برابر compact price `102980` است.
- `netPosition = buyUnits - sellUnits`: مثبت، synthetic SELL؛ منفی، synthetic BUY؛ صفر، بدون synthetic trade.
- همهٔ syntheticها قیمت همان Settlement را دارند.
- Settlement با صفر synthetic نیز ذخیره می‌شود.
- نخستین Settlement معتبر baseline صفر است؛ موجودی تاریخی اثبات‌نشده هرگز حدسی بسته نمی‌شود.
- Trade و QuoteHistory دائمی‌اند؛ هفت روز فقط پنجرهٔ Analytics است.
- Settlement در position، realized P&L، volume و trade count مشارکت دارد.
- نخستین payload معتبر پذیرفته‌شده authoritative است؛ edit، delete و conflict فقط manual review هستند.

منابع قراردادی: `docs/BUSINESS-RULES.md`، `docs/MARKET-DATA.md`، `docs/TELEGRAM.md`، `docs/POSTGRES.md` و `docs/GROUP-TRADING-PROTOCOL.md`.

## ۳. اصلاحات گزارش امکان‌سنجی

### ترتیب و هم‌زمانی

`recordTrade` و request processing اکنون `lockTradeStream` دارند، اما advisory lock ترتیب Telegram message ID را تضمین نمی‌کند. `KeyedSingleFlight` فقط همان `(chatId,messageId)` را ادغام می‌کند و callbackهای `sessions` فقط در هر session سریال‌اند. بنابراین coordinator گروهی و cursor پایدار لازم‌اند.

گپ message ID به‌تنهایی receipt مفقود نیست. history scan با `getHistory`، inbox و مرز پردازش لازم است؛ بااین‌حال history قابل‌مشاهده نبودن پیام حذف‌شده را اثبات نمی‌کند و coverage کامل باید جداگانه تأیید شود.

### PostgreSQL و Prisma

با nullable شدن `sourceMessageId`، unique فعلی `(chatId, sourceMessageId)` در PostgreSQL چند NULL را می‌پذیرد و برای NORMAL کافی است؛ partial index جایگزین لازم نیست. برای syntheticها باید یکتایی `(chatId, settlementMessageId, effectiveParticipant)` برقرار شود، زیرا دو unique جدا برای buyer و seller حالتی را که یک نفر در دو Settlement side متفاوت دارد پوشش نمی‌دهد.

CHECKهای shape در SQL migration و enum/relation در Prisma تعریف می‌شوند. PostgreSQL 16+ و lockfile فعلی Prisma 7.10.0 است؛ مستند معماری که Prisma 6 می‌گوید باید اصلاح شود.

### واحد قیمت

`parseTradeReceipt` قیمت نمایش‌داده‌شده را بر ۱۰۰۰ تقسیم کرده و `compactPrice` می‌سازد؛ handler فعلی همان displayed price را در `Trade.rawPrice` می‌نویسد. بنابراین قرارداد نهایی:

```text
raw Telegram amount = displayedPrice
compactPrice = displayedPrice / 1000
Trade.compactPrice = compactPrice
Trade.rawPrice = displayedPrice = compactPrice * 1000
P&L Tomans = round(sum(unrounded points) * 100 / 4.3318 * 1000)
```

### Bootstrap و confidence

baseline صفر، پوشش تاریخی و confidence مستقل‌اند. گذشت هفت روز یا موفقیت history scan، `HIGH` را تضمین نمی‌کند. `UNVERIFIED_INVENTORY` برای موجودی اولیهٔ اثبات‌نشده حفظ می‌شود و P&L ناقص نباید صفر نمایش داده شود.

### corrections، sender و performance

نبود edit/delete listener به‌معنای detection نیست. listener و revalidation اضافه می‌شود، اما correction تاریخی rewrite نمی‌شود. `QUOTE_SENDER_ID` به‌تنهایی sender Settlement را ثابت نمی‌کند؛ `SETTLEMENT_SENDER_ID` و metadata واقعی لازم است. ادعاهای زیر ۳۰ms و کاهش ۹۰٪ حذف می‌شوند و فقط query plan و benchmark واقعی معیارند.

## ۴. معماری نهایی

### Domain

فایل‌های جدید `packages/domain/src/parse-settlement-announcement.ts` و `calculate-settlement-trades.ts` ایجاد شوند. parser خالص و strict است و event نرمال‌شده شامل chat، message ID، sender، timestamp، compact price، raw text hash و payload version است. محاسبهٔ close فقط side و quantity را تعیین می‌کند و نتیجه با `calculatePositionTransition` در `packages/domain/src/analytics/calculate-position.ts` کنترل می‌شود؛ فرمول WACB یا conversion جدید ایجاد نشود.

### Database

`Settlement` حداقل این اطلاعات را دارد: `chatId`، `sourceMessageId`، `senderId`، `compactPrice`، `announcedAt`، `payloadHash`، `mode`، `status`، `reviewReason`، `coverageDigest` و timestamps. تعداد و حجم synthetic از Tradeها مشتق می‌شود و redundant ذخیره نمی‌شود.

در `Trade` افزوده شود: `type: NORMAL | SETTLEMENT`، `sourceMessageId Int?`، طرفین nullable و `settlementChatId/settlementMessageId` یا relation مرکب به Settlement. NORMAL باید source ID و هر دو طرف را داشته باشد؛ SETTLEMENT باید source ID تهی، settlement relation موجود و دقیقاً یک طرف داشته باشد. `quantity` و قیمت‌ها مثبت باشند.

دو entity عملیاتی دیگر لازم‌اند: `FinancialInbox` برای payload immutable و state پردازش، و `GroupIngestionState` برای `scannedThroughMessageId`، `appliedThroughMessageId`، وضعیت gate و `analyticsRevision`.

Migration additive باشد، دادهٔ تاریخی را rewrite نکند، قبل از CHECK validation پیش‌بررسی داشته باشد و generated Prisma client بعد از migration ساخته شود. rollback پس از درج synthetic فقط با forward fix یا backup restore هماهنگ ممکن است.

### Worker

مسیر نهایی:

```text
Telegram NEW/EDIT/DELETE
→ group/sender validation
→ immutable inbox
→ parser/classifier
→ ordered history/cursor gate
→ DB transaction + advisory lock
→ Settlement/Trade commit
→ request wake فقط برای NORMAL
```

در `apps/worker/src/mtcute.ts`، `transport.ts` و `sessions.ts` history، edit و delete پشتیبانی شوند. coordinator در `market-ingestion.ts` ساخته و قبل از `sessions.initialize()` متصل شود. هیچ Telegram I/O داخل transaction نیست.

برای recovery، `getHistory`/`iterHistory` با `minId/maxId` و pagination استفاده شود. overlap مرزی خوانده شود و application با شرط `(lastApplied, head]` فیلتر کند. عدم پیشرفت cursor، خطای page، timeout یا تغییر session gate را متوقف می‌کند. gap عددی پیام هرگز به‌عنوان missing receipt تفسیر نشود.

### Settlement transaction

`recordSettlement` در `packages/db/src/settlement.ts`:

1. `lockTradeStream(tx, chatId)`.
2. Settlement و inbox را idempotently بخواند.
3. boundary قبلی و ingestion state را کنترل کند.
4. برای نخستین Settlement، baseline صفر و بدون synthetic ثبت کند.
5. برای Settlement عادی، فقط NORMALهای بازهٔ `previousBoundary < messageId < currentBoundary` را با coverage معتبر replay کند.
6. برای هر participant nonzero یک close trade درج کند و next position را صفر تأیید کند.
7. Settlement status، cursor، digest و revision را در همان transaction commit کند.

تکرار همسان نتیجهٔ قبلی را برمی‌گرداند؛ payload متعارض، late receipt زیر boundary، یا incomplete coverage به `REVIEW_REQUIRED` می‌رود. دو Settlement نزدیک بدون تعیین تکلیف اولی پردازش نمی‌شوند.

## ۵. مدل داده و migration

نمونهٔ منطقی:

```text
Settlement UNIQUE(chatId, sourceMessageId)
Trade.type DEFAULT NORMAL
Trade.sourceMessageId nullable
Trade.buyerParticipantId nullable
Trade.sellerParticipantId nullable
Trade.settlementChatId/settlementMessageId nullable FK
```

SQL invariants:

- NORMAL: source non-null، settlement null، هر دو participant non-null و متفاوت.
- SETTLEMENT: source null، settlement non-null، دقیقاً یک participant non-null.
- SETTLEMENT unique بر effective participant در هر Settlement.
- quantity، compactPrice و rawPrice مثبت؛ `rawPrice = compactPrice * 1000`.
- relation با `ON DELETE RESTRICT`.

Unique فعلی `(chatId, sourceMessageId)` حفظ شود؛ index تکراری ساخته نشود. CHECKهایی که به ردیف دیگر نیاز دارند با CHECK پیاده نشوند؛ آن‌ها در transaction/domain بررسی شوند.

## ۶. پردازش حسابداری

ترتیب replay:

```text
NORMAL: sourceMessageId
SETTLEMENT: settlementMessageId
tie-break: participant alias سپس Trade.id
```

ترتیب insert یا timestamp دریافت مبنا نیست. `announcedAt` فقط پنجرهٔ Analytics را تعیین می‌کند. برای هر participant، همهٔ eventها یک‌بار از WACB عبور می‌کنند. `realizedPnlPoints` از جمع unrounded transitionها ساخته، سپس گرد می‌شود؛ تومان فقط در خروجی نهایی تبدیل می‌شود.

در پنجرهٔ هفت‌روزه، آخرین Settlement معتبر پیش از window start برای state صفر انتخاب می‌شود؛ خود synthetic مرز دوباره اعمال نمی‌شود، اما Settlement داخل پنجره با موقعیت پیش از آن replay می‌شود تا P&L حذف نشود. اگر baseline یا coverage ناقص است، P&L قابل‌اعتماد `null`/metadata review داشته باشد.

## ۷. جداسازی Market و Request

این توابع باید NORMAL-only شوند:

- `createMarketHeadsStore.marketHeads`
- `createMarketHeadsStore.marketEvent`
- `createMarketDataStore.latestTrade`
- `latestGroupTrade`
- `createRequestStore.arm`
- `claimTradeRequests`
- `eligibleTrade`
- `tradeTrigger`
- `markSending`
- legacy `latestTrade` و routeهای quote

Analytics queryهای `participantTradesChronological`، `tradesForParticipantsChronological`، `activeParticipantAliasesInWindow` و `participantTrades` هر دو type را شامل کنند و null alias را فیلتر کنند. Settlement نباید market snapshot، spread، recent tape، request form، request cursor یا auto-send را تغییر دهد.

## ۸. RPC، Analytics و Frontend

برای جلوگیری از شکستن schemaهای strict فعلی، `analytics.tradersV2` و `analytics.traderDetailV2` با route و schema مستقل ساخته شوند. Trade DTO به union زیر تبدیل شود:

- NORMAL: `sourceMessageId: number` و `counterpartyAlias: string`.
- SETTLEMENT: `sourceMessageId: null`، `settlementMessageId: number` و `counterpartyAlias: null`.

آمار سه bucket `normal`، `settlement` و `total` داشته باشد. total از eventهای یکسان دوباره‌شماری نشود؛ average کل از total volume/count محاسبه شود. P&L غیرقابل‌اعتماد null باشد.

cache key باید `analyticsRevision` را شامل شود. completion و review revision را افزایش دهند. Market cache invalidation برای Settlement لازم نیست؛ Analytics cache باید invalidate شود.

در `apps/web/src/modules/traders` فقط label، breakdown، null-safe rendering و confidence دقیق اضافه شود. عبارت «با null» ممنوع است. Home terminal و request UI redesign نمی‌شوند.

## ۹. نقشهٔ فایل‌ها

- Schema: `packages/db/prisma/schema/schema.prisma` و migration جدید.
- Domain: `packages/domain/src/parse-settlement-announcement.ts`، `calculate-settlement-trades.ts`، `analytics/types.ts`، `analytics/calculate-participant-analytics.ts`، `index.ts`.
- DB: `packages/db/src/settlement.ts`، `financial-ingestion.ts`، `market-data.ts`، `analytics.ts`، `market-heads.ts`، `trade-trigger.ts`، `requests.ts`، `index.ts`.
- Worker: `apps/worker/src/financial-ingestion-coordinator.ts`، `transport.ts`، `mtcute.ts`، `sessions.ts`، `market-ingestion.ts`، `authoritative-handler.ts`، `index.ts`.
- Contracts: `packages/contracts/src/analytics.ts`، `rpc.ts`، `index.ts`.
- Server: `apps/server/src/modules/analytics/analytics-service.ts`، `create-analytics-router.ts`، `create-orpc-router.ts`.
- Web: `apps/web/src/modules/traders/traders-page.tsx`، `_trader-card.tsx`، `_trader-detail-drawer.tsx`، `_data-coverage-badge.tsx`.
- Config/docs: `packages/env/src/worker.ts`، `compose.yml`، `deploy/*.env.example` و مستندات عملیاتی مرتبط.

## ۱۰. فازهای dependency-aware

### فاز ۱ — Schema و migration foundation

هدف: مدل‌ها، enumها، FKها، constraints و generated client؛ بدون فعال‌سازی. وابستگی ندارد. پذیرش: migration روی دیتابیس خالی و کپی تاریخی، حفظ همهٔ داده‌ها و رد shape نامعتبر.

### فاز ۲ — Domain parser و close calculation

هدف: parser نرمال‌شده و close calculator خالص. وابستگی: قرارداد فاز ۱. پذیرش: long/short/partial/zero و قیمت واحد؛ تا دریافت raw message gate خاموش.

### فاز ۳ — DB transaction و market isolation

هدف: `recordSettlement`، inbox، cursor و NORMAL-only queryها. وابستگی: فازهای ۱ و ۲. پذیرش: idempotency، rollback اتمیک، عدم تغییر market و request.

### فاز ۴ — Worker ordering و recovery

هدف: coordinator مشترک، history catch-up، edit/delete و fail-closed gate. وابستگی: فاز ۳. پذیرش: restart، چند session، reorder، late receipt و history ناقص.

### فاز ۵ — Accounting، Analytics و RPC v2

هدف: WACB replay، baseline، confidence، breakdown، revision cache و DTOهای strict. وابستگی: فازهای ۲ تا ۴. پذیرش: P&L و total بدون double count و پنجرهٔ هفت‌روزه صحیح.

### فاز ۶ — Frontend

هدف: label، breakdown، null-safe و confidence. وابستگی: فاز ۵. پذیرش: RTL، موبایل، loading/error/empty و حفظ terminal.

### فاز ۷ — Review، docs و deployment readiness

هدف: ابزار review dry-run، runbook، feature gate و مستندات. وابستگی: فازهای ۳ و ۴. پذیرش: manual reconciliation و mixed-version guard.

### فاز ۸ — Verification و release rehearsal

هدف: اجرای checklist، migration rehearsal، build و runtime import audit. وابستگی: همهٔ فازها. پذیرش: گزارش passed، baseline failure و unverified lane جداگانه.

فازهای ۱ و ۲ می‌توانند موازی باشند. frontend پس از تثبیت v2 هم‌زمان با تکمیل server انجام می‌شود. invariantهای مالی، schema و ordering مالک یکپارچه دارند و به عامل‌های مستقل جدا واگذار نمی‌شوند.

## ۱۱. سناریوهای شکست و concurrency

- چند session و یک پیام: inbox/unique فقط یک اثر.
- crash قبل از commit: retry inbox.
- crash بعد از commit: خواندن outcome قبلی.
- Settlement حین receipt: drain و boundary gate.
- receipt دیررس زیر Settlement completed: quarantine و manual review؛ insert خاموش ممنوع.
- Settlement بدون position: completion با صفر synthetic.
- دو Settlement نزدیک: اولی باید تعیین تکلیف شود.
- edit/delete: حفظ history، ثبت review، بدون rewrite.
- parser malformed/conflicting: status review، بدون قیمت حدسی.
- database timeout: rollback کامل و retry idempotent.
- worker offline: catch-up؛ هیچ request trigger تاریخی.

## ۱۲. deployment و rollback

1. backup/PITR و تأیید restore.
2. توقف worker و request admission؛ drain processing.
3. build server/worker/web از همان commit و `IMAGE_TAG`.
4. اجرای `deploy/migrate.mjs` با migrate service و Prisma Client هم‌نسخه.
5. اطمینان از نبود worker قدیمی؛ `depends_on` به‌تنهایی کافی نیست.
6. start جدید با `SETTLEMENT_ENABLED=false`.
7. rollout web/server و invalidation cache؛ اجبار reload برای PWA قدیمی.
8. startup catch-up و بررسی health/runtime imports.
9. فعال‌سازی gate فقط پس از raw evidence و coverage policy.

بعد از درج synthetic، rollback image کافی نیست؛ forward fix یا restore کامل با reconciliation ارسال‌ها لازم است. DB rollback معادل application rollback نیست. Compose فعلی `migrate` را پیش از server/worker اجرا می‌کند و lock volume `/sessions` باید آزاد باشد.

## ۱۳. verification و acceptance checklist

- NORMAL ingestion، receipt، quote و WACB بدون تغییر.
- Settlement موفق، zero position، چند participant، long/short و partial close.
- duplicate همسان و payload متعارض.
- چند MTProto session، out-of-order commit، restart قبل/بعد commit.
- history gap غیرمالی، history ناقص، late receipt و missing history.
- bootstrap و confidence مستقل از elapsed seven days.
- crossing پنجرهٔ هفت‌روزه و rounding دقیق تومان.
- trade count، volume و P&L total/breakdown بدون double count.
- هیچ Settlement trigger برای request، market snapshot یا spread ایجاد نکند.
- Zod strict compatibility و null-safe frontend.
- migration روی PostgreSQL نسخهٔ production و دیتابیس ایزوله.
- `pnpm check-types`، `pnpm lint`، `pnpm format:check`، `pnpm build` و audit importهای `dist` در مرحلهٔ پیاده‌سازی.

طبق دستور این مأموریت، تست یا suite در مرحلهٔ برنامه‌ریزی اجرا نشود. اختلاف CI فعلی که بخشی از تست عمومی را روی `zarbit` اجرا می‌کند، با guard مستندات برای دیتابیس `_test` باید در مرحلهٔ پیاده‌سازی بررسی شود.

## ۱۴. شواهد باقی‌مانده و موانع

برای نهایی‌کردن parser فقط این موارد لازم‌اند: raw text، chat ID، sender ID، message ID و Telegram timestamp. screenshot به‌تنهایی کافی نیست.

برای completion خودکار REGULAR Settlement، شواهد پوشش کامل receiptهای دوره لازم است. `getHistory`، inbox، cursor و چند session فقط ترتیب و recovery قابل‌مشاهده را بهتر می‌کنند و نبود پیام حذف‌شده را ثابت نمی‌کنند. تا رفع این مانع، `REVIEW_REQUIRED` رفتار ایمن و نهایی است.

## ۱۵. دستور تحویل به عامل کدنویس

1. این سند و سورس فعلی را با هم منبع حقیقت بدان؛ گزارش feasibility را بدون اصلاحات این سند تکرار نکن.
2. قبل از edit، worktree و AGENTS را دوباره بخوان و تغییرات هم‌زمان را حفظ کن.
3. parser را با متن ساختگی فعال نکن.
4. هیچ confidence یا coverage را از زمان، تعداد session یا موفقیت history scan استنتاج نکن.
5. تمام Trade consumerها را با جدول NORMAL-only/Analytics بررسی کن.
6. فرمول WACB و conversion فعلی را reuse کن.
7. settlement transaction را بدون outbound Telegram I/O و با idempotency DB پیاده کن.
8. late receipt زیر boundary را هرگز silent insert نکن.
9. migration را additive و production-safe نگه دار؛ حذف یا rewrite Trade/QuoteHistory ممنوع.
10. پس از تغییر معنادار، Graphify را refresh و importهای runtime image را audit کن.
11. در گزارش نهایی، checks اجراشده، baseline failures، prerequisites و unverified production/Telegram lanes را جدا اعلام کن.
