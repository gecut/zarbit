# ADR 0002: Dedicated Worker Ownership of MTProto Sessions

## Context and Decision

Telegram MTProto user accounts require persistent SQLite session storage, active socket connections, and strict serialized operation ordering. To isolate high-risk external Telegram protocol failures from user-facing HTTP traffic, all MTProto client sessions are strictly owned by `apps/worker`.

The worker guards the `/sessions` directory with an exclusive SQLite OS file lock (`.worker-owner.sqlite`). The API server (`apps/server`) has zero MTProto dependencies, does not mount the session volume, and communicates with the worker strictly via internal HTTP on private port 3002.

## Consequences

- The web API remains completely stateless and unblocked by Telegram network spikes or worker restarts.
- Exactly one worker instance may run at any time; running multiple workers against the same `/sessions` volume is blocked by the OS lock.
- User session disconnects and cancellations are transactionally committed to PostgreSQL by the server before worker dispatch, ensuring clean revocation even if the worker is offline.
