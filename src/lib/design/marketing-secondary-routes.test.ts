import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = (name: string) => readFileSync(resolve(__dirname, `../../app/(marketing)/${name}/page.tsx`), "utf8");
const product = route("product");
const living = route("crecy-living");
const security = route("security");
const pilot = route("pilot");
const pricing = route("pricing");

describe("secondary marketing route design contract", () => {
  it("removes the generic feature-grid and miniature composition language from the completed family", () => {
    for (const source of [product, living, security, pilot, pricing]) {
      expect(source).not.toContain("FeatureGrid");
      expect(source).not.toContain("FeatureItem");
      expect(source).not.toContain("ProductComposition");
    }
  });

  it("makes Product an operating sequence backed by OS-specific registers without chapter eyebrows", () => {
    expect(product).toContain("<OperatorCommandCenterProof");
    expect(product).toContain("<OperatingSequence");
    expect(product).toContain("<PortfolioRegisterProof");
    expect(product).toContain("<FinanceDeskProof");
    expect(product).toContain("<MaintenanceDeskProof");
    expect(product).toContain("<RecordContinuityProof");
    expect(product).not.toContain("text-sm font-medium text-primary");
    expect(product).not.toContain("The operating system");
  });

  it("makes Living place-led while keeping Maple Court explicitly fictional", () => {
    expect(living).toContain("marketing-exterior-v2.webp");
    expect(living).toContain("marketing-lobby-v2.webp");
    expect(living).toContain("marketing-model-home-v2.webp");
    expect(living).toContain("marketing-maintenance-v1.webp");
    expect(living).toContain("Fictional Crecy demonstration community");
    expect(living).toContain("<LivingHomeProof");
    expect(living).toContain("Crecy has not verified their legal sufficiency");
  });

  it("makes Security a property-specific control architecture instead of numbered capability rails", () => {
    expect(security).toContain("<PropertyAccessBoundary");
    expect(security).toContain("<RelationshipProjectionProof");
    expect(security).toContain("<LedgerCorrectionProof");
    expect(security).toContain("<DocumentCustodyProof");
    expect(security).toContain("<PaymentBoundaryProof");
    expect(security).toContain("<SupportAccessRecord");
    expect(security).toContain("<AssuranceLedger");
    expect(security).not.toContain("<AccessBoundaryMap");
    expect(security).not.toContain("<ControlStack");
    expect(security).not.toContain("<FinancialIntegrityRail");
    expect(security).not.toContain("<DocumentReleaseRail");
    expect(security).not.toContain("text-sm font-medium text-primary");
    expect(security).not.toContain("next/image");
  });

  it("makes Pilot an operating-readiness journey rather than a numbered early-access page", () => {
    expect(pilot).toContain("<PilotReadinessBoard");
    expect(pilot).toContain("<PilotActivationFlow");
    expect(pilot).toContain("<ImportReadinessProof");
    expect(pilot).toContain("<PilotStatusRegister");
    expect(pilot).not.toContain("SectionHeading");
    expect(pilot).not.toContain("text-sm font-medium text-primary");
    expect(pilot).not.toContain("0{index + 1}");
  });

  it("keeps Pricing canonical while removing the old payment eyebrow", () => {
    expect(pricing).toContain("<PricingExplorer");
    expect(pricing).toContain("PAYMENT_DISCLOSURE");
    expect(pricing).toContain("CUSTOM_AGREEMENT_UNITS");
    expect(pricing).not.toContain("more than 500 units");
    expect(pricing).not.toContain('eyebrow="Payments"');
    expect(pricing).not.toContain("SectionHeading");
  });

  it("keeps the Living anchor editorial, unnumbered and free of text overlays on Maple Court photography", () => {
    expect(living).toContain("Home is the interface.");
    expect(living.match(/text-sm font-medium text-primary/g) ?? []).toHaveLength(0);
    expect(living).not.toMatch(/\["0[1-9]"/);
    expect(living).not.toContain("bg-gradient-to-t");
    expect(living).not.toContain("absolute inset-x-0 bottom-0");
  });
});

/**
 * Responsive integrity of the marketing family.
 *
 * Scope note, because the first version of this block overstated itself. The behavioural guard for
 * horizontal overflow already exists and is stronger than anything source text can assert:
 * `e2e/marketing.spec.ts` drives a real browser over every public route at 375px and 1440px and
 * fails on `scrollWidth > clientWidth`. It is not part of `npm run check`, which is why two pages
 * shipped at roughly twice the viewport width without the gate noticing.
 *
 * What source text CAN usefully pin, and what is asserted below:
 *
 *  - Keyboard reachability of each scroll container. A container with no `tabIndex` cannot be
 *    reached by keyboard at all, so on a phone the table inside it is unreadable without a pointer.
 *    No other test covers this.
 *  - A width floor on the two NON-scrolling wrappers that are grid items. This is the constraint
 *    that actually mattered: per CSS Grid the automatic minimum size of a scroll container is
 *    already 0, so `min-w-0` on the scrolling element changes nothing — it is the enclosing figure,
 *    which does not scroll, that was being sized by the table it wraps.
 */
describe("marketing scroll containers stay reachable and their wrappers can shrink", () => {
  const sources = [
    "components/marketing/security-architecture.tsx",
    "components/marketing/pilot-operating-story.tsx",
    "components/marketing/operating-story.tsx",
    "components/marketing/pricing-explorer.tsx",
  ].map((rel) => [rel, readFileSync(resolve(__dirname, "../../", rel), "utf8")] as const);

  it("gives every horizontal scroll container a keyboard stop and an accessible name", () => {
    let checked = 0;
    for (const [name, source] of sources) {
      const tags = source.match(/<(?:div|figure)\b[^>]*overflow-x-auto[^>]*>/g) ?? [];
      expect(tags.length, `${name}: expected to find scroll containers`).toBeGreaterThan(0);
      for (const tag of tags) {
        expect(tag, `${name}: scroll container must be keyboard reachable`).toContain("tabIndex={0}");
        expect(tag, `${name}: scroll container needs an accessible name`).toContain("aria-label");
        checked += 1;
      }
    }
    // Guards that match nothing pass vacuously; this one is worthless unless it saw every container.
    expect(checked).toBe(8);
  });

  it("keeps the non-scrolling wrappers able to shrink inside a grid column", () => {
    const stage = readFileSync(resolve(__dirname, "../../components/crecy/marketing-product-stage.tsx"), "utf8");
    expect(stage).toContain('cn("relative min-w-0 max-w-full", className)');
    const pilot = readFileSync(resolve(__dirname, "../../components/marketing/pilot-operating-story.tsx"), "utf8");
    expect(pilot).toContain('<figure className="min-w-0 max-w-full border-y bg-card">');
  });

  it("does not put the security projections three-across while the figure is still narrow", () => {
    const architecture = readFileSync(resolve(__dirname, "../../components/marketing/security-architecture.tsx"), "utf8");
    // Three columns left ~195px of text from 768px and ~134px from 1024px, where the figure also
    // moves into the hero's narrower column.
    expect(architecture).not.toContain('className="grid border-b md:grid-cols-3"');
    expect(architecture).toContain('className="grid border-b xl:grid-cols-3"');
  });
});
