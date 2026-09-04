# Backup & Restore Runbook (§7.2)

The restore drill is a hard pilot-admission gate: before the first real operator is admitted, the
restore procedure must have been exercised, the operational owner must know where this runbook is, and
the last successful restore date must be recorded (plan §7.5, Recovery / restore coupling).

## Current state — BLOCKER (verified 2026-09-04, live)

| Fact | Value | Source |
| --- | --- | --- |
| Supabase org plan | **Free** | Management API `GET /v1/organizations` → `plan: null` |
| Automated daily backups | **none** | Free tier does not include them |
| Point-in-time recovery (PITR) | **disabled** | `GET /database/backups` → `pitr_enabled: false` |
| Backups on record | **0** | `backups_count: 0`, `latest: null` |

**The production database has no disaster-recovery protection.** A pilot must not admit real financial
and resident-PII data onto a database with no backup. This is a billing/plan decision (founder):

- **Minimum:** upgrade the `Property` project's org to **Supabase Pro**, which provides automated
  daily backups (7-day retention).
- **Recommended for financial data:** additionally enable **PITR** (point-in-time recovery) so an
  incident can be rewound to a moment, not just to the prior nightly backup.

Until then, §7.2 cannot pass and Gate 9 stays red on this criterion.

## The drill, to run once backups exist

Supabase restores are project-level, so restore into an **isolated environment**, never over
production:

1. **Source.** Confirm a backup exists: Management API `GET /v1/projects/{ref}/database/backups`, or
   Dashboard → Database → Backups. Note its timestamp.
2. **Isolated restore.** Create a Supabase **branch** (or a throwaway project) and restore the backup
   into it — never restore in place on the production project during a drill.
3. **Verify representative rows survived** (query the restored branch):
   - one `organizations` row and its `organization_subscriptions`;
   - one `properties` + `units`;
   - one `tenancies` (resident relationship);
   - one `journal_transactions` with balanced `journal_entries` (the ledger invariant);
   - one `payments` row and its allocation/metadata;
   - one `owner_entities` + `ownership_interests`;
   - one `documents` + `document_versions` (metadata; object bytes live in Storage, backed up
     separately — note Storage restore scope explicitly).
4. **Record** date, source backup timestamp, procedure, result, and any defect found — here and in the
   checkpoint's "last successful restore" line.

## Incident rule (from §7.5, do not regress)

Crecy uses forward-only migrations. Do **not** reverse a production migration as a generic rollback.
For a schema/data incident choose deliberately among: pause the affected capability, forward-fix,
restore from a verified backup into an approved recovery path, or an application rollback only when it
is schema-compatible. A destructive down-migration must never be improvised during a pilot incident.
