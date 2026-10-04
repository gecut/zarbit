# Zarbit OTC Gold Trading Domain

Ubiquitous language for the Iranian OTC gold trading intelligence and execution engine, bridging Telegram group market conventions with backend models and client terminals.

---

## Market & Pricing

**Quote (مظنه)**:
The authoritative 17-karat gold mithqal reference quote broadcast periodically by the group management bot (`🟡 مظنه: <number> 🟡`). Persisted in `QuoteHistory`.
_Avoid_: price, market rate, نرخ, قیمت روز

**Trade Receipt (حواله)**:
The authoritative completed trade announcement emitted by the group management bot upon bilateral deal matching. Persisted in `Trade` with type `NORMAL`.
_Avoid_: trade confirmation, order execution, invoice, فاکتور, معامله

**Compact Price (قیمت خرد)**:
An integer representation of the gold price expressed in thousands of Tomans (e.g. `105020` denotes `105,020,000` Tomans). Used exclusively in database columns, API payloads, and internal calculations.
_Avoid_: raw price, internal price, قیمت خام

**Nominal Toman Price (قیمت به تومان)**:
The complete Iranian Toman price computed by multiplying the compact price by 1,000 ($\text{compactPrice} \times 1000$). Used exclusively for headline UI displays.
_Avoid_: Rial price, full price, قیمت اصلی

**Spread / Difference (اختلاف مظنه و حواله)**:
The signed point difference between the latest completed trade receipt compact price and the latest official quote compact price (`trade.compactPrice - quote.compactPrice`), indicating current market premium or discount.
_Avoid_: slippage, execution spread, fee, کارمزد, اختلاف اجرا

**Trading Unit (واحد معامله)**:
The standardized physical transaction lot representing 100 grams of 18-karat gold, converted against 17-karat mithqal quotes via the constant ratio factor $100 / 4.3318$.
_Avoid_: gram, lot, share, گرم, سهم

---

## Accounting & Analytics

**Realized P&L Points (امتیاز سود/زیان محقق‌شده)**:
The unit-weighted cumulative price difference in compact points accumulated from matched buys and sells over the active accounting window.
_Avoid_: gross profit, dollar P&L, سود خام

**Nominal Realized P&L (سود/زیان تومانی)**:
The physical monetary return in Tomans derived by applying the gold purity weight factor to unrounded P&L points (`Math.round(unroundedPoints * 100 / 4.3318 * 1000)`).
_Avoid_: estimated profit, fiat P&L, سود تقریبی

**Synthetic Settlement (حواله تسویه)**:
An accounting trade at the official settlement price that closes one participant's nonzero position, with no counterparty and no outbound order. It contributes to accounting statistics but is not a market receipt.
_Avoid_: normal trade, market trade, معامله عادی

**Settlement Boundary (مرز تسویه)**:
The group message ID of an accepted successful settlement announcement, separating two accounting periods. Receipt arrival time does not determine the period.
_Avoid_: scheduled close, daily reset, بازنشانی روزانه

**Zero-position Baseline (مبنای موجودی صفر)**:
The first trusted settlement boundary from which positions start flat when prior inventory is unproven. It does not establish historical P&L reliability or prove later receipt coverage.
_Avoid_: complete history, verified inventory history, تاریخچه کامل

**Receipt Coverage (پوشش حواله‌ها)**:
Evidence that the receipts belonging to an accounting interval have been accounted for. Accessible Telegram history and message ID gaps alone do not prove this coverage.
_Avoid_: baseline validity, transport guarantee, تضمین دریافت

**Rolling Window (پنجره محاسباتی ۷ روزه)**:
A dynamic 7-day query filter applied to completed trades for calculating leaderboard rankings and participant metrics. Never used as a data retention or pruning TTL.
_Avoid_: retention period, expiry window, دوره انقضا

**Confidence Tier (سطح اطمینان داده)**:
An analytical badge (`HIGH`, `ESTIMATED`, `UNVERIFIED_INVENTORY`) reflecting historical data completeness and flat-position zero-crossing resets for a participant.
_Avoid_: reputation score, trust level, رتبه اعتبار

---

## Participants & Identity

**Participant (شرکت‌کننده)**:
An OTC market actor recognized primarily by their canonical Persian alias broadcast in bot receipts and orders.
_Avoid_: customer, account, client, کاربر, مشتری

**Participant Alias (نام مستعار)**:
The normalized Persian text identifier assigned by the group management bot (e.g. `سناتور`, `رسول اُف`) serving as the primary key in `Participant`.
_Avoid_: username, handle, شناسه کاربری

**Identity Resolution (تطبیق هویت)**:
The conservative deterministic process of associating a Persian participant alias with a specific Telegram user ID.
_Avoid_: account linking, KYC, احراز هویت

**Resolution Level (سطح مدرک تطبیق)**:
The evidentiary weight of a link observation: Level 1 (direct reply/mention) or Level 2 (isolated sequence within 1.5 seconds), requiring 5 corroborations without contradictions to become `VERIFIED`.
_Avoid_: verification score, probabilistic match, تطبیق تقریبی

---

## Order Flow & Execution

**Request (درخواست)**:
A user-defined conditional instruction (`ALERT`, `BUY`, `SELL`) registered on the platform with an execution threshold (`GTE`, `LTE`) and target price.
_Avoid_: order, limit order, سفارش, معامله

**Execution Phase Machine (مراحل چرخه اجرا)**:
The deterministic progression of a request: `WAITING_TRADE` → `CLAIMED` (atomic token) → `SENDING` → `DONE` / `FAILED` / `CANCELLED`.
_Avoid_: order status, workflow, وضعیت سفارش

**Force-Send (ارسال فوری)**:
An explicit user command that bypasses automatic trade threshold matching and immediately claims and dispatches the formatted order command to the Telegram group.
_Avoid_: market order, instant execution, خرید فوری

**Telegram Session (سشن تلگرام)**:
An isolated MTProto client instance authenticated under a verified user's Telegram credentials, stored in SQLite on the worker volume, and governed by an OS file lock.
_Avoid_: bot token, web session, نشست وب
