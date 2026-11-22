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

## Independent tenancy episodes

Each saved setup retains its ID and immutable activation receipt. The first save uses its
operation UUID as the episode ID. Later saves and activation address that exact ID.
Each actor can have one editable draft per rental unit. For a selected applicant, the
application and its linked setup retain their identity through conversion and replay.
Historical setup reads are scoped to the original actor and current property permissions.

The setup path distinguishes scheduled possession from current possession. Lease by date
uses inclusive end dates, so a lease ending December 31 can coexist with one beginning
January 1. The database serializes writes per unit and enforces both nonoverlapping live
date ranges and one physical possession. The scheduled-start worker checks the date in
the property's time zone and leaves a reservation scheduled while an earlier household
holds possession. Unit-only resident and balance imports prefer physical possession and refuse
ambiguous future-only targets.

Apply the tenancy episode expansion first and verify the compatible build can open, save
and resume an exact setup. Contract only when that build is serving the rental workspace.
The contract retires two unit-only writers and then removes the superseded constraints.

## Tenancy closeout

The closeout URL identifies the tenancy episode. Open it from the activation receipt,
the current tenancy, or the property's past tenancy list. Property-scoped lease read
permission permits viewing. Property-scoped lease management permits changes. The
posted accounting summary also requires financial permission for that property.

Plan, cancel, and record returned possession are versioned and audited commands.
Plan a property-local date on or after today. Canceling clears the plan. A handback
requires the operator to confirm actual return and provide its date. The return can
be recorded from an active tenancy with or without a plan. It ends possession and
future recurring rent for that episode while preserving the signed lease term,
recorded possession dates, and posted charges. The handback date counts as the last
day of possession, so an eligible successor can start on a later property-local day.

The accounting view reads the episode's posted receivable balance, open charges,
and unsettled payments. Existing provider activity can still change the balance.
Closeout introduces no journal entries, transfers, refunds, deposit custody, or
post-close payment session. Historical closeouts without a handback date display
the existing closed tenancy with its date unrecorded.

The separate security deposit register on this page tracks the exact episode's
recorded obligation, externally confirmed receipt and custody information, and
itemized dispositions. Select scanned property evidence when recording the
deduction and supply the operator's notice and approval references. The selected
version becomes permanently associated with that tenancy. Corrections append a
reason and preserve history. The register leaves the posted receivable balance,
third-party custody, and settlement workflows separate.

Apply the forward closeout migration before serving these routes. It retains the
scheduled-start RPC signature, so the existing recurring worker can call it during
the rollout.
