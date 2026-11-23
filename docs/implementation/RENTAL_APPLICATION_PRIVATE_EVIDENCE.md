# Private rental application evidence

## Availability

`CRECY_RENTAL_EVIDENCE_ENABLED=1` exposes the restricted applicant and reviewer interfaces. The database also requires an explicitly approved, enabled policy for the listing’s exact property and an eligible workspace. The migration creates zero policies. Keep the gate off until the jurisdiction, request categories, notice, review and disposition workflow, and retention schedule have been approved. Publishing informational requirements does not enable document collection.

The initial application records the exact published requirement version even with the gate off. Restricted review only applies to applications that captured an eligible policy on intake. An operator changing the listing does not overwrite the applicant’s saved criteria. Before submitting a packet, the applicant acknowledges any change against the current listing version while the original requirements remain in effect.

## Applicant and reviewer access

Applicants verify contact by email, use a confirmed account with recent TOTP, and explicitly link the original verified application capability to the account. The renter accepts a versioned evidence-sharing notice specific to the policy. The account can resume drafts from an authorized device. Allowlisted, renter-supplied files and an optional self-reported score remain a separate restricted packet. The score is unverified. Applicants can supply an optional source category and observed date with their score. The workflow does not request a credit pull or calculate a score.

Reviewers need a fresh TOTP challenge, the current selected workspace, active permission for the exact property, and the case’s designated reviewer assignment. The reviewer receives only the submitted packet and can request a correction or select an applicant after verifying the required checklist. Selecting a packet is a human decision and permits the existing separate lease preparation action. It does not send a lease or activate a tenancy. An unfavorable decision involving credit material is gated on an approved notice process. Acceptable alternatives remain under the reviewed policy.

## Storage and cleanup

Use the private `private-rental-evidence` bucket. A signed-in applicant may create one opaque, immutable object at the path issued by their current grant. Clients cannot list, replace, or fetch evidence directly. The app verifies size, file signature and exact SHA-256 before finalizing the upload. A fenced scheduled worker only uses the approved Vercel Sandbox scanner snapshot. It never falls back to generic relay or credit-processing providers. The isolated verdict must attest to the exact bytes; only a clean, currently authorized file is downloadable through the app. Download responses do not cache and do not return a shareable Storage URL.

Withdrawal, conversion, closure, and policy disablement remove interactive access. Terminal schedules and removed/expired upload grants become eligible for a bounded purge. A hold blocks purge selection. Object deletion must succeed before the file digest is cleared and its tombstone recorded. `CRECY_RENTAL_EVIDENCE_PURGE_ENABLED=1` keeps that cleanup running if new collection is disabled after launch. The retry schedule and legal-hold change procedure must be proven in the deployment environment. External backups, handoffs and evidence export require their own retention and authorization rules.

## Acceptance

Use synthetic identity and financial files. Verify cross-application and cross-workspace denial, stale TOTP, applicant recovery, late and duplicate uploads, modified bytes, pending/rejected verdicts, worker retry, reviewer correction and replay, legal-hold and terminal purge. Also verify actual account confirmation on the rentals hostname and scheduled Storage plus scanner behavior before enabling a policy with any real files.
