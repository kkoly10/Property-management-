import "server-only";

import { getPublicSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type CurrencyCode = "USD" | "CAD" | "MXN";
export type ReceivableSummaryItem = {
  tenancyId: string; propertyName: string; unitCode: string; currencyCode: CurrencyCode;
  balanceMinor: number; nextDueDate: string | null; nextDueAmountMinor: number | null; nextDueStatus: string | null;
};
export type PaymentSummaryItem = {
  paymentId: string; publicReference: string; propertyName: string; unitCode: string; householdName?: string;
  source: string; amountMinor: number; currencyCode: CurrencyCode; status: string; reconciliationStatus?: string;
  receivedAt: string; allocatedMinor?: number; externalReference?: string | null; receiptDocumentId: string;
};
export type ManualPaymentCharge = { chargeId: string; description: string; dueDate: string; amountMinor: number; allocatedMinor: number; remainingMinor: number };
export type ManualPaymentOption = {
  organizationId: string; tenancyId: string; propertyName: string; unitCode: string; householdName: string; currencyCode: CurrencyCode;
  evidenceThresholdMinor: number; charges: ManualPaymentCharge[]; evidenceDocuments: { documentId: string; title: string }[];
};
export type PaymentReceipt = PaymentSummaryItem & {
  documentId: string; organizationName: string; householdName: string; reason: string; generatedAt: string;
  allocations: { chargeId: string; description: string; dueDate: string; amountMinor: number }[];
};
type DataMode = "setup" | "ready" | "error";

const isCurrency = (value: unknown): value is CurrencyCode => value === "USD" || value === "CAD" || value === "MXN";
const objects = (value: unknown, key: string) => Array.isArray((value as Record<string, unknown> | null)?.[key]) ? (value as Record<string, unknown[]>)[key] : [];

function normalizeReceivables(data: unknown): ReceivableSummaryItem[] {
  return objects(data, "items").flatMap((raw) => {
    const item = raw as Record<string, unknown>;
    if (!isCurrency(item.currencyCode)) return [];
    return [{ tenancyId: String(item.tenancyId), propertyName: String(item.propertyName), unitCode: String(item.unitCode), currencyCode: item.currencyCode,
      balanceMinor: Number(item.balanceMinor), nextDueDate: item.nextDueDate ? String(item.nextDueDate) : null,
      nextDueAmountMinor: item.nextDueAmountMinor == null ? null : Number(item.nextDueAmountMinor), nextDueStatus: item.nextDueStatus ? String(item.nextDueStatus) : null }];
  });
}

function normalizePayments(data: unknown): PaymentSummaryItem[] {
  return objects(data, "items").flatMap((raw) => {
    const item = raw as Record<string, unknown>;
    if (!isCurrency(item.currencyCode)) return [];
    return [{ paymentId: String(item.paymentId), publicReference: String(item.publicReference), propertyName: String(item.propertyName), unitCode: String(item.unitCode),
      householdName: item.householdName ? String(item.householdName) : undefined, source: String(item.source), amountMinor: Number(item.amountMinor), currencyCode: item.currencyCode,
      status: String(item.status), reconciliationStatus: item.reconciliationStatus ? String(item.reconciliationStatus) : undefined, receivedAt: String(item.receivedAt),
      allocatedMinor: item.allocatedMinor == null ? undefined : Number(item.allocatedMinor), externalReference: item.externalReference ? String(item.externalReference) : null,
      receiptDocumentId: String(item.receiptDocumentId) }];
  });
}

function normalizeOptions(data: unknown): ManualPaymentOption[] {
  return objects(data, "tenancies").flatMap((raw) => {
    const item = raw as Record<string, unknown>;
    if (!isCurrency(item.currencyCode)) return [];
    return [{ organizationId: String(item.organizationId), tenancyId: String(item.tenancyId), propertyName: String(item.propertyName), unitCode: String(item.unitCode),
      householdName: String(item.householdName), currencyCode: item.currencyCode, evidenceThresholdMinor: Number(item.evidenceThresholdMinor),
      charges: objects(item, "charges").map((charge) => { const value = charge as Record<string, unknown>; return { chargeId: String(value.chargeId), description: String(value.description), dueDate: String(value.dueDate), amountMinor: Number(value.amountMinor), allocatedMinor: Number(value.allocatedMinor), remainingMinor: Number(value.remainingMinor) }; }),
      evidenceDocuments: objects(item, "evidenceDocuments").map((document) => { const value = document as Record<string, unknown>; return { documentId: String(value.documentId), title: String(value.title) }; }) }];
  });
}

const previewReceivable: ReceivableSummaryItem = { tenancyId: "20000000-0000-4000-8000-000000000002", propertyName: "Maple Court", unitCode: "101", currencyCode: "USD", balanceMinor: 142500, nextDueDate: "2026-08-01", nextDueAmountMinor: 100000, nextDueStatus: "partially_paid" };
const previewPayment: PaymentSummaryItem = { paymentId: "50000000-0000-4000-8000-000000000005", publicReference: "PAY-8C4A2F7B91D0", propertyName: "Maple Court", unitCode: "101", householdName: "Morgan household", source: "check", amountMinor: 85000, currencyCode: "USD", status: "succeeded", reconciliationStatus: "unreconciled", receivedAt: "2026-07-20T15:45:00Z", allocatedMinor: 85000, externalReference: "CHECK-1042", receiptDocumentId: "60000000-0000-4000-8000-000000000006" };
const previewOption: ManualPaymentOption = { organizationId: "10000000-0000-4000-8000-000000000001", tenancyId: previewReceivable.tenancyId, propertyName: "Maple Court", unitCode: "101", householdName: "Morgan household", currencyCode: "USD", evidenceThresholdMinor: 0, charges: [{ chargeId: "40000000-0000-4000-8000-000000000004", description: "Monthly rent", dueDate: "2026-08-01", amountMinor: 185000, allocatedMinor: 85000, remainingMinor: 100000 }], evidenceDocuments: [{ documentId: "30000000-0000-4000-8000-000000000003", title: "Check 1042 scan" }] };

export async function getOperatorPaymentWorkspace(): Promise<{ mode: DataMode; items: ReceivableSummaryItem[]; payments: PaymentSummaryItem[]; options: ManualPaymentOption[]; requestId?: string }> {
  if (!getPublicSupabaseConfig()) return { mode: "setup", items: [previewReceivable], payments: [previewPayment], options: [previewOption] };
  try {
    const supabase = await createClient();
    const [balances, payments, options] = await Promise.all([supabase.rpc("get_operator_receivables_summary"), supabase.rpc("get_operator_payment_summary"), supabase.rpc("get_manual_payment_options")]);
    if (balances.error || payments.error || options.error) throw balances.error ?? payments.error ?? options.error;
    return { mode: "ready", items: normalizeReceivables(balances.data), payments: normalizePayments(payments.data), options: normalizeOptions(options.data) };
  } catch { return { mode: "error", items: [], payments: [], options: [], requestId: crypto.randomUUID() }; }
}

export async function getOperatorReceivables() {
  const workspace = await getOperatorPaymentWorkspace();
  return { mode: workspace.mode, items: workspace.items, requestId: workspace.requestId };
}

export async function getResidentBalance(): Promise<{ mode: DataMode; items: ReceivableSummaryItem[]; payments: PaymentSummaryItem[]; requestId?: string }> {
  if (!getPublicSupabaseConfig()) return { mode: "setup", items: [previewReceivable], payments: [previewPayment] };
  try {
    const supabase = await createClient();
    const [balances, payments] = await Promise.all([supabase.rpc("get_resident_balance_summary"), supabase.rpc("get_resident_payment_history")]);
    if (balances.error || payments.error) throw balances.error ?? payments.error;
    return { mode: "ready", items: normalizeReceivables(balances.data), payments: normalizePayments(payments.data) };
  } catch { return { mode: "error", items: [], payments: [], requestId: crypto.randomUUID() }; }
}

export async function getPaymentReceipt(documentId: string): Promise<{ mode: DataMode | "not_found"; receipt?: PaymentReceipt; requestId?: string }> {
  if (!getPublicSupabaseConfig()) {
    if (documentId !== previewPayment.receiptDocumentId) return { mode: "not_found" };
    return { mode: "setup", receipt: { ...previewPayment, documentId, organizationName: "Crecy Demo", householdName: "Morgan household", reason: "Check received at the office", generatedAt: previewPayment.receivedAt, allocations: [{ chargeId: previewOption.charges[0].chargeId, description: "Monthly rent", dueDate: "2026-08-01", amountMinor: 85000 }] } };
  }
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_payment_receipt", { p_document_id: documentId });
    if (error || !data) return { mode: "not_found" };
    const item = data as Record<string, unknown>;
    if (!isCurrency(item.currencyCode)) return { mode: "not_found" };
    return { mode: "ready", receipt: { paymentId: String(item.paymentId), documentId: String(item.documentId), publicReference: String(item.publicReference), organizationName: String(item.organizationName), propertyName: String(item.propertyName), unitCode: String(item.unitCode), householdName: String(item.householdName), source: String(item.source), amountMinor: Number(item.amountMinor), currencyCode: item.currencyCode, status: String(item.status), reconciliationStatus: String(item.reconciliationStatus), receivedAt: String(item.receivedAt), receiptDocumentId: String(item.documentId), reason: String(item.reason), generatedAt: String(item.generatedAt), externalReference: item.externalReference ? String(item.externalReference) : null, allocations: objects(item, "allocations").map((allocation) => { const value = allocation as Record<string, unknown>; return { chargeId: String(value.chargeId), description: String(value.description), dueDate: String(value.dueDate), amountMinor: Number(value.amountMinor) }; }) } };
  } catch { return { mode: "error", requestId: crypto.randomUUID() }; }
}
