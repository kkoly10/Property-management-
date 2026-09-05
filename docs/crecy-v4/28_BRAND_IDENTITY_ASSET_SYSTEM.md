# Crecy Brand Identity Asset System

**Status:** Founder-approved production identity  
**Decision date:** 2026-09-05  
**Latest correction:** 2026-09-05 — custom wordmark/CY system supersedes the architectural placeholder  
**Applies to:** Crecy marketing, Crecy OS, Crecy Living, Crecy Owner, authentication, browser/PWA metadata, transactional surfaces, and exported documents.

## 1. Identity lock

The master brand remains **Crecy**.

The approved production identity is the custom Crecy wordmark selected by the founder: an airy oversized capital C, custom geometric r/e/c letterforms, and a distinctive y with a long descender and detached angled terminal. The earlier architectural/building symbol is rejected and must not be reused.

Two color families are authoritative:

- **Crecy OS family — purple:** `#3A37EB`
  - `crecyos.com`
  - `www.crecyos.com`
  - `app.crecyos.com`
  - `owner.crecyos.com`
  - future `vendor.crecyos.com`
- **Crecy Living family — green:** `#01A065`
  - `crecyliving.com`
  - `www.crecyliving.com`
  - every `*.crecyliving.com` community portal

The domain family, not a generic suffix treatment, determines the logo color. Crecy Owner is purple because its canonical host is `owner.crecyos.com`.

## 2. Approved compact mark

The approved compact mark is **CY**, derived from the same custom wordmark:

- open rounded C;
- angular Y/y construction;
- detached angled terminal preserved as the recognizable signature;
- white monogram on a purple rounded-square tile for Crecy OS;
- white monogram on a green rounded-square tile for Crecy Living.

Do not use the old building/skyline mark, a generic letter tile, or a stock real-estate icon.

## 3. Canonical implementation

Canonical code:

- `src/components/brand/crecy-art.tsx` — authoritative vector geometry and colors
- `src/components/brand/wordmark.tsx` — reusable production wordmark/monogram component
- `src/app/api/brand/icon/route.tsx` — PNG icon rendering at standard sizes
- `src/app/layout.tsx` — host-aware favicon metadata
- `src/app/manifest.ts` — host-aware PWA identity
- `src/app/opengraph-image.tsx` — Crecy OS social artwork

Canonical static assets:

- `public/brand/crecy-logo.svg` — purple wordmark
- `public/brand/crecy-logo-white.svg` — reversed wordmark
- `public/brand/crecy-os.svg` — purple wordmark
- `public/brand/crecy-living.svg` — green wordmark
- `public/brand/crecy-owner.svg` — purple wordmark
- `public/brand/crecy-mark.svg` — purple CY monogram
- `public/brand/crecy-mark-white.svg` — white CY monogram
- `public/brand/favicon-os.svg` — purple CY tile
- `public/brand/favicon-living.svg` — green CY tile
- `public/brand/favicon.svg` — purple/default CY tile

Standard PNG icon sizes are rendered from the same CY vector geometry at:

- 16×16
- 32×32
- 48×48
- 64×64
- 180×180
- 192×192
- 512×512

No screen may invent a second logo or substitute a Lucide/property icon for the Crecy identity.

## 4. Placement rules

### Crecy marketing + Crecy OS

Use the purple custom Crecy wordmark on `crecyos.com` and all `*.crecyos.com` product surfaces. Use the purple CY tile for browser tabs, bookmarks, app/PWA icons, and compact placements.

### Crecy Living

Use the green custom Crecy wordmark on `crecyliving.com` and all community subdomains. Use the green CY tile for browser tabs, bookmarks, PWA icons, and compact placements.

### Crecy Owner

Use the purple custom Crecy wordmark and purple CY mark because the portal is `owner.crecyos.com`.

### Reversed use

Use the white wordmark/monogram only when required by a dark or strongly colored background. Geometry may not change between normal and reversed variants.

## 5. Clear space and minimum size

- Minimum full wordmark width: 110 CSS px.
- Minimum compact CY icon: 16 CSS px.
- Keep clear space around the wordmark approximately equal to the cap-stroke thickness of the C.
- Do not stretch, skew, outline, add drop shadows, add a different symbol, or substitute a generic font rendering of “Crecy”.
- Do not add “OS”, “Living”, or “Owner” as part of the logo artwork itself. Product context comes from the host/surface and adjacent UI copy when needed.

## 6. Accessibility

- SVG wordmarks carry an accessible product label when they convey identity.
- Decorative inner geometry is aria-hidden through the parent lockup.
- Green/purple identity color is never the sole carrier of product meaning; the host/surface and page copy also identify the product.
- Reversed variants must preserve sufficient contrast.

## 7. Brand quality gate

A surface is not brand-complete if any of the following are true:

- the old architectural/building mark is visible;
- the header renders plain default-font “Crecy” rather than the custom wordmark;
- a `crecyos.com` surface uses the green identity;
- a `crecyliving.com` surface uses the purple identity;
- Crecy Owner uses green;
- the favicon/PWA icon is not the CY monogram;
- browser/PWA assets drift from the approved vector geometry;
- social artwork uses the rejected architectural mark;
- product-specific suffix typography is baked into a parallel logo instead of using the canonical wordmark.

The custom wordmark and CY monogram are now the only approved production identity.
