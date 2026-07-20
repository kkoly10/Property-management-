import { describe, expect, it } from "vitest";
import { autoMapImportColumns, CsvImportError, maximumImportRows, parseCsv } from "./csv";

describe("portfolio CSV parsing", () => {
  it("parses quoted commas, escaped quotes, and embedded newlines", () => {
    const parsed = parseCsv('Property Name,Address,Notes\r\n"Maple, Court","100 Main St","Line one\nLine ""two"""\r\n');
    expect(parsed.headers).toEqual(["Property Name", "Address", "Notes"]);
    expect(parsed.rows[0]).toMatchObject({ "Property Name": "Maple, Court", Notes: 'Line one\nLine "two"' });
  });

  it("rejects duplicate headers and oversized imports", () => {
    expect(() => parseCsv("Name,name\nOne,Two")).toThrow(CsvImportError);
    const oversized = `Name\n${Array.from({ length: maximumImportRows + 1 }, (_, index) => index).join("\n")}`;
    expect(() => parseCsv(oversized)).toThrow(/10,000/);
  });

  it("maps common portfolio template headers", () => {
    expect(autoMapImportColumns(["Property Name", "Property Type", "Address", "City", "Unit", "Sq Ft"])).toEqual({
      propertyName: "Property Name", propertyType: "Property Type", addressLine1: "Address",
      locality: "City", unitCode: "Unit", squareFeet: "Sq Ft",
    });
  });
});
