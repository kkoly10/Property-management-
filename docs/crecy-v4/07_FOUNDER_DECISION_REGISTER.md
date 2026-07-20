# Founder Decision Register — Closed for Gate 0

**Version:** 4.0  
**Status:** All founder-controlled P0 decisions approved  
**Date:** 2026-07-19

Coding agents must implement these decisions and may not reopen them without a dated founder change record.

## A. Product and customer decisions

| ID | Approved decision | Implementation consequence |
|---|---|---|
| FD-001 | Crecy is B2B2C SaaS. Operators pay; residents, owners, and invited vendors participate through operator relationships. | Organization owns subscription and data scope. |
| FD-002 | Primary initial market is growing self-managing landlords and small property managers with roughly 5–100 units. | Default onboarding is simple but supports teams, owners, and growth. |
| FD-003 | Secondary entry market is landlords with 1–4 units. | Free plan and simplified “I manage my own rentals” onboarding. |
| FD-004 | Target architecture may support 500+ units, but enterprise procurement features are not P0. | Avoid enterprise-only complexity in first journeys. |
| FD-005 | Crecy OS, Crecy Living, and a basic Crecy Owner portal are P0. Crecy Vendor is post-pilot unless a signed pilot requires it. | Three P0 surfaces; fourth surface preserved in architecture. |
| FD-006 | Public rental marketplace and open vendor network are post-launch. | No marketplace liquidity, public ratings, commissions, or cross-operator discovery. |
| FD-007 | Launch is nationwide in the United States, Canada, and Mexico as neutral software. | State/province/state is metadata and routing context, not ordinary SaaS activation gating. |
| FD-008 | Operators provide and control leases, policies, notices, fees, deposits, and legal documents. | Import/version/deliver documents; never certify legal sufficiency. |
| FD-009 | Ghana, Nigeria, then Singapore are preparation priorities after North America. | Research/profile scaffolding only until separate activation gates pass. |

## B. Data, country, and accounting decisions

| ID | Approved decision | Implementation consequence |
|---|---|---|
| FD-010 | One global codebase and canonical core. | Country behavior uses profiles/adapters, not forks. |
| FD-011 | One organization may own multiple operating entities. | Organization is not a legal/merchant/currency boundary. |
| FD-012 | Each operating entity may own one or more accounting books. | Books separate financial truth by currency and operation. |
| FD-013 | Each accounting book has one immutable functional currency after first posting. | New currency requires a new book; no currency edit. |
| FD-014 | Each property belongs to exactly one active operating entity and accounting book at a time. | All financial dimensions resolve through property/book. |
| FD-015 | Property location—not user IP/GPS—provides country/subdivision context. | Location detection may suggest, never silently assign legal behavior. |
| FD-016 | Country profiles cover currency, language, payment rails, formats, platform notices, and provider capability. | They do not encode certified landlord-tenant legal advice in P0. |

## C. Payment decisions

| ID | Approved decision | Implementation consequence |
|---|---|---|
| FD-017 | Provider-neutral payment orchestration with Stripe first in North America. | Canonical payment objects are provider-independent. |
| FD-018 | Eligible operators use a full-Dashboard/Standard-equivalent connected account with Stripe-hosted onboarding. | Operator controls merchant account and payout destination. |
| FD-019 | Resident rent uses direct charges on the operator connected account. | Payment objects are queried in connected-account context. |
| FD-020 | Crecy does not pool, custody, or redistribute resident rent. | No destination-charge marketplace flow for P0 rent. |
| FD-021 | Stripe/provider fees are charged to the connected operator where configuration permits. | Crecy does not subsidize payment processing by default. |
| FD-022 | SaaS subscription billing is separate from resident rent. | Separate customers, invoices, ledgers, and tax treatment. |
| FD-023 | Launch monetization is subscription-first. | No Crecy application fee on resident rent in P0. |
| FD-024 | No mandatory resident convenience fee or surcharge in P0. | Bank rails are promoted; card use remains operator-enabled. |
| FD-025 | Payment targets: US ACH + cards; Canada ACSS debit + cards; Mexico MXN bank transfer/SPEI-supported flow + cards. | Method availability comes from provider capabilities at runtime. |
| FD-026 | Operators may record cash and external bank-transfer payments. | Require permission, evidence/reason, receipt, audit event, and reconciliation status. |
| FD-027 | Security deposits are tracked as obligations but not collected online in P0. | Deposit custody integrations remain disabled. |
| FD-028 | Automated owner payouts are not P0. | Record distributions/remittances; do not transmit them. |

## D. Pricing and packaging decisions

The exact country price books and entitlements in `11_PRICING_ENTITLEMENTS_AND_BILLING_SPEC.md` are approved.

| ID | Approved decision |
|---|---|
| FD-029 | Four plans: Free, Starter, Growth, Pro. |
| FD-030 | 30-day no-card trial of Growth; production rent collection still requires merchant verification. |
| FD-031 | Country-localized price books, not live FX conversion. |
| FD-032 | Annual billing equals approximately ten monthly payments. |
| FD-033 | Owner portal begins on Growth; advanced owner accounting/approvals are Pro. |
| FD-034 | Platform branding on Free/Starter, co-branding on Growth, advanced branding on Pro; custom domains are post-MVP. |
| FD-035 | Assisted early-customer onboarding with self-service imports underneath; managed migration can become a paid service later. |

## E. UX, brand, and technology decisions

| ID | Approved decision |
|---|---|
| FD-036 | Brand is Crecy. Product names: Crecy OS, Crecy Living, Crecy Owner, Crecy Vendor. |
| FD-037 | Domains: `crecy.com`, `app.crecy.com`, community portals under `*.crecyliving.com`; owner/vendor domains may use `owner.crecy.com` and `vendor.crecy.com`. |
| FD-038 | Wordmark-led visual identity; light-first “Calm Global Infrastructure.” |
| FD-039 | Typography: Inter; Noto Sans fallback; JetBrains Mono for identifiers/financial figures. |
| FD-040 | Component foundation: shadcn/ui + Radix primitives + Tailwind CSS + TanStack Table. |
| FD-041 | Crecy Living launches as responsive mobile-first PWA. Native apps are post-validation. |
| FD-042 | English and Spanish P0 product content; French architecture and full French before broad public Canadian launch. |
| FD-043 | AI may summarize, extract, translate, and draft; it cannot autonomously approve applicants, modify legal clauses, post ledger entries, or execute legal/financial actions. |

## F. Professional production approvals—not founder questions

The following do not block coding or staging. They block only the affected production behavior:

- final company terms, privacy notice, DPA, e-sign disclosure, and payment disclosure;
- tax registration and SaaS tax treatment by country;
- production Stripe account/configuration and connected-account contract review;
- Quebec French/legal review before Quebec public marketing;
- Mexico tax/CFDI strategy before automated tax-document claims;
- penetration test and security approval;
- accessibility audit;
- screening compliance before screening is ever enabled;
- deposit custody approval before online deposit collection;
- owner payout approval before automated remittances.

## G. Change control

A change to tenancy, ledger, permissions, connected-account responsibility, price/entitlement, country posture, or P0 scope requires a dated ADR and migration/rollout impact assessment.
