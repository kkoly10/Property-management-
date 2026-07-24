import { describe, expect, it } from "vitest";
import {
  OPERATOR_SEARCH_MAX_LENGTH,
  parseOperatorSearch,
} from "@/lib/validation/search";

describe("operator search validation", () => {
  it("trims and accepts a bounded query", () => {
    expect(parseOperatorSearch({ q: "  Maple Court  " })).toEqual({
      query: "Maple Court",
      state: "ready",
    });
  });

  it("uses the first query value and handles an empty search", () => {
    expect(parseOperatorSearch({ q: ["Unit 101", "ignored"] }).query).toBe("Unit 101");
    expect(parseOperatorSearch({})).toEqual({ query: "", state: "empty" });
  });

  it("rejects too-short and too-long queries", () => {
    expect(parseOperatorSearch({ q: "x" }).state).toBe("invalid");
    expect(parseOperatorSearch({ q: "x".repeat(OPERATOR_SEARCH_MAX_LENGTH + 1) }).state).toBe("invalid");
  });
});
