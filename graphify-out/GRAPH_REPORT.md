# Graph Report - apps/web/src  (2026-09-07)

## Corpus Check
- Corpus is ~4,556 words - fits in a single context window. You may not need a graph.

## Summary
- 97 nodes · 168 edges · 6 communities
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.57)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Telegram runtime and theme
- App shell and API
- Mock API and scenarios
- Telegram session actions
- Quote dashboard
- Telegram login form

## God Nodes (most connected - your core abstractions)
1. `useApi()` - 8 edges
2. `ApiClient` - 8 edges
3. `initializeTelegramWebApp()` - 7 edges
4. `QuoteDashboardCard()` - 6 edges
5. `useIdentity()` - 6 edges
6. `telegramInitData()` - 6 edges
7. `createMockApi()` - 5 edges
8. `createServerApi()` - 5 edges
9. `useQuoteDashboard()` - 5 edges
10. `useTelegramSession()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `AppRuntime()` --calls--> `initializeTelegramWebApp()`  [EXTRACTED]
  components/app-runtime.tsx → lib/telegram.ts
- `AppRuntime()` --calls--> `applyTheme()`  [EXTRACTED]
  components/app-runtime.tsx → lib/theme.tsx
- `QuoteDashboardCard()` --calls--> `useQuoteDashboard()`  [EXTRACTED]
  components/latest-quote.tsx → lib/quote.ts
- `TelegramConnection()` --calls--> `useSessionCommand()`  [EXTRACTED]
  components/telegram-connection.tsx → lib/telegram-session.ts
- `TelegramConnection()` --calls--> `useTelegramSession()`  [EXTRACTED]
  components/telegram-connection.tsx → lib/telegram-session.ts

## Import Cycles
- None detected.

## Communities (6 total, 0 thin omitted)

### Community 0 - "Telegram runtime and theme"
Cohesion: 0.13
Nodes (14): AppRuntime(), AppRuntimeProps, initializeTelegramWebApp(), TelegramWebApp, applyTheme(), preference(), Theme, ThemePicker() (+6 more)

### Community 1 - "App shell and API"
Cohesion: 0.16
Nodes (12): AppShell(), navigationItems, PwaUpdate(), createServerApi(), request(), serverUrl(), AuthGate(), IdentityContext (+4 more)

### Community 2 - "Mock API and scenarios"
Cohesion: 0.16
Nodes (10): copySession(), createMockApi(), initialSession(), mockIdentity, createQuoteDashboard(), getQuoteScenario(), QuoteScenario, ApiClient (+2 more)

### Community 3 - "Telegram session actions"
Cohesion: 0.22
Nodes (11): ConfirmAction(), TelegramConnection(), states, TelegramConnectionCard(), TelegramConnectionCardProps, SessionCommand, useApi(), useIdentity() (+3 more)

### Community 4 - "Quote dashboard"
Cohesion: 0.20
Nodes (9): formatAxisDate(), formatDate(), formatQuote(), QuoteDashboardCard(), relativeFormatter, timeFormatter, TomanIcon(), useQuoteDashboard() (+1 more)

### Community 5 - "Telegram login form"
Cohesion: 0.33
Nodes (4): deliveryLabels, LoginCredentialFieldProps, TelegramLoginForm(), TelegramLoginFormProps

## Knowledge Gaps
- **24 isolated node(s):** `AppRuntimeProps`, `navigationItems`, `relativeFormatter`, `timeFormatter`, `states` (+19 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ApiClient` connect `Mock API and scenarios` to `App shell and API`?**
  _High betweenness centrality (0.102) - this node is a cross-community bridge._
- **Why does `initializeTelegramWebApp()` connect `Telegram runtime and theme` to `App shell and API`?**
  _High betweenness centrality (0.064) - this node is a cross-community bridge._
- **Why does `useApi()` connect `Telegram session actions` to `App shell and API`, `Mock API and scenarios`, `Quote dashboard`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._
- **What connects `AppRuntimeProps`, `navigationItems`, `relativeFormatter` to the rest of the system?**
  _24 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Telegram runtime and theme` be split into smaller, more focused modules?**
  _Cohesion score 0.1341991341991342 - nodes in this community are weakly interconnected._