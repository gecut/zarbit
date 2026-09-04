# Zarbit — Product Specification

> Status: Baseline specification for implementation by Codex/LLM agents.
> Scope: MVP.
> Language: English for machine-readability; product UI may be Persian/RTL.

## 1. Product Summary

Zarbit is a private Telegram Mini App plus user-owned Telegram automation system for a gold-trading group.

The system watches a specific Telegram group where gold quote messages ("مظنه") are published in a fixed format. Authorized users create one-shot requests in the Mini App based on a target price.

A request may:

- only notify the user when the price condition is reached;
- automatically send a buy order to the group;
- automatically send a sell order to the group.

Once a request reaches its target and its action is handled, that request is finished.

## 2. Core User Problem

Users currently need to manually watch new gold quote messages and react when a price reaches a desired level.

Zarbit reduces this manual monitoring by letting an authorized user define:

1. whether the trigger is above or below a price;
2. the target price;
3. whether the system should only alert or place a trade;
4. for trades, whether the action is buy or sell;
5. for trades, how many units should be used.

## 3. Product Actors

### 3.1 Authorized Mini App User

A Telegram user whose Telegram user ID is explicitly allowed by server configuration.

Authorized users can:

- open the Telegram Mini App;
- create requests;
- view requests;
- edit active requests;
- cancel active requests;
- receive notifications;
- create alert, buy, and sell requests.

There is no public registration flow.

### 3.2 Telegram Bot

A standard Telegram Bot API bot.

Responsibilities:

- launch/open the Mini App;
- send private notifications to authorized users.

It does not execute trades in the trading group.

### 3.3 Telegram User Account / MTProto session

Each authorized Mini App user connects their own Telegram account via QR-only MTProto login using mtcute.

Responsibilities:

- stay connected to the fixed target trading group;
- receive quote messages from the configured source;
- reply to the triggering quote message from that same user's account when one of that user's buy/sell requests matches.

The product accepts up to 20 active sessions. The application credentials are global server secrets; users never provide `TELEGRAM_API_ID` or `TELEGRAM_API_HASH`.

## 4. Main User Flow

### 4.1 Create Alert

1. User opens Mini App.
2. User selects:
   - price condition: greater/equal or less/equal;
   - target price;
   - action: alert.
3. Request becomes `ACTIVE`.
4. A quote message arrives.
5. If quote satisfies the condition:
   - bot sends a private notification;
   - request becomes `DONE`.

### 4.2 Create Buy/Sell Request

1. User opens Mini App.
2. User selects:
   - price condition;
   - target price;
   - action: buy or sell;
   - unit count.
3. Request becomes `ACTIVE`.
4. A quote message arrives.
5. If quote satisfies the condition:
   - system claims the request so it cannot execute twice;
   - their connected Telegram account replies to that exact quote message;
   - trade message uses the quote that triggered the request;
   - request becomes `DONE`;
   - user receives a private notification.

If sending the trade message fails, the request becomes `FAILED` and the user is informed.

## 5. Price Representation

The Telegram group publishes compact quote values such as:

```text
95900
96155
95100
```

The format may naturally grow from 5 digits to 6 digits when the market price crosses that range. The parser must never assume a fixed digit count.

The Mini App displays/accepts the human-facing full price format, for example:

```text
95,900,000
```

Price conversion between UI representation and Telegram quote representation must be centralized in one domain utility and must not be duplicated across components.

## 6. Request Model

Conceptually:

```ts
type RequestCondition = "LTE" | "GTE";
type RequestAction = "ALERT" | "BUY" | "SELL";
type RequestStatus = "ACTIVE" | "DONE" | "CANCELLED" | "FAILED";

type Request = {
  id: string;
  userId: string;
  condition: RequestCondition;
  targetPrice: number;
  action: RequestAction;
  units: number | null;
  status: RequestStatus;
  createdAt: Date;
  updatedAt: Date;
};
```

Rules:

- `units` is required for `BUY` and `SELL`;
- `units` is not used for `ALERT`;
- every request is one-shot;
- multiple active requests per user are allowed;
- multiple requests may match the same quote;
- only `ACTIVE` requests may be triggered;
- users may view, edit, and cancel active requests.

## 7. Access Control

The Mini App is private.

Authorized Telegram user IDs are configured server-side, preferably through environment configuration:

```env
ALLOWED_TELEGRAM_USER_IDS=123456789,987654321
```

The server must never trust a Telegram user ID supplied directly by the frontend.

Authorization flow:

```text
Telegram Mini App
  -> initData
  -> server validation
  -> authenticated Telegram user
  -> allowlist check
  -> application access
```

## 8. MVP Screens

Recommended minimal screens:

- Dashboard
- New Request
- Active Requests
- Completed / Historical Requests
- Edit Request

No public website, SEO surface, CMS, account registration, password login, or administration panel is required for MVP.

## 9. Explicit Non-Goals

Do not add these unless separately requested:

- multiple trading groups;
- dynamic quote sources;
- public user signup;
- subscription/billing;
- complex RBAC;
- Redis;
- BullMQ;
- Kafka;
- event sourcing;
- microservices;
- advanced trading strategies;
- stop-loss/take-profit chains;
- recurring orders;
- portfolio accounting;
- automatic reconciliation with external exchanges;
- analytics platform;
- SSR/SEO requirements.

## 10. Product Simplicity Rule

Zarbit is intentionally small.

Implementation should prefer:

- direct and readable code;
- explicit domain functions;
- small modules;
- minimal dependencies;
- few abstractions;
- deterministic business rules.

Do not introduce infrastructure or patterns merely because they are common in larger trading systems.
