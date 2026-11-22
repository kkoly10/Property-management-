# Contract releases — NOT part of the ordinary migration set

Everything in `supabase/migrations/` is **additive** and safe to apply at any time, in timestamp order,
without coordinating with a deploy. That property is what makes `supabase db push` a safe command.

The migrations in **this** directory are not. Each one **removes** something the previously deployed
application still uses, so applying it before the compatible build is live takes the product down.

They live here, outside the migration path, because a directory whose safe execution depends on someone
remembering to stop halfway through, deploy, and resume is not a safe directory. A fresh engineer
following the repository's standard instructions must not be able to break production by doing the
normal thing.

## The release procedure

For each file here, in timestamp order:

1. **Expand.** Apply everything in `supabase/migrations/`. This is additive; the running application is
   unaffected.
2. **Deploy.** Ship the application build that uses the new surfaces.
3. **Verify.** Confirm the deployed build is actually calling them — not merely that it built. Smoke
   the affected screens against the target environment.
4. **Contract.** Only now apply the file from this directory.
5. **Smoke again**, immediately. A contraction is the step most likely to surface a caller nobody knew
   about, and the window to notice is right after it runs.

Steps 1–3 can be repeated safely. Step 4 cannot be undone by re-running anything here — restoring a
grant requires a new forward migration.


## Release sequence for `20260918130000_phase_8_retire_invitation_email_marks.sql`

This one retires `mark_staff_invitation_email_sent` and `mark_relationship_invitation_email_sent` from
`service_role`. The currently deployed invitation routes **call them**, so applying it before the new
build is live breaks every invitation on the running site. The order is not advisory:

1. **Verify the production migration ledger.** Confirm which migrations the target project has actually
   applied, and that `20260918120000_phase_8_invitation_email_delivery.sql` is not among them yet.
   Confirm you are pointed at the right project first — see the runbook's §1 note on the project ref.
2. **Apply the additive migration only:**
   `supabase/migrations/20260918120000_phase_8_invitation_email_delivery.sql`.
   It is additive — new overloads, a new `service_role`-only attach command, a new delivery-state
   helper, a widened scrub trigger. The running application is unaffected by all of it.
3. **Do NOT apply the contract migration yet.** The deployed build still calls the mark-as-sent RPCs.
4. **Deploy the compatible application build** (this PR, once merged).
5. **Verify the new architecture is actually in use**, not merely built: send one staff invitation and
   one relationship invitation against the target environment, and confirm the queued job carries
   `authTokenHash`, that the rendered link points at `/auth/confirm` on the recipient's own origin, and
   that no call to `mark_*_invitation_email_sent` remains in the deployed route code.
6. **Apply the contract migration:**
   `supabase/migrations-contract/20260918130000_phase_8_retire_invitation_email_marks.sql`.
7. **Verify again immediately.** Send one more invitation of each kind and confirm delivery state still
   advances to `sent` through `complete_notification_job`. This is the step most likely to surface a
   caller nobody knew about, and the window to notice is right after it runs.

Step 6 cannot be undone by re-running anything here; restoring the grants requires a new forward
migration. Steps 1–5 are all repeatable.

## What is in here

For `20261122143918_retire_implicit_payment_export.sql`, apply the scope expansion first. Smoke the
Payments export in the selected workspace with date, property, accounting book and MFA filters.
Then remove the legacy RPC grant and verify the scoped CSV and organization-switch tests again.

| File | Removes | Safe only after |
| --- | --- | --- |
| `20260828130000_phase_8_close_unscoped_operator_surfaces.sql` | `EXECUTE` for `authenticated` on 11 unscoped operator **collection** RPCs, and on the browser `create_organization` | the build whose fetchers pass an explicit organization, and whose onboarding creates organizations through the server boundary |
| `20261122144145_retire_unfenced_queue_settlement.sql` | `EXECUTE` for `service_role` on four legacy job settlement RPCs | scheduled and manual workers use the fenced RPCs and the previous workers have finished or been recovered. See [runtime worker recovery](../../docs/implementation/RUNTIME_WORKER_RECOVERY.md). |
| `20261122072946_retire_unbound_signing_and_broad_download.sql` | Direct execution of `sign_document`, delivery-based access to sibling versions and nonclean storage objects, and declining a signed delivery | the build using `sign_reviewed_document` and delivery-specific downloads |
| `20261122144712_enable_independent_tenancy_episodes.sql` | The two unit-only homeowner setup writers and their superseded uniqueness constraints | the build using explicit setup IDs for save, activation, and application handoff |

## Tenancy episode release sequence

1. Confirm `btree_gist` is available and apply `20261122144708_tenancy_episodes_and_temporal_guards.sql`. Both old uniqueness rules still apply. The new date and physical-possession guards must exist before removing either.
2. Deploy and smoke-test the compatible app. Check existing episode read, resume, activation and applicant handoff with exact IDs. Retain the verified compatible build after contracting.
3. Apply `20261122144712_enable_independent_tenancy_episodes.sql`, then verify a distinct successor draft, nonoverlapping future reservation, overlap denial, delayed possession and old receipt access. Reinstating the old uniqueness rules is unsafe once separate drafts or reservations exist; repair forward.

## Signing release sequence

1. Apply the additive `20261122072817_signing_review_and_access.sql` migration. Existing delivery, acknowledgment, download, and signature paths still work with the previous application.
2. Deploy the compatible build and verify its server credential calls the guarded write. Verify an ordinary delivery, an explicit signature request, review of the exact delivered version, a completed signature and replay, and a preexisting certificate.
3. Apply `20261122072946_retire_unbound_signing_and_broad_download.sql`. This step is required before treating the legacy signing and broad Storage paths as closed. Keep the compatible build deployed after contracting. Restoring a legacy grant or policy would require a separately reviewed forward migration.
4. Repeat the smoke checks with a recipient who holds only a delivery grant, and verify sibling and quarantined objects are inaccessible at the Storage boundary. Confirm the upload grant still permits upload verification before finalization.

Existing completed signatures and their certificates remain intact. Existing unsigned deliveries can still be acknowledged or downloaded when delivered. An operator who needs a signature on a previously delivered document can send a new delivery with the signature option selected.

## How this is enforced

`npm run check` runs `scripts/check-migrations.mjs`, which fails if a contract migration is found in
`supabase/migrations/`. `npm run test:db` still replays this directory **after** the expand set, so the
end state — including every revocation — is proven on every run. The separation is about *when* a human
may apply them, not about whether they are tested.
