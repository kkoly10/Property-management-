import { describe, expect, it } from "vitest";
import { importCommandsFor } from "./commands";

describe("importCommandsFor", () => {
  it("routes each import type to its own validate/commit pair", () => {
    expect(importCommandsFor("portfolio")).toEqual({ validate: "validate_portfolio_import", commit: "commit_portfolio_import" });
    expect(importCommandsFor("leases")).toEqual({ validate: "validate_occupied_import", commit: "commit_occupied_import" });
    expect(importCommandsFor("combined")).toEqual({ validate: "validate_combined_import", commit: "commit_combined_import" });
    expect(importCommandsFor("residents")).toEqual({ validate: "validate_resident_import", commit: "commit_resident_import" });
    expect(importCommandsFor("opening_balances")).toEqual({ validate: "validate_opening_balance_import", commit: "commit_opening_balance_import" });
  });

  it("returns null for an unknown or missing type instead of defaulting to portfolio", () => {
    // Defaulting would send the job to a command that rejects it with IMPORT_TYPE_MISMATCH, turning a
    // routing bug into an opaque 422.
    expect(importCommandsFor("documents")).toBeNull();
    expect(importCommandsFor(null)).toBeNull();
    expect(importCommandsFor(undefined)).toBeNull();
    expect(importCommandsFor("")).toBeNull();
  });

  it("is not fooled by inherited Object properties", () => {
    expect(importCommandsFor("constructor")).toBeNull();
    expect(importCommandsFor("toString")).toBeNull();
  });
});
