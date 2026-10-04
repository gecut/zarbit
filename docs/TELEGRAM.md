# Zarbit — Telegram Integration

## Identity and secrets

- **Mini App Authentication**: The API verifies Telegram Mini App `initData` using the bot token HMAC (`WebAppData`), checking for expiration (max 24 hours) and allowlist authorization (`ALLOWED_TELEGRAM_USER_IDS`). Client-supplied user IDs and `initDataUnsafe` are never trusted.
- **Account Binding Invariant**: The authenticated MTProto account ID must exactly match the verified Telegram user ID of the Mini App opener. If a user enters credentials for a different account, the mismatch is rejected immediately and the session is logged out.
- **Credential Segregation**: `TELEGRAM_API_ID` and `TELEGRAM_API_HASH` belong to the product's Telegram application and are supplied exclusively to the worker. End users never provide API credentials. The bot never receives phone codes or passwords.

## OTP and login contract

- All public endpoints require Mini App authentication and return `Cache-Control: no-store` responses.
- Login flow: phone number → SMS/app verification code → optional two-step password (2FA). QR login is unsupported.
- Challenges have a 10-minute lifetime and permit up to 5 invalid attempts before expiration.
- Send rate limits: maximum 3 code requests per rolling 15-minute window, persisted in `LoginRateLimit`.
- OTP codes, passwords, and challenge state live in short-lived worker memory and are never persisted to the database or written to logs.

## Group market data ingestion

The worker's connected sessions subscribe to incoming messages in `TELEGRAM_GROUP_ID`:

- **Peer Resolution**: Worker dialogs (including archived dialogs) are resolved on startup to obtain the group's `accessHash`. Worker sessions never join groups automatically.
- **Membership**: Group membership is validated upon login and periodically re-verified. Non-members remain authorized in the database (`NOT_IN_GROUP`) but dormant.
- **Authoritative Quotes**: Canonical bot quote messages (`🟡 مظنه: <number> 🟡`) from the group management bot are parsed via `parseCanonicalBotQuote` and recorded into `QuoteHistory`.
- **Authoritative Trade Receipts**: Bot trade receipts (`حواله`) are parsed via `parseTradeReceipt` and recorded permanently into `Trade`.
- **Active Orders & Taker Commands**: Canonical bot orders (`🔵 ... / 🔴 ...`) update the in-memory `BoundedOrderCache`. Human order intents (`خ`, `ف`, `ب`, `ن`) are recorded in `TradingAction`.
- **Idempotency**: All message ingestion models enforce unique constraints on `sourceMessageId` (or `(chatId, sourceMessageId)`). Multiple sessions observing the same message concurrently result in one committed record (`count === 1`) and safe duplicate discards (`count === 0`).

## Request matching and execution engine

The worker executes user trading requests (`Request`):

1. **Matching**: When a confirmed trade is recorded, the worker durably claims eligible `WAITING_TRADE` requests. Both initial matching and the atomic transition to sending require a trade at most 60 seconds old, newer than request creation/editing. Quotes never trigger requests. See `docs/OPERATIONS.md` for restart recovery.
2. **Atomic Claim**: The request is transitioned to `CLAIMED` inside a database transaction using an atomic update with a unique `claimToken`.
3. **Delivery**: The session transitions the request to `SENDING` and posts the formatted order command (e.g. `1خ105020`) to the Telegram group using MTProto.
4. **Completion**: Upon successful delivery, the request is marked `DONE` with `outgoingMessageId`. If transmission fails, it transitions to `FAILED` with error metadata.
5. **Immediate Execution («ارسال فوری»)**: Users may bypass trade matching via `requests.forceSend`, which claims and sends the order immediately.

## Session lifecycle and failure handling

Worker instances solely own session files with exclusive SQLite OS locks (see [ADR 0002](adr/0002-single-worker-ownership-of-mtproto-sessions.md)).

- **Network Interruption**: Network outages retain session authorization files. Reconnection uses exponential backoff (from 10 seconds up to a 5-minute ceiling) and marks connection status `DEGRADED`.
- **Revocation**: Disconnect requests immediately record `REVOKING` in PostgreSQL. The worker then logs out the MTProto client, closes the SQLite database, deletes the session files (`<hex>.sqlite`), and marks the state `REVOKED`.
- **Offline Resilience**: Session cancellation and revocation are transactionally committed to PostgreSQL by the server before asynchronous worker dispatch. Unsent `WAITING_TRADE` or `CLAIMED` requests are cancelled under database row locks, guaranteeing user logout succeeds even if the worker is restarting.

## Asynchronous operations (Contract v3)

Public Telegram procedures use contract version 3 (`X-Zarbit-Telegram-Contract: 3`):

- `telegram.command`: Submits an operation UUID (`operationId`) and command payload (`login`, `code`, `password`, `resend`, `cancel`, `membership`, `revoke`). Returns `{ operationId, acceptedAt }` immediately (HTTP 200).
- `telegram.operation`: Durable operation status endpoint (`GET /rpc/telegram/operation/{id}`). Returns current progress (`ACCEPTED`, `RUNNING`, `SUCCEEDED`, `FAILED`, `CANCEL_REQUESTED`, `CANCELLED`, `INTERRUPTED`) and safe outcome metadata.
- Completed operations are retained in PostgreSQL (`TelegramOperation`) for 24 hours. They contain no phone numbers, OTPs, passwords, or session hashes.
- `WORKER_DIAGNOSTIC_USER_ID` (`00000000-0000-0000-0000-000000000000`) is supported for inspecting worker health and session status without requiring an allowlisted user record.

## Logs and diagnostics

Operational logging uses Pino JSON with structured correlation metadata:

- Sensitive credentials, phone numbers, OTP codes, 2FA passwords, request bodies, and raw Telegram message texts are redacted or omitted.
- Logs use opaque references (`sessionRef`, `challengeRef`) and standardized event names (e.g. `telegram.quote.recorded`, `telegram.trade.recorded`, `telegram.login.started`).

## Settlement ingestion

The shared financial coordinator is attached before session initialization. Its durable inbox is independent of per-session serialization and memory deduplication. With settlement enabled, startup/reconnect closes the request/financial gate, reads a fixed group history head and catches up from the durable cursor, initially just before `SETTLEMENT_BOOTSTRAP_MESSAGE_ID`. History scan success is not receipt coverage certification. Failed recovery persists `historyRecoveryRequired` and blocks financial application.

Settlement uses numeric `SETTLEMENT_SENDER_ID`; quotes/receipts continue using `QUOTE_SENDER_ID`. Ambiguous receipt candidates are persisted for review even when the senders differ. The parser remains unavailable until exact raw Telegram evidence is provided, and enabling ingestion currently fails startup. No settlement processing sends Telegram orders or wakes trade requests. See [operations](OPERATIONS.md#settlement-release-and-manual-coverage-review) for coverage approval and correction-detection limits.
