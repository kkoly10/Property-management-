# Crecy Marketing Anchor Visual Correction

**Review date:** 2026-09-16
**Scope:** public homepage `/` and `/crecy-living`
**Authority:** files 18, 29, 31, 34, 35, 37, and 38 plus founder visual review
**Status:** local anchor correction passed; no remote action authorized or performed

## 1. Why this correction exists

The marketing propagation recorded in file 38 passed functional checks but did not pass founder visual
review. The homepage and Crecy Living still used too many small colored labels, repeated medium-weight
split sections, numbered `01 / 02 / 03` scaffolding, and marketing copy layered over Maple Court images.
Those patterns made the pages read like a generic editorial SaaS template rather than a connected rental
operating system and a resident relationship with a specific home.

This is a continuation of the existing marketing system, not a new site direction. Product, Security,
Pricing, and Pilot were deliberately not propagated again during this correction.

## 2. Shared product-stage correction

`MarketingProductStage` now treats both its label and disclosure as optional. When present, the caption is
rendered beneath the framed interface rather than above it.

Consequences:

- a negatively offset device cannot collide with an above-stage label;
- Crecy OS and Owner proofs can retain one explicit sample-data disclosure;
- the Living device can remain self-identifying through its actual Crecy Living interface;
- a complete photo/device composition owns one disclosure below the whole composition rather than
  repeating `Representative demo data` around the mockup.

## 3. Homepage anchor

The homepage now uses deliberately different chapter silhouettes:

- a large, light-weight editorial proposition paired with the real Crecy OS command-center proof;
- a dark relationship manifesto that separates Operator, Living, and Owner responsibilities without
  numbered labels;
- a green, place-led Living chapter with a clean Maple Court lobby and overlapping resident device;
- a financial Owner chapter built around finalized statements and the payment lifecycle;
- an unnumbered maintenance-continuity rail;
- trust and pricing represented as inspectable records rather than badge or pricing-card walls.

The small primary-colored eyebrow pattern is absent from the page. The mobile pricing register no longer
widens the document; included-unit values remain visible beneath each plan at 390 px.

## 4. Crecy Living anchor

The Living page now opens with `Home is the interface.` and uses Maple Court as narrative evidence rather
than a backdrop for marketing copy.

- The exterior, lobby, model home, and maintenance images remain in the route with their approved alt text.
- No marketing words, gradients, or disclosure blocks are positioned over a Maple Court photograph.
- The exterior establishes the fictional community, with the disclosure beneath the image.
- The lobby is a full-width community-threshold composition.
- The resident-task chapter pairs the model home, an unnumbered task register, and the real Living device.
- The maintenance chapter uses a dark field and keeps the repair image separate from the explanatory copy.
- The relationship boundary explicitly distinguishes resident-safe projections from operator, owner,
  vendor, and neighboring-resident records.
- The operator-document legal-sufficiency disclaimer remains visible.

## 5. Adversarial verdict

The two anchors no longer depend on logo or color alone:

- the homepage is identifiable through command-center proof, relationship separation, resident place,
  owner finance, maintenance continuity, trust records, and canonical pricing;
- Living is identifiable through community threshold, home context, resident tasks, a resident device,
  maintenance continuity, and an explicit privacy boundary.

The pages still use split compositions where the relationship between narrative and evidence calls for one,
but they no longer repeat one split-section formula throughout. Typography shifts from oversized light
statements to compact operational records. Photography is tied to a specific fictional community and the
workflow it explains.

## 6. Browser evidence

Local Playwright Chromium reviewed both routes at 390 px, 768 px tablet, 1024 px, 1440 px, and a 200%
root-text resize simulation.

Across the reviewed captures:

- each route rendered exactly one `h1`;
- document horizontal overflow was zero;
- the mobile menu opened and exposed all public navigation links;
- no framework error overlay or browser console error appeared;
- all four Living WebP files decoded at their expected natural width;
- the photo/device composition contained no marketing-caption collision;
- headline wrapping retained the intended editorial hierarchy;
- exterior, lobby, model-home, and maintenance crops retained property or home context;
- the resident device remained legible and visually subordinate to the place-led chapter;
- grayscale recognition does not depend on logo or color because the route silhouettes remain distinct.

This screenshot result certifies only the two corrected marketing anchors in this local worktree. It is not
deployment evidence and does not certify the remaining marketing family, provider configuration, or launch.

## 7. Contract preservation

This correction changes public presentation and source-level regression tests only.

- No API, RLS policy, permission, payment, ledger, document-scanning, financial-immutability,
  idempotency, or resident/owner/operator data-boundary behavior changed.
- Homepage prices still come from the canonical runtime price books and entitlements.
- Maple Court remains explicitly fictional and sample interfaces remain disclosed.
- Security, customer, uptime, accessibility, and country-availability claims remain within file 18.
- Operator-controlled legal documents remain accompanied by the legal-sufficiency disclaimer.

## 8. Local validation

- Targeted marketing contracts: 3 files, 42 tests passed.
- Full Vitest: 69 files, 467 tests passed.
- TypeScript: passed.
- ESLint: passed with five pre-existing unused-import warnings in unrelated Operator pages.
- Schema validation: passed.
- Schedule validation: four scheduled jobs; Vercel configuration in sync.
- Migration validation: 69 expand migrations and one contract migration passed.
- Local Next.js production build: passed; 51 static pages generated.

No branch, pull request, push, preview, or deployment was created. Further marketing propagation requires
explicit approval after review of these two anchors.
