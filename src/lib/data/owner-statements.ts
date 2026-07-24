import "server-only";

import { getPublicSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { DataMode } from "@/lib/data/maintenance";

export type OwnerStatementSummary = {
  statementSnapshotId: string;
  statementSeriesId: string;
  versionNumber: number;
  ownerEntityId: string;
  ownerName: string;
  propertyId: string;
  propertyName: string;
  periodStart: string;
  periodEnd: string;
  currencyCode: string;
  incomeMinor: number;
  expenseMinor: number;
  managementFeeMinor: number;
  netOwnerPositionMinor: number;
  finalizedAt: string;
  sha256Hex: string;
};

export type OperatorOwnerStatementContext = {
  organizationId: string;
  ownerEntityId: string;
  ownerName: string;
  propertyId: string;
  propertyName: string;
  accountingBookId: string;
  currencyCode: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  latestStatement: {
    statementSnapshotId: string;
    periodStart: string;
    periodEnd: string;
    versionNumber: number;
    netOwnerPositionMinor: number;
    finalizedAt: string;
  } | null;
};

export type OwnerStatementLine = {
  accountCode: string;
  accountName: string;
  category: "income" | "expense" | "management_fee";
  amountMinor: number;
  transactionCount: number;
};

export type OwnerStatementDetail = {
  statementSnapshotId: string;
  statementSeriesId: string;
  versionNumber: number;
  supersedesSnapshotId: string | null;
  correctionReason: string | null;
  finalizedAt: string;
  sha256Hex: string;
  snapshot: {
    ownerName: string;
    propertyName: string;
    periodStart: string;
    periodEnd: string;
    currencyCode: string;
    incomeMinor: number;
    expenseMinor: number;
    managementFeeMinor: number;
    netOwnerPositionMinor: number;
    sourceEntryCount: number;
    sourceTransactionCount: number;
    lines: OwnerStatementLine[];
  };
};

const previewSummary: OwnerStatementSummary = {
  statementSnapshotId: "e0000000-0000-4000-8000-000000000001",
  statementSeriesId: "e1000000-0000-4000-8000-000000000001",
  versionNumber: 1,
  ownerEntityId: "d1000000-0000-4000-8000-000000000001",
  ownerName: "Maple Court Holdings",
  propertyId: "e2000000-0000-4000-8000-000000000001",
  propertyName: "Maple Court",
  periodStart: "2026-06-01",
  periodEnd: "2026-06-30",
  currencyCode: "USD",
  incomeMinor: 925000,
  expenseMinor: 126500,
  managementFeeMinor: 74000,
  netOwnerPositionMinor: 724500,
  finalizedAt: "2026-07-05T15:30:00Z",
  sha256Hex: "a".repeat(64),
};

const previewContext: OperatorOwnerStatementContext = {
  organizationId: "d0000000-0000-4000-8000-000000000001",
  ownerEntityId: previewSummary.ownerEntityId,
  ownerName: previewSummary.ownerName,
  propertyId: previewSummary.propertyId,
  propertyName: previewSummary.propertyName,
  accountingBookId: "d2000000-0000-4000-8000-000000000001",
  currencyCode: "USD",
  effectiveFrom: "2026-01-01",
  effectiveTo: null,
  latestStatement: {
    statementSnapshotId: previewSummary.statementSnapshotId,
    periodStart: previewSummary.periodStart,
    periodEnd: previewSummary.periodEnd,
    versionNumber: previewSummary.versionNumber,
    netOwnerPositionMinor: previewSummary.netOwnerPositionMinor,
    finalizedAt: previewSummary.finalizedAt,
  },
};

const previewDetail: OwnerStatementDetail = {
  statementSnapshotId: previewSummary.statementSnapshotId,
  statementSeriesId: previewSummary.statementSeriesId,
  versionNumber: 1,
  supersedesSnapshotId: null,
  correctionReason: null,
  finalizedAt: previewSummary.finalizedAt,
  sha256Hex: previewSummary.sha256Hex,
  snapshot: {
    ownerName: previewSummary.ownerName,
    propertyName: previewSummary.propertyName,
    periodStart: previewSummary.periodStart,
    periodEnd: previewSummary.periodEnd,
    currencyCode: previewSummary.currencyCode,
    incomeMinor: previewSummary.incomeMinor,
    expenseMinor: previewSummary.expenseMinor,
    managementFeeMinor: previewSummary.managementFeeMinor,
    netOwnerPositionMinor: previewSummary.netOwnerPositionMinor,
    sourceEntryCount: 14,
    sourceTransactionCount: 9,
    lines: [
      { accountCode: "4000", accountName: "Rental income", category: "income", amountMinor: 925000, transactionCount: 5 },
      { accountCode: "4100", accountName: "Management fee income", category: "management_fee", amountMinor: 74000, transactionCount: 1 },
      { accountCode: "5000", accountName: "Maintenance expense", category: "expense", amountMinor: 126500, transactionCount: 3 },
    ],
  },
};

const stringValue = (value: unknown) => String(value ?? "");
const nullableString = (value: unknown) => value ? String(value) : null;

function normalizeSummary(raw: unknown): OwnerStatementSummary {
  const item = raw as Record<string, unknown>;
  return {
    statementSnapshotId: stringValue(item.statementSnapshotId),
    statementSeriesId: stringValue(item.statementSeriesId),
    versionNumber: Number(item.versionNumber),
    ownerEntityId: stringValue(item.ownerEntityId),
    ownerName: stringValue(item.ownerName),
    propertyId: stringValue(item.propertyId),
    propertyName: stringValue(item.propertyName),
    periodStart: stringValue(item.periodStart),
    periodEnd: stringValue(item.periodEnd),
    currencyCode: stringValue(item.currencyCode),
    incomeMinor: Number(item.incomeMinor),
    expenseMinor: Number(item.expenseMinor),
    managementFeeMinor: Number(item.managementFeeMinor),
    netOwnerPositionMinor: Number(item.netOwnerPositionMinor),
    finalizedAt: stringValue(item.finalizedAt),
    sha256Hex: stringValue(item.sha256Hex),
  };
}

function normalizeContext(raw: unknown): OperatorOwnerStatementContext {
  const item = raw as Record<string, unknown>;
  const latest = item.latestStatement as Record<string, unknown> | null;
  return {
    organizationId: stringValue(item.organizationId),
    ownerEntityId: stringValue(item.ownerEntityId),
    ownerName: stringValue(item.ownerName),
    propertyId: stringValue(item.propertyId),
    propertyName: stringValue(item.propertyName),
    accountingBookId: stringValue(item.accountingBookId),
    currencyCode: stringValue(item.currencyCode),
    effectiveFrom: stringValue(item.effectiveFrom),
    effectiveTo: nullableString(item.effectiveTo),
    latestStatement: latest ? {
      statementSnapshotId: stringValue(latest.statementSnapshotId),
      periodStart: stringValue(latest.periodStart),
      periodEnd: stringValue(latest.periodEnd),
      versionNumber: Number(latest.versionNumber),
      netOwnerPositionMinor: Number(latest.netOwnerPositionMinor),
      finalizedAt: stringValue(latest.finalizedAt),
    } : null,
  };
}

function normalizeDetail(raw: unknown): OwnerStatementDetail {
  const item = raw as Record<string, unknown>;
  const snapshot = item.snapshot as Record<string, unknown>;
  const lines = Array.isArray(snapshot.lines) ? snapshot.lines : [];
  return {
    statementSnapshotId: stringValue(item.statementSnapshotId),
    statementSeriesId: stringValue(item.statementSeriesId),
    versionNumber: Number(item.versionNumber),
    supersedesSnapshotId: nullableString(item.supersedesSnapshotId),
    correctionReason: nullableString(item.correctionReason),
    finalizedAt: stringValue(item.finalizedAt),
    sha256Hex: stringValue(item.sha256Hex),
    snapshot: {
      ownerName: stringValue(snapshot.ownerName),
      propertyName: stringValue(snapshot.propertyName),
      periodStart: stringValue(snapshot.periodStart),
      periodEnd: stringValue(snapshot.periodEnd),
      currencyCode: stringValue(snapshot.currencyCode),
      incomeMinor: Number(snapshot.incomeMinor),
      expenseMinor: Number(snapshot.expenseMinor),
      managementFeeMinor: Number(snapshot.managementFeeMinor),
      netOwnerPositionMinor: Number(snapshot.netOwnerPositionMinor),
      sourceEntryCount: Number(snapshot.sourceEntryCount),
      sourceTransactionCount: Number(snapshot.sourceTransactionCount),
      lines: lines.map((line) => {
        const value = line as Record<string, unknown>;
        return {
          accountCode: stringValue(value.accountCode),
          accountName: stringValue(value.accountName),
          category: stringValue(value.category) as OwnerStatementLine["category"],
          amountMinor: Number(value.amountMinor),
          transactionCount: Number(value.transactionCount),
        };
      }),
    },
  };
}

export async function getOwnerStatementWorkspace(): Promise<{ mode: DataMode; items: OwnerStatementSummary[]; requestId?: string }> {
  if (!getPublicSupabaseConfig()) return { mode: "setup", items: [previewSummary] };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_owner_statement_workspace");
    if (error || !data) throw error ?? new Error("Owner statements are unavailable.");
    const items = (data as Record<string, unknown>).items;
    return { mode: "ready", items: Array.isArray(items) ? items.map(normalizeSummary) : [] };
  } catch {
    return { mode: "error", items: [], requestId: crypto.randomUUID() };
  }
}

export async function getOperatorOwnerStatementWorkspace(): Promise<{ mode: DataMode; owners: OperatorOwnerStatementContext[]; requestId?: string }> {
  if (!getPublicSupabaseConfig()) return { mode: "setup", owners: [previewContext] };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_operator_owner_statement_workspace");
    if (error || !data) throw error ?? new Error("Owner statement preparation is unavailable.");
    const owners = (data as Record<string, unknown>).owners;
    return { mode: "ready", owners: Array.isArray(owners) ? owners.map(normalizeContext) : [] };
  } catch {
    return { mode: "error", owners: [], requestId: crypto.randomUUID() };
  }
}

export async function getOwnerStatementDetail(statementSnapshotId: string): Promise<{ mode: DataMode; item?: OwnerStatementDetail; requestId?: string }> {
  if (!getPublicSupabaseConfig()) return { mode: "setup", item: previewDetail };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_owner_statement_detail", {
      p_statement_snapshot_id: statementSnapshotId,
    });
    if (error || !data) throw error ?? new Error("Owner statement detail is unavailable.");
    return { mode: "ready", item: normalizeDetail(data) };
  } catch {
    return { mode: "error", requestId: crypto.randomUUID() };
  }
}
