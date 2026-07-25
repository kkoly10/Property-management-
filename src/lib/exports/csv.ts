export type CsvValue = string | number | boolean | null | undefined;

const formulaPrefix = /^[\s]*[=+\-@]/;

export function csvCell(value: CsvValue) {
  const raw = String(value ?? "");
  const safe = formulaPrefix.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function createCsv(headers: readonly string[], rows: readonly (readonly CsvValue[])[]) {
  const body = [
    headers.map(csvCell).join(","),
    ...rows.map((row) => row.map(csvCell).join(",")),
  ].join("\r\n");

  return `\uFEFF${body}\r\n`;
}
