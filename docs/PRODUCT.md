# Zarbit — Product Specification

## Scope

Private Persian/RTL Telegram Mini App that displays the latest gold quote and market intelligence from one fixed group and authoritative group bot. Up to 20 simultaneous Telegram clients support login, recovery, and message observation. Phase 1 focuses strictly on data collection and market data foundation: persisting `Participant`, `TradingAction`, `Trade`, and `QuoteHistory`. No public signup, billing, admin, portfolio, whale cards or Follow execution is introduced by Home. Existing trader/analytics navigation remains independent.

## Access and login

The API verifies Telegram Mini App initData and ALLOWED_TELEGRAM_USER_IDS before any private access. OTP does not replace this identity check. Each authorized user connects only their own Telegram account through phone number → Telegram login code → two-step password if required. QR login has been removed.

The product owner supplies global TELEGRAM_API_ID/HASH on the worker. End users never provide application credentials. Telegram determines code delivery and length; SMS is not guaranteed. Codes/passwords are never accepted in the bot.

An authenticated account must have exactly the same Telegram ID as the Mini App opener. Mismatches are rejected and the newly authorized session is logged out.

## Session lifecycle

Stored states: PENDING_OTP, ACTIVE, NOT_IN_GROUP, REVOKING, REVOKED, ERROR. DISCONNECTED is the API representation when no record exists. Live connectivity and stored authorization are separate.

- Nonmembers retain an inactive authorized session and may recheck membership without another OTP.

## Screens

Home displays the latest official Quote and latest completed Trade as full Toman figures, their signed compact-price difference, and real announcement timestamp. Header status means the current user’s Telegram connection, never global market health. Active Requests show their count and an explicit «درخواست جدید» action. Bottom navigation remains خانه / سوابق / معامله‌گران / تنظیمات. Market stream and Telegram errors remain local. Settings preserve the existing Telegram login/session lifecycle.

The existing compact mobile layout, RTL and Vazirmatn font remain. HeroUI semantic tokens define colors, surfaces, states, focus, shadows and radii. Theme can follow Telegram/system or be set manually to light/dark. The update prompt never forces a reload.

## Quote and market data

Telegram, PostgreSQL, API responses, and requests retain the compact integer, such as `105020`. Only the primary latest-quote and latest-trade figures on the dashboard display Toman formatting (e.g. `105,020,000 تومان`); other internal prices remain compact. `QuoteHistory` is persisted in PostgreSQL to provide authoritative latest-quote resolution, auditability, and historical analysis. Completed trades are recorded strictly from authoritative bot receipts into `Trade` and retained permanently.

## Release validation

Typecheck, production builds and native dependency checks remain. Functional Telegram validation is performed by the owner with real accounts; a successful build is not proof that group delivery is operating.
