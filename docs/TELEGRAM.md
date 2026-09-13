# Zarbit — Telegram Integration

## Identity and secrets

Mini App initData is verified with the bot-token HMAC, expiration and allowlist. Never trust initDataUnsafe or a client-supplied user ID. The MTProto account ID must then exactly equal that verified Mini App identity.

TELEGRAM_API_ID/HASH belong to the product's Telegram application and are provided only to the worker. The bot never receives phone codes or passwords.

## OTP contract

All public endpoints require Mini App authentication and return no-store responses. Login supports phone, code, optional two-step password, resend and cancellation. QR routes are removed. One random challenge per owner has a ten-minute lifetime; send and retry limits are persisted. OTP/password/hash stay only in short-lived worker memory and never enter logs or the database.

## Group market data ingestion

The adapter loads dialogs, including archived dialogs, to resolve the private group's peer/access hash. It never joins groups automatically. Membership is checked after login and periodically; nonmembers remain authorized but dormant.

The worker subscribes to incoming messages in `TELEGRAM_GROUP_ID` and extracts complete event metadata: `messageId`, `senderId`, `date`, `text`, `replyToMessageId`, `replyToSenderId`, and MTProto message entities.

- **Authoritative Quotes:** Canonical bot quote messages (`🟡 مظنه: <number> 🟡`) from the group trading bot qualify as the authoritative persisted quote source in `QuoteHistory`.
- **Trading Actions:** Human messages are parsed and recorded as `TradingAction` (`ORDER_BUY`, `ORDER_SELL`, `TAKE_ALL`, `TAKE_QUANTITY`, `CANCEL`) preserving their reply context.
- **Completed Trades:** Authoritative bot receipts (`حواله`) issued by the bot are parsed and recorded into `Trade`.
- **Idempotency:** Multiple active worker sessions observe group messages concurrently; database unique constraints on `sourceMessageId` ensure zero duplicate rows. Unresolved protocol behaviors (e.g. unreplied cancels, auto-cross matching) are preserved as unresolved and never guessed.

## Failures and disconnect

Network outage retains the authorization file and uses bounded reconnect backoff. Revocation invalidates the session. Disconnect first stores REVOKING even while the worker is offline; worker then logs out, closes storage, removes recognized files and reports REVOKED.

## Logs and manual verification

Operational logs use shared Pino JSON events and opaque session/challenge references, not raw Telegram errors or credentials. The owner verifies OTP/2FA, identity mismatch rejection, private-group access, quote persistence/display, membership loss, revocation and disconnect with real accounts.

## Committed Market propagation

`recordQuote` and `recordTrade` notify PostgreSQL inside their insert transaction only when `createMany(skipDuplicates)` reports one new row. NOTIFY delivery happens after commit; rolled-back/duplicate observations do not emit. Payload is type plus sourceMessageId and contains no raw receipt, user identity or session data. One Server listener reads committed rows; Worker never pushes directly to Web/Server. The configured single group remains mandatory for revision semantics. Listener recovery relies on authoritative reads because PostgreSQL notifications are not replayed. Ingestion, Request matching, membership and Telegram command boundaries remain unchanged.
