# Crecy Brand Identity Asset System

**Status:** Founder-approved identity implementation  
**Decision date:** 2026-09-05  
**Applies to:** Crecy marketing, Crecy OS, Crecy Living, Crecy Owner, authentication, browser/PWA metadata, transactional surfaces, and exported documents.

## 1. Identity lock

The master brand remains **Crecy**.

The production identity is a wordmark-led system with an architectural operating-layer mark derived from the approved Crecy brand board:

- Primary brand: Crecy mark + Crecy wordmark in Primary Indigo `#4F46E5`.
- Reversed brand: white mark + white wordmark on dark/indigo surfaces.
- Crecy OS: Primary Indigo product lockup.
- Crecy Living: Secondary Teal `#0F766E` product lockup.
- Crecy Owner: Secondary Teal `#0F766E` product lockup.
- Small-space identity: the Crecy mark alone on an indigo app-icon tile.
- Typography remains Inter with Noto Sans fallback.

The old text-only bold `Crecy` placeholder is not an approved logo.

## 2. Canonical implementation

The codebase must have one reusable brand component and one canonical asset directory.

Canonical code:
- `src/components/brand/wordmark.tsx`

Canonical static assets:
- `public/brand/crecy-logo.svg`
- `public/brand/crecy-logo-white.svg`
- `public/brand/crecy-mark.svg`
- `public/brand/crecy-mark-white.svg`
- `public/brand/crecy-os.svg`
- `public/brand/crecy-living.svg`
- `public/brand/crecy-owner.svg`
- `public/brand/favicon.svg`

Metadata artwork:
- `src/app/icon.svg`
- `src/app/apple-icon.tsx`
- `src/app/opengraph-image.tsx`
- `src/app/twitter-image.tsx`
- `src/app/manifest.ts`

No page may invent a second logo, copy/paste a different SVG geometry, or substitute a generic Lucide building/home icon for the Crecy identity.

## 3. Placement rules

### Marketing
Use the full Crecy lockup in the site header and footer. Browser tab, app/bookmark icon, and social metadata must use the canonical identity assets.

### Crecy OS
Use the full master/OS lockup in the desktop sidebar, mobile header, authentication and onboarding. The mark may collapse to mark-only only where horizontal space is genuinely constrained.

### Crecy Living
Use the teal Crecy Living lockup in resident headers and authentication/community entry points. Use the mark-only identity in compact PWA/mobile placements.

### Crecy Owner
Use the teal Crecy Owner lockup in owner headers and owner authentication/entry points.

### Communications and documents
Transactional emails, receipts, notices, owner statements, and generated reports should use the full lockup when the rendering channel supports it. Never embed a low-resolution screenshot of the logo.

## 4. Clear space and minimum size

- Maintain clear space around a full lockup equal to at least the visual height of the Crecy mark's smallest exterior building stroke.
- Minimum mark size: 16 CSS px.
- Minimum full horizontal lockup: 110 CSS px wide.
- Do not stretch, skew, outline, shadow, gradient, or arbitrarily recolor the identity.
- Do not place the mark inside a generic circular badge unless the product surface specifically requires a circular OS/app mask.

## 5. Accessibility

- Logo SVGs must have accessible names when they convey brand identity.
- Decorative mark instances inside an already labeled lockup must be aria-hidden.
- Reversed and colored variants must preserve WCAG-safe contrast against their surfaces.
- Product identity color is never the only way product context is communicated; the product name remains visible in the full lockup.

## 6. Brand quality gate

A public or authenticated surface is not brand-complete if any of the following are true:

- the browser tab still shows a starter-framework/default favicon;
- the header renders plain bold text instead of the canonical Crecy lockup;
- Crecy Living or Crecy Owner uses a generic badge as its primary product identity;
- social previews have no Crecy artwork;
- PWA/bookmark installation uses a default or unrelated icon;
- the logo geometry differs between pages because SVG fragments were copied locally.

This identity system is the implementation baseline for future visual refinement. Any future logo-artwork change must update the canonical component and asset directory rather than creating parallel identities.
