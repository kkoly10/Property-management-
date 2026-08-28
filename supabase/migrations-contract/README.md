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

## What is in here

| File | Removes | Safe only after |
| --- | --- | --- |
| `20260828130000_phase_8_close_unscoped_operator_surfaces.sql` | `EXECUTE` for `authenticated` on 11 unscoped operator **collection** RPCs, and on the browser `create_organization` | the build whose fetchers pass an explicit organization, and whose onboarding creates organizations through the server boundary |

## How this is enforced

`npm run check` runs `scripts/check-migrations.mjs`, which fails if a contract migration is found in
`supabase/migrations/`. `npm run test:db` still replays this directory **after** the expand set, so the
end state — including every revocation — is proven on every run. The separation is about *when* a human
may apply them, not about whether they are tested.
