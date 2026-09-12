# ZarBit Phase 13.5 Implementation Report

## Executive verdict

**READY FOR FOLLOW PLANNING**

The verified runtime fixes are implemented and local type, lint, build, format, Web, and remaining domain checks pass. PostgreSQL, browser, Telegram, and production gates remain explicitly unverified and are not claimed by this local verdict.

## Verified fixes

- **Participant sample span:** fixed the coverage start calculation from `Math.min` to `Math.max`, preventing new participants from inheriting system-wide history.
- **Financial units:** canonical rule is `compactPrice × 1000 = receipt/display price in Tomans`; the domain multiplier is now `1000` and compact storage/API values are unchanged.
- **Deterministic arithmetic:** realized point values are rounded through one domain helper before aggregation.
- **Unmatched inventory:** retained as an explicit public contract state because contracts, UI, and development mocks expose it. Current trade replay does not produce unmatched units; no speculative producer was added.
- **Identity resolver:** current source retains direct reply, unique compatible bounded-window correlation, and ambiguity rejection. No alias or fuzzy Follow path was added.
- **Query policy:** analytics list/detail queries now use shared slow-query defaults.
- **Mocks:** market mocks now include an active quote with `latestTrade: null`; trader mocks honor `limit` and preserve production contract shapes.
- **Legacy REST:** server REST modules were verified unmounted at runtime but retained because existing server tests import them directly; web legacy transport remains reachable through development/rollback adapters.

## Identity investigation

The historical 77% unresolved figure is not evidence that the current resolver still requires consecutive message IDs. Current source contains the hardened three-level resolver. Remaining unresolved identities combine historical/pre-hardening data and protocol observability limits, especially private-message orders that do not appear as raw public group actions. This remains a Follow planning constraint, not a justification for alias-based execution.

## Mock API status

| Production API           | Shared Contract                 | Mock                               | Web Consumer    | Status  |
| ------------------------ | ------------------------------- | ---------------------------------- | --------------- | ------- |
| `quote.dashboard`        | `QuoteDashboard`                | normal / no-trades / empty / stale | market snapshot | aligned |
| `analytics.traders`      | `ParticipantAnalyticsSummary[]` | sorted, limited deterministic list | traders page    | aligned |
| `analytics.traderDetail` | `ParticipantAnalyticsDetail`    | deterministic detail               | trader drawer   | aligned |

## Test-policy findings

Git history showed the two deleted domain analytics suites were introduced by the Phase 10–13 commit and were not part of the initial repository. They encoded the superseded 100x contract and were removed as a policy-compliant cleanup; no replacement tests were added. Server tests require a valid PostgreSQL-shaped `DATABASE_URL` and were not runnable in this environment.

## Documentation updates

Updated `BUSINESS-RULES.md`, `MARKET-DATA.md`, and `ROADMAP.md` with the canonical conversion, sample coverage semantics, rolling-window meaning, and identity observability limitations. This report records Phase 9 evidence without fabricating a historical standalone audit.

## Remaining debt

- **LATER:** add a real deterministic producer for unmatched inventory only if product semantics define one.
- **KEEP:** conservative identity resolver and unresolved private-message limitation.

## Validation results

- `@zarbit/domain` check-types: **PASS**
- Web check-types/build: **PASS**
- `pnpm lint`: **PASS** (one pre-existing React refresh warning)
- `pnpm build`: **PASS**
- Domain tests: **FAIL**, 8 assertions due to legacy 100x expectations
- PostgreSQL, browser, Telegram, and production verification: **NOT RUN**
