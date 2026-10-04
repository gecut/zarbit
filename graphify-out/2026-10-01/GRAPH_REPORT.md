# Graph Report - .  (2026-09-15)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1562 nodes · 3186 edges · 101 communities (91 shown, 10 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 87 edges (avg confidence: 0.73)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `1ca25c95`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- domain/src/index.ts
- worker/src/index.ts
- src/telegram.ts
- contracts/src/analytics.ts
- db/src/index.ts
- tasks
- devDependencies
- scripts
- Sessions
- create-orpc-router.ts
- logger.ts
- contracts/src/index.ts
- create-session-command.ts
- _request-details-drawer.tsx
- typescript
- format/src/index.ts
- get-constructor.js
- dependencies
- sessions.ts
- dependencies
- app-dependencies.ts
- devDependencies
- compilerOptions
- dependencies
- drawer.tsx
- rpc.ts
- useApi
- mtcute.ts
- api-provider.tsx
- _trader-detail-drawer.tsx
- domain/package.json
- get-class.js
- requests-page.tsx
- orpc.ts
- contracts/package.json
- get-method.js
- dependencies
- @zarbit/env
- telegram-session.test.ts
- env/package.json
- compilerOptions
- scripts
- logger/package.json
- AppDependencies
- telegram-page.tsx
- scripts
- harness.tsx
- dotenv
- devDependencies
- errors.ts
- TelegramTransport
- SessionStore
- scripts
- format/package.json
- start-application-server.ts
- app-runtime.tsx
- db/package.json
- messages/package.json
- @zarbit/contracts
- app-shell.tsx
- get_source.mjs
- devDependencies
- compilerOptions
- history.tsx
- merge-market-snapshot.ts
- SessionOutages
- compilerOptions
- worker/tsconfig.json
- initializeTelegramWebApp
- context7
- devDependencies
- get_component_docs.mjs
- get_theme.mjs
- domain/tsconfig.json
- @zarbit/config/tsconfig.base.json
- format/tsconfig.json
- logger/tsconfig.json
- messages/tsconfig.json
- get_docs.mjs
- list_components.mjs
- migrate.mjs
- config/package.json
- contracts/tsconfig.json
- cart-summary.tsx
- product-list.tsx
- vendor-map.tsx
- _mock-recent-trades.ts
- playwright.config.ts

## God Nodes (most connected - your core abstractions)
1. `Sessions` - 38 edges
2. `AppError` - 35 edges
3. `sessionRef` - 29 edges
4. `AppDependencies` - 26 edges
5. `useApi()` - 24 edges
6. `scripts` - 22 edges
7. `formatNumber()` - 22 edges
8. `useIdentity()` - 21 edges
9. `Store` - 20 edges
10. `compilerOptions` - 18 edges

## Surprising Connections (you probably didn't know these)
- `RecentTradesTapeProps` --references--> `MarketSnapshot`  [EXTRACTED]
  apps/web/src/modules/home/_recent-trades-tape.tsx → packages/contracts/src/market.ts
- `TerminalQuoteHeaderProps` --references--> `MarketSnapshot`  [EXTRACTED]
  apps/web/src/modules/home/_terminal-quote-header.tsx → packages/contracts/src/market.ts
- `AppDependencies` --references--> `TelegramCommandInput`  [EXTRACTED]
  apps/server/src/app-dependencies.ts → packages/contracts/src/telegram.ts
- `AppDependencies` --references--> `TelegramCommandReceipt`  [EXTRACTED]
  apps/server/src/app-dependencies.ts → packages/contracts/src/telegram.ts
- `AppDependencies` --references--> `TelegramSessionStatus`  [EXTRACTED]
  apps/server/src/app-dependencies.ts → packages/contracts/src/telegram.ts

## Import Cycles
- None detected.

## Communities (101 total, 10 thin omitted)

### Community 0 - "domain/src/index.ts"
Cohesion: 0.07
Nodes (46): MarketState, AuthoritativeHandlerDependencies, createAuthoritativeHandler(), createMarketIngestion(), createQuoteRecorder, MarketDataStore, BoundedMessageDeduplicator, BoundedOrderCache (+38 more)

### Community 1 - "worker/src/index.ts"
Cohesion: 0.07
Nodes (48): startWorker(), mtcuteFactory(), createPrivateNotifier(), notifyRecoveredRequests(), acquireWorkerOwnership(), ClaimedRequest, createRequestExecutor(), RequestStore (+40 more)

### Community 2 - "src/telegram.ts"
Cohesion: 0.06
Nodes (39): ConfirmAction(), ConfirmActionProps, resolveTelegramSessionPresentation(), TelegramSessionPresentation, deliveryLabels, LoginCredentialField(), LoginCredentialFieldProps, TelegramLoginFormProps (+31 more)

### Community 3 - "contracts/src/analytics.ts"
Cohesion: 0.08
Nodes (37): AnalyticsService, AnalyticsRouterDependencies, DataCoverageConfidence, dataCoverageConfidenceSchema, ParticipantAnalyticsDetail, participantAnalyticsDetailSchema, ParticipantAnalyticsSummary, participantAnalyticsSummarySchema (+29 more)

### Community 4 - "db/src/index.ts"
Cohesion: 0.07
Nodes (36): MarketNotification, createAnalyticsDataStore(), createPrismaClient(), createStore(), databasePool, databasePoolOptions, originalPrismaDisconnect, QuoteRecord (+28 more)

### Community 5 - "tasks"
Cohesion: 0.05
Nodes (45): ^build, ^check-types, DATABASE_URL, dist/**, .env*, ^format:check, ^lint, $TURBO_DEFAULT$ (+37 more)

### Community 6 - "devDependencies"
Cohesion: 0.05
Nodes (37): devDependencies, @playwright/test, postcss, tailwindcss, @tanstack/router-plugin, tsx, @types/react, @types/react-dom (+29 more)

### Community 7 - "scripts"
Cohesion: 0.06
Nodes (35): dependencies, lint-staged, **/*.{css,json,jsonc,md,yaml,yml,html}, **/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}, name, packageManager, private, scripts (+27 more)

### Community 8 - "Sessions"
Cohesion: 0.22
Nodes (3): challengeRef, sessionRef, Sessions

### Community 9 - "create-orpc-router.ts"
Cohesion: 0.10
Nodes (20): createAnalyticsRouter(), createAuthRouter(), createMarketRouter(), createMarketRuntime(), MarketRuntime, RequestsRouterDependencies, Context, createTelegramRouter() (+12 more)

### Community 10 - "logger.ts"
Cohesion: 0.11
Nodes (19): createWorkerApp(), contextStorage, logger, withWorkerContext(), workerLog, OperationStore, SessionOperations, sessions (+11 more)

### Community 11 - "contracts/src/index.ts"
Cohesion: 0.10
Nodes (26): parseInput(), registerRequestRoutes(), createRequestsRouter(), requireLiveSession(), baseRow, requestApp(), requestRow(), fixtureTime (+18 more)

### Community 12 - "create-session-command.ts"
Cohesion: 0.15
Nodes (20): classifyWorkerFailure(), probeWorker(), envelopeSchema, errorSchema, sendWorkerCommand(), successSchema, WorkerDiagnostic, WorkerFailure (+12 more)

### Community 13 - "_request-details-drawer.tsx"
Cohesion: 0.15
Nodes (20): requests, snapshot, RequestCard(), RequestCardProps, RequestDetailsDrawer(), compactPriceFormatOptions, RequestFormDrawer(), requestMutationOptions() (+12 more)

### Community 14 - "typescript"
Cohesion: 0.08
Nodes (28): @types/node, typescript, @zarbit/config, @types/node, typescript, @zarbit/config, @types/node, typescript (+20 more)

### Community 15 - "format/src/index.ts"
Cohesion: 0.14
Nodes (22): marketDifference(), MarketDifferenceDetails, QuoteAge(), QuoteAgeProps, RecentTradesTape(), RecentTradesTapeProps, connectionLabels, MarketConnection (+14 more)

### Community 16 - "get-constructor.js"
Cohesion: 0.13
Nodes (19): entryFullTypeName(), expandWorkspaceGlobs(), findMatches(), findPackageRoot(), fullTypeName(), generateTypescriptDefinitionsForTlEntry(), getWorkspacePackageDirs(), indent() (+11 more)

### Community 17 - "dependencies"
Cohesion: 0.07
Nodes (27): dependencies, @base-ui/react, @fontsource-variable/vazirmatn, @heroui/react, @heroui/styles, @orpc/tanstack-query, react, react-dom (+19 more)

### Community 18 - "sessions.ts"
Cohesion: 0.12
Nodes (17): SessionFiles, expiredLoginCodes, LoginPhase, SessionOptions, SessionOwner, SessionRecord, SessionState, SessionUpdate (+9 more)

### Community 19 - "dependencies"
Cohesion: 0.09
Nodes (23): dependencies, grammy, hono, @hono/node-server, @orpc/openapi, @orpc/server, @orpc/zod, pg (+15 more)

### Community 20 - "app-dependencies.ts"
Cohesion: 0.16
Nodes (16): createProductionDependencies(), errorSchema, responseSchema, sendWorkerOperation(), authenticate, authenticateTelegramRequest(), TelegramAuthenticationOptions, VerifyTelegramInitData (+8 more)

### Community 21 - "devDependencies"
Cohesion: 0.09
Nodes (23): eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, husky, lint-staged, devDependencies (+15 more)

### Community 22 - "compilerOptions"
Cohesion: 0.09
Nodes (21): compilerOptions, allowSyntheticDefaultImports, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, lib, module, moduleResolution (+13 more)

### Community 23 - "dependencies"
Cohesion: 0.10
Nodes (21): @zarbit/db, @zarbit/logger, @zarbit/db, @zarbit/logger, dependencies, grammy, hono, @mtcute/dispatcher (+13 more)

### Community 24 - "drawer.tsx"
Cohesion: 0.12
Nodes (3): Drawer, DrawerSheet(), DrawerSheetProps

### Community 25 - "rpc.ts"
Cohesion: 0.15
Nodes (16): createMarketMock(), createMarketFixtures(), createMockLiveIterator(), createTelegramMock(), requestDetailSchema, requestHistoryPageSchema, MarketLiveEvent, marketLiveEventSchema (+8 more)

### Community 26 - "useApi"
Cohesion: 0.27
Nodes (15): secondsUntil(), SessionCommand, useTelegramConnection(), useSessionCommand(), useTelegramOperation(), useTelegramSession(), TradersPage(), useApi() (+7 more)

### Community 27 - "mtcute.ts"
Cohesion: 0.16
Nodes (12): add(), MtcuteLifecycleClient, observeMtcuteClient(), remove(), ZARBIT_CONNECTION_IDENTITY, Account, CodeDelivery, LoginResult (+4 more)

### Community 28 - "api-provider.tsx"
Cohesion: 0.16
Nodes (11): ApiProvider(), MarketScenario, marketScenarios, mockEpoch, ApiContext, createRpcClient(), telegramInitData(), Window (+3 more)

### Community 29 - "_trader-detail-drawer.tsx"
Cohesion: 0.24
Nodes (10): DataCoverageBadge(), TraderCard(), TraderDetailDrawer(), sortOptions, TraderSortBar(), Route, TomanIcon(), SortOrder (+2 more)

### Community 30 - "domain/package.json"
Cohesion: 0.11
Nodes (17): devDependencies, tsx, @types/node, typescript, @zarbit/config, exports, tsx, name (+9 more)

### Community 31 - "get-class.js"
Cohesion: 0.18
Nodes (10): dedent(), expandWorkspaceGlobs(), extractDescription(), findPackageRoot(), getWorkspacePackageDirs(), parseExports(), resolveFromWorkspaces(), resolveMtcuteCoreDir() (+2 more)

### Community 32 - "requests-page.tsx"
Cohesion: 0.19
Nodes (11): ExecutionStrip(), ExecutionStripProps, HomePage(), HomeRequestSection(), HomeRequestSectionProps, useMarket(), FilterAction, RequestListProps (+3 more)

### Community 33 - "orpc.ts"
Cohesion: 0.21
Nodes (9): RpcUtils, createQueryClient(), fastQuery, marketPolling, marketSnapshotQuery, retryDelay(), retryQuery(), slowQuery (+1 more)

### Community 34 - "contracts/package.json"
Cohesion: 0.12
Nodes (16): @orpc/contract, dependencies, @orpc/contract, zod, exports, ./rpc, zod, name (+8 more)

### Community 35 - "get-method.js"
Cohesion: 0.20
Nodes (10): dedent(), expandWorkspaceGlobs(), extractDescription(), findPackageRoot(), getWorkspacePackageDirs(), parseClientDts(), resolveFromWorkspaces(), resolveMtcuteCoreDir() (+2 more)

### Community 36 - "dependencies"
Cohesion: 0.13
Nodes (15): @prisma/adapter-pg, @prisma/client, @prisma/adapter-pg, @prisma/client, @prisma/adapter-pg, @prisma/client, dependencies, pg (+7 more)

### Community 37 - "@zarbit/env"
Cohesion: 0.40
Nodes (5): @zarbit/env, @zarbit/env, @zarbit/env, @zarbit/env, @zarbit/env

### Community 38 - "telegram-session.test.ts"
Cohesion: 0.29
Nodes (7): commandInput(), registerTelegramSessionRoutes(), commandWith(), onlineStatus, statusRouteApp(), statusStore(), storedSession

### Community 39 - "env/package.json"
Cohesion: 0.12
Nodes (15): exports, ./access, ./db, ./server, ./web, ./worker, name, private (+7 more)

### Community 40 - "compilerOptions"
Cohesion: 0.13
Nodes (14): compilerOptions, esModuleInterop, jsx, module, moduleResolution, paths, rootDirs, skipLibCheck (+6 more)

### Community 41 - "scripts"
Cohesion: 0.13
Nodes (14): main, name, private, scripts, build, check-types, dev, format (+6 more)

### Community 42 - "logger/package.json"
Cohesion: 0.13
Nodes (14): dependencies, pino, exports, pino, name, private, scripts, check-types (+6 more)

### Community 43 - "AppDependencies"
Cohesion: 0.18
Nodes (15): createApp(), AppDependencies, registerQuoteRoutes(), AppEnv, generateOpenApi(), registerApiErrorHandlers(), initDataFromBody(), registerApiMiddleware() (+7 more)

### Community 44 - "telegram-page.tsx"
Cohesion: 0.25
Nodes (9): TelegramLoginForm(), TelegramPage(), themeOptions, ThemePicker(), Route, applyTheme(), getThemePreference(), saveThemePreference() (+1 more)

### Community 45 - "scripts"
Cohesion: 0.15
Nodes (12): main, name, scripts, build, check-types, dev, format, format:check (+4 more)

### Community 46 - "harness.tsx"
Cohesion: 0.21
Nodes (7): Harness(), Identity(), params, root, router, AppErrorBoundary, AppErrorFallback()

### Community 47 - "dotenv"
Cohesion: 0.17
Nodes (12): dotenv, @t3-oss/env-core, dotenv, @t3-oss/env-core, dotenv, @t3-oss/env-core, dotenv, dependencies (+4 more)

### Community 48 - "devDependencies"
Cohesion: 0.17
Nodes (12): devDependencies, @orpc/client, tsx, @types/node, @types/pg, typescript, @zarbit/config, tsx (+4 more)

### Community 49 - "errors.ts"
Cohesion: 0.38
Nodes (10): ErrorDetails, FailureCategory, isNetworkCode(), isRevoked(), nativeCode(), rpcCode(), safeCode(), safeError() (+2 more)

### Community 52 - "scripts"
Cohesion: 0.17
Nodes (12): scripts, check-types, db:generate, db:migrate, db:migrate:deploy, db:push, db:studio, format (+4 more)

### Community 53 - "format/package.json"
Cohesion: 0.11
Nodes (17): @zarbit/domain, @zarbit/domain, @zarbit/domain, @zarbit/domain, dependencies, @zarbit/domain, exports, name (+9 more)

### Community 54 - "start-application-server.ts"
Cohesion: 0.27
Nodes (7): startApplicationServer(), assertTelegramBotConfiguration(), createTelegramBot(), app, dependencies, market, prisma

### Community 56 - "app-runtime.tsx"
Cohesion: 0.25
Nodes (8): AppRuntime(), AppRuntimeProps, queryClient, rootElement, AppRouter, Register, router, @tanstack/react-router

### Community 57 - "db/package.json"
Cohesion: 0.18
Nodes (10): devDependencies, prisma, tsx, typescript, @zarbit/config, exports, tsx, name (+2 more)

### Community 58 - "messages/package.json"
Cohesion: 0.20
Nodes (9): exports, name, private, scripts, check-types, lint, test, type (+1 more)

### Community 59 - "@zarbit/contracts"
Cohesion: 0.22
Nodes (9): @zarbit/contracts, @zarbit/contracts, @zarbit/format, @zarbit/contracts, @zarbit/format, @zarbit/contracts, dependencies, @zarbit/contracts (+1 more)

### Community 60 - "app-shell.tsx"
Cohesion: 0.28
Nodes (5): AppShell(), navigationItems, PwaUpdate(), Route, RouterAppContext

### Community 61 - "get_source.mjs"
Cohesion: 0.36
Nodes (6): fetchApi(), fetchGithubFallback(), main(), fetchApi(), fetchGithubFallback(), main()

### Community 62 - "devDependencies"
Cohesion: 0.25
Nodes (8): tsdown, tsdown, devDependencies, tsdown, tsx, typescript, @zarbit/config, tsx

### Community 63 - "compilerOptions"
Cohesion: 0.25
Nodes (7): compilerOptions, composite, jsx, jsxImportSource, outDir, paths, extends

### Community 64 - "history.tsx"
Cohesion: 0.36
Nodes (3): parseRequestSearch(), RequestList, Route

### Community 65 - "merge-market-snapshot.ts"
Cohesion: 0.39
Nodes (6): applyMarketEvent(), mergeMarketQueryData(), mergeMarketSnapshot(), quote, snapshot, trade

### Community 67 - "compilerOptions"
Cohesion: 0.25
Nodes (7): compilerOptions, composite, declaration, declarationMap, outDir, sourceMap, extends

### Community 68 - "worker/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, composite, outDir, extends, include, src

### Community 71 - "context7"
Cohesion: 0.33
Nodes (5): npx, pnpm, better-t-stack, context7, @upstash/context7-mcp

### Community 72 - "devDependencies"
Cohesion: 0.33
Nodes (6): devDependencies, tsx, @types/node, typescript, @zarbit/config, tsx

### Community 73 - "get_component_docs.mjs"
Cohesion: 0.70
Nodes (4): fetchApi(), fetchFallback(), main(), toKebabCase()

### Community 74 - "get_theme.mjs"
Cohesion: 0.60
Nodes (4): FALLBACK_THEME, fetchApi(), formatVariables(), main()

### Community 75 - "domain/tsconfig.json"
Cohesion: 0.40
Nodes (4): extends, include, src, test

### Community 76 - "@zarbit/config/tsconfig.base.json"
Cohesion: 0.40
Nodes (3): extends, extends, @zarbit/config/tsconfig.base.json

### Community 77 - "format/tsconfig.json"
Cohesion: 0.40
Nodes (4): extends, include, src, test

### Community 78 - "logger/tsconfig.json"
Cohesion: 0.40
Nodes (4): extends, include, src, test

### Community 79 - "messages/tsconfig.json"
Cohesion: 0.40
Nodes (4): extends, include, src, test

### Community 80 - "get_docs.mjs"
Cohesion: 0.83
Nodes (3): fetchApi(), fetchFallback(), main()

### Community 81 - "list_components.mjs"
Cohesion: 0.83
Nodes (3): fetchApi(), fetchFallback(), main()

### Community 84 - "config/package.json"
Cohesion: 0.50
Nodes (3): name, private, version

### Community 85 - "contracts/tsconfig.json"
Cohesion: 0.50
Nodes (3): extends, include, src/**/*.ts

## Knowledge Gaps
- **460 isolated node(s):** `FALLBACK_THEME`, `CartItem`, `Product`, `Window`, `pnpm` (+455 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SessionFiles` connect `sessions.ts` to `worker/src/index.ts`, `logger.ts`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Why does `AppError` connect `app-dependencies.ts` to `orpc.ts`, `worker/src/index.ts`, `src/telegram.ts`, `db/src/index.ts`, `telegram-session.test.ts`, `create-orpc-router.ts`, `logger.ts`, `contracts/src/index.ts`, `create-session-command.ts`, `AppDependencies`, `errors.ts`, `sessions.ts`, `rpc.ts`, `useApi`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Why does `@zarbit/config` connect `typescript` to `devDependencies`, `devDependencies`, `domain/package.json`, `db/package.json`, `devDependencies`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **What connects `FALLBACK_THEME`, `CartItem`, `Product` to the rest of the system?**
  _460 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `domain/src/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07092907092907093 - nodes in this community are weakly interconnected._
- **Should `worker/src/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06892010535557506 - nodes in this community are weakly interconnected._
- **Should `src/telegram.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06184012066365008 - nodes in this community are weakly interconnected._