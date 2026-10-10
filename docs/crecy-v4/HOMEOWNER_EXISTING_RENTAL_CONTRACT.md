# Homeowner existing signed rental — A3/A4 contract

Recon: c40f595 local; main 1be8ef1 and draft PR64 ca21898 unchanged. No production writes.
Existing activation uses a document ID and accepts any clean version. The upload route can
reject a replay after successful finalization. Resident delivery requires an active relationship.

Plan: save private drafts per actor, organization and unit with optimistic versions. Activate
only the confirmed saved version, using the existing tenancy and financial commands. Bind the
exact clean agreement version, require an explicit opening position and first charge date,
and preserve the result for safe retries. Keep invitations separate from tenancy creation.

Adversarial checks: reject cross-organization and expired access, stale drafts, wrong or
rejected document versions, conflicting retries and duplicate activation. Provider failures
must not ask the homeowner to recreate the tenancy. All tests remain local.

## Persistence and commands
- private.homeowner_lease_setups: actor/organization/unit unique, revision, bounded draft,
  last-save receipt and permanent activated result. RLS enabled; no browser table privileges.
- leases.signed_document_version_id: organization-consistent and immutable once bound.
- get_homeowner_lease_setup: authenticated lease.manage + documents.manage, self-managing
  workspace, exact actor draft and authorized latest-version choices; no implicit tenant.
- save_homeowner_lease_setup: expected revision + operation UUID; same-key replay, conflict
  on changed payload or revision. Audited/evented without household text in event payloads.
- activate_homeowner_lease_setup: consumes saved revision and two true confirmations;
  existing activation command remains financial authority. Immutable result survives retries.
- recover_document_upload: authenticated original actor and current parent permission;
  returns only document/version IDs and scan status for a finalized matching checksum.
- private.deliver_homeowner_signed_lease: existing relationship activation is the caller;
  fixed bound-version portal delivery, audited/evented, exactly once per resident/lease/user.

## Research and verification
Read current Supabase function privilege and signed-upload references, and PostgreSQL 17
row-locking reference before building. Signed upload overwrite options belong on URL creation.
No direct document-version release or fake provider outcomes; DB tests must drive the
existing finalize, claim and complete scan commands with explicit test-provider fixtures.
Local embedded SQL verification is not live Supabase/provider certification.

Research references used for this slice:
- https://supabase.com/docs/guides/database/functions
- https://supabase.com/docs/reference/javascript/storage-from-uploadtosignedurl
- https://www.postgresql.org/docs/17/explicit-locking.html

## Future signed rental runtime delta
Recon found no scheduled-to-active transition in the existing rent worker. A new service-only
start_due_homeowner_tenancies command is therefore called by the existing hourly recurring
worker before due-schedule evaluation. It applies only to bound, active homeowner leases,
uses the property's local date, respects lease end/unit/book state, locks each tenancy,
and emits one start audit/event. Early and duplicate invocations must not start or charge.
No new scheduler, provider or deployment is introduced. Local tests are not runtime certification.
