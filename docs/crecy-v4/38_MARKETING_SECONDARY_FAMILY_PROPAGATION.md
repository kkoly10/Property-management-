# Crecy Marketing Secondary-Family Propagation

**Review date:** 2026-09-16
**Scope:** `/product`, `/crecy-living`, `/security`, plus targeted continuity work on `/`, `/pricing`, and `/pilot`
**Authority:** files 18, 27, 29, 31, and 37 plus current executable marketing code

## Subsequent anchor correction

Founder review after this propagation found that the homepage and Crecy Living still relied too heavily on
small colored labels, repeated medium-weight split sections, numbered scaffolding, and marketing text layered
over Maple Court photography. File `39_MARKETING_ANCHOR_VISUAL_CORRECTION.md` is the binding correction for
those two anchors.

This correction is intentionally limited to `/` and `/crecy-living`. It does not authorize another mechanical
restyle of Product, Security, Pricing, or Pilot. Those routes keep their existing contracts until the two anchors
pass local multi-viewport visual review and the corrected language is deliberately approved for propagation.

## Verdict

The three weakest secondary marketing routes no longer share the same feature-grid and miniature-product-card grammar.

- Product is an operating sequence built from registers, financial rows, work queues, and continuity between records.
- Crecy Living is a place-led resident story using the fictional Maple Court image family and a real Living product proof.
- Security is a visible access and evidence architecture rather than a list of security features.

The homepage now pairs its Living proof with place imagery. Pricing presents plans as one connected comparison surface rather than four detached cards. Pilot reads as an operating partnership with a sequenced setup and an explicit current-state ledger.

## Route and dependency map

| Route | Job | Components and assets | Data or action boundary |
| --- | --- | --- | --- |
| `/product` | Explain how an operator runs the portfolio from setup through owner reporting. | `OperatorCommandCenterProof`, `OperatingSequence`, portfolio/finance/maintenance registers, record-continuity table. | Static public explanation; no product read model or mutation is invoked. Trial wording remains sourced from the canonical pricing module. |
| `/crecy-living` | Explain the resident relationship with a specific home. | `LivingHomeProof`; four Maple Court marketing images; resident task, maintenance, and relationship-boundary rows. | Static public explanation. Maple Court is explicitly fictional. No hostname, tenancy, or community profile is treated as authorization. |
| `/security` | Make isolation, financial integrity, document release, payment handling, and assurance limits inspectable. | Access boundary map, control stack, financial-integrity rail, document-release rail, assurance ledger. | Static public explanation grounded in current controls and file 18 claim restrictions. No certification or availability state is invented. |
| `/` | Establish the product family and route prospects into deeper stories. | Existing OS/Owner proof plus new `LivingPlaceProof`. | Canonical price-book preview remains unchanged. |
| `/pricing` | Compare exact plans and local price books. | Existing interactive pricing explorer, now one connected comparison band. | Prices, limits, overage, entitlements, and trial copy remain sourced from `src/lib/marketing/pricing.ts`. |
| `/pilot` | Set expectations for an early operating partnership. | Sequenced activation rail, current-state ledger, portfolio-path split. | Existing self-service signup links only; no invented request endpoint or lead form. |

## Generic motifs removed

- Removed all `FeatureGrid`, `FeatureItem`, and `ProductComposition` usage from Product, Living, and Security.
- Deleted those retired shared helpers so they cannot continue as the default marketing grammar.
- Replaced Product’s repeated two-column miniature cards with job-specific operating registers.
- Replaced Living’s six-item feature grid with a place-led resident journey and real community imagery.
- Replaced Security’s repeated capability grids with boundary, lifecycle, integrity, and assurance structures.
- Replaced Pricing’s four detached plan cards with one connected comparison surface.
- Replaced Pilot’s generic cards and equal-weight grids with an ordered activation and expectation record.

## Contracts preserved

- No API route, database read, server command, authorization rule, RLS policy, payment behavior, or financial truth was changed.
- Public routes remain static explanations and retain their existing navigation, metadata, canonical, robots, and sitemap contracts.
- Pricing remains entirely sourced from the canonical runtime price books and entitlements.
- Crecy Living still states the operator-document legal-sufficiency disclaimer.
- Maple Court remains a named fictional demonstration community and is never presented as customer evidence.
- Security copy continues to deny unsupported SOC 2, uptime, penetration-test, accessibility-conformance, and country-availability claims.

## Adversarial gate

The pages remain distinguishable without color or logos:

- Product: operating sequence, command center, registers, queue, ledger, and record continuity.
- Living: community photography, home context, resident device hierarchy, task journey, and resident-safe boundary.
- Security: access map, narrowing stack, immutable-event rail, release pipeline, and assurance ledger.

Photography is not used on Security and does not replace operational proof on Product. Living imagery is tied to a specific fictional community narrative rather than inserted as decorative stock photography.

## Local validation

- ESLint: passed with five pre-existing unused-import warnings in unrelated Crecy OS pages.
- TypeScript: passed.
- Vitest: 69 files and 464 tests passed.
- Schema validation: passed.
- Schedule configuration: four scheduled jobs, Vercel configuration in sync.
- Migration validation: 69 expand migrations and one contract migration passed.
- Next.js production build: passed, 51 static pages generated.
- Marketing source-level regression suite: passed.
- Local production-server smoke check: `/`, `/product`, `/crecy-living`, `/security`, `/pricing`, `/pilot`, and all four new WebP assets returned HTTP 200 with the expected content type.

Automated browser certification could not run in this workspace because the remote browser blocks localhost and the repository Playwright configuration points to a Chromium executable that is not installed here. No deployment was created as a workaround. Final screenshot certification at 390 px, tablet, 1024 px, 1440 px, and 200% zoom therefore remains an explicit local-environment follow-up rather than a claimed pass.
