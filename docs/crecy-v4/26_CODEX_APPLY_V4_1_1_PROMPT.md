# Codex — Apply and Validate Crecy v4.1.1

Treat this directory as the only authoritative Crecy specification.

1. Replace files `00`, `12`, `13`, `14`, `17`, and root `AGENTS.md` with these v4.1.1 versions; add files `25` and `26`.
2. Confirm file 12 contains no grants to views created in file 13.
3. Decompose file 12 into dependency-ordered, forward-only migrations without weakening constraints.
4. Execute migrations and file-13 RLS setup against a disposable Supabase/PostgreSQL database.
5. Prove same-key pre-organization idempotency, co-owner isolation, resident base-work-order denial, delivery-only selected-tenancy announcements, property-scoped import/document isolation, and persisted bounded refunds.
6. Run every RLS attack case through RLS-030 and record evidence.
7. Commit the specification/migration correction before application feature work.

Do not begin real payment, resident, owner-portal, or messaging implementation until these checks pass.
