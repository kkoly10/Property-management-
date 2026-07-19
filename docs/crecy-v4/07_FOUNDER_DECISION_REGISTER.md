# Founder Decision Register — Closed for Gate 0

**Version:** 4.0  
**Status:** All founder-controlled P0 decisions approved  
**Date:** 2026-07-19

Coding agents must implement these decisions and may not reopen them without a dated founder change record.

## Product and customer

- Crecy is B2B2C SaaS. Operators pay; residents, owners, and invited vendors participate through operator relationships.
- Primary initial market: growing self-managing landlords and small property managers with roughly 5–100 units.
- Secondary entry market: landlords with 1–4 units.
- Target architecture supports larger portfolios, but enterprise procurement features are not P0.
- P0 surfaces: Crecy OS, Crecy Living, and basic Crecy Owner. Crecy Vendor is post-pilot unless a signed pilot requires it.
- Public rental marketplace and open vendor network are post-launch.
- Launch posture: nationwide neutral software for the United States, Canada, and Mexico.
- Operators provide/control leases, policies, notices, fees, deposits, applicant decisions, and legal documents. Crecy imports, versions, delivers, and operationalizes them without legal certification.
- Expansion research order after North America: Ghana, Nigeria, Singapore.

## Data, country, and accounting

- One global codebase and canonical core.
- One organization may own multiple operating entities.
- Each operating entity may own one or more accounting books.
- Each accounting book has one immutable functional currency after first posting.
- Each property belongs to one active operating entity and accounting book at a time.
- Property location—not user IP/GPS—provides country/subdivision context.
- Country profiles cover currency, language, payment rails, formats, platform notices, and provider capability; they do not certify landlord-tenant law in P0.

## Payments

- Provider-neutral orchestration with Stripe first in North America.
- Eligible operators use a full-Dashboard/Standard-equivalent connected account with Stripe-hosted onboarding.
- Resident rent uses direct charges on the operator connected account.
- Crecy does not pool, custody, or redistribute resident rent.
- Provider fees are charged to the connected operator where supported.
- SaaS subscription billing is separate from resident rent.
- Monetization is subscription-first; no Crecy application fee on rent in P0.
- No mandatory resident convenience fee/surcharge in P0.
- Payment targets: US ACH + cards; Canada ACSS debit + cards; Mexico MXN bank transfer/SPEI-supported flow + cards.
- Operators may record cash/external bank transfers with permission, evidence/reason, receipt, audit, and reconciliation state.
- Security deposits are tracked but not collected online in P0.
- Automated owner payouts are not P0.

## Pricing and packaging

- Four plans: Free, Starter, Growth, Pro.
- 30-day no-card Growth trial.
- Country-localized price books, not live FX conversion.
- Annual billing approximates ten monthly payments.
- Owner portal begins on Growth; advanced owner accounting/approvals are Pro.
- Branding: Crecy on Free/Starter, co-branding on Growth, advanced branding on Pro; custom domains post-MVP.
- Assisted pilot onboarding with self-service imports underneath.

## UX, brand, and technology

- Brand: Crecy. Product names: Crecy OS, Crecy Living, Crecy Owner, Crecy Vendor.
- Domains: `crecy.com`, `app.crecy.com`, community portals under `*.crecyliving.com`; owner/vendor may use `owner.crecy.com` and `vendor.crecy.com`.
- Wordmark-led, light-first “Calm Global Infrastructure.”
- Typography: Inter, Noto Sans fallback, JetBrains Mono for identifiers/financial figures.
- Components: shadcn/ui + Radix + Tailwind CSS + TanStack Table.
- Crecy Living launches as responsive mobile-first PWA; native apps post-validation.
- English and Spanish P0 content; French architecture and full French before broad public Canadian launch.
- AI may summarize/extract/translate/draft but cannot autonomously approve applicants, modify legal clauses, post ledger entries, or execute legal/financial actions.

## Professional production approvals—not founder questions

These do not block coding/staging. They gate affected production behavior:

- final terms, privacy notice, DPA, e-sign, and payment disclosure;
- country tax/SaaS treatment;
- production Stripe configuration and contract review;
- Quebec French/legal review;
- Mexico tax/CFDI strategy;
- penetration test, security and accessibility approval;
- screening review before screening;
- deposit custody approval before online deposits;
- owner-payout approval before automated remittances.

## Change control

A change to tenancy, ledger, permissions, connected-account responsibility, prices/entitlements, country posture, or P0 scope requires a dated ADR and migration/rollout assessment.
