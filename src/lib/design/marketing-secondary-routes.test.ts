import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = (name: string) => readFileSync(resolve(__dirname, `../../app/(marketing)/${name}/page.tsx`), "utf8");
const product = route("product");
const living = route("crecy-living");
const security = route("security");

describe("secondary marketing route design contract", () => {
  it("removes the generic feature-grid and miniature composition language from all three routes", () => {
    for (const source of [product, living, security]) {
      expect(source).not.toContain("FeatureGrid");
      expect(source).not.toContain("FeatureItem");
      expect(source).not.toContain("ProductComposition");
    }
  });

  it("makes Product an operating sequence backed by OS-specific registers", () => {
    expect(product).toContain("<OperatorCommandCenterProof");
    expect(product).toContain("<OperatingSequence");
    expect(product).toContain("<PortfolioRegisterProof");
    expect(product).toContain("<FinanceDeskProof");
    expect(product).toContain("<MaintenanceDeskProof");
    expect(product).toContain("<RecordContinuityProof");
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

  it("keeps the Living anchor editorial, unnumbered and free of text overlays on Maple Court photography", () => {
    expect(living).toContain("Home is the interface.");
    expect(living.match(/text-sm font-medium text-primary/g) ?? []).toHaveLength(0);
    expect(living).not.toMatch(/\["0[1-9]"/);
    expect(living).not.toContain("bg-gradient-to-t");
    expect(living).not.toContain("absolute inset-x-0 bottom-0");
  });
});
