# Apartment Rental Platform — Brand, Figma, Component Library, and Visual Direction Decisions

**Status:** Recommended design lock for founder approval  
**Applies to:** Operator OS, Resident Portal/PWA, Owner Portal, Private Vendor Workspace, Platform Administration, and marketing surfaces.

## 1. Brand Position

### Brand category
A global rental operating system for independent landlords and growing property managers.

### Brand promise
**Operate every rental relationship from one clear, trusted system.**

### Brand personality
- Calm
- Capable
- Transparent
- Global
- Human
- Operationally serious

### Brand archetype
**The Guide + The Architect** — the product should make complex rental operations understandable without appearing legalistic, cold, or enterprise-heavy.

### Voice and tone
- Plain language over legal or financial jargon
- Direct, respectful, and reassuring
- Specific about status, money, and next actions
- Never imply that the platform has verified operator-supplied legal documents
- Never use playful language in payment failures, disputes, identity checks, or maintenance emergencies

## 2. Visual Direction — “Calm Global Infrastructure”

### Core visual idea
A light-first, precise, modern operating system with calm information density. It should feel more approachable than legacy property-management software and more operationally serious than a consumer marketplace.

### Production palette
- **Crecy OS / master purple:** `#3A37EB`
- **Crecy OS hover:** `#302DD4`
- **Crecy OS strong:** `#2724B8`
- **Crecy Living identity green:** `#01A065`
- **Crecy Living identity hover/accent:** `#008A57`
- **Crecy Living text-bearing action green:** `#067647`
- **Financial/secondary teal:** `#0F766E`
- **Ink:** `#101828`
- **Muted Text:** `#667085`
- **Canvas:** `#F7F8FB` (Living may use the warmer `#F6F9F8`)
- **Surface:** `#FFFFFF`
- **Border:** `#E4E7EC`
- **Success:** `#067647`
- **Warning:** `#B54708`
- **Danger:** `#B42318`
- **Information:** `#175CD3`

The master purple and Living green are product identity colors, not interchangeable accents. Surface theming is host-aware: Crecy OS and Owner are purple; Crecy Living is green. The approved Living identity green is not used blindly for white-on-green normal-size text: text-bearing controls use the darker AA-safe Living action green.

All production combinations must be WCAG 2.2 AA contrast-tested. Semantic status colors must always be paired with text and/or icons.

### Typography
- **Primary UI and marketing font:** Inter
- **Global fallback:** Noto Sans, then system sans-serif
- Use tabular numerals for money, dates, and accounting tables.
- One font family at launch to reduce localization, rendering, and implementation risk.

### Shape and spacing
- 8-point spacing system
- Button/input radius: 8–10 px
- Card radius: 12 px
- Dialog/drawer radius: 16 px
- Subtle borders and low-elevation shadows
- Avoid excessive pills, glassmorphism, neon colors, and heavy gradients

### Motion
- Motion should explain causality, hierarchy, and status changes.
- Prefer opacity and transform transitions.
- Respect reduced-motion settings.
- No decorative animation inside financial, legal-document, or maintenance-emergency workflows.

### Theme decision
- Light theme is required for launch.
- Dark theme is a post-launch enhancement, not a launch blocker.

### Logo direction
The **product name is permanently locked as Crecy**. The founder-approved production identity is now the custom Crecy wordmark plus the derived CY monogram defined in `28_BRAND_IDENTITY_ASSET_SYSTEM.md`. The earlier architectural/building mark is rejected. The approved wordmark has an oversized open C, custom geometric r/e/c construction, and a distinctive y with a long descender and detached angled terminal. Purple is used on `crecyos.com` and every `*.crecyos.com` surface; green is used on `crecyliving.com` and every `*.crecyliving.com` surface.

## 3. Role-Specific Presentation

### Operator OS
- Desktop-first, responsive, information-dense but breathable
- Left navigation, global search/command palette, attention queue
- Tables and split views for portfolio, leasing, money, maintenance, and owners
- Dashboard prioritizes unresolved work over decorative metrics
- Use asymmetric workspaces and metric strips; do not express every summary, filter, queue, and table as an independent card
- Navigation is grouped by operating domain rather than one flat list of equally weighted routes

### Resident Portal/PWA
- Mobile-first
- Green Crecy Living semantic theme across logo, actions, focus states, selected navigation, and PWA chrome
- Bottom navigation: Home, Payments, central New Request action, Messages, More
- Balance, next payment, open maintenance, and management requests appear first
- Community/property identity may use operator-supplied public-safe imagery and presentation data when available
- No download required; installable PWA is optional

### Owner Portal
- Read-heavy, trust-centered presentation with the purple Crecy OS family identity
- Occupancy, income, expenses, maintenance approvals, statements, and remittance visibility
- Financial-first hierarchy rather than a resident-style stack of shortcut cards
- Financial explanations use plain language and audit trails

### Private Vendor Workspace
- Mobile-first assignment workflow
- Jobs, schedule, quotes, evidence, status, and completion confirmation
- No public marketplace behavior at launch

## 4. Figma System Decision

Create one primary Figma project named **Rental OS — Product System** with the following pages:

1. `00 Cover + Decision Log`
2. `01 Brand Foundations`
3. `02 Variables + Tokens`
4. `03 Core Components`
5. `04 Product Patterns`
6. `05 Operator OS`
7. `06 Resident Portal`
8. `07 Owner Portal`
9. `08 Vendor Workspace`
10. `09 Platform Admin`
11. `10 Interactive Prototypes`
12. `11 Dev Handoff + Changelog`
13. `12 Reference Screenshots`

### Required Figma variables
- Primitive colors
- Semantic colors
- Typography
- Spacing
- Radius
- Elevation
- Breakpoints and container widths
- Motion durations/easing
- Density modes: Comfortable and Compact
- Theme modes: Light and future Dark

### Component properties
Components must use explicit properties such as:
- Type
- Size
- State
- Intent
- Icon position
- Density
- Validation state

Do not create disconnected one-off component variants.

### Required prototypes before broad implementation
1. Operator onboarding, country setup, and Stripe Connect
2. Portfolio and legal-document import
3. Property/unit/resident setup and lease activation
4. Resident rent payment and receipt
5. Resident maintenance request through completion
6. Payment detail, reconciliation, refund, and reversal states
7. Owner statement and maintenance approval
8. Responsive navigation and mobile behavior

### Required screen states
Every critical screen must define:
- Default
- Loading/skeleton
- Empty
- Error
- Permission restricted
- Feature unavailable by plan
- Country/payment unavailable
- Pending
- Failed
- Offline/interrupted
- Success

### Localization frames
Critical screens must be tested in English, French, and Spanish. Designs must accommodate longer French copy, Mexican address formats, Canadian province fields, and currency-specific formatting.

## 5. Approved Reference Direction

### Industry references
- **RealPage LOFT:** resident task hierarchy, mobile home, payments, and bottom navigation
- **DoorLoop:** approachable operator navigation and simplified property workflows
- **Buildium/AppFolio:** operational breadth, accounting, leasing, and maintenance depth

### Best-in-class non-industry references
- **Stripe Dashboard:** payment status, transaction detail, fees, refunds, disputes, and audit clarity
- **Linear:** calm information density, muted navigation chrome, focus, and command-driven workflows

### Explicitly avoid
- Legacy enterprise density without progressive disclosure
- Dashboard pages made mostly of charts
- Generic template aesthetics
- Excessive cards around every field
- Large gradients and glass effects
- Consumer marketplace styling inside the operator product
- Separate visual brands for every country
- Color-only status communication

## 6. Approved Code Component Stack

### Core UI layer
- **shadcn/ui** as the source-owned component foundation
- **Radix UI Primitives** for accessible behavior and interaction primitives
- **Tailwind CSS v4 theme variables** for shared design tokens

### Complex product UI
- **TanStack Table** for sortable, filterable, column-configurable operational tables
- **React Hook Form + Zod** for forms, validation, and typed schemas
- **Recharts** for limited operational and financial charts
- **Lucide** for the icon system
- **Sonner** through the shadcn integration for transient notifications

### Rules
- Do not mix multiple full component libraries.
- Wrap primitives into product-owned components inside `packages/ui` or the equivalent shared package.
- Figma component names and properties must map directly to code components and props.
- Do not use charts when a number, table, progress bar, or exception list communicates the information more clearly.

## 7. Component Inventory

### Foundations
- App shell
- Sidebar
- Mobile bottom navigation
- Top bar
- Page header
- Breadcrumbs
- Command palette
- Locale/currency switchers

### Data and operations
- Data table
- Filter bar
- Saved view
- Bulk action bar
- Status badge
- KPI metric
- Attention queue
- Timeline/audit log
- Activity feed
- Reconciliation panel

### Forms and workflows
- Text, number, currency, date, address, phone, and identity inputs
- Country/state/province selectors
- Combobox
- Stepper
- Wizard
- Document uploader
- Import mapper
- Signature block
- Confirmation and destructive-action dialogs

### Domain components
- Property card/row
- Unit status cell
- Resident summary
- Lease status header
- Charge/payment allocation table
- Payment rail selector
- Maintenance priority and workflow card
- Owner statement summary
- Vendor job card
- Compliance/operator-document disclaimer

## 8. Design Quality Gates

A screen is not ready for implementation until:
- It uses published variables and components
- It includes responsive behavior
- It includes required states
- It passes contrast and keyboard-flow review
- It has final product copy or marked copy dependencies
- It identifies the authoritative backend status and permitted actions
- It has no invented financial or legal behavior
- It is marked Ready for Development in Figma

## 9. Brand Identity Decision — Closed

The product name is **Crecy** and the production identity artwork is locked by the latest 2026-09-05 founder decision in `28_BRAND_IDENTITY_ASSET_SYSTEM.md`. The custom Crecy wordmark is the master logo; CY is the compact/favicon mark. Crecy OS and all `*.crecyos.com` surfaces are purple, while Crecy Living and all `*.crecyliving.com` surfaces are green. Future refinements must update the canonical geometry rather than introduce parallel logos.
