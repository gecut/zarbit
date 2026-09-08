# Agent Operating Contract

## Project Contract

Zarbit is a pnpm/Turborepo TypeScript monorepo with `apps/web`, `apps/server`, `apps/worker`, and shared packages under `packages/`. Runtime boundaries include the web client, server API, Telegram/MTProto worker, PostgreSQL data layer, and shared contracts/config/logger/domain packages. Before changing code, read the nearest applicable instructions, current worktree status, the affected package manifest and TypeScript/ESLint configuration, then trace the caller-to-effect path. The authoritative product and operational contracts are in `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/BUSINESS-RULES.md`, `docs/TELEGRAM.md`, `docs/POSTGRES.md`, and `docs/OPERATIONS.md`; consult the relevant documents rather than copying their rules here.

Instruction precedence is: (1) explicit user/task instructions; (2) the nearest applicable `AGENTS.md` and project contracts in `docs/`; (3) applicable Nexload skills as the mandatory initial engineering baseline; (4) current source/configuration and relevant official technology documentation; (5) existing implementation patterns as evidence only. A more specific project contract may specialize or override generic Nexload guidance.

## Nexload Skills

For engineering work, consult every applicable project-local Nexload skill before implementation. These are baseline engineering guidelines, not the complete Zarbit specification; `docs/`, source contracts, and explicit requirements still decide behavior.

- `nexload-code` (`.agents/skills/nexload-code/SKILL.md`) is the baseline for TypeScript implementation/refactoring, naming, trust boundaries, ownership, dependency restraint, and focused verification.
- `nexload-react` (`.agents/skills/nexload-react/SKILL.md`) routes React components, hooks, state/effect ownership, client boundaries, and component entrypoints. Compose with `nexload-code` for language-wide concerns.
- `nexload-design` (`.agents/skills/nexload-design/SKILL.md`) routes visual-system, layout, responsive, spacing, surface, and RTL work. Inspect approved/current rendered states before changing visual behavior.
- `nexload-cto-review` (`.agents/skills/nexload-cto-review/SKILL.md`) is only for an explicit CTO, final technical, architecture, approval, or production-readiness review. It is review-only and must not be loaded as normal implementation guidance.

Do not duplicate skill text in repository docs. Use the narrowest relevant package scripts and report checks actually run; separate scoped results from unrelated baseline failures.

## Graphify

Graphify is the preferred repository-navigation and relationship tool for architecture, dependencies, cross-file relationships, and impact analysis. The current baseline lives in `graphify-out/` and was generated from the repository with normal code-only extraction. Query it before broad grep or loading many files when traversal can answer the question; use query, path, explain, god-node, and related capabilities as appropriate. Treat graph output as extracted facts or inferences, distinguish ambiguous relationships, and verify important conclusions against source code and the authoritative docs.

After meaningful repository changes, refresh the graph incrementally or rebuild it when stale. Avoid deep/LLM analysis unless the task genuinely requires it. Graphify assists discovery; it never overrides source code, project contracts, or explicit requirements. Current extraction has a known limitation: SQL syntax is not indexed when the optional `tree_sitter_sql` dependency is unavailable.

For every Node service release, inspect the built `dist` artifact's external imports and verify each one is available from the production runtime layout; do not assume a transitive pnpm dependency is present in a Docker image. Bundle dependency families with `tsdown` when the runtime image does not install their full transitive tree, and run this audit for every service after build changes.

## Caveman

Caveman is an optional token-efficiency skill installed at `.agents/skills/caveman/SKILL.md`. It is not a source of truth and is not required for every task. Use it conservatively for large, low-signal command output, logs, search results, or similarly verbose context. Preserve exact code, commands, paths, errors, identifiers, requirements, architectural decisions, security/review findings, and other evidence needed for a correct change. If compression might hide useful context, do not use it. This repository intentionally uses only the skill; do not add Caveman Proxy, Cavemem, Agent SDK, routing, interception, or global infrastructure unless a future task explicitly requires it.
