# Zarbit — Telegram Integration

## Identity and secrets

Mini App initData is verified with the bot-token HMAC, expiration and allowlist. Never trust initDataUnsafe or a client-supplied user ID. The MTProto account ID must then exactly equal that verified Mini App identity.

TELEGRAM_API_ID/HASH belong to the product's Telegram application and are provided only to the worker. Bot token is shared by server (launcher) and worker (notifications). The bot never receives phone codes or passwords.

## OTP contract

All public endpoints require Mini App authentication and return no-store responses:

| Method | Path                                     | Purpose                                                    |
| ------ | ---------------------------------------- | ---------------------------------------------------------- |
| GET    | /api/telegram-session/status             | Stored state, live connection, readiness and pending login |
| POST   | /api/telegram-session/login              | Begin with international phone number                      |
| POST   | /api/telegram-session/login/:id/code     | Verify code                                                |
| POST   | /api/telegram-session/login/:id/password | Verify two-step password                                   |
| POST   | /api/telegram-session/login/:id/resend   | Allowed resend                                             |
| DELETE | /api/telegram-session/login/:id          | Cancel pending login                                       |
| POST   | /api/telegram-session/membership-check   | Recheck membership                                         |
| DELETE | /api/telegram-session                    | Persist and perform disconnect                             |

QR routes are removed. Login uses sendCode, signIn and checkPassword; recovery uses connect/getMe, never an interactive terminal prompt.

One random challenge per owner, ten-minute lifetime, at most five invalid code/password attempts. At most three sends per owner and HMAC-hashed phone key, with a conservative 15-minute window extended by each send. Resend waits at least 60 seconds or Telegram's longer timeout. Flood waits are enforced, not silently slept through.

Telegram app codes, SMS, calls, SMS word/phrase are supported. Other delivery methods terminate with a Persian explanation; no QR fallback. Delivery/length come from Telegram, not fixed UI assumptions. See [Telegram authorization](https://core.telegram.org/api/auth).

Phone and phoneCodeHash remain only in short-lived worker memory. UI receives only a masked number. OTP/password/hash never enter app database, logs, URLs, localStorage, bot or persistent query cache. Refresh resumes a current challenge; worker restart expires incomplete login and restores authorized sessions.

## Group access and execution

The adapter loads dialogs, including archived dialogs, to resolve the private group's peer/access hash. It never joins groups automatically. Membership is checked after login, periodically and before every matched action. Nonmembers remain authorized but dormant.

Only new messages from TELEGRAM_GROUP_ID and QUOTE_SENDER_ID qualify. Parser accepts an independent compact number or «مظنه: 95900», including Persian/Arabic digits and grouped commas. It rejects unrelated text and combined numbers. Edited messages are not new triggers.

Each client evaluates only its owner's requests. Trade builders emit units + خ/ف + actual triggering quote, with replyTo set to the exact source message. No forwarding.

Automatic RPC middleware retries are disabled for this client so ambiguous financial sends are not replayed by application retry logic. MTProto transport protocol recovery remains the library's responsibility.

## Failures and disconnect

Network outage: authorization file retained, runtime unavailable, bounded reconnect backoff. Revocation: session invalidated, unclaimed requests cancelled, bot notification attempted. Membership loss: inactive session retained, unclaimed requests cancelled. Rejoining does not resurrect requests.

Disconnect first stores REVOKING and cancels only unclaimed requests, even if the worker is offline. Worker logs out, closes storage, then removes recognized files and reports REVOKED. In-flight sends may already have reached the group.

A lost/unknown send response is FAILED with a request to inspect the group. Never resend such trades automatically. A successful trade's bot notification failure cannot change its outcome.

## Logs and manual verification

Operational logs contain event names and opaque user/request IDs, not raw Telegram errors or credentials. All user-facing failures are Persian.

The owner performs real-account checks: own-account OTP/2FA, mismatched identity rejection, private-group access, correct-account replies, membership loss, revoked session and disconnect. No real Telegram operations are part of build or CI.
