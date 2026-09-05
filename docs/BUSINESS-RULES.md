# Zarbit — Business Rules

## Prices and source

All UI prices are rial; database/Telegram prices are compact integers. Conversion is centralized in packages/domain: 95,900,000 ↔ 95900. Target must be positive, a multiple of 1000 rial, and fit the compact integer range. Units are positive whole integers for BUY/SELL and null for ALERT.

LTE means quote <= target; GTE means quote >= target. Equality matches. Only a new message in the fixed group from the fixed publisher may trigger a request. Accept an independent number or «مظنه: number»; reject arbitrary numeric text. No fixed five-digit assumption, NLP, forwarding or edit-trigger behavior.

## Ownership and readiness

Mini App signature and allowlist authorize API access. Every request belongs to that verified identity. MTProto login must connect the same account.

Create/edit requires a live ready session and recently verified group membership. Reading history and cancelling unclaimed requests remain available without a worker connection. Each quote listener considers only its owner's requests.

## Request lifecycle

ACTIVE (unclaimed) → atomic claim → DONE / FAILED. Only unclaimed ACTIVE requests can be edited or cancelled. Claimed ACTIVE requests appear as «در حال اجرا». DONE, FAILED and CANCELLED are terminal.

A claim atomically checks owner, session revision/readiness, current condition/price and creation time relative to the quote. The action reads the latest claimed fields, not a stale candidate snapshot. Several requests may independently match a quote.

ALERT sends a private bot notification then finishes. BUY/SELL replies from the owner's Telegram account to the exact triggering message. Payload is units + side + actual quote, without spaces; BUY=خ, SELL=ف. Example: a target of 96000 matched by 95900 sends 1خ95900, never 1خ96000.

## Failure and cancellation

No automatic financial resend. If the send outcome cannot be determined, the request becomes FAILED and explicitly asks the user to inspect group messages before creating another order. A crash with an unfinished claim is treated the same way on recovery. Atomic PostgreSQL claiming is not an exactly-once transaction with Telegram.

A successfully sent trade remains successful when its private notification fails. Notification failure is logged separately.

Membership loss, allowlist removal and disconnect cancel only unclaimed ACTIVE requests in a short transaction with the session state change. Claimed requests are not falsely reported as cancelled. Rechecking membership may reactivate the connection, never cancelled orders. Temporary network failure alone must not delete valid sessions.

## Product limits

Up to 20 simultaneous Telegram clients including OTP and recovery; one worker, group and publisher. Fixed environment allowlist requires restart. No automatic group joining, recurring orders, accounting, reconciliation, exchange settlement, public signup or distributed infrastructure.

## Validation policy

Automated suites were removed at the owner's request. TypeScript, production builds and native dependency checks remain; real Telegram and UI acceptance is performed manually by the owner.
