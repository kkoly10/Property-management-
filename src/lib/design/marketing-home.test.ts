import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const home = readFileSync(resolve(__dirname, "../../app/(marketing)/page.tsx"), "utf8");
const proofs = readFileSync(resolve(__dirname, "../../components/marketing/product-proof.tsx"), "utf8");
const stage = readFileSync(resolve(__dirname, "../../components/crecy/marketing-product-stage.tsx"), "utf8");

describe("Crecy marketing home design contract", () => {
  it("tells the product story through role-specific product proofs rather than generic feature-card grids", () => {
    expect(home).toContain("<OperatorCommandCenterProof");
    expect(home).toContain("<LivingPlaceProof");
    expect(home).toContain("<OwnerOverviewProof");
    expect(home).toContain("<RelationshipIndex");
    expect(home).not.toContain("<FeatureGrid");
    expect(home).not.toContain("<FeatureItem");
    expect(home).not.toContain("<ProductComposition");
  });

  it("reuses Crecy product signatures inside deterministic demo stages", () => {
    expect(proofs).toContain("<MetricStrip");
    expect(proofs).toContain("<OperatorAttentionRail");
    expect(proofs).toContain("<LivingCommunityIdentity");
    expect(proofs).toContain("marketing-lobby-v2.webp");
    expect(proofs).toContain("<OwnerFinancialBand");
    expect(proofs).toContain("Representative demo data");
  });

  it("keeps pricing sourced from the canonical runtime price book", () => {
    expect(home).toContain("PRICE_BOOKS");
    expect(home).toContain("PLAN_ORDER");
    expect(home).toContain("formatPrice");
    expect(home).not.toContain("$49");
    expect(home).not.toContain("$129");
    expect(home).not.toContain("$279");
  });

  it("does not claim unsupported customer evidence or certifications", () => {
    expect(home).not.toMatch(/SOC\s*2/i);
    expect(home).not.toMatch(/trusted by/i);
    expect(home).not.toMatch(/customers? saved/i);
  });

  it("uses typography and composition instead of repeating eyebrow and numbered chapter scaffolding", () => {
    expect(home.match(/text-sm font-medium text-primary/g) ?? []).toHaveLength(0);
    expect(home).not.toMatch(/\["0[1-9]"/);
    expect(proofs).not.toContain('["01", "Crecy OS"');
    expect(proofs).not.toContain('["01", "Resident reports"');
  });

  it("keeps the Living photograph clean and puts stage disclosures below their interfaces", () => {
    expect(stage).toContain("label?: ReactNode");
    expect(stage.indexOf("{children}")).toBeLessThan(stage.indexOf("<figcaption"));
    expect(proofs).not.toContain('label="Crecy Living · Resident home"');
    expect(proofs).not.toContain("bg-gradient-to-t");
    expect(proofs).toContain("Maple Court is a fictional demonstration community");
  });
});
