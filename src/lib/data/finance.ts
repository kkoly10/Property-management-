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
  receivedAt: string | null; allocatedMinor?: number; externalReference?: string | null; receiptDocumentId: string | null;
};
export type SettlementSummaryItem = {
  settlementId: string; publicReference: string; providerStatus: string; reconciliationStatus: string;
  grossMinor: number; feeMinor: number; netMinor: number; currencyCode: CurrencyCode;
  expectedArrivalDate: string | null; receivedAt: string | null; itemCount: number; matchedCount: number;
};
export type ReconciliationExceptionItem = {
  exceptionId: string; settlementId: string; settlementReference: string; paymentId: string | null;
  paymentReference: string | null; exceptionType: string; status: string; expectedMinor: number | null;
  actualMinor: number | null; currencyCode: CurrencyCode; detail: string; detectedAt: string;
};
export type ManualPaymentCharge = { chargeId: string; description: string; dueDate: string; amountMinor: number; allocatedMinor: number; remainingMinor: number };
export type ManualPaymentOption = {
  organizationId: string; tenancyId: string; propertyName: string; unitCode: string; householdName: string; currencyCode: CurrencyCode;
  evidenceThresholdMinor: number; charges: ManualPaymentCharge[]; evidenceDocuments: { documentId: string; title: string }[];
};
export type ResidentPaymentSessionOption = {
  tenancyId: string; organizationId: string; organizationName: string; propertyName: string; unitCode: string; currencyCode: CurrencyCode;
  connectionStatus: string; availableMethods: ("card" | "bank")[];
  charges: { chargeId: string; description: string; dueDate: string; amountMinor: number; remainingMinor: number }[];
};
export type ResidentPaymentRetryContext = {
  paymentId: string; publicReference: string; tenancyId: string; amountMinor: number; currencyCode: CurrencyCode;
  method: "card" | "bank"; failureCode: string; failedAt: string;
  allocations: { chargeId: string; amountMinor: number }[];
};
export type PaymentAttemptItem = {
  attemptId: string; method: "card" | "bank" | "unknown"; providerStatus: string; failureCode: string | null;
  initiatedAt: string; expiresAt: string | null; confirmedAt: string | null; isCurrent: boolean;
};
export type PaymentReceipt = Omit<PaymentSummaryItem, "receivedAt" | "receiptDocumentId"> & {
  receivedAt: string; receiptDocumentId: string;
  documentId: string; organizationName: string; householdName: string; reason: string; generatedAt: string;
  allocations: { chargeId: string; description: string; dueDate: string; amountMinor: number }[];
};
export type PaymentDetail = PaymentSummaryItem & {
  organizationId: string; version: number; reason: string | null; journalTransactionId: string | null; canCorrect: boolean;
  canRefund: boolean; refundableMinor: number;
  allocations: { allocationId: string; chargeId: string; description: string; dueDate: string; amountMinor: number; allocatedAt: string; reversedAt: string | null; reversalReason: string | null }[];
  eligibleCharges: { chargeId: string; description: string; dueDate: string; amountMinor: number; availableMinor: number }[];
  refunds: { refundId: string; amountMinor: number; status: string; reason: string; requestedAt: string; completedAt: string | null;
    correctiveJournalTransactionId: string | null; failureCode: string | null }[];
  disputes: { disputeId: string; kind: string; amountMinor: number; currencyCode: CurrencyCode; reasonCode: string; status: string;
    evidenceDueAt: string | null; openedAt: string; closedAt: string | null; reversalJournalTransactionId: string | null;
    recoveryJournalTransactionId: string | null }[];
  settlements: SettlementSummaryItem[];
  attempts: PaymentAttemptItem[];
  corrections: { correctionId: string; correctionType: string; reason: string; paymentStatus: string; version: number; correctiveJournalTransactionId: string | null; correctedAt: string }[];
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
      status: String(item.status), reconciliationStatus: item.reconciliationStatus ? String(item.reconciliationStatus) : undefined, receivedAt: item.receivedAt ? String(item.receivedAt) : null,
      allocatedMinor: item.allocatedMinor == null ? undefined : Number(item.allocatedMinor), externalReference: item.externalReference ? String(item.externalReference) : null,
      receiptDocumentId: item.receiptDocumentId ? String(item.receiptDocumentId) : null }];
  });
}

function normalizeResidentPaymentOptions(data: unknown): ResidentPaymentSessionOption[] {
  return objects(data, "tenancies").flatMap((raw) => {
    const item = raw as Record<string, unknown>;
    if (!isCurrency(item.currencyCode)) return [];
    const methods = Array.isArray(item.availableMethods)
      ? item.availableMethods.filter((method): method is "card" | "bank" => method === "card" || method === "bank")
      : [];
    return [{
      tenancyId: String(item.tenancyId), organizationId: String(item.organizationId), organizationName: String(item.organizationName),
      propertyName: String(item.propertyName), unitCode: String(item.unitCode), currencyCode: item.currencyCode,
      connectionStatus: String(item.connectionStatus), availableMethods: methods,
      charges: objects(item, "charges").map((rawCharge) => { const charge = rawCharge as Record<string, unknown>; return {
        chargeId: String(charge.chargeId), description: String(charge.description), dueDate: String(charge.dueDate),
        amountMinor: Number(charge.amountMinor), remainingMinor: Number(charge.remainingMinor),
      }; }),
    }];
  });
}

function normalizeResidentPaymentRetry(data: unknown): ResidentPaymentRetryContext | null {
  const item = data as Record<string, unknown> | null;
  if (!item || !isCurrency(item.currencyCode) || (item.method !== "card" && item.method !== "bank")) return null;
  return {
    paymentId: String(item.paymentId), publicReference: String(item.publicReference), tenancyId: String(item.tenancyId),
    amountMinor: Number(item.amountMinor), currencyCode: item.currencyCode, method: item.method,
    failureCode: String(item.failureCode), failedAt: String(item.failedAt),
    allocations: objects(item, "allocations").map((raw) => { const value = raw as Record<string, unknown>; return {
      chargeId: String(value.chargeId), amountMinor: Number(value.amountMinor),
    }; }),
  };
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

function normalizePaymentDetail(data: unknown): PaymentDetail | null {
  const item = data as Record<string, unknown> | null;
  if (!item || !isCurrency(item.currencyCode)) return null;
  return {
    paymentId: String(item.paymentId), organizationId: String(item.organizationId), publicReference: String(item.publicReference),
    propertyName: String(item.propertyName), unitCode: String(item.unitCode), householdName: String(item.householdName),
    source: String(item.source), amountMinor: Number(item.amountMinor), currencyCode: item.currencyCode, status: String(item.status),
    version: Number(item.version), reconciliationStatus: String(item.reconciliationStatus), receivedAt: item.receivedAt ? String(item.receivedAt) : null,
    reason: item.reason ? String(item.reason) : null, externalReference: item.externalReference ? String(item.externalReference) : null,
    receiptDocumentId: item.receiptDocumentId ? String(item.receiptDocumentId) : null, journalTransactionId: item.journalTransactionId ? String(item.journalTransactionId) : null, canCorrect: Boolean(item.canCorrect),
    canRefund: false, refundableMinor: 0,
    allocations: objects(item, "allocations").map((raw) => { const value = raw as Record<string, unknown>; return {
      allocationId: String(value.allocationId), chargeId: String(value.chargeId), description: String(value.description), dueDate: String(value.dueDate),
      amountMinor: Number(value.amountMinor), allocatedAt: String(value.allocatedAt), reversedAt: value.reversedAt ? String(value.reversedAt) : null,
      reversalReason: value.reversalReason ? String(value.reversalReason) : null,
    }; }),
    eligibleCharges: objects(item, "eligibleCharges").map((raw) => { const value = raw as Record<string, unknown>; return {
      chargeId: String(value.chargeId), description: String(value.description), dueDate: String(value.dueDate), amountMinor: Number(value.amountMinor), availableMinor: Number(value.availableMinor),
    }; }),
    refunds: objects(item, "refunds").map((raw) => { const value = raw as Record<string, unknown>; return {
      refundId: String(value.refundId), amountMinor: Number(value.amountMinor), status: String(value.status), reason: String(value.reason),
      requestedAt: String(value.requestedAt), completedAt: value.completedAt ? String(value.completedAt) : null,
      correctiveJournalTransactionId: value.correctiveJournalTransactionId ? String(value.correctiveJournalTransactionId) : null,
      failureCode: value.failureCode ? String(value.failureCode) : null,
    }; }),
    disputes: [], settlements: [], attempts: [],
    corrections: objects(item, "corrections").map((raw) => { const value = raw as Record<string, unknown>; return {
      correctionId: String(value.correctionId), correctionType: String(value.correctionType), reason: String(value.reason), paymentStatus: String(value.paymentStatus),
      version: Number(value.version), correctiveJournalTransactionId: value.correctiveJournalTransactionId ? String(value.correctiveJournalTransactionId) : null,
      correctedAt: String(value.correctedAt),
    }; }),
  };
}

function normalizeSettlementWorkspace(data: unknown) {
  const batches = objects(data, "batches").flatMap((raw) => {
    const item = raw as Record<string, unknown>;
    if (!isCurrency(item.currencyCode)) return [];
    return [{
      settlementId: String(item.settlementId), publicReference: String(item.publicReference), providerStatus: String(item.providerStatus),
      reconciliationStatus: String(item.reconciliationStatus), grossMinor: Number(item.grossMinor), feeMinor: Number(item.feeMinor),
      netMinor: Number(item.netMinor), currencyCode: item.currencyCode, expectedArrivalDate: item.expectedArrivalDate ? String(item.expectedArrivalDate) : null,
      receivedAt: item.receivedAt ? String(item.receivedAt) : null, itemCount: Number(item.itemCount ?? 1), matchedCount: Number(item.matchedCount ?? 1),
    } satisfies SettlementSummaryItem];
  });
  const exceptions = objects(data, "exceptions").flatMap((raw) => {
    const item = raw as Record<string, unknown>;
    if (!isCurrency(item.currencyCode)) return [];
    return [{
      exceptionId: String(item.exceptionId), settlementId: String(item.settlementId), settlementReference: String(item.settlementReference),
      paymentId: item.paymentId ? String(item.paymentId) : null, paymentReference: item.paymentReference ? String(item.paymentReference) : null,
      exceptionType: String(item.exceptionType), status: String(item.status), expectedMinor: item.expectedMinor == null ? null : Number(item.expectedMinor),
      actualMinor: item.actualMinor == null ? null : Number(item.actualMinor), currencyCode: item.currencyCode,
      detail: String(item.detail), detectedAt: String(item.detectedAt),
    } satisfies ReconciliationExceptionItem];
  });
  return { batches, exceptions };
}

const previewReceivable: ReceivableSummaryItem = { tenancyId: "20000000-0000-4000-8000-000000000002", propertyName: "Maple Court", unitCode: "101", currencyCode: "USD", balanceMinor: 142500, nextDueDate: "2026-08-01", nextDueAmountMinor: 100000, nextDueStatus: "partially_paid" };
const previewPayment: PaymentSummaryItem = { paymentId: "50000000-0000-4000-8000-000000000005", publicReference: "PAY-8C4A2F7B91D0", propertyName: "Maple Court", unitCode: "101", householdName: "Morgan household", source: "check", amountMinor: 85000, currencyCode: "USD", status: "succeeded", reconciliationStatus: "unreconciled", receivedAt: "2026-07-20T15:45:00Z", allocatedMinor: 85000, externalReference: "CHECK-1042", receiptDocumentId: "60000000-0000-4000-8000-000000000006" };
const previewFailedPayment: PaymentSummaryItem = { paymentId: "51000000-0000-4000-8000-000000000015", publicReference: "PAY-FAILED91D0", propertyName: "Maple Court", unitCode: "101", householdName: "Morgan household", source: "provider", amountMinor: 50000, currencyCode: "USD", status: "failed", reconciliationStatus: "unreconciled", receivedAt: null, allocatedMinor: 0, externalReference: null, receiptDocumentId: null };
const previewOption: ManualPaymentOption = { organizationId: "10000000-0000-4000-8000-000000000001", tenancyId: previewReceivable.tenancyId, propertyName: "Maple Court", unitCode: "101", householdName: "Morgan household", currencyCode: "USD", evidenceThresholdMinor: 0, charges: [{ chargeId: "40000000-0000-4000-8000-000000000004", description: "Monthly rent", dueDate: "2026-08-01", amountMinor: 185000, allocatedMinor: 85000, remainingMinor: 100000 }], evidenceDocuments: [{ documentId: "30000000-0000-4000-8000-000000000003", title: "Check 1042 scan" }] };
const previewResidentPaymentOption: ResidentPaymentSessionOption = { organizationId: previewOption.organizationId, tenancyId: previewOption.tenancyId, organizationName: "Crecy Demo", propertyName: previewOption.propertyName, unitCode: previewOption.unitCode, currencyCode: previewOption.currencyCode, connectionStatus: "enabled", availableMethods: ["card", "bank"], charges: previewOption.charges.map((charge) => ({ chargeId: charge.chargeId, description: charge.description, dueDate: charge.dueDate, amountMinor: charge.amountMinor, remainingMinor: charge.remainingMinor })) };
const previewPaymentDetail: PaymentDetail = { ...previewPayment, organizationId: previewOption.organizationId, version: 1, reason: "Check received at the office", journalTransactionId: "70000000-0000-4000-8000-000000000007", canCorrect: true, canRefund: false, refundableMinor: 0,
  allocations: [{ allocationId: "80000000-0000-4000-8000-000000000008", chargeId: previewOption.charges[0].chargeId, description: "Monthly rent", dueDate: "2026-08-01", amountMinor: 85000, allocatedAt: previewPayment.receivedAt!, reversedAt: null, reversalReason: null }],
  eligibleCharges: [{ chargeId: previewOption.charges[0].chargeId, description: "Monthly rent", dueDate: "2026-08-01", amountMinor: 185000, availableMinor: 185000 }], refunds: [], disputes: [], settlements: [], attempts: [], corrections: [] };
const previewFailedPaymentDetail: PaymentDetail = { ...previewFailedPayment, organizationId: previewOption.organizationId, version: 1, reason: null, journalTransactionId: null, canCorrect: false, canRefund: false, refundableMinor: 0, allocations: [], eligibleCharges: previewPaymentDetail.eligibleCharges, refunds: [], disputes: [], settlements: [], corrections: [], attempts: [{ attemptId: "52000000-0000-4000-8000-000000000016", method: "card", providerStatus: "expired", failureCode: "checkout_session_expired", initiatedAt: "2026-07-21T15:45:00Z", expiresAt: "2026-07-21T16:15:00Z", confirmedAt: null, isCurrent: true }] };
const previewRetryContext: ResidentPaymentRetryContext = { paymentId: previewFailedPayment.paymentId, publicReference: previewFailedPayment.publicReference, tenancyId: previewOption.tenancyId, amountMinor: previewFailedPayment.amountMinor, currencyCode: previewFailedPayment.currencyCode, method: "card", failureCode: "checkout_session_expired", failedAt: "2026-07-21T16:15:00Z", allocations: [{ chargeId: previewOption.charges[0].chargeId, amountMinor: previewFailedPayment.amountMinor }] };
const previewSettlement: SettlementSummaryItem = { settlementId: "90000000-0000-4000-8000-000000000009", publicReference: "SET-3F7A91C224BE", providerStatus: "paid", reconciliationStatus: "reconciled", grossMinor: 185000, feeMinor: 5665, netMinor: 179335, currencyCode: "USD", expectedArrivalDate: "2026-07-23", receivedAt: "2026-07-23T14:00:00Z", itemCount: 1, matchedCount: 1 };
const previewException: ReconciliationExceptionItem = { exceptionId: "91000000-0000-4000-8000-000000000010", settlementId: "92000000-0000-4000-8000-000000000011", settlementReference: "SET-5DB42C991F10", paymentId: null, paymentReference: null, exceptionType: "amount_mismatch", status: "open", expectedMinor: 179335, actualMinor: 178835, currencyCode: "USD", detail: "The payout amount does not equal the net of its imported provider balance transactions.", detectedAt: "2026-07-24T14:00:00Z" };

export async function getOperatorPaymentWorkspace(): Promise<{ mode: DataMode; items: ReceivableSummaryItem[]; payments: PaymentSummaryItem[]; options: ManualPaymentOption[]; settlements: SettlementSummaryItem[]; exceptions: ReconciliationExceptionItem[]; requestId?: string }> {
  if (!getPublicSupabaseConfig()) return { mode: "setup", items: [previewReceivable], payments: [previewPayment, previewFailedPayment], options: [previewOption], settlements: [previewSettlement], exceptions: [previewException] };
  try {
    const supabase = await createClient();
    const [balances, payments, options, reconciliation] = await Promise.all([supabase.rpc("get_operator_receivables_summary"), supabase.rpc("get_operator_payment_summary"), supabase.rpc("get_manual_payment_options"), supabase.rpc("get_settlement_reconciliation_workspace")]);
    if (balances.error || payments.error || options.error || reconciliation.error) throw balances.error ?? payments.error ?? options.error ?? reconciliation.error;
    const settlementWorkspace = normalizeSettlementWorkspace(reconciliation.data);
    return { mode: "ready", items: normalizeReceivables(balances.data), payments: normalizePayments(payments.data), options: normalizeOptions(options.data), settlements: settlementWorkspace.batches, exceptions: settlementWorkspace.exceptions };
  } catch { return { mode: "error", items: [], payments: [], options: [], settlements: [], exceptions: [], requestId: crypto.randomUUID() }; }
}

export async function getOperatorReceivables() {
  const workspace = await getOperatorPaymentWorkspace();
  return { mode: workspace.mode, items: workspace.items, requestId: workspace.requestId };
}

export async function getResidentBalance(): Promise<{ mode: DataMode; items: ReceivableSummaryItem[]; payments: PaymentSummaryItem[]; requestId?: string }> {
  if (!getPublicSupabaseConfig()) return { mode: "setup", items: [previewReceivable], payments: [previewFailedPayment, previewPayment] };
  try {
    const supabase = await createClient();
    const [balances, payments] = await Promise.all([supabase.rpc("get_resident_balance_summary"), supabase.rpc("get_resident_payment_history")]);
    if (balances.error || payments.error) throw balances.error ?? payments.error;
    return { mode: "ready", items: normalizeReceivables(balances.data), payments: normalizePayments(payments.data) };
  } catch { return { mode: "error", items: [], payments: [], requestId: crypto.randomUUID() }; }
}

export async function getResidentPaymentSessionOptions(): Promise<{ mode: DataMode; options: ResidentPaymentSessionOption[]; requestId?: string }> {
  if (!getPublicSupabaseConfig()) return { mode: "setup", options: [previewResidentPaymentOption] };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_resident_payment_session_options");
    if (error || !data) throw error ?? new Error("Payment options are unavailable.");
    return { mode: "ready", options: normalizeResidentPaymentOptions(data) };
  } catch { return { mode: "error", options: [], requestId: crypto.randomUUID() }; }
}

export async function getResidentPaymentRetryContext(paymentId: string): Promise<{ mode: DataMode | "not_found"; retry?: ResidentPaymentRetryContext; requestId?: string }> {
  if (!getPublicSupabaseConfig()) return paymentId === previewFailedPayment.paymentId ? { mode: "setup", retry: previewRetryContext } : { mode: "not_found" };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_resident_payment_retry_context", { p_payment_id: paymentId });
    if (error || !data) return { mode: "not_found" };
    const retry = normalizeResidentPaymentRetry(data);
    return retry ? { mode: "ready", retry } : { mode: "not_found" };
  } catch { return { mode: "error", requestId: crypto.randomUUID() }; }
}

export async function getPaymentReceipt(documentId: string): Promise<{ mode: DataMode | "not_found"; receipt?: PaymentReceipt; requestId?: string }> {
  if (!getPublicSupabaseConfig()) {
    if (documentId !== previewPayment.receiptDocumentId) return { mode: "not_found" };
    return { mode: "setup", receipt: { ...previewPayment, receivedAt: previewPayment.receivedAt!, receiptDocumentId: previewPayment.receiptDocumentId!, documentId, organizationName: "Crecy Demo", householdName: "Morgan household", reason: "Check received at the office", generatedAt: previewPayment.receivedAt!, allocations: [{ chargeId: previewOption.charges[0].chargeId, description: "Monthly rent", dueDate: "2026-08-01", amountMinor: 85000 }] } };
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

export async function getPaymentDetail(paymentId: string): Promise<{ mode: DataMode | "not_found"; payment?: PaymentDetail; requestId?: string }> {
  if (!getPublicSupabaseConfig()) return paymentId === previewPayment.paymentId ? { mode: "setup", payment: previewPaymentDetail } : paymentId === previewFailedPayment.paymentId ? { mode: "setup", payment: previewFailedPaymentDetail } : { mode: "not_found" };
  try {
    const supabase = await createClient();
    const [detail, eligibility, disputeHistory, settlementHistory, attemptHistory] = await Promise.all([
      supabase.rpc("get_payment_detail", { p_payment_id: paymentId }),
      supabase.rpc("get_payment_refund_eligibility", { p_payment_id: paymentId }),
      supabase.rpc("get_payment_dispute_history", { p_payment_id: paymentId }),
      supabase.rpc("get_payment_settlement_history", { p_payment_id: paymentId }),
      supabase.rpc("get_payment_attempt_history", { p_payment_id: paymentId }),
    ]);
    if (detail.error || !detail.data || eligibility.error || !eligibility.data || disputeHistory.error || !disputeHistory.data || settlementHistory.error || !settlementHistory.data || attemptHistory.error || !attemptHistory.data) return { mode: "not_found" };
    const payment = normalizePaymentDetail(detail.data);
    if (payment) {
      const refund = eligibility.data as Record<string, unknown>;
      payment.canRefund = Boolean(refund.canRefund);
      payment.refundableMinor = Number(refund.refundableMinor ?? 0);
      payment.refunds = objects(refund, "refunds").map((raw) => { const value = raw as Record<string, unknown>; return {
        refundId: String(value.refundId), amountMinor: Number(value.amountMinor), status: String(value.status), reason: String(value.reason),
        requestedAt: String(value.requestedAt), completedAt: value.completedAt ? String(value.completedAt) : null,
        correctiveJournalTransactionId: value.correctiveJournalTransactionId ? String(value.correctiveJournalTransactionId) : null,
        failureCode: value.failureCode ? String(value.failureCode) : null,
      }; });
      payment.disputes = objects(disputeHistory.data, "disputes").flatMap((raw) => {
        const value = raw as Record<string, unknown>;
        if (!isCurrency(value.currencyCode)) return [];
        return [{
          disputeId: String(value.disputeId), kind: String(value.kind), amountMinor: Number(value.amountMinor), currencyCode: value.currencyCode,
          reasonCode: String(value.reasonCode), status: String(value.status), evidenceDueAt: value.evidenceDueAt ? String(value.evidenceDueAt) : null,
          openedAt: String(value.openedAt), closedAt: value.closedAt ? String(value.closedAt) : null,
          reversalJournalTransactionId: value.reversalJournalTransactionId ? String(value.reversalJournalTransactionId) : null,
          recoveryJournalTransactionId: value.recoveryJournalTransactionId ? String(value.recoveryJournalTransactionId) : null,
        }];
      });
      payment.settlements = normalizeSettlementWorkspace({ batches: objects(settlementHistory.data, "settlements"), exceptions: [] }).batches;
      payment.attempts = objects(attemptHistory.data, "attempts").map((raw) => { const value = raw as Record<string, unknown>; return {
        attemptId: String(value.attemptId), method: value.method === "card" || value.method === "bank" ? value.method : "unknown",
        providerStatus: String(value.providerStatus), failureCode: value.failureCode ? String(value.failureCode) : null,
        initiatedAt: String(value.initiatedAt), expiresAt: value.expiresAt ? String(value.expiresAt) : null,
        confirmedAt: value.confirmedAt ? String(value.confirmedAt) : null, isCurrent: Boolean(value.isCurrent),
      }; });
    }
    return payment ? { mode: "ready", payment } : { mode: "not_found" };
  } catch { return { mode: "error", requestId: crypto.randomUUID() }; }
}
