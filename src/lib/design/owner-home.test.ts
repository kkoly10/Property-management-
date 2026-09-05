import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const home = readFileSync(resolve(__dirname, "../../app/owner/page.tsx"), "utf8");
const shell = readFileSync(resolve(__dirname, "../../components/owner/owner-shell.tsx"), "utf8");
const navigation = readFileSync(resolve(__dirname, "../../components/owner/owner-navigation.tsx"), "utf8");

describe("Crecy Owner home design contract", () => {
  it("is financial-first instead of a generic owner shortcut-card portal", () => {
    expect(home).toContain("<OwnerFinancialBand");
    expect(home).toContain("Finalized statements");
    expect(home).toContain("Recorded distributions");
    expect(home).toContain("Needs your decision");
    expect(home).not.toMatch(/from ["']@\/components\/ui\/card["']/);
  });

  it("keeps owner financial truth statement-scoped rather than inventing a portfolio aggregate", () => {
    expect(home).toContain("Latest finalized statement");
    expect(home).toContain("Each currency and property remains separate");
    expect(home).not.toContain("Portfolio total");
    expect(home).not.toContain("Upcoming distribution");
  });

  it("uses the purple owner surface and only existing owner destinations", () => {
    expect(shell).toContain('surface="owner"');
    expect(shell).toContain('<Wordmark product="Owner"');
    for (const href of [
      "/owner",
      "/owner#statements",
      "/owner#remittances",
      "/owner#approvals",
      "/owner/documents",
      "/owner/messages",
      "/owner/preferences",
    ]) {
      expect(navigation).toContain(`href: "${href}"`);
    }
    expect(navigation).not.toContain("/owner/properties");
    expect(navigation).not.toContain("/owner/distributions");
  });
});
