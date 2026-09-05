# Crecy Visual Foundation — Adversarial Review

**Review date:** 2026-09-05  
**Reviewed against:** founder-approved mock direction, files 15/16/28/29, current production code, and the four-anchor rollout plan.

## Verdict

The first visual-foundation pass solved **brand-color drift and component plumbing**, but by itself it was **not sufficient to guarantee a non-generic product**.

The risk was specific: `PageHeader`, `MetricStrip`, `WorkspacePanel`, `SectionTabs`, and `EmptyState` are useful structural primitives, but they are patterns that many modern SaaS products use. If the anchor screens were built only from those primitives, Crecy could still become a polished generic dashboard.

That is now corrected at the foundation level by adding role-specific visual signatures and explicit anti-template gates. The actual proof still happens on the four anchor screens; no foundation document can substitute for screenshot review.

## Findings

### A1 — High: personality was mostly color-level

The original foundation differentiated OS/Living/Owner primarily through purple/green semantic tokens and a small canvas change.

**Why that fails:** swapping color variables is re-skinning, not product design.

**Correction:** role-specific structures are now required and represented in code:
- `OperatorAttentionRail`
- `LivingCommunityIdentity`
- `OwnerFinancialBand`
- `MarketingProductStage`

### A2 — High: generic component primitives could become the page language

`WorkspacePanel` and `MetricStrip` could easily become the new version of the old card wall.

**Correction:** file 29 now explicitly classifies the shared primitives as neutral scaffolding, not Crecy personality. They cannot be used as evidence that a screen is design-complete.

### A3 — High: no structural recognition test

A screen could have passed review merely because it had the right logo and color.

**Correction:** every anchor screen must now pass the logo-off/color-off silhouette test. OS, Living, Owner, and Marketing must remain structurally recognizable in grayscale without product names.

### A4 — High: no enforceable card-wall threshold

The old app repeatedly used four-to-six same-weight cards. The first foundation prohibited card walls in prose but did not define when review should fail.

**Correction:** four or more visually identical sibling cards above the fold now fail review unless equal-weight comparison is justified by the data contract.

### A5 — Medium: icon decoration risk

The existing product and mocks contain many icon containers. Used everywhere, small pastel icon bubbles quickly become generic SaaS decoration.

**Correction:** icon-in-pastel-circle treatment is explicitly prohibited as a default motif. Icons must communicate state/action/domain meaning.

### A6 — Medium: Living needed a place-based signature

A green theme alone does not make Crecy Living feel residential.

**Correction:** the Living signature now includes community/property identity and supports operator-supplied public-safe imagery. The resident product is expected to feel tied to a real home/community, not an anonymous workspace.

### A7 — Medium: Owner needed a financial signature

The existing Owner implementation is a vertical stack of portal cards. Purple alone would not distinguish it from Operator.

**Correction:** the Owner surface now has a continuous financial-summary pattern and must prioritize distributions, statements, performance, and approvals.

### A8 — Medium: marketing could still fake product UI

The current marketing code creates miniature fake dashboards from generic divs.

**Correction:** the new marketing stage is explicitly for real product UI or deterministic demo-state product components. It cannot be used as permission to invent miniature dashboard artwork.

### A9 — High: approved Living identity green failed normal-text contrast on white

The first semantic-theme implementation used the approved Living green `#01A065` directly as the primary button/link color. White text on that green is about **3.38:1**, which fails WCAG AA for normal text.

**Correction:** the approved `#01A065` remains the Crecy Living identity/wordmark green. Interactive text-bearing controls use the darker green `#067647`, which exceeds 4.5:1 against white. A regression test now guards the distinction and the OS/Living/Owner action contrast.

### A10 — Medium: operator urgency rail initially relied on color

The first `OperatorAttentionRail` revision represented priority with a colored vertical rail only.

**Correction:** non-neutral priority is now exposed to assistive technology as text in addition to the visual rail.

## Non-generic surface signatures

### Crecy OS
Recognizable by:
- persistent grouped operating rail;
- command/search chrome;
- asymmetric main/attention layout;
- dense queues and rows;
- direct work on the dashboard;
- restrained use of cards.

### Crecy Living
Recognizable by:
- green Crecy identity;
- property/community presentation;
- resident-first payment and maintenance hierarchy;
- mobile bottom navigation;
- larger touch targets and warmer spacing;
- image-led community moments where real data exists.

### Crecy Owner
Recognizable by:
- purple Crecy identity;
- continuous financial band;
- portfolio-performance emphasis;
- distributions, statements, and approvals;
- quieter read-heavy shell;
- minimal operational clutter.

### Marketing
Recognizable by:
- editorial type scale and whitespace;
- large real-product stages;
- alternating product stories rather than feature-card grids;
- visible relationship between OS, Living, and Owner.

## Hard review rule for the next step

Do not propagate the redesign after the first anchor screen simply because it looks cleaner.

The four anchor screens—`/app`, `/home`, `/owner`, and `/`—must be reviewed together. If changing only the logo and primary color could make any of them look like a plausible Stripe/Linear/shadcn clone, the anchor phase is not complete.

## Current status

- Brand identity: locked.
- Surface colors: locked.
- Semantic token plumbing: implemented.
- Neutral layout primitives: implemented.
- Role-specific signature primitives: implemented.
- Anti-generic review gates: implemented.
- Anchor-screen proof: **not yet complete**.

The next implementation step remains the Operator `/app` anchor, followed by Living, Owner, and Marketing before broad propagation.
