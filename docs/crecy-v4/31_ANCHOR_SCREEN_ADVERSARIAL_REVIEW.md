# Crecy Anchor Screens — Adversarial Review

**Review date:** 2026-09-05  
**Reviewed commit:** `db099197227284733527c44b2627b4695498fa5a`  
**Scope:** Crecy OS `/app`, Crecy Living `/home`, Crecy Owner `/owner`, and public marketing `/`.

## Verdict

The four anchors now establish **four distinct layout silhouettes rather than one SaaS template recolored by audience**.

The source-level genericness gates pass:

- none of the four anchor pages imports the generic `Card` primitive;
- no anchor uses the retired `#312e81`, `#4F46E5`, or `#4338ca` literals;
- the marketing home no longer uses `FeatureGrid`, `FeatureItem`, or `ProductComposition`;
- none of the anchors relies on repeated eyebrow labels;
- OS, Living, Owner, and Marketing have role-specific structural signatures.

This does **not** certify every page in Crecy as visually complete. The anchors are the approved grammar for propagation. Many secondary routes still use the previous generic composition and must now be migrated deliberately.

## 1. Crecy OS — `/app`

### Passes
- persistent grouped operating rail rather than flat navigation;
- command/search chrome;
- connected summary strip rather than independent KPI cards;
- asymmetric financial workspace + unresolved-work rail;
- dense property-performance table;
- audit timeline;
- no decorative chart filler;
- permission-aware and currency-separated data remains intact.

### Adversarial check
Removing the logo and purple color still leaves a recognizable operating console: persistent operating domains, scope controls, queue, ledger-oriented workspace, dense rows, and audit activity.

### Remaining risk
The rest of the Operator product still contains old page-local card compositions. The command center must not become an isolated “beautiful homepage” surrounded by generic subpages.

## 2. Crecy Living — `/home`

### Passes
- dedicated Living shell and green semantic theme;
- mobile-first bottom navigation;
- central maintenance-request action;
- property/community identity is part of the page hierarchy;
- balance and upcoming payment are one connected resident task surface;
- maintenance, messages, and documents use resident task rows rather than shortcut cards;
- community notices and payment history remain secondary;
- no invented resident name, unread count, or property image URL.

### Adversarial check
In grayscale without the wordmark, the page still reads as a resident/home product through community identity, payment priority, touch-sized tasks, and mobile navigation.

### Remaining risk — real community media
The current repository still has no authoritative public-safe community media/profile contract. The anchor correctly uses a non-photographic fallback rather than fabricating imagery, but the high-quality image-led Living direction from the approved mocks cannot be considered complete until operators can supply safe community presentation data.

Required future contract should cover only public-safe presentation fields such as:
- community display name;
- hero/cover media;
- public address;
- leasing-office contact;
- office hours;
- selected amenities;
- public notice/contact/help information.

It must not expose tenancy, resident, or financial data.

## 3. Crecy Owner — `/owner`

### Passes
- dedicated purple Owner shell;
- financial-first continuous summary band;
- latest finalized statement is clearly identified as statement-scoped;
- currencies/properties are not silently aggregated;
- statement rows, approval decisions, and recorded remittances dominate the layout;
- no fake valuation, occupancy, distribution forecast, or cash-on-cash metric was invented to imitate the mock;
- navigation uses only existing routes or in-page sections.

### Adversarial check
Without branding, the page still reads as a private financial/ownership portal through statement hierarchy, owner payable, remittances, and approval decisions rather than an operator work queue.

### Remaining data-contract gap
The approved Owner visual direction eventually calls for broader property-health/performance visibility. The current owner-facing read models do not expose an authoritative occupancy/performance overview or an `/owner/properties/:propertyId` route. Those should be designed from real ownership-scoped data before being added; they must not be simulated from operator-only data.

## 4. Marketing — `/`

### Passes
- large editorial hero;
- real-system Crecy OS/Living/Owner proof components;
- product proofs reuse actual design signatures such as `MetricStrip`, `OperatorAttentionRail`, `LivingCommunityIdentity`, and `OwnerFinancialBand`;
- each demo stage is explicitly marked representative/demo data;
- no generic feature-card wall on the homepage;
- no fake customer logos, testimonials, savings claims, or unsupported certification badges;
- pricing continues to come from the canonical runtime price book;
- broader editorial canvas and centered navigation create a marketing rhythm distinct from authenticated product shells.

### Adversarial check
Without the logo/color, the page still reads as an editorial product story through type scale, real product stages, relationship index, workflow rail, trust rows, and pricing table.

### Remaining risk
Other marketing routes—especially Product, Crecy Living, and parts of Pricing/Security—still use the older `FeatureGrid` / `ProductComposition` language. The homepage establishes the new authority but has not yet propagated it.

## 5. Cross-surface silhouette test

The anchors now separate by job:

| Surface | Primary silhouette |
| --- | --- |
| Crecy OS | operating rail + command chrome + dense work canvas + attention queue |
| Crecy Living | place identity + payment/home tasks + mobile bottom navigation |
| Crecy Owner | financial band + statements/remittances/approvals + read-heavy rail |
| Marketing | editorial typography + large product stages + narrative workflow |

A future change fails review if these collapse into the same sidebar/cards/buttons composition.

## 6. Source-level genericness audit

At this reviewed commit:

- `src/app/app/page.tsx`: no generic Card import, no old brand literals, no eyebrow pattern.
- `src/app/home/page.tsx`: no generic Card import, no old brand literals, no eyebrow pattern.
- `src/app/owner/page.tsx`: no generic Card import, no old brand literals, no eyebrow pattern.
- `src/app/(marketing)/page.tsx`: no Card import, no old brand literals, no FeatureGrid, no ProductComposition, no eyebrow pattern.

Rounded rectangles still exist where they earn grouping—resident balance, product stages, compact panels—but they are no longer the universal unit of page composition.

## 7. What is *not* certified yet

The following claims would be premature:

- “all Crecy pages are 10/10”;
- “the resident experience fully matches the image-led mock”;
- “the Owner portal has complete portfolio-performance data”;
- “the marketing site is fully migrated”;
- “visual regression is complete.”

Actual deployed screenshot review at 390px, tablet, 1024px, 1440px, and 200% text zoom remains required before broad visual certification.

## 8. Propagation order after anchor approval

1. **Operator canonical workspaces:** property detail, payments, maintenance queue, maintenance detail.
2. **Resident shell migration:** payments, maintenance, messages, documents, preferences; then add the public-safe community presentation contract.
3. **Owner shell migration:** statement detail, approval detail, documents, messages, preferences; then add ownership-scoped property performance.
4. **Marketing migration:** Product, Crecy Living, Pricing, Security, Pilot.
5. **Auth/onboarding:** role-specific login and activation presentation.
6. **Visual regression:** deterministic screenshot baselines and responsive/accessibility certification.

Do not broaden implementation to all routes in one mechanical restyle. Each route family must inherit its anchor’s information hierarchy and role-specific signature.
