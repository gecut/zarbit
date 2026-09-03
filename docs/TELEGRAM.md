# Zarbit — Telegram Integration

> Scope: Telegram Mini App authentication, Bot API notifications, and MTProto self-bot behavior.

## 1. Telegram Identities

Zarbit uses two separate Telegram identities.

### 1.1 Standard Bot

Library:

```text
grammY
```

Responsibilities:

- provide the Mini App entry point;
- send private notifications to users.

It does not listen to or execute trades in the trading group unless separately required.

### 1.2 Self-bot User Account

Library:

```text
mtcute
```

Runtime:

```text
Node.js
```

Responsibilities:

- maintain an MTProto user session;
- listen to the configured trading group;
- receive quote messages;
- reply to quote messages with trade instructions.

Only one self-bot account is supported in MVP.

## 2. Worker Placement

The self-bot must run in:

```text
apps/worker
```

It is a long-running process and is not part of the Hono HTTP request lifecycle.

Recommended structure:

```text
apps/worker/src/
  index.ts
  telegram/
    client.ts
    listener.ts
    messages/
      trade.ts
      alert.ts
      notification.ts
  quote/
    parse-quote.ts
  requests/
    process-quote.ts
```

Exact filenames may adapt to repository conventions.

## 3. MTProto Configuration

Required configuration:

```env
TELEGRAM_API_ID=
TELEGRAM_API_HASH=
TELEGRAM_GROUP_ID=
QUOTE_SENDER_ID=
```

Session persistence must survive process restarts.

Do not require interactive Telegram login on every deployment.

The chosen mtcute storage/session mechanism should be persisted on the production volume when necessary.

## 4. Message Intake

The worker only processes a message as a quote when:

```text
chat == TELEGRAM_GROUP_ID
AND
sender == QUOTE_SENDER_ID
AND
message matches known quote format
```

Everything else is ignored.

Do not attempt generic NLP extraction from arbitrary messages.

## 5. Quote Parser Contract

Parser responsibility:

```text
Telegram message text
  -> valid compact quote integer
  OR
  -> no result
```

Examples of valid quote values:

```text
95900
95100
96155
100000
```

Do not require exactly five digits.

The parser must match the actual known quote message structure.

## 6. Trade Reply Format

Outgoing trade payload:

```text
[units][side][quote]
```

Side mapping:

```text
BUY  -> خ
SELL -> ف
```

Examples:

```text
1خ95900
2ف96155
```

The outgoing message must be a reply to the exact quote message that caused the trigger.

## 7. Message Builders

Telegram text is treated as presentation/configurable protocol, not embedded business logic.

Required design principle:

```ts
buildTradeMessage(...)
buildAlertMessage(...)
buildTradeSuccessMessage(...)
buildTradeFailureMessage(...)
```

or equivalent functions.

No route handler, request matcher, or database function should manually construct Telegram message strings.

This is mandatory because group message formats may change later.

## 8. Trigger Price vs Target Price

The target price decides whether a request matches.

The outgoing trade message uses the actual incoming quote.

Example:

```text
Request target:
96000

Triggering quote:
95900

Outgoing:
1خ95900
```

Never substitute the target price into the outgoing trade payload.

## 9. New vs Edited Messages

MVP processes new quote messages only.

Edited messages must be ignored as trigger events.

If edited-message behavior is introduced later, it must be explicitly specified in the business rules first.

## 10. Forwarding

The target group disables message forwarding.

No feature depends on forwarding.

The self-bot:

- receives updates directly as a group member;
- replies directly to the original quote message.

## 11. Duplicate Execution Protection

Telegram may deliver updates close together, and several quote messages may satisfy the same request.

The worker must not rely on event timing to prevent duplicates.

Before sending any one-shot action:

```text
claim ACTIVE request atomically
```

Only the successful claimant may execute it.

A second concurrent event must see that the request is no longer eligible.

## 12. Error Handling

### Trade Send Failure

If sending a buy/sell reply fails:

```text
request -> FAILED
```

Do not blindly retry financial actions.

Send a private failure notification through the normal bot if possible.

### Notification Failure

Notification delivery failure should be logged.

It must not cause a successfully sent trade to be sent again.

## 13. Telegram Mini App Authentication

The Mini App uses Telegram-provided initialization data.

Flow:

```text
Telegram opens Mini App
  -> frontend receives initData
  -> frontend sends initData to server
  -> server validates authenticity
  -> server extracts Telegram user ID
  -> server checks allowlist
```

Server-side validation is mandatory.

Do not trust:

- client-supplied Telegram user IDs;
- client-supplied authorization flags;
- frontend-only allowlist checks.

## 14. Allowlist

Recommended environment representation:

```env
ALLOWED_TELEGRAM_USER_IDS=123456789,987654321
```

The env layer should parse this into a validated list/set.

There is no registration or invitation workflow in MVP.

## 15. Bot Responsibilities

grammY bot should remain small.

Expected use cases:

- Mini App launcher/button;
- alert notification;
- trade success notification;
- trade failure notification.

Do not put request matching or quote parsing inside grammY handlers.

## 16. Logging

Useful events:

```text
telegram.worker.connected
telegram.worker.disconnected
telegram.quote.received
telegram.quote.rejected
telegram.request.matched
telegram.trade.sent
telegram.trade.failed
telegram.notification.sent
telegram.notification.failed
```

Logs must not expose:

- API hash;
- bot token;
- session secrets;
- raw Mini App auth secrets.

## 17. Deployment

The mtcute worker:

- is deployed as a separate Docker service;
- has a single replica;
- must restart automatically on failure;
- does not require a public domain;
- must use persistent storage where its session implementation requires it.

The server and web applications may scale independently, but MVP does not require horizontal scaling.

## 18. Integration Boundary Rule

Keep Telegram-specific objects at the edge.

Prefer transforming mtcute messages into a small internal representation:

```ts
type QuoteEvent = {
  quote: number;
  chatId: string;
  messageId: number;
  receivedAt: Date;
};
```

Domain/request logic should operate on internal values instead of deep mtcute object graphs.

This keeps future Telegram formatting/library changes localized.
