# ADR 0005: Whale Copy Execution on Raw Trading Actions Instead of Trade Receipts

## Context and Decision

For Phase 3 automated copy trading, copying trades based on bot receipts (`Trade`) arrives too late: by the time a bot publishes a completed receipt, the market liquidity is filled and the trade has already cleared.

We decided that autonomous copy-trade execution must trigger on raw taker commands in `TradingAction` (`خ`, `ف`, `ب`, `ن`) emitted by `VERIFIED` participant identities. Bot receipts (`Trade`) are used exclusively for post-trade reconciliation, execution validation, and P&L accounting.

## Consequences

- Copy-trade execution occurs with sub-second latency directly upon observing the target participant's raw chat message.
- Requires strict risk controls: identity verification threshold ($K \ge 5$ without contradictions), slippage tolerance limits, and automated cancellation on timeout.
- Unverified or ambiguous identities (`CANDIDATE`, `CONFLICT`) are strictly excluded from automated copy triggers.
