import { unzipSync } from "fflate";
import { maximumImportColumns, maximumImportRows } from "./csv";

/**
 * A deliberately small .xlsx reader for portfolio imports.
 *
 * Why not a spreadsheet library: the only npm-published SheetJS build (xlsx@0.18.5) carries unfixed
 * high-severity prototype-pollution and ReDoS advisories — the fix ships only from the vendor's own
 * CDN — and ExcelJS pulls nine transitive packages (jszip, unzipper, archiver, saxes, ...) to write
 * formatted workbooks we never write. This reads exactly what an import needs: the first worksheet, as
 * trimmed strings, in the same shape as parseCsv. The only dependency is fflate (MIT, zero deps) for
 * the ZIP container.
 *
 * Untrusted-input hardening, because an .xlsx is an attacker-supplied ZIP of attacker-supplied XML:
 *   * decompression is bounded by entry count and total bytes, so a zip bomb fails instead of
 *     exhausting memory;
 *   * every map keyed by file content uses a null-prototype object, which is the exact defect class
 *     behind CVE-2023-30533;
 *   * a DOCTYPE is rejected outright, so no entity expansion is possible;
 *   * rows and columns are capped at the same limits the CSV path enforces.
 */
export class XlsxImportError extends Error {}

/** A generously sized workbook is still only a few MB of XML; past this it is an attack, not a file. */
const maximumEntryCount = 512;
const maximumTotalBytes = 64 * 1024 * 1024;

function decodeEntry(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes);
}

function assertNoDoctype(xml: string, what: string) {
  if (/<!DOCTYPE/i.test(xml)) throw new XlsxImportError(`The workbook's ${what} contains a document type declaration.`);
}

/** Unescape the five XML predefined entities plus numeric character references. Nothing else. */
function unescapeXml(value: string): string {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => safeCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec) => safeCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function safeCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return "";
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

/** "BC12" -> 54 (1-based column index). */
export function columnIndexFromReference(reference: string): number {
  const letters = /^([A-Z]+)/.exec(reference.toUpperCase())?.[1];
  if (!letters) return 0;
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index;
}

/** Concatenated text of one <si> shared-string element, including all its runs. */
function sharedStringText(siXml: string): string {
  const parts: string[] = [];
  const pattern = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t\s*\/>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(siXml)) !== null) parts.push(unescapeXml(match[1] ?? ""));
  return parts.join("");
}

function readSharedStrings(xml: string): string[] {
  assertNoDoctype(xml, "shared strings");
  const strings: string[] = [];
  const pattern = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>|<si\s*\/>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) strings.push(sharedStringText(match[1] ?? ""));
  return strings;
}

type Cell = { column: number; value: string };

function readSheetRows(xml: string, sharedStrings: string[]): Cell[][] {
  assertNoDoctype(xml, "worksheet");
  const rows: Cell[][] = [];
  const rowPattern = /<row(?:\s[^>]*)?>([\s\S]*?)<\/row>|<row\s[^>]*\/>/g;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowPattern.exec(xml)) !== null) {
    if (rows.length > maximumImportRows + 1) {
      throw new XlsxImportError(`Spreadsheets can contain at most ${maximumImportRows.toLocaleString()} rows.`);
    }
    const cells: Cell[] = [];
    const cellPattern = /<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellPattern.exec(rowMatch[1] ?? "")) !== null) {
      const attributes = cellMatch[1] ?? "";
      const body = cellMatch[2] ?? "";
      const reference = /r="([A-Z]+\d+)"/i.exec(attributes)?.[1] ?? "";
      const type = /t="([^"]+)"/.exec(attributes)?.[1] ?? "n";
      const column = columnIndexFromReference(reference) || cells.length + 1;

      let value = "";
      if (type === "inlineStr") {
        value = sharedStringText(body);
      } else if (type === "s") {
        const index = Number.parseInt(unescapeXml(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? ""), 10);
        // Bounds-checked lookup into a plain array — never a property read on a shared object.
        value = Number.isInteger(index) && index >= 0 && index < sharedStrings.length ? sharedStrings[index] : "";
      } else {
        value = unescapeXml(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "");
      }
      cells.push({ column, value: value.trim() });
    }
    rows.push(cells);
  }
  return rows;
}

/** The sheet the workbook lists first, resolved through the relationship id when one is present. */
function firstSheetPath(workbookXml: string, relsXml: string | null, available: Set<string>): string {
  assertNoDoctype(workbookXml, "workbook");
  const sheet = /<sheet\s[^>]*?\/?>/i.exec(workbookXml)?.[0];
  const relationshipId = sheet ? /r:id="([^"]+)"/i.exec(sheet)?.[1] : null;
  if (relationshipId && relsXml) {
    assertNoDoctype(relsXml, "workbook relationships");
    const relationships = relsXml.match(/<Relationship\s[^>]*?\/?>/gi) ?? [];
    for (const relationship of relationships) {
      if (/Id="([^"]+)"/i.exec(relationship)?.[1] !== relationshipId) continue;
      const target = /Target="([^"]+)"/i.exec(relationship)?.[1];
      if (!target) break;
      const normalized = target.replace(/^\/?xl\//, "").replace(/^\.\//, "");
      const candidate = `xl/${normalized}`;
      if (available.has(candidate)) return candidate;
      break;
    }
  }
  const fallback = [...available].filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name)).sort();
  if (fallback.length === 0) throw new XlsxImportError("The workbook contains no worksheet.");
  return fallback[0];
}

export function parseXlsx(source: ArrayBuffer | Uint8Array): { headers: string[]; rows: Array<Record<string, string>> } {
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new XlsxImportError("That file is not a valid .xlsx workbook.");
  }

  let unzipped: Record<string, Uint8Array>;
  try {
    let entries = 0;
    let totalBytes = 0;
    unzipped = unzipSync(bytes, {
      // Only the four entries an import needs are inflated; everything else is skipped before it can
      // cost memory, and the running totals stop a zip bomb that hides inside those names.
      filter: (file) => {
        const wanted =
          file.name === "xl/workbook.xml" ||
          file.name === "xl/_rels/workbook.xml.rels" ||
          file.name === "xl/sharedStrings.xml" ||
          /^xl\/worksheets\/sheet\d+\.xml$/.test(file.name);
        if (!wanted) return false;
        entries += 1;
        totalBytes += file.originalSize ?? 0;
        if (entries > maximumEntryCount || totalBytes > maximumTotalBytes) {
          throw new XlsxImportError("That workbook is too large to import.");
        }
        return true;
      },
    });
  } catch (error) {
    if (error instanceof XlsxImportError) throw error;
    throw new XlsxImportError("That workbook could not be opened.");
  }

  const available = new Set(Object.keys(unzipped));
  const workbookEntry = unzipped["xl/workbook.xml"];
  if (!workbookEntry) throw new XlsxImportError("That file is not a valid .xlsx workbook.");
  const relsEntry = unzipped["xl/_rels/workbook.xml.rels"];
  const sharedEntry = unzipped["xl/sharedStrings.xml"];

  const sheetPath = firstSheetPath(decodeEntry(workbookEntry), relsEntry ? decodeEntry(relsEntry) : null, available);
  const sheetEntry = unzipped[sheetPath];
  if (!sheetEntry) throw new XlsxImportError("The workbook's first worksheet could not be read.");

  const sharedStrings = sharedEntry ? readSharedStrings(decodeEntry(sharedEntry)) : [];
  const grid = readSheetRows(decodeEntry(sheetEntry), sharedStrings);

  const meaningful = grid.filter((row) => row.some((cell) => cell.value.length));
  if (meaningful.length < 2) throw new XlsxImportError("The workbook needs a header and at least one data row.");

  const widest = Math.max(...meaningful.map((row) => row.reduce((max, cell) => Math.max(max, cell.column), 0)));
  if (widest > maximumImportColumns) throw new XlsxImportError(`Spreadsheets can contain at most ${maximumImportColumns} columns.`);

  const toDense = (row: Cell[]): string[] => {
    const dense = new Array<string>(widest).fill("");
    for (const cell of row) if (cell.column >= 1 && cell.column <= widest) dense[cell.column - 1] = cell.value;
    return dense;
  };

  const headerRow = toDense(meaningful[0]);
  // Trailing empty header columns are an artifact of stray formatting, not real columns.
  let width = headerRow.length;
  while (width > 0 && headerRow[width - 1] === "") width -= 1;
  const headers = headerRow.slice(0, width);
  if (headers.length === 0) throw new XlsxImportError("Every spreadsheet column needs a header.");
  if (!headers.every(Boolean)) throw new XlsxImportError("Every spreadsheet column needs a header.");
  if (headers.some((header) => header.length > 120)) throw new XlsxImportError("Spreadsheet column headers must be 120 characters or shorter.");
  const normalized = headers.map((header) => header.toLocaleLowerCase());
  if (new Set(normalized).size !== normalized.length) throw new XlsxImportError("Spreadsheet column headers must be unique.");

  const dataRows = meaningful.slice(1);
  if (dataRows.length > maximumImportRows) throw new XlsxImportError(`Spreadsheets can contain at most ${maximumImportRows.toLocaleString()} rows.`);

  const rows = dataRows.map((row) => {
    const dense = toDense(row);
    // Null-prototype: a header literally named "__proto__" must become an own property, never mutate
    // Object.prototype. This is the defect class behind the SheetJS prototype-pollution advisory.
    const record = Object.create(null) as Record<string, string>;
    headers.forEach((header, index) => {
      record[header] = dense[index] ?? "";
    });
    return { ...record };
  });

  return { headers, rows };
}
