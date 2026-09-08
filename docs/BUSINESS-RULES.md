# Zarbit — Business Rules

## Quote

Only a new message in the fixed Telegram group from the configured publisher qualifies. The parser accepts an independent compact integer or `مظنه: number`, including Persian/Arabic digits and grouped commas; it rejects unrelated or combined text.

The database, API, requests, and Telegram messages retain the compact value, such as `95900`. Only the primary latest-quote figure on the dashboard displays `95,900,000 تومان`; other price displays remain compact. `announcedAt` is the original Telegram message date. One global latest-quote record exists; an older message cannot replace a newer message, while duplicate observations are idempotent.

## Ownership and readiness

Mini App signature and allowlist authorize API access. MTProto login must connect the same account as the Mini App identity. Connected, group-member accounts observe valid quote events; each observation updates the same global latest quote.

## Product limits

Up to 20 simultaneous Telegram clients including OTP and recovery; one worker, group and publisher. Fixed environment allowlist requires restart. No automatic group joining, order execution, alerts, accounting, quote history, public signup or distributed infrastructure.

## Validation policy

TypeScript, production builds and native dependency checks remain automated. Real Telegram and UI acceptance is performed manually by the owner.
