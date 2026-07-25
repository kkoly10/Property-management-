import { describe, expect, it } from "vitest";
import { createCsv, csvCell } from "@/lib/exports/csv";

describe("CSV export encoding", () => {
  it("quotes delimiters, quotes, and line breaks", () => {
    expect(csvCell('Maple, "Court"\nUnit 1')).toBe('"Maple, ""Court""\nUnit 1"');
  });

  it.each(["=SUM(A1:A2)", "+cmd", "-2+3", "@import", "  =1+1"])(
    "neutralizes spreadsheet formulas in %s",
    (value) => {
      expect(csvCell(value)).toBe(`"'${value}"`);
    },
  );

  it("uses a UTF-8 BOM and CRLF records for spreadsheet compatibility", () => {
    expect(createCsv(["payment_id", "amount_minor"], [["pay-1", "85000"]]))
      .toBe('\uFEFF"payment_id","amount_minor"\r\n"pay-1","85000"\r\n');
  });
});
