import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CUSTOM_AGREEMENT_UNITS,
  ENTITLEMENTS,
  GROWTH_TRIAL_COPY,
  PAYMENT_DISCLOSURE,
  PLAN_ORDER,
  PRICE_BOOKS,
  annualSavingLabel,
  formatPrice,
  type PlanCode,
  type PriceBook,
} from "./pricing";

const spec = readFileSync(
  resolve(__dirname, "../../../docs/crecy-v4/11_PRICING_ENTITLEMENTS_AND_BILLING_SPEC.md"),
  "utf8",
);

/** The plan rows of one country's table in file 11, parsed from the spec itself. */
function specTable(heading: string) {
  const section = spec.slice(spec.indexOf(`### ${heading}`));
  const rows = [...section.slice(0, section.indexOf("Additional active unit")).matchAll(
    /^\|\s*(Free|Starter|Growth|Pro)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*(\d+)\s*\|/gm,
  )];
  return Object.fromEntries(rows.map((r) => [r[1].toLowerCase(), { monthly: r[2], annual: r[3], units: Number(r[4]) }]));
}

const COUNTRIES: [PriceBook, string][] = [["US", "United States"], ["CA", "Canada"], ["MX", "Mexico"]];

describe("the public price books", () => {
  it.each(COUNTRIES)("matches file 11 exactly for %s", (code, heading) => {
    // File 11 §7 exists because generated marketing images showed a $49 Starter, a $129 Growth and a
    // $279 Pro. None of those are real. This parses the spec's own table rather than trusting a
    // transcription, so the public page cannot drift toward a mock someone remembers seeing.
    const table = specTable(heading);
    const book = PRICE_BOOKS[code];
    for (const plan of PLAN_ORDER) {
      const row = table[plan];
      expect(row, `${heading} has no ${plan} row`).toBeDefined();
      expect(formatPrice(book, book.plans[plan].monthlyMinor), `${code} ${plan} monthly`).toBe(row.monthly);
      expect(formatPrice(book, book.plans[plan].annualMinor), `${code} ${plan} annual`).toBe(row.annual);
      expect(book.plans[plan].includedUnits, `${code} ${plan} units`).toBe(row.units);
    }
  });

  it.each(COUNTRIES)("matches file 11's overage rate for %s", (code, heading) => {
    const section = spec.slice(spec.indexOf(`### ${heading}`));
    const stated = /Additional active unit above Pro allowance: \*\*([^*]+?)\/month\*\*/.exec(section);
    expect(stated, `${heading} states no overage rate`).not.toBeNull();
    expect(formatPrice(PRICE_BOOKS[code], PRICE_BOOKS[code].overageMinor)).toBe(stated![1]);
  });

  it("carries the 500+ custom-agreement threshold from the spec", () => {
    expect(spec).toContain(`Custom agreement at ${CUSTOM_AGREEMENT_UNITS}+ units`);
  });

  it("advertises the authoritative 30-day no-card Growth trial", () => {
    expect(spec).toMatch(/30-day no-card Growth trial/i);
    expect(GROWTH_TRIAL_COPY).toBe("30-day Growth trial, no card required");
  });

  it("states annual billing as the spec does — roughly ten monthly payments", () => {
    expect(spec).toMatch(/Annual billing equals approximately ten monthly payments/i);
    for (const [code] of COUNTRIES) {
      const book = PRICE_BOOKS[code];
      for (const plan of PLAN_ORDER.filter((p) => p !== "free")) {
        expect(annualSavingLabel(book.plans[plan]), `${code} ${plan}`).toBe("2 months free");
      }
      expect(annualSavingLabel(book.plans.free)).toBeNull();
    }
  });
});

describe("the entitlement comparison", () => {
  it("covers every plan for every capability", () => {
    expect(ENTITLEMENTS.length).toBeGreaterThan(10);
    for (const row of ENTITLEMENTS) {
      for (const plan of PLAN_ORDER) {
        expect(row.values[plan as PlanCode], `${row.capability} has no ${plan} value`).toBeTruthy();
      }
    }
  });

  it("never says 'unlimited' without the spec's own qualification", () => {
    // File 11 §7 names bare "unlimited" as a claim the images got wrong.
    for (const row of ENTITLEMENTS) {
      for (const value of Object.values(row.values)) {
        if (/unlimited/i.test(value)) expect(value).toMatch(/fair use/i);
      }
    }
  });
});

describe("the payment disclosure", () => {
  it("keeps every load-bearing sentence", () => {
    const text = PAYMENT_DISCLOSURE.join(" ");
    expect(text).toMatch(/separate from rent collection/i);
    expect(text).toMatch(/no transaction or application fee/i);
    expect(text).toMatch(/connected payment accounts/i);
    expect(text).toMatch(/does not hold resident rent/i);
  });

  it("does not promise instant settlement", () => {
    // File 18 §1 prohibits "instant" for ACH, ACSS or bank transfer.
    expect(PAYMENT_DISCLOSURE.join(" ")).not.toMatch(/\binstant\b/i);
  });
});
