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

describe("autoMapImportColumns for the lease-bearing legs", () => {
  it("maps the occupied-lease and combined columns an operator's rent roll actually uses", () => {
    const mapping = autoMapImportColumns([
      "Property", "Type", "Address", "City", "Country", "Time Zone", "Unit",
      "First Name", "Last Name", "Email", "Lease Start", "Rent", "Rent Frequency", "Currency", "Opening Balance",
    ]);
    expect(mapping).toMatchObject({
      propertyName: "Property", propertyType: "Type", addressLine1: "Address", locality: "City",
      countryCode: "Country", timeZone: "Time Zone", unitCode: "Unit",
      primaryFirstName: "First Name", primaryLastName: "Last Name", primaryEmail: "Email",
      leaseStartDate: "Lease Start", rentAmountMinor: "Rent", rentFrequency: "Rent Frequency",
      currencyCode: "Currency", openingBalanceMinor: "Opening Balance",
    });
  });

  it("maps the opening-balance columns", () => {
    const mapping = autoMapImportColumns(["Property", "Address", "Country", "Unit", "Balance", "Effective Date", "Memo"]);
    expect(mapping).toMatchObject({ openingBalanceMinor: "Balance", effectiveDate: "Effective Date", memo: "Memo" });
  });

  it("leaves unmatched canonical keys absent rather than guessing", () => {
    const mapping = autoMapImportColumns(["Property", "Address"]);
    expect(mapping.rentAmountMinor).toBeUndefined();
    expect(mapping.unitCode).toBeUndefined();
  });
});
