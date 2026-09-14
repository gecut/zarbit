# Graph Report - apps/web  (2026-09-14)

## Corpus Check
- 74 files · ~17,193 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 360 nodes · 628 edges · 21 communities (17 shown, 4 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 29 edges (avg confidence: 0.61)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `2e6a6f04`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- api-provider.tsx
- useApi
- dependencies
- _telegram-session-panel.tsx
- _terminal-quote-header.tsx
- devDependencies
- orpc.ts
- drawer.tsx
- harness.tsx
- scripts
- compilerOptions
- MarketLive
- app-shell.tsx
- _theme-picker.tsx
- history.tsx
- home-terminal.spec.ts
- playwright.config.ts

## God Nodes (most connected - your core abstractions)
1. `useApi()` - 21 edges
2. `useIdentity()` - 18 edges
3. `MarketLive` - 13 edges
4. `scripts` - 12 edges
5. `compilerOptions` - 11 edges
6. `RequestDetailsDrawer()` - 9 edges
7. `ApiProvider()` - 8 edges
8. `resolveTelegramSessionPresentation()` - 8 edges
9. `TraderDetailDrawer()` - 8 edges
10. `useRequestActions()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `Harness()` --indirect_call--> `createQueryClient()`  [INFERRED]
  apps/web/e2e/harness.tsx → apps/web/src/shared/api/query-client.ts
- `Identity()` --calls--> `useIdentity()`  [EXTRACTED]
  apps/web/e2e/harness.tsx → apps/web/src/shared/auth/auth.tsx
- `ApiProvider()` --indirect_call--> `telegramInitData()`  [INFERRED]
  apps/web/src/app/api-provider.tsx → apps/web/src/shared/telegram/telegram.ts
- `AppRuntime()` --calls--> `initializeTelegramWebApp()`  [EXTRACTED]
  apps/web/src/app/app-runtime.tsx → apps/web/src/shared/telegram/telegram.ts
- `AppRuntime()` --calls--> `applyTheme()`  [EXTRACTED]
  apps/web/src/app/app-runtime.tsx → apps/web/src/shared/theme/theme.ts

## Import Cycles
- None detected.

## Communities (21 total, 4 thin omitted)

### Community 0 - "api-provider.tsx"
Cohesion: 0.14
Nodes (14): ApiProvider(), AppRuntimeProps, createMarketMock(), createMarketFixtures(), MarketScenario, marketScenarios, mockEpoch, createMockLiveIterator() (+6 more)

### Community 1 - "useApi"
Cohesion: 0.09
Nodes (39): useMarket(), RequestCard(), RequestCardProps, RequestDetailsDrawer(), compactPriceFormatOptions, RequestFormDrawer(), actionIcons, actionLabels (+31 more)

### Community 2 - "dependencies"
Cohesion: 0.06
Nodes (35): @base-ui/react, @fontsource-variable/vazirmatn, @heroui/react, @heroui/styles, @orpc/client, @orpc/tanstack-query, dependencies, @base-ui/react (+27 more)

### Community 3 - "_telegram-session-panel.tsx"
Cohesion: 0.08
Nodes (24): ConfirmAction(), ConfirmActionProps, ConnectionChip, resolveChip(), resolveDescription(), resolveTelegramSessionPresentation(), stateLabels, TelegramSessionPresentation (+16 more)

### Community 4 - "_terminal-quote-header.tsx"
Cohesion: 0.11
Nodes (22): ExecutionStrip(), ExecutionStripProps, HomePage(), compactPriceFormat(), fullToman(), marketDifferenceDetails, marketNumber, marketTimePrecise() (+14 more)

### Community 5 - "devDependencies"
Cohesion: 0.07
Nodes (27): devDependencies, @playwright/test, postcss, tailwindcss, @tanstack/router-plugin, tsx, @types/node, @types/react (+19 more)

### Community 6 - "orpc.ts"
Cohesion: 0.16
Nodes (11): LiveView, applyMarketEvent(), mergeMarketSnapshot(), createRpcUtils(), RpcUtils, createQueryClient(), fastQuery, marketSnapshotQuery (+3 more)

### Community 7 - "drawer.tsx"
Cohesion: 0.12
Nodes (3): Drawer, DrawerSheet(), DrawerSheetProps

### Community 8 - "harness.tsx"
Cohesion: 0.13
Nodes (14): Harness(), Identity(), params, root, router, AppErrorBoundary, AppErrorFallback(), AppRuntime() (+6 more)

### Community 9 - "scripts"
Cohesion: 0.12
Nodes (16): name, private, scripts, build, check-types, dev, format, format:check (+8 more)

### Community 10 - "compilerOptions"
Cohesion: 0.13
Nodes (14): ., vite/client, vite-plugin-pwa/react, compilerOptions, esModuleInterop, jsx, module, moduleResolution (+6 more)

### Community 12 - "app-shell.tsx"
Cohesion: 0.28
Nodes (5): AppShell(), navigationItems, PwaUpdate(), Route, RouterAppContext

### Community 13 - "_theme-picker.tsx"
Cohesion: 0.50
Nodes (6): themeOptions, ThemePicker(), applyTheme(), getThemePreference(), saveThemePreference(), Theme

## Knowledge Gaps
- **101 isolated node(s):** `params`, `router`, `root`, `snapshot`, `requests` (+96 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useApi()` connect `useApi` to `_telegram-session-panel.tsx`, `orpc.ts`?**
  _High betweenness centrality (0.095) - this node is a cross-community bridge._
- **Why does `useIdentity()` connect `useApi` to `harness.tsx`, `_telegram-session-panel.tsx`?**
  _High betweenness centrality (0.071) - this node is a cross-community bridge._
- **Why does `RequestList()` connect `useApi` to `_terminal-quote-header.tsx`, `history.tsx`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **What connects `params`, `router`, `root` to the rest of the system?**
  _101 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `api-provider.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.1396011396011396 - nodes in this community are weakly interconnected._
- **Should `useApi` be split into smaller, more focused modules?**
  _Cohesion score 0.09117475160724722 - nodes in this community are weakly interconnected._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.05714285714285714 - nodes in this community are weakly interconnected._