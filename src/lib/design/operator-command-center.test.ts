import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(__dirname, "../../app/app/page.tsx"), "utf8");
const navigation = readFileSync(resolve(__dirname, "../../components/app/primary-navigation.tsx"), "utf8");

describe("operator command-center design contract", () => {
  it("does not regress the anchor back into a generic Card wall", () => {
    expect(page).not.toMatch(/from ["']@\/components\/ui\/card["']/);
    expect(page).not.toMatch(/<Card(?:\s|>)/);
    expect(page).toContain("<MetricStrip");
    expect(page).toContain("<OperatorAttentionRail");
    expect(page).toContain("<WorkspacePanel");
  });

  it("keeps the operator navigation grouped by operating domain", () => {
    for (const group of ["Portfolio", "Operations", "Money", "Records"]) {
      expect(navigation).toContain(`label: "${group}"`);
    }
    expect(navigation).toContain('label: "Properties"');
    expect(navigation).toContain('label: "Maintenance"');
    expect(navigation).toContain('label: "Payments"');
  });

  it("keeps work queues and tables in the anchor instead of decorative chart filler", () => {
    expect(page).toContain("Needs attention");
    expect(page).toContain("Portfolio performance");
    expect(page).toContain("Recent activity");
    expect(page).not.toMatch(/recharts|ResponsiveContainer|LineChart|BarChart/);
  });
});
