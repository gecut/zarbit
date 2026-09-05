# Zarbit — Product Specification

## Scope

Private Persian/RTL Telegram Mini App for one-shot gold-price alerts and buy/sell replies. Up to 20 simultaneous Telegram clients, including login and recovery. One fixed trading group, one fixed quote publisher, and an environment allowlist. No public signup, billing, admin, portfolio, recurring orders or horizontal scaling.

## Access and login

The API verifies Telegram Mini App initData and ALLOWED_TELEGRAM_USER_IDS before any private access. OTP does not replace this identity check. Each authorized user connects only their own Telegram account through phone number → Telegram login code → two-step password if required. QR login has been removed.

The product owner supplies global TELEGRAM_API_ID/HASH on the worker. End users never provide application credentials. Telegram determines code delivery and length; SMS is not guaranteed. Codes/passwords are never accepted in the bot.

An authenticated account must have exactly the same Telegram ID as the Mini App opener. Mismatches are rejected and the newly authorized session is logged out.

## Session lifecycle

Stored states: PENDING_OTP, ACTIVE, NOT_IN_GROUP, REVOKING, REVOKED, ERROR. DISCONNECTED is the API representation when no record exists. Live connectivity and stored authorization are separate.

- Create/edit requires a ready connection and verified membership.
- History and cancellation of unclaimed requests remain available during worker outages.
- Nonmembers retain an inactive authorized session and may recheck membership without another OTP.
- Loss of membership or disconnect cancels unclaimed requests. Cancelled requests never reactivate automatically.
- A claimed request is shown as «در حال اجرا», not as cancelled.
- An unknown send outcome is terminal and requires checking the actual group before a new order.

## Screens

Dashboard with active count/recent requests; new/edit request; active requests; paginated, filterable history; Telegram connection with phone/code/password, expiry, resend, cancellation, membership recheck and confirmed disconnect.

The existing compact mobile layout, RTL and Vazirmatn font remain. HeroUI semantic tokens define colors, surfaces, states, focus, shadows and radii. Theme can follow Telegram/system or be set manually to light/dark. The update prompt never forces a reload.

## Prices and actions

Prices displayed/entered are in rial. The shared domain conversion is 95,900,000 ↔ 95900 (integer factor 1000). LTE and GTE include equality. ALERT has no units; BUY/SELL require positive whole units.

A valid quote only executes requests belonging to the receiving account. Buy/sell uses that account and replies to the exact triggering quote with the actual quote, not the target threshold: 1خ95900 or 2ف96155.

## Release validation

At the user's request, automated unit/integration/browser suites are not maintained. Typecheck, production builds and native dependency checks remain. Functional Telegram validation is performed by the owner with real accounts; a successful build is not proof of trade safety.
