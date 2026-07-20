export const maximumImportRows = 10_000;
export const maximumImportColumns = 100;

export class CsvImportError extends Error {}

export function parseCsv(source: string): { headers: string[]; rows: Array<Record<string, string>> } {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      record.push(field);
      field = "";
    } else if (character === "\n") {
      record.push(field.replace(/\r$/, ""));
      records.push(record);
      record = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) throw new CsvImportError("The CSV contains an unclosed quoted field.");
  if (field.length || record.length) {
    record.push(field.replace(/\r$/, ""));
    records.push(record);
  }

  const meaningful = records.filter((candidate) => candidate.some((value) => value.trim().length));
  if (meaningful.length < 2) throw new CsvImportError("The CSV needs a header and at least one data row.");
  const headers = meaningful[0].map((header, index) => (index === 0 ? header.replace(/^\uFEFF/, "") : header).trim());
  if (!headers.every(Boolean)) throw new CsvImportError("Every CSV column needs a header.");
  if (headers.some((header) => header.length > 120)) throw new CsvImportError("CSV column headers must be 120 characters or shorter.");
  if (headers.length > maximumImportColumns) throw new CsvImportError(`CSV files can contain at most ${maximumImportColumns} columns.`);
  const normalizedHeaders = headers.map((header) => header.toLocaleLowerCase());
  if (new Set(normalizedHeaders).size !== normalizedHeaders.length) throw new CsvImportError("CSV column headers must be unique.");

  const sourceRows = meaningful.slice(1);
  if (sourceRows.length > maximumImportRows) throw new CsvImportError(`CSV files can contain at most ${maximumImportRows.toLocaleString()} rows.`);
  const rows = sourceRows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""])));
  return { headers, rows };
}

const columnAliases: Record<string, string[]> = {
  propertyName: ["property name", "property", "name"],
  propertyType: ["property type", "type"],
  addressLine1: ["address line 1", "address", "street address"],
  addressLine2: ["address line 2", "address 2", "suite"],
  locality: ["city", "locality"],
  subdivisionCode: ["state", "province", "subdivision", "state/province"],
  postalCode: ["postal code", "zip", "zip code"],
  countryCode: ["country code", "country"],
  timeZone: ["time zone", "timezone"],
  unitCode: ["unit code", "unit", "unit number"],
  unitType: ["unit type"],
  bedrooms: ["bedrooms", "beds"],
  bathrooms: ["bathrooms", "baths"],
  squareFeet: ["square feet", "sq ft", "sqft"],
};

export function autoMapImportColumns(headers: string[]) {
  const byNormalizedHeader = new Map(headers.map((header) => [header.trim().toLocaleLowerCase(), header]));
  return Object.fromEntries(Object.entries(columnAliases).flatMap(([canonical, aliases]) => {
    const match = aliases.map((alias) => byNormalizedHeader.get(alias)).find(Boolean);
    return match ? [[canonical, match]] : [];
  }));
}
