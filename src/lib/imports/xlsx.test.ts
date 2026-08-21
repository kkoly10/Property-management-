import { zipSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { columnIndexFromReference, parseXlsx, XlsxImportError } from "./xlsx";

const WORKBOOK = `<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Roster" sheetId="1" r:id="rId1"/></sheets></workbook>`;
const RELS = `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;

function sharedStrings(values: string[]): string {
  return `<?xml version="1.0"?><sst count="${values.length}">${values.map((v) => `<si><t>${v}</t></si>`).join("")}</sst>`;
}

/** grid[r][c] is either {s:index} for a shared string, {v:literal}, or {inline:text}. */
type CellSpec = { s: number } | { v: string } | { inline: string } | null;

function sheet(grid: CellSpec[][]): string {
  const columnName = (index: number) => {
    let name = "";
    let n = index + 1;
    while (n > 0) {
      const remainder = (n - 1) % 26;
      name = String.fromCharCode(65 + remainder) + name;
      n = Math.floor((n - 1) / 26);
    }
    return name;
  };
  const rows = grid
    .map((cells, rowIndex) => {
      const body = cells
        .map((cell, columnIndex) => {
          if (cell === null) return "";
          const ref = `${columnName(columnIndex)}${rowIndex + 1}`;
          if ("s" in cell) return `<c r="${ref}" t="s"><v>${cell.s}</v></c>`;
          if ("inline" in cell) return `<c r="${ref}" t="inlineStr"><is><t>${cell.inline}</t></is></c>`;
          return `<c r="${ref}"><v>${cell.v}</v></c>`;
        })
        .join("");
      return `<row r="${rowIndex + 1}">${body}</row>`;
    })
    .join("");
  return `<?xml version="1.0"?><worksheet><sheetData>${rows}</sheetData></worksheet>`;
}

function workbook(files: Record<string, string>): Uint8Array {
  return zipSync(Object.fromEntries(Object.entries(files).map(([name, xml]) => [name, strToU8(xml)])));
}

function simpleWorkbook(strings: string[], grid: CellSpec[][]): Uint8Array {
  return workbook({
    "xl/workbook.xml": WORKBOOK,
    "xl/_rels/workbook.xml.rels": RELS,
    "xl/sharedStrings.xml": sharedStrings(strings),
    "xl/worksheets/sheet1.xml": sheet(grid),
  });
}

describe("columnIndexFromReference", () => {
  it("decodes single and multi-letter column references", () => {
    expect(columnIndexFromReference("A1")).toBe(1);
    expect(columnIndexFromReference("Z9")).toBe(26);
    expect(columnIndexFromReference("AA1")).toBe(27);
    expect(columnIndexFromReference("BC12")).toBe(55);
  });
});

describe("parseXlsx", () => {
  it("reads headers and rows from shared strings", () => {
    const file = simpleWorkbook(
      ["Property", "Unit", "Maple Court", "101"],
      [
        [{ s: 0 }, { s: 1 }],
        [{ s: 2 }, { s: 3 }],
      ],
    );
    const parsed = parseXlsx(file);
    expect(parsed.headers).toEqual(["Property", "Unit"]);
    expect(parsed.rows).toEqual([{ Property: "Maple Court", Unit: "101" }]);
  });

  it("reads inline strings and numeric literals, and trims values", () => {
    const file = simpleWorkbook(
      ["Property", "Rent"],
      [
        [{ s: 0 }, { s: 1 }],
        [{ inline: "  Birch Terrace  " }, { v: "135000" }],
      ],
    );
    const parsed = parseXlsx(file);
    expect(parsed.rows[0]).toEqual({ Property: "Birch Terrace", Rent: "135000" });
  });

  it("fills gaps from sparse rows using the cell reference, not cell order", () => {
    // A row where the middle cell is omitted entirely must still align to its header.
    const file = simpleWorkbook(
      ["Property", "Unit", "Rent"],
      [
        [{ s: 0 }, { s: 1 }, { s: 2 }],
        [{ inline: "Maple" }, null, { v: "1200" }],
      ],
    );
    const parsed = parseXlsx(file);
    expect(parsed.rows[0]).toEqual({ Property: "Maple", Unit: "", Rent: "1200" });
  });

  it("unescapes XML entities in cell text", () => {
    const file = simpleWorkbook(["Name"], [[{ s: 0 }], [{ inline: "Smith &amp; Sons &lt;A&gt; &#65;" }]]);
    expect(parseXlsx(file).rows[0].Name).toBe("Smith & Sons <A> A");
  });

  it("does not pollute Object.prototype from a hostile header", () => {
    // The defect class behind CVE-2023-30533: a header named __proto__ must become an own property.
    const file = simpleWorkbook(["__proto__", "Unit"], [[{ s: 0 }, { s: 1 }], [{ inline: "polluted" }, { inline: "1" }]]);
    const parsed = parseXlsx(file);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(parsed.rows[0], "__proto__")).toBe(true);
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
  });

  it("rejects a DOCTYPE, so no entity expansion is possible", () => {
    const hostile = `<?xml version="1.0"?><!DOCTYPE t [<!ENTITY x "boom">]><worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>&x;</t></is></c></row></sheetData></worksheet>`;
    const file = workbook({
      "xl/workbook.xml": WORKBOOK,
      "xl/_rels/workbook.xml.rels": RELS,
      "xl/worksheets/sheet1.xml": hostile,
    });
    expect(() => parseXlsx(file)).toThrow(XlsxImportError);
  });

  it("rejects a non-zip payload", () => {
    expect(() => parseXlsx(strToU8("not a workbook"))).toThrow(XlsxImportError);
  });

  it("rejects a workbook with no data row, blank headers, or duplicate headers", () => {
    expect(() => parseXlsx(simpleWorkbook(["Property"], [[{ s: 0 }]]))).toThrow(/header and at least one data row/);
    expect(() => parseXlsx(simpleWorkbook(["Name", "Name"], [[{ s: 0 }, { s: 1 }], [{ inline: "a" }, { inline: "b" }]]))).toThrow(/unique/);
    // A blank header BETWEEN populated ones is ambiguous and must be rejected.
    expect(() => parseXlsx(simpleWorkbook(["Name", "Unit"], [[{ s: 0 }, { inline: "" }, { s: 1 }], [{ inline: "a" }, { inline: "b" }, { inline: "c" }]]))).toThrow(XlsxImportError);
  });

  it("trims trailing blank header columns instead of failing on stray formatting", () => {
    // Spreadsheets routinely carry an empty formatted column past the last real one.
    const parsed = parseXlsx(simpleWorkbook(["Name", ""], [[{ s: 0 }, { inline: "" }], [{ inline: "a" }, { inline: "" }]]));
    expect(parsed.headers).toEqual(["Name"]);
    expect(parsed.rows).toEqual([{ Name: "a" }]);
  });

  it("ignores an out-of-range shared-string index rather than throwing", () => {
    const file = simpleWorkbook(["Property"], [[{ s: 0 }], [{ s: 99 }]]);
    // The only data row is then blank, so the workbook has no meaningful data row.
    expect(() => parseXlsx(file)).toThrow(/header and at least one data row/);
  });

  it("falls back to the first sheet file when relationships are missing", () => {
    const file = workbook({
      "xl/workbook.xml": `<?xml version="1.0"?><workbook><sheets><sheet name="Roster" sheetId="1"/></sheets></workbook>`,
      "xl/sharedStrings.xml": sharedStrings(["Property", "Maple"]),
      "xl/worksheets/sheet1.xml": sheet([[{ s: 0 }], [{ s: 1 }]]),
    });
    expect(parseXlsx(file).rows).toEqual([{ Property: "Maple" }]);
  });

  it("ignores unrelated zip entries", () => {
    const file = workbook({
      "xl/workbook.xml": WORKBOOK,
      "xl/_rels/workbook.xml.rels": RELS,
      "xl/sharedStrings.xml": sharedStrings(["Property", "Maple"]),
      "xl/worksheets/sheet1.xml": sheet([[{ s: 0 }], [{ s: 1 }]]),
      "docProps/app.xml": "<Properties/>",
      "../escape.txt": "should never be read",
    });
    expect(parseXlsx(file).headers).toEqual(["Property"]);
  });
});
