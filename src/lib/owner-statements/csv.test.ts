import { describe, expect, it } from "vitest";
import type { OwnerStatementDetail } from "@/lib/data/owner-statements";
import { ownerStatementCsvFilename, ownerStatementToCsv } from "./csv";

const baseDetail: OwnerStatementDetail = {
  statementSnapshotId: "e0000000-0000-4000-8000-000000000001",
  statementSeriesId: "e1000000-0000-4000-8000-000000000001",
  versionNumber: 2,
  supersedesSnapshotId: null,
  correctionReason: null,
  finalizedAt: "2026-07-05T15:30:00Z",
  sha256Hex: "a".repeat(64),
  ownerPayableMinor: 474500,
  remittances: [],
  snapshot: {
    ownerName: "Maple Court Holdings",
    propertyName: "Maple Court",
    periodStart: "2026-06-01",
    periodEnd: "2026-06-30",
    currencyCode: "USD",
    incomeMinor: 925000,
    expenseMinor: 126500,
    managementFeeMinor: 74000,
    netOwnerPositionMinor: 724500,
    sourceEntryCount: 12,
    sourceTransactionCount: 8,
    lines: [
      { accountCode: "4000", accountName: "Rental income", category: "income", amountMinor: 925000, transactionCount: 3 },
      { accountCode: "6200", accountName: "Repairs and maintenance", category: "expense", amountMinor: 126500, transactionCount: 2 },
    ],
  },
};

describe("ownerStatementToCsv", () => {
  it("emits metadata, line items with major-unit amounts, totals, and CRLF rows", () => {
    const csv = ownerStatementToCsv(baseDetail);
    const rows = csv.split("\r\n");
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(rows).toContain("Owner,Maple Court Holdings");
    expect(rows).toContain("Property,Maple Court");
    expect(rows).toContain("Account code,Account name,Category,Amount (USD),Transactions");
    expect(rows).toContain("4000,Rental income,Income,9250.00,3");
    expect(rows).toContain("6200,Repairs and maintenance,Expense,1265.00,2");
    expect(rows).toContain("Total income,9250.00");
    expect(rows).toContain("Net owner position,7245.00");
    expect(rows).toContain("Current owner payable,4745.00");
  });

  it("omits the remittances section when there are none and includes it when present", () => {
    expect(ownerStatementToCsv(baseDetail)).not.toContain("Remittance,Paid on");
    const withRemittance = ownerStatementToCsv({
      ...baseDetail,
      remittances: [{
        remittanceId: "e4000000-0000-4000-8000-000000000001", publicReference: "OWN-REMIT-01", statementSnapshotId: baseDetail.statementSnapshotId,
        amountMinor: 250000, currencyCode: "USD", paidOn: "2026-07-02", externalReference: "ACH-9931", recordedAt: "2026-07-02T10:00:00Z", evidenceDocumentId: "e4000000-0000-4000-8000-0000000000ff",
      }],
    });
    expect(withRemittance).toContain("Remittance,Paid on,Amount (USD),External reference");
    expect(withRemittance).toContain("OWN-REMIT-01,2026-07-02,2500.00,ACH-9931");
  });

  it("escapes commas/quotes and neutralizes spreadsheet formula injection in owner-controlled text", () => {
    const csv = ownerStatementToCsv({
      ...baseDetail,
      snapshot: {
        ...baseDetail.snapshot,
        ownerName: '=SUM(A1:A2),Evil "Corp"',
        lines: [{ accountCode: "4000", accountName: "Rent, prorated", category: "income", amountMinor: 100000, transactionCount: 1 }],
      },
    });
    // Leading '=' is prefixed with an apostrophe, and the comma/quotes force RFC-4180 quoting with doubled quotes.
    expect(csv).toContain('Owner,"\'=SUM(A1:A2),Evil ""Corp"""');
    // A comma inside an account name is quoted.
    expect(csv).toContain('4000,"Rent, prorated",Income,1000.00,1');
  });
});

describe("ownerStatementCsvFilename", () => {
  it("builds a safe, descriptive filename", () => {
    expect(ownerStatementCsvFilename(baseDetail)).toBe("owner-statement-maple-court-2026-06-01-to-2026-06-30-v2.csv");
  });

  it("falls back to 'statement' when the property name has no usable characters", () => {
    expect(ownerStatementCsvFilename({ ...baseDetail, snapshot: { ...baseDetail.snapshot, propertyName: "***" } })).toBe("owner-statement-statement-2026-06-01-to-2026-06-30-v2.csv");
  });
});
