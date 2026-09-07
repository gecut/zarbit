# Zarbit — Business Rules

## Quote

Only a new message in the fixed Telegram group from the configured publisher qualifies. The parser accepts an independent compact integer or `مظنه: number`, including Persian/Arabic digits and grouped commas; it rejects unrelated or combined text.

The database retains the compact value, such as `95900`. The API and web application display `95,900,000 تومان`. `announcedAt` is the original Telegram message date. One global latest-quote record exists; an older message cannot replace a newer message, while duplicate observations are idempotent.

## Ownership and readiness

Mini App signature and allowlist authorize API access. MTProto login must connect the same account as the Mini App identity. Connected, group-member accounts observe valid quote events; each observation updates the same global latest quote.

## Product limits

Up to 20 simultaneous Telegram clients including OTP and recovery; one worker, group and publisher. Fixed environment allowlist requires restart. No automatic group joining, order execution, alerts, accounting, quote history, public signup or distributed infrastructure.

## Validation policy

TypeScript, production builds and native dependency checks remain automated. Real Telegram and UI acceptance is performed manually by the owner.
