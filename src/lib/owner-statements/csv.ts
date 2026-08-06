import type { OwnerStatementDetail } from "@/lib/data/owner-statements";

const CATEGORY_LABEL: Record<string, string> = { income: "Income", expense: "Expense", management_fee: "Management fee" };

// RFC 4180 escaping: quote a field that contains a comma, quote, CR, or LF; double internal quotes.
const esc = (value: string): string => /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
// User-controlled text also gets spreadsheet formula-injection neutralization (OWASP): a leading
// =, +, -, @, tab, or CR is prefixed with an apostrophe so a spreadsheet treats it as text, not a formula.
const txt = (value: string): string => esc(/^[=+\-@\t\r]/.test(value) ? `'${value}` : value);
// Amounts are numeric (minor -> major, 2dp for every supported currency); safe without the formula guard.
const amount = (minor: number): string => esc((minor / 100).toFixed(2));

/** Serialize a finalized owner statement to a self-describing CSV. Pure and dependency-free. */
export function ownerStatementToCsv(detail: OwnerStatementDetail): string {
  const s = detail.snapshot;
  const rows: string[] = [];
  const amountHeader = `Amount (${s.currencyCode})`;

  rows.push([txt("Owner statement")].join(","));
  rows.push([txt("Owner"), txt(s.ownerName)].join(","));
  rows.push([txt("Property"), txt(s.propertyName)].join(","));
  rows.push([txt("Period start"), txt(s.periodStart)].join(","));
  rows.push([txt("Period end"), txt(s.periodEnd)].join(","));
  rows.push([txt("Currency"), txt(s.currencyCode)].join(","));
  rows.push([txt("Version"), String(detail.versionNumber)].join(","));
  rows.push([txt("Finalized at"), txt(detail.finalizedAt)].join(","));
  rows.push([txt("Integrity SHA-256"), txt(detail.sha256Hex)].join(","));

  rows.push("");
  rows.push([txt("Account code"), txt("Account name"), txt("Category"), esc(amountHeader), txt("Transactions")].join(","));
  for (const line of s.lines) {
    rows.push([txt(line.accountCode), txt(line.accountName), txt(CATEGORY_LABEL[line.category] ?? line.category), amount(line.amountMinor), String(line.transactionCount)].join(","));
  }

  rows.push("");
  rows.push([txt("Total income"), amount(s.incomeMinor)].join(","));
  rows.push([txt("Total expenses"), amount(s.expenseMinor)].join(","));
  rows.push([txt("Total management fees"), amount(s.managementFeeMinor)].join(","));
  rows.push([txt("Net owner position"), amount(s.netOwnerPositionMinor)].join(","));
  rows.push([txt("Current owner payable"), amount(detail.ownerPayableMinor)].join(","));

  if (detail.remittances.length) {
    rows.push("");
    rows.push([txt("Remittance"), txt("Paid on"), esc(amountHeader), txt("External reference")].join(","));
    for (const remittance of detail.remittances) {
      rows.push([txt(remittance.publicReference), txt(remittance.paidOn), amount(remittance.amountMinor), txt(remittance.externalReference ?? "")].join(","));
    }
  }

  // Trailing CRLF per RFC 4180.
  return rows.join("\r\n") + "\r\n";
}

/** Safe, descriptive download filename for a statement's CSV. */
export function ownerStatementCsvFilename(detail: OwnerStatementDetail): string {
  const slug = (value: string) => value.normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "statement";
  return `owner-statement-${slug(detail.snapshot.propertyName)}-${detail.snapshot.periodStart}-to-${detail.snapshot.periodEnd}-v${detail.versionNumber}.csv`;
}
