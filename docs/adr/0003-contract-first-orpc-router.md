# ADR 0003: Contract-First oRPC Router

## Context and Decision

Client-server communication requires end-to-end type safety, runtime schema validation, OpenAPI generation, and request batching support. Rather than maintaining manual tRPC routers or raw Hono route definitions, we chose oRPC v1.15 with contract definitions located in `packages/contracts`.

The server implements contracts via standard Hono middleware, and the web client consumes an automatically typed client via `@orpc/client` and TanStack Query.

## Consequences

- Full compile-time contract safety across monorepo boundaries with zero code generation steps.
- Supports request batching up to 4 calls per batch via `BatchHandlerPlugin`, reducing HTTP roundtrips on mobile clients.
- Every API change must start in `packages/contracts`, guaranteeing that schema modifications cannot break callers silently.
