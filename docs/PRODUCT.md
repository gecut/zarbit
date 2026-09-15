# Zarbit — Product Specification

## Scope

Zarbit is a private Persian/RTL Telegram Mini App for Iranian OTC gold trading intelligence and execution. It connects to one fixed trading group and authoritative management bot, providing:

1. **Market Terminal**: Displays the latest official gold quote and latest completed trade in full Tomans, their signed difference (premium/discount spread), compact bank prices, announcement timestamps, and a live recent trades tape (up to 10 completed trades).
2. **Order & Alert Radar**: Allows users to register conditional trading requests (`BUY`, `SELL`, `ALERT`) against the official quote (`GTE`, `LTE`), view active orders, monitor execution phase transitions, force immediate delivery to the group («ارسال فوری»), and cancel pending requests.
3. **7-Day Whale Leaderboard & Trader Analytics**: Provides a rolling 7-day performance dashboard (`/traders`) ranking active participants by Realized P&L, Volume, Trade Count, and Average Trade Size, with data coverage confidence indicators (`HIGH`, `ESTIMATED`, `UNVERIFIED_INVENTORY`) and individual trader detail drawers.
4. **MTProto Session Gateway**: Supports up to 20 concurrent Telegram user sessions for observing group trading flow and executing matched client orders under verified user ownership.

**Explicitly unsupported in this release**: Public signup (access is restricted by a fixed allowlist), billing/subscriptions, portfolio management, multi-group support, and automated follow/copy execution (which is deferred to Phase 3).

## Access and authentication

The API verifies the Telegram Mini App `initData` HMAC signature, expiration (max 24 hours), and allowlist (`ALLOWED_TELEGRAM_USER_IDS`) before granting access to any private endpoint.

- Each authorized user connects only their own Telegram account via phone number → Telegram login code → optional two-step verification password.
- QR login is unsupported and has been removed.
- The product owner configures global `TELEGRAM_API_ID` and `TELEGRAM_API_HASH` on the worker; end users never provide API credentials.
- Telegram determines code delivery method (Telegram app message or SMS) and code length. Codes and passwords are never accepted through the bot.
- **Identity Invariant**: The connected MTProto account ID must exactly match the verified Telegram user ID of the Mini App opener. Mismatches are immediately rejected and the newly authorized session is terminated.

## Session lifecycle

Session authorization states in PostgreSQL:

- `PENDING_OTP`: Login challenge initiated; awaiting code or 2FA password.
- `ACTIVE`: Account authenticated and authorized.
- `NOT_IN_GROUP`: Account authenticated, but membership in the target trading group is unconfirmed. Re-checking membership does not require re-authenticating.
- `REVOKING`: User requested disconnect; cleanup in progress.
- `REVOKED`: Session terminated; local storage files deleted.
- `ERROR`: Authentication or runtime failure occurred.
- `DISCONNECTED`: Virtual API status when no session record exists in storage.

Live connectivity (`CONNECTED`, `CONNECTING`, `OFFLINE`, `DEGRADED`) is tracked independently from authorization. Capabilities (`canLogin`, `canSubmitCode`, `canCreateRequest`, `canRevoke`, etc.) are dynamically presented by `presentTelegramSession`.

## Screens and navigation

Bottom navigation dock provides four primary tabs:

1. **خانه (Home)** (`/`): Terminal quote card, execution action strip (`خرید`, `فروش`, `هشدار`), active requests radar, and recent completed trades tape.
2. **سوابق (History)** (`/history`): Archive of past, completed, and cancelled requests with cursor-based infinite scrolling.
3. **معامله‌گران (Traders)** (`/traders`): 7-day rolling performance leaderboard with sorting toolbar, confidence badges, and detailed trader profile drawers.
4. **تنظیمات (Settings)** (`/telegram`): Telegram connection status, login and 2FA forms, group membership verification, session revocation, and theme picker (System / Light / Dark).

UI uses HeroUI semantic tokens, compact mobile layout, RTL direction, and the Vazirmatn font. PWA updates are presented via an explicit update card and never force an abrupt reload.

## Quote, trade and financial invariants

- **Compact Integer Pricing**: Storage (`QuoteHistory.compactQuote`, `Trade.compactPrice`, `Request.targetPrice`), API payloads, and internal calculations retain the compact market integer (e.g. `105020`).
- **Nominal Toman Conversion**: Receipt and display prices convert compact integers to full Tomans using the canonical multiplier:
  $$\text{Price in Tomans} = \text{compactPrice} \times 1000$$
  For example, `105020` converts to `105,020,000 تومان`.
- **Display Rules**: Headline quote and trade figures on the Home dashboard display full Toman formatting; secondary prices and request target prices remain compact integers.
- **Realized P&L**: Analytics calculates realized P&L points in compact integer space (`realizedPnlPoints`), rounded to 2 decimal places, and converts to nominal Tomans via `unroundedRealizedPnlPoints × 100 / 4.3318 × 1000`.
- **Permanent Retention**: Completed trades in `Trade` and reference quotes in `QuoteHistory` are retained permanently. The 7-day rolling window is strictly a query filter for analytics, never a database pruning TTL.

## Release validation

TypeScript compilation (`pnpm check-types`), linting (`pnpm lint`), production bundling (`pnpm build`), and automated unit/integration tests must pass cleanly. Live Telegram validation (login, 2FA, group message reception, and order execution) requires owner verification with real accounts in a controlled staging group.

### Analytics monetary conversion

Each historical and new trading unit represents 100 grams of 18-karat gold.
Recorded compact prices remain 17-karat mithqal quotes. Realized monetary P&L
is `Math.round(sumOfUnroundedPoints * 100 / 4.3318 * 1000)`; negative zero becomes zero.
Sum unrounded closing P&L over the rolling window before converting; never sum
rounded per-trade amounts. API points remain unit-weighted quote differences
rounded to two decimals for display. No raw trades or schemas are rewritten.
Deploy server and web together, restart server caches, and reload existing web
tabs: older web bundles still multiply monetary P&L by 100.

## Primary price and request behavior

The primary Home price is the latest confirmed trade; the official quote is secondary. The spread remains latest trade minus official quote. A connected feed does not imply a fresh trade.

New and edited requests wait for a subsequent confirmed trade. Automatic BUY, SELL and ALERT matching requires a non-future trade at most 60 seconds old. The worker rechecks the latest trade immediately before starting delivery: an invalid condition or expired price returns the request to waiting; a newer qualifying trade replaces the trigger metadata. BUY/SELL messages always use the user's target price. DONE means delivered, not filled. Manual execution remains explicit and bypasses the automatic trade condition.

The form prefills only from a fresh trade; otherwise the price is blank for manual entry. It never substitutes the official quote or a synthetic price.
