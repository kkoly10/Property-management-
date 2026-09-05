# Crecy Visual System Foundation

**Status:** Binding implementation foundation  
**Decision date:** 2026-09-05  
**Applies to:** Crecy OS, Crecy Living, Crecy Owner, public marketing, auth, onboarding, and shared UI.

## 1. Why this exists

The product engine is substantially ahead of the visual architecture. The repository already has broad operator, resident, owner, marketing, auth, onboarding, and settings coverage, but many pages compose low-level `Card`, `Button`, `Badge`, and form primitives directly. That creates visually competent but generic pages and encourages page-local color drift.

This foundation establishes a Crecy-owned layout grammar before broad page redesign.

## 2. Product themes

The root layout derives the visual surface from the canonical host classifier and sets `data-crecy-surface`.

### Crecy OS
- Host family: `crecyos.com`, `app.crecyos.com`, other approved OS hosts
- Brand/action color: `#3A37EB`
- Strong: `#2724B8`
- Soft: `#EFEFFF`

### Crecy Living
- Host family: `crecyliving.com`, `*.crecyliving.com`
- Brand/action color: `#01A065`
- Strong: `#067647`
- Soft: `#E8F8F1`
- The green theme applies to actions, focus, selected navigation, links, and PWA chrome—not only the logo.

### Crecy Owner
- Host: `owner.crecyos.com`
- Purple Crecy OS family identity
- Quieter financial canvas
- Teal may be used as a financial/secondary semantic accent, never as the Owner brand color.

## 3. Semantic-token rule

Pages do not own product colors.

Use semantic tokens such as:
- `--brand`
- `--brand-hover`
- `--brand-strong`
- `--brand-soft`
- `--surface-canvas`
- `--surface-raised`
- `--finance-accent`
- `--border`
- `--shadow-panel`

Do not add new page-local literals for Crecy purple/green when a semantic token exists.

## 4. Crecy layout primitives

Canonical components under `src/components/crecy/`:

### `SurfaceTheme`
An explicit OS/Living/Owner theme wrapper for route shells and previews. Production defaults come from the canonical host, while this wrapper keeps local/Vercel review faithful to the intended surface.

### `PageHeader`
A consistent page/object heading with optional contextual line, description, metadata and actions. It intentionally does not force an uppercase eyebrow.

### `MetricStrip`
A connected metric surface with shared borders and optional links. Use this instead of four to six independent KPI cards when the metrics belong to one summary.

### `WorkspacePanel`
A restrained operational panel with optional title/description/actions. Use panels for real workspaces, not as a wrapper around every paragraph.

### `SectionTabs`
A compact horizontal tab pattern with an active underline and optional counts.

### `EmptyState`
A shared empty-state pattern with one clear next action.

These components sit above low-level UI primitives and are deliberately neutral scaffolding. They do **not** by themselves make a page feel like Crecy. A production surface must combine them with the role-specific signatures below.

### Role-specific visual signatures

#### `OperatorAttentionRail`
Crecy OS unresolved-work list with urgency rails, chronology, and compact operational density. It is a queue, not a set of cards.

#### `LivingCommunityIdentity`
Crecy Living community/property identity block. The resident experience is allowed to be image-led and place-led; the property is part of the product experience rather than an anonymous SaaS workspace.

#### `OwnerFinancialBand`
Crecy Owner continuous financial summary with primary figures separated by hairlines rather than four interchangeable dashboard cards.

#### `MarketingProductStage`
Editorial product-proof frame intended to hold real Crecy UI or deterministic demo-state product components. It must not become a replacement for the product with invented miniature mock UI.

## 5. Layout grammar

### Operator
- Persistent grouped navigation
- Command/search header
- Attention-first dashboard
- Metric strip followed by asymmetric working regions
- Tables, queues, split views, timelines and object workspaces
- Avoid a wall of same-weight cards

### Resident
- Mobile-first
- Shared Living shell
- Home identity, payment, maintenance, messaging and documents prioritized by actual resident tasks
- Community presentation can use operator-supplied public-safe presentation data
- Green theme throughout the surface

### Owner
- Read-heavy desktop shell
- Financial-first hierarchy
- Statements, distributions, approvals and property health are primary
- Avoid copying the resident shortcut-card pattern

### Marketing
- Editorial rhythm
- Real Crecy product compositions wherever practical
- Large product storytelling rather than repeated feature-card grids
- Pricing continues to use canonical runtime price books and entitlements

## 6. Anti-generic rules

A redesign is not acceptable if it:
- replaces one card wall with a differently styled card wall;
- uses the same shell for Operator, Living and Owner with only labels changed;
- uses repeated uppercase eyebrow labels as the primary hierarchy device;
- hard-codes product brand colors in individual pages;
- turns every data grouping into a bordered rounded rectangle;
- fabricates mini product UIs for marketing when reusable real product components can be shown;
- adds decorative charts where exact values, queues or tables communicate better;
- relies on color and the logo as the only visible difference between product surfaces;
- uses icon-in-pastel-circle decoration as a default visual motif;
- places four or more same-size sibling cards above the fold without a documented information-hierarchy reason;
- uses a centered generic empty-state illustration when a contextual next action or object-specific explanation is available.

### Surface-recognition test

Every anchor screen must pass a **logo-off, color-off silhouette test**.

Temporarily remove the Crecy wordmark, convert the screen to grayscale, and ignore all product names. A reviewer should still be able to distinguish the surfaces by structure:

- **Crecy OS:** persistent operating rail, command/search chrome, asymmetric work canvas, attention queue, dense operational rows.
- **Crecy Living:** property/community identity, resident-task hierarchy, mobile bottom navigation, larger touch targets, warmer spatial rhythm.
- **Crecy Owner:** financial summary band, portfolio performance, statements/distributions/approvals, restrained read-heavy navigation.
- **Marketing:** editorial typography and large real-product stages rather than an authenticated-app shell.

If the surfaces become indistinguishable after color/logo removal, the design is generic and must be revised.

### Card-budget test

Cards are containers of last resort, not the default layout unit. Before adding a card, ask whether spacing, a divider, a table row, a rail, a section background, or a split pane communicates the grouping more clearly.

Above the fold, a screen with four or more visually identical sibling cards fails review unless the data contract genuinely requires equal-weight comparison.

### Brand-decoration test

The following do not count as brand personality by themselves:
- purple/green fills;
- rounded corners;
- shadows;
- Lucide icons;
- gradient buttons;
- a custom wordmark placed above otherwise-generic UI.

Crecy personality must come from information architecture, role-specific composition, product imagery where appropriate, typography rhythm, and workflow prioritization.

## 7. Rollout order

1. Visual tokens and Crecy primitives.
2. Anchor screens: Operator `/app`, Resident `/home`, Owner `/owner`, Marketing `/`.
3. Visual review and correction before propagation.
4. Operator canonical workspaces: property, payments, maintenance, detail.
5. Resident shared shell and all resident journeys.
6. Owner shared shell, property performance, statements, approvals.
7. Marketing migration to real product compositions.
8. Auth/onboarding alignment.
9. Visual regression screenshots plus accessibility/responsive certification.

Do not mass-restyle every route before the anchor screens pass design review.

## 8. Adversarial design gate

Before implementation is considered visually mature, review each anchor screen against these questions:

1. Could this screen plausibly be sold as another SaaS product by changing only the logo and colors? If yes, fail.
2. Is the primary user task obvious within three seconds without reading every card title? If no, fail.
3. Does the screen expose working software—queues, rows, timelines, financial truth, property context—or mostly decorative summary containers? Decorative wins fail.
4. Does the mobile transformation preserve task priority rather than merely stack desktop blocks? If not, fail.
5. Are Operator, Living and Owner structurally different because their jobs differ? If not, fail.
6. Is any chart present only because dashboards are expected to have charts? If yes, remove it.
7. Is any photo decorative rather than tied to a real community/property/product story? If yes, remove or replace it.
8. Are repeated component patterns earning their repetition through a shared user task? If not, redesign the composition.

## 9. Quality gate

Before broad propagation, the four anchor screens must be reviewed at:
- 390 px
- tablet
- 1024 px
- 1440 px
- 200% text zoom

They must also preserve:
- keyboard flow
- semantic headings
- current permission behavior
- loading/empty/error/pending/success states
- canonical backend truth
- no invented financial/legal state

Functional redesign must preserve the existing domain engine unless a specific UX requirement exposes a documented data-contract gap.
