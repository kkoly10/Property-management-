# Homeowner implementation — local A1/A2 handoff

> 2026-09-26 continuation: the signed-rental A3/A4 implementation is now recorded in
> `HOMEOWNER_SIGNED_RENTAL_LOCAL_HANDOFF.md`. The original checkpoint below remains historical.


## Checkout and release boundary
Worktree: `/Users/komlankouhikocrecyolympe/Developer/crecy-homeowner-rental`.
Branch: `feat/homeowner-rental-batch-a`.
Base: PR64 `ca21898a82f1617b0163016f15a5b3ccd26e232e`, two commits ahead of
main `1be8ef122d3b2b4c55d9689d7518f2fed6f907f9`. The mobile PR remains draft and unmerged.
This stack is local. Its branch is explicitly deployment-disabled in `vercel.json`.
No push, merge, production migration, provider message, charge, or DNS change was performed.

## Implemented
Validated active-organization presentation, both existing navigation surfaces, homeowner
onboarding redirect, private rental overview/setup/detail, explicit new or existing property
and rental-account selection, room/shared-space descriptors, stable submitted-request
recovery in actor/organization-scoped session storage, and the authenticated creation endpoint.
`create_homeowner_rental` composes the existing entity/book, property and unit commands
atomically. Existing unit limits apply. Durable receipts survive child-receipt cleanup.
The saved rental links into the existing tenancy workflow with its property and unit selected.
The application still uses the original management, tenancy, financial and resident systems.

## Verification sources
`/tmp/crecy-homeowner-evidence/baseline.log` — unchanged PR64 baseline.
`/tmp/crecy-homeowner-evidence/final-check.log` — complete local gate.
`/tmp/crecy-homeowner-evidence/form-tests.log` — form/retry component tests.
`/tmp/crecy-homeowner-evidence/setup-*.png` — local browser captures.
These tests use PGlite, mocked authentication/network edges, and explicit unconnected browser
previews. They do not certify production Supabase, provider delivery, or a live lease-to-resident journey.

## Next slice — A3/A4, not completed here
- Integrate signed-agreement upload and asynchronous clean-version checks into the homeowner flow.
- Require and explain explicit first charge date/opening position; prevent accidental historical rent.
- Replace the legacy existing-lease form's shared draft key and transient activation key with scoped,
  recoverable activation. That old form was only adapted here to preselect the chosen unit.
- Verify tenancy activation, invitation retry, acceptance and resident access as one authenticated journey.
- Add cross-device/server-side journey recovery and locale completion as required by the full spec.
  This slice retains a submitted operation in the current browser tab; unsent fields are not cloud-saved.
- Complete the related marketing entry and launch disclosures before presenting the full offering publicly.

Batch B (shared listings, inquiries/tours/applications/signing conversion) and public discovery
remain unimplemented. `rent.crecyos.com` has not been activated or added to production routing.
Reconcile PR64 before preparing a production merge. Apply the additive migration before
releasing application code that consumes `customerPath` and `units.rental_details`.
Do not claim that the complete homeowner product or all of Batch A is pilot-ready from this slice.

## Final local verification
`pnpm check` completed with exit code 0 after the dynamic rental route's explicit demo
fixture was registered in the existing automatic mobile-route coverage.
- Lint: no errors; five existing unused-import warnings retained.
- TypeScript: passed.
- Vitest: 626 tests across 85 files passed (baseline: 611 across 82).
- PGlite: authority and all existing command suites passed, plus three homeowner spaces,
  explicit book/property reuse, atomic limit rollback, durable and late replay, cross-organization
  denial, property-scoped staff denial, expired-membership denial, and SELECT-only unit writes.
- Scheduler: four jobs in sync. Migrations: 75 expand, two contract; checks passed.
- Production build: passed locally. Playwright: 236 tests passed, including the new setup
  at 320/390/1440 pixels and automatic 390-pixel coverage for every new route.
- Visual review: the 390-pixel setup capture was inspected. No horizontal overflow was detected.
The preview suite logs Supabase-not-configured warnings on document routes; this is not
connected-provider/document-flow certification. No production credentials were copied into this worktree.
