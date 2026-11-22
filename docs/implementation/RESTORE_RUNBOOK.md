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

## Local synthetic rehearsal — 2026-11-22 UTC

The rehearsal replayed 89 expand migrations followed by 6 contract migrations from
`383794d19c93d04192747e0a92a5418a1b19a8e3` on PostgreSQL 17.12. The migration bundle SHA-256 was
`35ecc94bdef4cb56539ee35d09d9b8c2de4a7346ccbd9d93f740b41749423422`.

| Evidence | Observed result |
| --- | --- |
| Snapshot | `crecy-local-restore-nuHuep`, PostgreSQL system ID `7711017260642773284`, captured after a clean stop at 15:25:18.499Z. The source, snapshot, and restored `pg_control` SHA-256 matched before startup. |
| Execution | The source and successive restore servers bound to `127.0.0.1:55443` and used separate data directories. Source prechecks and restored database checks matched. Both servers stopped after use. |
| Recovered relationships | One organization with subscription, one property and unit, one tenancy and household member, one full owner interest, one payment and allocation with receipt metadata, and two documents linked to Storage object metadata. |
| Ledger | Three journals and six entries. The opening balance, rent charge, and manual payment each had equal debit and credit totals of 42,500, 185,000, and 85,000 minor units, respectively. |
| Auth boundary | Two synthetic `auth.users` identities restored. The administrator could read the scoped payment workspace, and the outsider received `ORGANIZATION_SCOPE_DENIED`. Payment row-level security remained enabled. |
| Storage | Two fixture files restored separately from the database and matched their recorded sizes and SHA-256 digests. A same-size byte change failed SHA-256 verification. An absent object failed the file read. |
| Timing and recovery | The run started at 15:25:11.528Z and ended at 15:25:23.549Z. Restoring from the existing snapshot through database and Storage verification took **2.545 seconds** from 15:25:20.864Z to 15:25:23.409Z. All committed fixture writes through the clean shutdown were recovered. |
| Correction | The first Windows attempt stalled while waiting for subprocess output after PostgreSQL had started. The runner now waits for the control process to exit with standard streams disconnected and bounds the database start and stop. |

| Separate Storage file | Bytes | SHA-256 |
| --- | ---: | --- |
| `payment_evidence.fixture` | 61 | `510f8734bf095a111ba5a21b540b004b8894b46d0a7276ef78493f67bd2fcb6e` |
| `signed_lease.fixture` | 57 | `23f3882c4dfedd0ff91c37090c852805f61b6a15d842504a366c2037694db659` |

Reproduce with Node.js 22 or later, PostgreSQL 17 binaries including `initdb` and `pg_ctl`, a tools
directory with the `pg` package, and a writable scratch parent. Run from a checkout with committed
migrations and a free loopback port 55443.

```text
node scripts/validate-local-restore.mjs <postgresql-bin> <pg-tools-directory> <scratch-parent>
```

The runner creates a unique scratch directory and records `result.json`, source and restore logs,
the stopped database snapshot, and the separate Storage copies. It uses the repository's synthetic
Auth and Storage tables. The hosted gate requires current backup evidence, a supervised restore into
an isolated Supabase target, and verification of hosted Auth, Storage, and recovery timing.

## Incident rule (from §7.5, do not regress)

Crecy uses forward-only migrations. Do **not** reverse a production migration as a generic rollback.
For a schema/data incident choose deliberately among: pause the affected capability, forward-fix,
restore from a verified backup into an approved recovery path, or an application rollback only when it
is schema-compatible. A destructive down-migration must never be improvised during a pilot incident.
