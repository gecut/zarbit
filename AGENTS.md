# Agent Operating Contract

Zarbit is an Iranian OTC gold trading intelligence and execution engine (Turborepo TypeScript monorepo: React 19 web, Hono server, MTProto worker, Prisma PostgreSQL).

Authoritative product, domain, and operational contracts live in [`docs/`](docs/README.md). Consult them as the single source of truth; never guess boundaries, schemas, or terminology.

**Precedence**: (1) User task; (2) `AGENTS.md` and `docs/`; (3) Nexload baseline; (4) Official docs; (5) Existing code.

---

## The Zarbit Pipeline

Execute all engineering work through this strict sequence. Satisfy each phase's completion criterion before crossing into the next.

### 1. Triage, Ideation, and Planning

- **`triage`** ([`SKILL.md`](.agents/skills/triage/SKILL.md)): When processing raw issues, bugs, or PRs. Categorize, verify claims against code, and write agent-ready briefs.
- **`wayfinder`** ([`SKILL.md`](.agents/skills/wayfinder/SKILL.md)): When tackling multi-session initiatives or loose scopes. Chart milestones as decision tickets with explicit blocking edges.
- **Graphify**: When starting codebase reconnaissance, consult `graphify-out/` before broad search to inspect god nodes, topological clusters, and dependency seams.
- **`domain-modeling`** ([`SKILL.md`](.agents/skills/domain-modeling/SKILL.md)): When negotiating codebase terminology or boundaries. Maintain [`docs/GLOSSARY.md`](docs/GLOSSARY.md) and record ADRs in [`docs/adr/`](docs/adr/).
- **`codebase-design`** ([`SKILL.md`](.agents/skills/codebase-design/SKILL.md)): When architecting interfaces and modules. Maximize depth (narrow interface, deep implementation), place seams intentionally, and design for testability.
- **`systematic-debugging`** ([`SKILL.md`](.agents/skills/systematic-debugging/SKILL.md)): When addressing bugs or test failures. Gather hard evidence, reproduce in a _tight_ red loop, and formulate hypotheses before modifying source code.
- **`writing-plans`** ([`SKILL.md`](.agents/skills/writing-plans/SKILL.md)): When planning multi-step features or refactors. Formulate checklist-driven implementation plans with explicit types, interfaces, and test gates.
- **`grill-me`** ([`SKILL.md`](.agents/skills/grill-me/SKILL.md)) / **`grill-with-docs`** ([`SKILL.md`](.agents/skills/grill-with-docs/SKILL.md)): Gate for plan approval. Relentlessly interview and stress-test assumptions, capturing decisions in [`docs/adr/`](docs/adr/) and [`docs/GLOSSARY.md`](docs/GLOSSARY.md) until all ambiguity is cleared.
  **Completion criterion**: Root cause proven with failing test (bugs), or plan checklist approved via grilling, domain terms synced in [`docs/GLOSSARY.md`](docs/GLOSSARY.md), and architectural boundaries verified against [`docs/`](docs/README.md).

### 2. Execution and Implementation

- **`using-git-worktrees`** ([`SKILL.md`](.agents/skills/using-git-worktrees/SKILL.md)): When starting non-trivial features, refactors, or parallel streams. Isolate execution in a dedicated worktree to protect the primary branch.
- **Dispatch Policy**:
  - **Native Inline (`executing-plans`)** ([`SKILL.md`](.agents/skills/executing-plans/SKILL.md)): Default approach for single-developer flow, tightly-coupled tasks, and rapid linear execution without context switching.
  - **Subagent-Driven (`subagent-driven-development`)** ([`SKILL.md`](.agents/skills/subagent-driven-development/SKILL.md)): Use when implementing multi-step plans with independent tasks. Dispatches fresh implementer subagents per task to eliminate context pollution, followed by per-task review gates.
  - **Parallel Agents (`dispatching-parallel-agents`)** ([`SKILL.md`](.agents/skills/dispatching-parallel-agents/SKILL.md)): Use strictly when facing 2+ fully independent tasks with no shared state or sequential ordering.
- **Code Standards**:
  - **`nexload-code`** ([`SKILL.md`](.agents/skills/nexload-code/SKILL.md)): Mandatory baseline for TypeScript module ownership, boundaries, dependency restraint, and internal imports.
  - **`nexload-react`** ([`SKILL.md`](.agents/skills/nexload-react/SKILL.md)): Component structure, pure rendering, state and effect ownership, and narrow client boundaries.
  - **`nexload-design`** ([`SKILL.md`](.agents/skills/nexload-design/SKILL.md)): Semantic design tokens, RTL-safe geometry, surface roles, and spacing.
  - **`heroui-react`** ([`SKILL.md`](.agents/skills/heroui-react/SKILL.md)): HeroUI v3 component implementation and Tailwind CSS v4 styling.
  - **`using-mtcute`** ([`SKILL.md`](.agents/skills/using-mtcute/SKILL.md)): Telegram MTProto interactions, TL types, and client lifecycle in the worker.
  - **`prisma-client-api`** ([`SKILL.md`](.agents/skills/prisma-client-api/SKILL.md)): Database models, queries, filters, and transactional integrity.
    **Completion criterion**: Every task in the plan implemented and committed, adhering strictly to Nexload standards, with zero unresolved compiler or lint errors.

### 3. Verification and Review

- **`code-review`** ([`SKILL.md`](.agents/skills/code-review/SKILL.md)): Self-audit changes along two independent axes:
  1. _Spec_: Did the implementation fulfill the exact originating requirements without scope creep?
  2. _Standards_: Does the code adhere to repository idioms, clean architecture, and type safety?
- **`verification-before-completion`** ([`SKILL.md`](.agents/skills/verification-before-completion/SKILL.md)): **Hard gate.** Prove all changes work with fresh terminal command evidence. Run typechecks (`pnpm check-types`), linter (`pnpm lint`), tests, and assertions. Never claim "done" without command-line evidence.
- **`nexload-cto-review`** ([`SKILL.md`](.agents/skills/nexload-cto-review/SKILL.md)): Trigger only upon explicit user request for architectural assessment or production readiness scoring.
  **Completion criterion**: All automated checks pass (`check-types`, `lint`, tests) with terminal logs produced and verified; zero regressions against contract boundaries.

### 4. Documentation and Delivery

- **`writing-for-agents`** ([`SKILL.md`](.agents/skills/writing-for-agents/SKILL.md)): Apply when modifying `AGENTS.md`, `docs/`, or skills. Use leading words, precise context pointers, and ruthless pruning.
- **`writing-skills`** ([`SKILL.md`](.agents/skills/writing-skills/SKILL.md)): Apply when authoring or editing reusable skills. Test-drive instructions and close edge-case gaps.
- **`caveman`** ([`SKILL.md`](.agents/skills/caveman/SKILL.md)): Use for ultra-compressed communication of verbose logs or large terminal outputs while preserving exact identifiers and errors.
  **Completion criterion**: All relevant `docs/` updated inline (including [`docs/GLOSSARY.md`](docs/GLOSSARY.md) and [`docs/adr/`](docs/adr/)); diffs and evidence reported concisely.

---

## Authoritative Documentation Map

When working on specific subsystems, consult the corresponding authoritative document in [`docs/`](docs/README.md):

| Subsystem / Context         | Authoritative File                                                 | Focus Area                                                                        |
| :-------------------------- | :----------------------------------------------------------------- | :-------------------------------------------------------------------------------- |
| **System Topology & Seams** | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)                     | Boundaries, inter-process communication, connection pools, deployment layout      |
| **Domain Terminology**      | [`docs/GLOSSARY.md`](docs/GLOSSARY.md)                             | Ubiquitous language for OTC gold trading, compact pricing, and avoided aliases    |
| **Business Invariants**     | [`docs/BUSINESS-RULES.md`](docs/BUSINESS-RULES.md)                 | Calculation formulas, P&L accounting, request matching rules, identity thresholds |
| **Telegram Protocols**      | [`docs/GROUP-TRADING-PROTOCOL.md`](docs/GROUP-TRADING-PROTOCOL.md) | Canonical bot quote, receipt, and human order message parsers                     |
| **MTProto Gateway**         | [`docs/TELEGRAM.md`](docs/TELEGRAM.md)                             | Worker session lifecycle, SQLite storage lock, OTP flow, execution engine         |
| **API Contracts**           | [`docs/RPC.md`](docs/RPC.md)                                       | oRPC v1.15 routers, data planes, cache ownership, rate limits, headers            |
| **Database & Persistence**  | [`docs/POSTGRES.md`](docs/POSTGRES.md)                             | PostgreSQL schemas, Prisma migrations, pooling parameters, retention policies     |
| **Market Data Pipeline**    | [`docs/MARKET-DATA.md`](docs/MARKET-DATA.md)                       | Snapshot caching, stream monotonic merge, head derivation                         |
| **Product & UI Specs**      | [`docs/PRODUCT.md`](docs/PRODUCT.md)                               | Mini App UX, screen navigation, theme contracts, access allowlist                 |
| **Operations & Deploy**     | [`docs/OPERATIONS.md`](docs/OPERATIONS.md)                         | Dokploy Compose setup, migration cutovers, container healthchecks                 |
| **Roadmap & Strategy**      | [`docs/ROADMAP.md`](docs/ROADMAP.md)                               | Phase definitions (Phase 1 Ingestion, Phase 2 Analytics, Phase 3 Whale Copy)      |
| **Architectural Decisions** | [`docs/adr/`](docs/adr/)                                           | Irreversible trade-offs and structural choices                                    |

---

## The Inviolable Constitution

These principles override all other reasoning defaults. Violation requires explicit user override.

1. **Grounding**: Runtime evidence > Source code > Official docs > Inferences > Assumptions. Never invert this chain.
2. **Inspect Before Ask**: Zero questions for data present in the codebase. Read `docs/`, `graphify-out/`, and source before asking.
3. **Problem Space**: Feature requests are hypotheses, not constraints. Interrogate the need before designing the solution.
4. **Divergence Firewall**: Ideation never self-censors on implementation difficulty. Evaluate feasibility only in the evaluation phase.
5. **Complexity Rent**: Reject speculative scalability. Build for Now + 1. Every abstraction must pay measurable rent in the current iteration.
6. **Immutability**: Never reopen settled ADRs in [`docs/adr/`](docs/adr/) without material contradictory evidence presented in writing.
7. **Verification**: "Builds" !== "Works". Every completion claim requires empirical test evidence from terminal output.
8. **Budget**: Terminate reasoning when residual uncertainty has zero design impact. Over-analysis is waste.

---

## Nexload Reasoning Sparse Handoff

When crossing reasoning phases, emit `[NEXLOAD HANDOFF → <target-skill>]` with a compressed context payload. Each skill triggers on its declared phase boundary.

| Trigger Condition                                                       | Target Skill                      | Handoff Signal                      |
| :---------------------------------------------------------------------- | :-------------------------------- | :---------------------------------- |
| Entering codebase reconnaissance or dependency mapping                  | `nexload-reasoning-discovery`     | `[NEXLOAD HANDOFF → discovery]`     |
| Bug, failure, or unexpected behavior requiring root-cause analysis      | `nexload-reasoning-investigation` | `[NEXLOAD HANDOFF → investigation]` |
| Generating solution alternatives or architectural options               | `nexload-reasoning-ideation`      | `[NEXLOAD HANDOFF → ideation]`      |
| Designing interfaces, modules, or system boundaries                     | `nexload-reasoning-design`        | `[NEXLOAD HANDOFF → design]`        |
| Comparing trade-offs, scoring options, or deciding between alternatives | `nexload-reasoning-evaluation`    | `[NEXLOAD HANDOFF → evaluation]`    |
| Implementing approved plan steps                                        | `nexload-reasoning-execution`     | `[NEXLOAD HANDOFF → execution]`     |
| Package boundary, export surface, or monorepo topology work             | `nexload-package`                 | `[NEXLOAD HANDOFF → package]`       |
| Health endpoint design, Docker probe, or readiness/liveness logic       | `healthcheck-core`                | `[NEXLOAD HANDOFF → healthcheck]`   |
| Custom health checks beyond HTTP 200 (DB pools, Telegram sessions)      | `healthcheck-custom-checks`       | `[NEXLOAD HANDOFF → custom-checks]` |

---

## Verification Commands

Consolidated commands for the verification gate. All must pass before claiming completion.

```bash
# Type safety
pnpm check-types

# Linting
pnpm lint

# Formatting
pnpm format:check

# Tests
pnpm test

# Build (full monorepo)
pnpm build

# Database schema
pnpm db:generate
pnpm db:migrate
```
