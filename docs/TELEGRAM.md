# Zarbit — Telegram Integration

## Identity and secrets

Mini App initData is verified with the bot-token HMAC, expiration and allowlist. Never trust initDataUnsafe or a client-supplied user ID. The MTProto account ID must then exactly equal that verified Mini App identity.

TELEGRAM_API_ID/HASH belong to the product's Telegram application and are provided only to the worker. The bot never receives phone codes or passwords.

## OTP contract

All public endpoints require Mini App authentication and return no-store responses. Login supports phone, code, optional two-step password, resend and cancellation. QR routes are removed. One random challenge per owner has a ten-minute lifetime; send and retry limits are persisted. OTP/password/hash stay only in short-lived worker memory and never enter logs or the database.

## Group quote ingestion

The adapter loads dialogs, including archived dialogs, to resolve the private group's peer/access hash. It never joins groups automatically. Membership is checked after login and periodically; nonmembers remain authorized but dormant.

Only new messages from TELEGRAM_GROUP_ID and QUOTE_SENDER_ID qualify. A valid compact quote is persisted with its original message timestamp. Each active account can observe it, but the PostgreSQL singleton makes the final value global and prevents older events overwriting newer ones.

## Failures and disconnect

Network outage retains the authorization file and uses bounded reconnect backoff. Revocation invalidates the session. Disconnect first stores REVOKING even while the worker is offline; worker then logs out, closes storage, removes recognized files and reports REVOKED.

## Logs and manual verification

Operational logs use shared Pino JSON events and opaque session/challenge references, not raw Telegram errors or credentials. The owner verifies OTP/2FA, identity mismatch rejection, private-group access, quote persistence/display, membership loss, revocation and disconnect with real accounts.
