# Zarbit — Product Specification

## Scope

Private Persian/RTL Telegram Mini App that displays the latest gold quote from one fixed group and publisher. Up to 20 simultaneous Telegram clients support login and recovery. No public signup, billing, admin, portfolio, orders or horizontal scaling.

## Access and login

The API verifies Telegram Mini App initData and ALLOWED_TELEGRAM_USER_IDS before any private access. OTP does not replace this identity check. Each authorized user connects only their own Telegram account through phone number → Telegram login code → two-step password if required. QR login has been removed.

The product owner supplies global TELEGRAM_API_ID/HASH on the worker. End users never provide application credentials. Telegram determines code delivery and length; SMS is not guaranteed. Codes/passwords are never accepted in the bot.

An authenticated account must have exactly the same Telegram ID as the Mini App opener. Mismatches are rejected and the newly authorized session is logged out.

## Session lifecycle

Stored states: PENDING_OTP, ACTIVE, NOT_IN_GROUP, REVOKING, REVOKED, ERROR. DISCONNECTED is the API representation when no record exists. Live connectivity and stored authorization are separate.

- Nonmembers retain an inactive authorized session and may recheck membership without another OTP.

## Screens

Dashboard with the latest quote and its announcement time; Telegram connection with phone/code/password, expiry, resend, cancellation, membership recheck and confirmed disconnect.

The existing compact mobile layout, RTL and Vazirmatn font remain. HeroUI semantic tokens define colors, surfaces, states, focus, shadows and radii. Theme can follow Telegram/system or be set manually to light/dark. The update prompt never forces a reload.

## Quote

Telegram, PostgreSQL, API responses, and requests retain the compact integer, such as `95900`. Only the primary latest-quote figure on the dashboard displays `95,900,000 تومان`; other prices remain compact. The global latest quote records the Telegram message timestamp and does not maintain quote history in this phase.

## Release validation

Typecheck, production builds and native dependency checks remain. Functional Telegram validation is performed by the owner with real accounts; a successful build is not proof that group delivery is operating.
