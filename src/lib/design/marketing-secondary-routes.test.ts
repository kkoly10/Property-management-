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
 * Both defects this guards against were live on the branch and invisible to every source-text
 * assertion above, because both are layout behaviour rather than markup vocabulary:
 *
 *  - A horizontally scrollable element that is also a grid item defaults to `min-width: auto`, so it
 *    is sized by its widest table instead of scrolling it. /pilot rendered 780px wide on a 390px
 *    phone and /product 694px, in both cases doubling the page instead of scrolling one table.
 *  - A scroll container with no `tabIndex` cannot be reached by keyboard at all, so on a phone the
 *    table is simply unreadable without a pointer. `pricing-explorer` already solved this; the rest
 *    of the family had not followed it.
 */
describe("marketing scroll containers stay constrained and reachable", () => {
  const sources = [
    "components/marketing/security-architecture.tsx",
    "components/marketing/pilot-operating-story.tsx",
    "components/marketing/operating-story.tsx",
    "components/marketing/pricing-explorer.tsx",
    "components/crecy/marketing-product-stage.tsx",
  ].map((rel) => [rel, readFileSync(resolve(__dirname, "../../", rel), "utf8")] as const);

  it("gives every horizontal scroll container a width floor and a keyboard stop", () => {
    for (const [name, source] of sources) {
      const tags = source.match(/<(?:div|figure)\b[^>]*overflow-x-auto[^>]*>/g) ?? [];
      for (const tag of tags) {
        expect(tag, `${name}: scroll container must carry min-w-0 so it shrinks instead of widening the page`).toContain("min-w-0");
        expect(tag, `${name}: scroll container must be keyboard reachable`).toContain("tabIndex={0}");
        expect(tag, `${name}: scroll container needs an accessible name`).toContain("aria-label");
      }
    }
  });

  it("keeps the shared product stage able to shrink inside a grid column", () => {
    const stage = readFileSync(resolve(__dirname, "../../components/crecy/marketing-product-stage.tsx"), "utf8");
    expect(stage).toContain('cn("relative min-w-0 max-w-full", className)');
  });

  it("does not put the security projections three-across while the figure is still narrow", () => {
    const architecture = readFileSync(resolve(__dirname, "../../components/marketing/security-architecture.tsx"), "utf8");
    // At md and lg the figure shares the hero row, leaving ~134px of text per cell and a five-line wrap.
    expect(architecture).not.toContain('className="grid border-b md:grid-cols-3"');
    expect(architecture).toContain('className="grid border-b xl:grid-cols-3"');
  });
});
