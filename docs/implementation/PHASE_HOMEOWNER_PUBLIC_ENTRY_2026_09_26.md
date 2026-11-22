# Homeowner public entry — 2026-09-26

## Scope
This slice gives the locked self-managing architecture a truthful public entrance without enabling the
marketplace. It adds `/landlords`, preserves self-managing intent through signup confirmation, and
resolves an authenticated user into an explicitly selected or newly created self-managing workspace.

## Security and tenancy boundary
The acquisition hint is presentation only. It grants no role, organization, property, or resident
relationship. Existing accounts are never silently moved into a different organization. The canonical
organization context and live membership validation remain the authorization boundary.

## Marketing boundary
The public page describes the existing-renter workflow that is implemented locally. It says explicitly
that public listings, inquiries, tours and applications are the next expansion. It does not claim traffic,
screening, lease legality, provider certification, country launch certification, or marketplace availability.

## Connected-test blocker
A disposable connected rehearsal was attempted before this slice. The Mac's Colima/containerd store
failed writes with input/output errors, and the production Crecy Supabase project has no existing preview
branch. No production database was modified and no billable Supabase branch was created.

## Release boundary
Local implementation only. Do not push, deploy, apply production migrations, alter DNS, send real mail,
or create real charges from this phase without a deliberate release step.
