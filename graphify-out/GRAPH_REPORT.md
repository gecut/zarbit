# Graph Report - .  (2026-09-08)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1007 nodes · 1640 edges · 75 communities (70 shown, 5 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 46 edges (avg confidence: 0.77)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `139850ab`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39
- Community 40
- Community 41
- Community 42
- Community 43
- Community 44
- Community 45
- Community 46
- Community 47
- Community 48
- Community 49
- Community 50
- Community 51
- Community 52
- Community 53
- Community 54
- Community 55
- Community 56
- Community 57
- Community 58
- Community 59
- Community 60
- Community 61
- Community 62

## God Nodes (most connected - your core abstractions)
1. `Sessions` - 31 edges
2. `scripts` - 22 edges
3. `sessionRef` - 21 edges
4. `compilerOptions` - 18 edges
5. `TelegramSessionStatus` - 16 edges
6. `AppError` - 16 edges
7. `TelegramTransport` - 14 edges
8. `ApiClient` - 13 edges
9. `rpcCode()` - 13 edges
10. `AppDependencies` - 12 edges

## Surprising Connections (you probably didn't know these)
- `registerApiErrorHandlers()` --calls--> `databasePoolStats()`  [EXTRACTED]
  apps/server/src/api-error-handlers.ts → packages/db/src/index.ts
- `AppDependencies` --references--> `WorkerCommand`  [EXTRACTED]
  apps/server/src/app-types.ts → packages/contracts/src/index.ts
- `registerQuoteRoutes()` --calls--> `compactQuoteToDisplayPrice()`  [EXTRACTED]
  apps/server/src/quote-routes.ts → packages/domain/src/index.ts
- `registerRequestRoutes()` --indirect_call--> `requestView()`  [INFERRED]
  apps/server/src/request-routes.ts → packages/db/src/requests.ts
- `WorkerCommandDependencies` --references--> `WorkerCommand`  [EXTRACTED]
  apps/server/src/telegram-session.ts → packages/contracts/src/index.ts

## Import Cycles
- None detected.

## Communities (75 total, 5 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (44): WorkerCommandDependencies, copySession(), createMockApi(), initialSession(), mockIdentity, seedRequests(), createQuoteDashboard(), getQuoteScenario() (+36 more)

### Community 1 - "Community 1"
Cohesion: 0.15
Nodes (10): isRevoked(), safeError(), createWorkerApp(), challengeRef, sessionRef, Sessions, SessionStore, sessions (+2 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (45): ^build, ^check-types, DATABASE_URL, dist/**, .env*, ^format:check, ^lint, $TURBO_DEFAULT$ (+37 more)

### Community 3 - "Community 3"
Cohesion: 0.05
Nodes (34): compilerOptions, composite, jsx, jsxImportSource, outDir, paths, extends, compilerOptions (+26 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (35): dependencies, lint-staged, **/*.{css,json,jsonc,md,yaml,yml,html}, **/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}, name, packageManager, private, scripts (+27 more)

### Community 5 - "Community 5"
Cohesion: 0.06
Nodes (34): devDependencies, postcss, tailwindcss, @tanstack/router-plugin, tsx, @types/react, @types/react-dom, vite (+26 more)

### Community 6 - "Community 6"
Cohesion: 0.12
Nodes (21): startWorker(), workerLog, mtcuteFactory(), acquireWorkerOwnership(), createRequestExecutor(), Quote, RequestStore, checkDatabaseHealth() (+13 more)

### Community 7 - "Community 7"
Cohesion: 0.13
Nodes (19): entryFullTypeName(), expandWorkspaceGlobs(), findMatches(), findPackageRoot(), fullTypeName(), generateTypescriptDefinitionsForTlEntry(), getWorkspacePackageDirs(), indent() (+11 more)

### Community 8 - "Community 8"
Cohesion: 0.12
Nodes (17): AppRuntime(), AppRuntimeProps, themeOptions, ThemePicker(), ApiProvider(), initializeTelegramWebApp(), TelegramWebApp, applyTheme() (+9 more)

### Community 9 - "Community 9"
Cohesion: 0.08
Nodes (25): dependencies, @fontsource-variable/vazirmatn, @heroui/react, @heroui/styles, react, react-dom, recharts, @solar-icons/react (+17 more)

### Community 10 - "Community 10"
Cohesion: 0.08
Nodes (24): devDependencies, prisma, tsx, @types/pg, typescript, @zarbit/config, exports, tsx (+16 more)

### Community 11 - "Community 11"
Cohesion: 0.22
Nodes (16): registerApiErrorHandlers(), initDataFromBody(), registerApiMiddleware(), createApp(), AppDependencies, AppEnv, registerQuoteRoutes(), parseInput() (+8 more)

### Community 12 - "Community 12"
Cohesion: 0.17
Nodes (16): ErrorDetails, FailureCategory, isNetworkCode(), nativeCode(), rpcCode(), safeCode(), stringProperty(), errorContext() (+8 more)

### Community 13 - "Community 13"
Cohesion: 0.09
Nodes (23): eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, husky, lint-staged, devDependencies (+15 more)

### Community 14 - "Community 14"
Cohesion: 0.09
Nodes (21): compilerOptions, allowSyntheticDefaultImports, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, lib, module, moduleResolution (+13 more)

### Community 15 - "Community 15"
Cohesion: 0.14
Nodes (12): ConfirmAction(), ConfirmActionProps, ConnectionChip, resolveChip(), resolveDescription(), resolveTelegramSessionPresentation(), stateLabels, TelegramSessionPresentation (+4 more)

### Community 16 - "Community 16"
Cohesion: 0.16
Nodes (12): add(), MtcuteLifecycleClient, observeMtcuteClient(), remove(), ZARBIT_CONNECTION_IDENTITY, Account, CodeDelivery, LoginResult (+4 more)

### Community 17 - "Community 17"
Cohesion: 0.19
Nodes (11): authenticateTelegramRequest(), invalidInitData(), TelegramIdentity, verifyTelegramInitData(), app, startServer(), serverLog, startApplicationServer() (+3 more)

### Community 18 - "Community 18"
Cohesion: 0.11
Nodes (18): @zarbit/db, @zarbit/db, dependencies, grammy, hono, @mtcute/dispatcher, @mtcute/node, pg (+10 more)

### Community 19 - "Community 19"
Cohesion: 0.22
Nodes (12): labels, RequestCard(), RequestForm(), RequestList(), ApiContext, useApi(), AuthGate(), IdentityContext (+4 more)

### Community 20 - "Community 20"
Cohesion: 0.18
Nodes (13): deliveryLabels, LoginCredentialField(), LoginCredentialFieldProps, TelegramLoginForm(), TelegramLoginFormProps, TelegramPage(), secondsUntil(), SessionCommand (+5 more)

### Community 21 - "Community 21"
Cohesion: 0.18
Nodes (10): dedent(), expandWorkspaceGlobs(), extractDescription(), findPackageRoot(), getWorkspacePackageDirs(), parseExports(), resolveFromWorkspaces(), resolveMtcuteCoreDir() (+2 more)

### Community 22 - "Community 22"
Cohesion: 0.12
Nodes (17): dependencies, grammy, hono, @hono/node-server, pg, pino, @zarbit/logger, zod (+9 more)

### Community 23 - "Community 23"
Cohesion: 0.20
Nodes (10): dedent(), expandWorkspaceGlobs(), extractDescription(), findPackageRoot(), getWorkspacePackageDirs(), parseClientDts(), resolveFromWorkspaces(), resolveMtcuteCoreDir() (+2 more)

### Community 24 - "Community 24"
Cohesion: 0.12
Nodes (15): exports, ./access, ./db, ./server, ./web, ./worker, name, private (+7 more)

### Community 25 - "Community 25"
Cohesion: 0.13
Nodes (15): @zarbit/domain, @zarbit/env, @zarbit/domain, @zarbit/env, @zarbit/domain, @zarbit/env, @zarbit/domain, @zarbit/env (+7 more)

### Community 26 - "Community 26"
Cohesion: 0.13
Nodes (14): compilerOptions, esModuleInterop, jsx, module, moduleResolution, paths, rootDirs, skipLibCheck (+6 more)

### Community 27 - "Community 27"
Cohesion: 0.13
Nodes (14): main, name, private, scripts, build, check-types, dev, format (+6 more)

### Community 28 - "Community 28"
Cohesion: 0.13
Nodes (14): dependencies, pino, exports, pino, name, private, scripts, check-types (+6 more)

### Community 29 - "Community 29"
Cohesion: 0.23
Nodes (12): createWorkerCommand(), isExpectedWorkerStatus(), isWorkerError(), offlineStatus(), readWorkerResponse(), SessionReader, unavailableError(), workerCommand (+4 more)

### Community 30 - "Community 30"
Cohesion: 0.22
Nodes (5): SessionFiles, createSessions(), createStore(), now, transportFactory()

### Community 31 - "Community 31"
Cohesion: 0.18
Nodes (13): Challenge, expiredLoginCodes, LoginPhase, SessionOptions, SessionOwner, SessionRecord, SessionState, SessionUpdate (+5 more)

### Community 32 - "Community 32"
Cohesion: 0.14
Nodes (13): dependencies, zod, exports, zod, name, private, scripts, check-types (+5 more)

### Community 33 - "Community 33"
Cohesion: 0.15
Nodes (12): main, name, scripts, build, check-types, dev, format, format:check (+4 more)

### Community 34 - "Community 34"
Cohesion: 0.17
Nodes (13): typescript, @zarbit/config, typescript, @zarbit/config, typescript, @zarbit/config, devDependencies, typescript (+5 more)

### Community 35 - "Community 35"
Cohesion: 0.22
Nodes (8): formatAxisDate(), formatDate(), formatQuote(), QuoteDashboardCard(), relativeFormatter, timeFormatter, TomanIcon(), Route

### Community 36 - "Community 36"
Cohesion: 0.17
Nodes (12): dotenv, @t3-oss/env-core, dotenv, @t3-oss/env-core, dotenv, @t3-oss/env-core, dotenv, dependencies (+4 more)

### Community 37 - "Community 37"
Cohesion: 0.24
Nodes (8): commandInput(), registerTelegramSessionRoutes(), commandWith(), onlineStatus, statusRouteApp(), statusStore(), storedSession, AppError

### Community 39 - "Community 39"
Cohesion: 0.17
Nodes (11): exports, name, private, scripts, check-types, format, format:check, lint (+3 more)

### Community 40 - "Community 40"
Cohesion: 0.31
Nodes (6): createQuoteRecorder(), QuoteEvent, compactQuoteMultiplier, compactQuoteToDisplayPrice(), isFreshQuote(), parseQuoteMessage()

### Community 41 - "Community 41"
Cohesion: 0.22
Nodes (9): devDependencies, tsx, @types/node, typescript, @zarbit/config, tsx, @types/node, @types/node (+1 more)

### Community 42 - "Community 42"
Cohesion: 0.28
Nodes (5): AppShell(), navigationItems, PwaUpdate(), Route, RouterAppContext

### Community 43 - "Community 43"
Cohesion: 0.25
Nodes (8): tsdown, tsdown, devDependencies, tsdown, tsx, typescript, @zarbit/config, tsx

### Community 44 - "Community 44"
Cohesion: 0.33
Nodes (5): npx, pnpm, better-t-stack, context7, @upstash/context7-mcp

### Community 45 - "Community 45"
Cohesion: 0.33
Nodes (6): devDependencies, tsx, @types/node, typescript, @zarbit/config, tsx

### Community 46 - "Community 46"
Cohesion: 0.33
Nodes (6): devDependencies, tsx, @types/node, typescript, @zarbit/config, tsx

### Community 47 - "Community 47"
Cohesion: 0.70
Nodes (4): fetchApi(), fetchFallback(), main(), toKebabCase()

### Community 48 - "Community 48"
Cohesion: 0.60
Nodes (4): FALLBACK_THEME, fetchApi(), formatVariables(), main()

### Community 49 - "Community 49"
Cohesion: 0.40
Nodes (5): @zarbit/contracts, @zarbit/contracts, @zarbit/contracts, @zarbit/contracts, @zarbit/contracts

### Community 50 - "Community 50"
Cohesion: 0.50
Nodes (3): parseAllowlist(), allowedTelegramUserIds, env

### Community 51 - "Community 51"
Cohesion: 0.83
Nodes (3): fetchApi(), fetchFallback(), main()

### Community 52 - "Community 52"
Cohesion: 0.83
Nodes (3): fetchApi(), fetchGithubFallback(), main()

### Community 53 - "Community 53"
Cohesion: 0.83
Nodes (3): fetchApi(), fetchGithubFallback(), main()

### Community 54 - "Community 54"
Cohesion: 0.83
Nodes (3): fetchApi(), fetchFallback(), main()

### Community 55 - "Community 55"
Cohesion: 0.50
Nodes (4): @prisma/adapter-pg, @prisma/adapter-pg, @prisma/adapter-pg, @prisma/adapter-pg

### Community 56 - "Community 56"
Cohesion: 0.50
Nodes (4): @prisma/client, @prisma/client, @prisma/client, @prisma/client

### Community 58 - "Community 58"
Cohesion: 0.50
Nodes (3): name, private, version

### Community 59 - "Community 59"
Cohesion: 0.50
Nodes (3): env, ImportMeta, ImportMetaEnv

## Knowledge Gaps
- **351 isolated node(s):** `FALLBACK_THEME`, `CartItem`, `Product`, `Window`, `pnpm` (+346 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `devDependencies` connect `Community 13` to `Community 41`, `Community 34`, `Community 4`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `Community 5` to `Community 41`, `Community 34`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Why does `@zarbit/config` connect `Community 34` to `Community 41`, `Community 10`, `Community 43`, `Community 45`, `Community 46`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **What connects `FALLBACK_THEME`, `CartItem`, `Product` to the rest of the system?**
  _351 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05683060109289618 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.1452358926919519 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.04541062801932367 - nodes in this community are weakly interconnected._