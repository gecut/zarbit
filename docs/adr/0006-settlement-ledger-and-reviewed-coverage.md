# Settlement accounting requires durable boundaries and reviewed coverage

Settlement is reconstructed from the trusted Telegram announcement, without sending orders. Synthetic closes remain typed records in `Trade`, reuse signed WACB, and are excluded from market heads and request triggers. The first trusted message establishes a zero-position baseline; it never invents prior inventory.

A shared worker coordinator persists financial observations and catches up Telegram history to a fixed message ID. PostgreSQL locks and uniqueness protect commit idempotency, but cannot prove message delivery order or unseen deleted receipts. Therefore later settlements require a human-reviewed coverage digest bound to the observed inbox and normal trades. Late receipts and corrections close the financial gate and require documented reconciliation, rather than automatic historical rewriting.

Analytics V2 exposes both contributions and coverage metadata. Legacy strict contracts reject post-settlement accounting rather than silently presenting normal-only results as complete. Activation remains disabled until the exact raw announcement and numeric sender/bootstrap message identities are verified.
