# Homeowner signed-rental implementation checkpoint


Base: c40f595 on feat/homeowner-rental-batch-a, isolated worktree crecy-homeowner-rental.
Main remains 1be8ef122d3b2b4c55d9689d7518f2fed6f907f9. Draft PR64 remains
ca21898a82f1617b0163016f15a5b3ccd26e232e. No remote push, merge or deployment.

## Implemented in this continuation
- Private actor/organization/unit-scoped server drafts, explicit save/resume, revision conflicts.
- Homeowner signed-rental page with co-renters, existing/future occupancy, exact monetary input,
  explicit first charge and opening position, signed-version selection and two confirmations.
- Private upload through existing grant/storage/finalize lifecycle; recovery of a finalized
  receipt before the original issued-only inspection, so an interrupted response is retryable.
- Receipt metadata is saved before transfer; no file bytes, signed URL or token in the draft.
- Scan states remain authoritative; the client never marks a version clean.
- Activation delegates financial writes to the existing command, pins an immutable document
  version, and retains its result independently of short-lived command receipts.
- Invitations remain independent. Existing invitation acceptance provisions only the bound
  agreement into that resident's portal, with exactly-once delivery and audit/outbox evidence.
- Future bound leases start through the existing hourly rent runner at property-local midnight;
  early or duplicate runs do not start twice. No new scheduler has been introduced.
- Professional lease entry remains unchanged; self-managers enter the new protected workflow.

## Evidence boundaries
The SQL lifecycle is tested in disposable PGlite, including scanner fixture verdicts through
claim/complete commands, invitations through existing commands, and actual local ledger charges.
Rendered forms exercise API/storage mocks. Browser checks use disabled unconnected preview
surfaces. None of these substitutes for connected Supabase, real scanner/SMTP or production proof.

## Final verification
`pnpm check` exited 0 on 2026-09-26: lint (0 errors; 5 pre-existing warnings), TypeScript,
648 Vitest tests / 90 files, full PGlite migration/command suite, schedule check, migration
placement check, local production build, and 240 Playwright checks. Browser screenshots
at 320/390/1440px are in /tmp/crecy-homeowner-evidence/lease-*.png; the 390px image was inspected.
The full transcript is /tmp/crecy-homeowner-evidence/lease-final-check.log.

New database coverage proves draft isolation, stale-save refusal, same-save replay, quarantine
and rejected/newer-version refusal, exact-version binding, finance permission, non-backdated
cutover, balanced opening, first rent generated once, safe late activation replay, invitation
reissue and acceptance, recipient-only document delivery/balance, expired membership denial,
and future signed leases starting once at the property's local midnight.

## Remaining gates and rollout
This is the local A3/A4 implementation checkpoint, not full Batch A or launch certification.
Next: authenticated connected browser rehearsal using a disposable Crecy test environment,
including actual private storage, scanner transport, mail capture and resident acceptance,
then balance/messages/maintenance regression. Do not reuse the running Korent local database.
Homeowner public entry/copy/localization and new draft privacy/retention integration still need
closure before a broad homeowner release. Public shared listings remain Batch B.

Before any release, recon/reconcile draft PR64 and preserve its mobile work. Apply both additive
homeowner migrations to the intended test environment before deploying this code there; the
new finalization recovery and recurring worker depend on the new RPCs. Validate that rollout,
then deliberately release. No production migration, DNS change, push, merge, mail or charge
was performed here. Branch-specific Vercel deployment suppression remains intact.
