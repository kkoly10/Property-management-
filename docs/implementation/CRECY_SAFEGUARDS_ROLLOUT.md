# Crecy signing and ownership safeguards rollout

## Baseline observed on November 22, 2026

The production application resolved to main at d538584184109bfec9d05d1a3199d93861eb347a. The Supabase production project had 129 recorded versions. Of those, 73 match main's expand files directly, 52 are older aliases of versions also present under canonical names, one is the vendor alternate, and three are homeowner foundations. [Production mapping](LAUNCH_RUNBOOK.md) · [Deployment](https://vercel.com/komlan-kouhikos-projects/property-management/5j9cNGLzRf6pqUZ64m8vLoUZVKS5)

| Production observation | Release treatment |
| --- | --- |
| Vendor migration 20260918023819 has the same SQL as repository migration 20260918090000, with one extra standalone semicolon after commit. Vendor write and scoped workspace grants match the repository. | Preserve the canonical file and recognize the existing application when planning a release. Reconcile the ledger separately from SQL execution. |
| Homeowner setup, existing rental and listing versions are recorded. Their SQL viewer is empty. Installed homeowner functions and grants match their repository definitions in the native replay. Private lease setup and public listing tables are present. | Treat those three versions as the foundation to upgrade. Retain the original migration files and verify the live constraints and policies before any schema rollout. |
| Inquiry, tour, application and discovery versions have no matching history rows and their defining catalog objects were absent. | Evaluate the four pending dependencies in order when testing the integrated homeowner candidate. |
| The 14 grants targeted by the 20260828130000 unscoped operator contract are still effective for authenticated callers. | Smoke the scoped callers and handle that contraction as its own release step. |
| Both service grants targeted by the 20260918130000 invitation writer contract are already absent. The invitation status readers and the attach credential command retain service execution. The contract has no matching ledger row. | Reconcile the recorded history separately from the verified access state. |
| Legacy signing and payment export RPCs remain callable by authenticated users. | Retire legacy signing only after the compatible application is verified. Review the export's implicit organization separately. |
| The dashboard shows Free plan without scheduled project backups. | Verify a recoverable database and Storage artifact backup and restore exercise before a production schema rollout. |

A disposable native PostgreSQL 17.12 replay using current main expand SQL, the recorded vendor body, the three homeowner foundations and the invitation-writer grant state matched all 30 inspected production function definitions and effective authenticated, service and anon grants. That fixture accepted both new expand migrations and the later signing contract with the expected privilege transitions. Storage HTTP behavior, actual data, legacy aliases and provider execution require separate evidence.

## Release sequence

1. **Rehearse the upgrade.** Verify the target environment, role and schema inventory. Use both a clean database and a production-shaped fixture. Review unresolved overlap or owner-coverage gaps using read-only aggregate checks. Existing evidence, financial history and ownership rows retain their original values. Address exceptions with audited changes through the correct authority path.
2. **Apply the forward expand migrations on the approved target.** Review the exact file list after reconciling the history. Ownership uses the existing RPC signatures. Signing adds the new authenticated delivery purpose and server-authorized version-bound write. At this stage, the old application can still execute its signing RPC.
3. **Deploy and smoke the compatible application in a controlled environment.** Deliver a known clean V1 explicitly for signature, add an eligible sibling version, and confirm pinned review, canonical disclosure, recipient identity, status handling and replay. Confirm a review-only delivery still supports acknowledgment and a completed certificate remains retrievable. Exercise staff invites, active-owner succession and ownership creation. Check worker and portal behavior with the same deployment and database.
4. **Apply the specific signing contract after the callers switch.** Retire the old public signing grant and establish the final narrow version and clean Storage policies. Prove that authenticated direct writes, changed consent, expired and declined signing, and a sibling or quarantined object download are denied. Recheck scoped operator access, normal upload and scan paths, and completed historical copies. Certify acceptance with synthetic objects through both HTTP and SQL.
5. **Recheck data and receipts.** Confirm existing agreements and ownership history remain readable by authorized parties. Retain V1 source hashes and old receipt identifiers. For unexecuted legacy deliveries, reissue an explicit signature request if signature is required.

Use a reviewed migration list and preserve recorded version aliases until an explicit history decision has been approved. Reverting the application before contraction can still use the old signing endpoint. If a regression occurs after contraction, use the verified compatible build or a forward fix. Review any privilege restoration separately because it reopens the legacy command.

## Scope of this slice

This slice protects the existing per-delivery signature and authority paths. A complete multi-party agreement, applicant-to-signing bridge and generalized future-possession scheduling retain their separate implementation and verification steps.

All four pending homeowner migrations replayed on the production-shaped local fixture after the safeguards, with the new signing grants intact. A dry merge against the current homeowner tip found 14 source conflicts, including the common schema fixture. Before shipping that integration, reconcile those paths, prove the shared scheduled-activation job, and run connected tests for signing, listing intake and the operator and owner portals.
