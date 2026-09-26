# ADR-HR-2026-09-25 — homeowner management and rental intake

Status: founder-approved architecture; registered for local implementation.

## Locked boundaries
- `crecyos.com`: marketing and homeowner entry.
- `app.crecyos.com`: one engine; presentation follows the validated active organization.
- `rent.crecyos.com`: landlord-approved shared listings and applicants; discovery later.
- `crecyliving.com`: existing resident experience and community hosts.
- `owner.crecyos.com`: existing passive owner oversight, not a landlord workspace.
- No new identity service, ledger, tenancy engine, global homeowner role, or homeowner domain.

## Delivery order
Batch A: homeowner setup, existing signed rental, explicit financial cutover, scanned document,
recoverable invitation, and the existing Living relationship. No marketplace dependency.
Batch B: shared listings, inquiries, tours, applications, operator-controlled signing/selection,
and atomic conversion to the same tenancy engine. Public discovery remains deferred.

## Authority and exclusions
FD-HR-001 through FD-HR-005 narrowly extend FD-006/FD-037 and acquisition exclusions.
No new countries, prices, screening, applicant fees, automatic legal drafting, deposits online,
owner payouts, rent custody, public ratings, commissions, or vendor marketplace are authorized.
Existing finance/RLS/consent/entitlement and professional launch gates remain binding.
Presentation never grants access; submissions bind to an explicit, server-validated organization.
