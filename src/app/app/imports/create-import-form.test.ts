import { describe, expect, it } from "vitest";
import { IMPORT_TYPE_HINTS, IMPORT_TYPE_LABELS } from "./create-import-form";
import { importTypes } from "@/lib/validation/imports";

/**
 * Guards the regression this branch actually shipped: three import legs existed end to end in the API
 * while the form still offered only two, so no operator could reach them. Adding a leg to importTypes
 * without giving it a label and a hint now fails here rather than shipping an unreachable feature.
 */
describe("import type copy", () => {
  it("gives every implemented leg a label and a hint", () => {
    for (const type of importTypes) {
      expect(IMPORT_TYPE_LABELS[type], `missing label for ${type}`).toBeTruthy();
      expect(IMPORT_TYPE_HINTS[type], `missing hint for ${type}`).toBeTruthy();
    }
  });

  it("carries copy for exactly the implemented legs — no orphans", () => {
    expect(Object.keys(IMPORT_TYPE_LABELS).sort()).toEqual([...importTypes].sort());
    expect(Object.keys(IMPORT_TYPE_HINTS).sort()).toEqual([...importTypes].sort());
  });

  it("makes each leg distinguishable to the operator", () => {
    const labels = Object.values(IMPORT_TYPE_LABELS);
    const hints = Object.values(IMPORT_TYPE_HINTS);
    expect(new Set(labels).size).toBe(labels.length);
    expect(new Set(hints).size).toBe(hints.length);
  });

  it("says what each financially significant leg will post or change", () => {
    expect(IMPORT_TYPE_HINTS.opening_balances).toMatch(/opening receivable/i);
    expect(IMPORT_TYPE_HINTS.combined).toMatch(/opening receivable/i);
    expect(IMPORT_TYPE_HINTS.residents).toMatch(/not duplicated|reported/i);
  });
});
