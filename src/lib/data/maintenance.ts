import "server-only";

import { getPublicSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type DataMode = "setup" | "ready" | "error";
export type MaintenanceTenancy = { tenancyId: string; organizationId: string; propertyName: string; unitCode: string };
export type ResidentMaintenanceItem = {
  maintenanceRequestId: string; publicReference: string; propertyName: string; unitCode: string; category: string;
  title: string; description: string; priorityRequested: string | null; residentVisibleStatus: string;
  accessPermission: string | null; preferredTimes: Array<{ start: string; end: string }>; createdAt: string;
  closedAt: string | null; evidenceCount: number;
};
export type OperatorWorkOrder = {
  workOrderId: string; publicReference: string; status: string; scope: string;
  vendorId: string | null; vendorName: string | null;
  scheduledStart: string | null; scheduledEnd: string | null; startedAt: string | null;
  completedAt: string | null; completionSummary: string | null;
  estimatedCostMinor: number | null; actualCostMinor: number | null; currencyCode: string | null;
  ownerApprovalRequired: boolean; ownerApprovalStatus: string | null;
  canceledReason: string | null; version: number; evidenceCount: number;
};
export type OperatorMaintenanceItem = {
  maintenanceRequestId: string; organizationId: string; publicReference: string; propertyName: string; unitCode: string; category: string;
  title: string; description: string; priorityRequested: string | null; officialPriority: string; status: string;
  accessPermission: string | null; preferredTimes: Array<{ start: string; end: string }>; createdAt: string;
  targetAt: string | null; evidenceCount: number; workOrder: OperatorWorkOrder | null;
};
export type Vendor = { vendorId: string; displayName: string; email: string | null; phoneE164: string | null; status: string };

const previewTenancy: MaintenanceTenancy = { tenancyId: "20000000-0000-4000-8000-000000000002", organizationId: "10000000-0000-4000-8000-000000000001", propertyName: "Maple Court", unitCode: "101" };
const previewResidentItem: ResidentMaintenanceItem = {
  maintenanceRequestId: "a0000000-0000-4000-8000-000000000001", publicReference: "MR-6C29A4F817D2", propertyName: "Maple Court", unitCode: "101",
  category: "plumbing", title: "Kitchen sink is leaking", description: "Water is dripping beneath the kitchen sink.", priorityRequested: "medium",
  residentVisibleStatus: "submitted", accessPermission: "Call before entering.", preferredTimes: [], createdAt: "2026-07-22T14:30:00Z", closedAt: null, evidenceCount: 2,
};
const objects = (value: unknown, key: string) => Array.isArray((value as Record<string, unknown> | null)?.[key]) ? (value as Record<string, unknown[]>)[key] : [];
const windows = (value: unknown) => Array.isArray(value) ? value.flatMap((raw) => {
  const item = raw as Record<string, unknown>;
  return item.start && item.end ? [{ start: String(item.start), end: String(item.end) }] : [];
}) : [];

function normalizeTenancies(data: unknown): MaintenanceTenancy[] {
  return objects(data, "tenancies").map((raw) => { const item = raw as Record<string, unknown>; return {
    tenancyId: String(item.tenancyId), organizationId: String(item.organizationId), propertyName: String(item.propertyName), unitCode: String(item.unitCode),
  }; });
}
function normalizeResidentItems(data: unknown): ResidentMaintenanceItem[] {
  return objects(data, "items").map((raw) => { const item = raw as Record<string, unknown>; return {
    maintenanceRequestId: String(item.maintenanceRequestId), publicReference: String(item.publicReference), propertyName: String(item.propertyName), unitCode: String(item.unitCode),
    category: String(item.category), title: String(item.title), description: String(item.description), priorityRequested: item.priorityRequested ? String(item.priorityRequested) : null,
    residentVisibleStatus: String(item.residentVisibleStatus), accessPermission: item.accessPermission ? String(item.accessPermission) : null,
    preferredTimes: windows(item.preferredTimes), createdAt: String(item.createdAt), closedAt: item.closedAt ? String(item.closedAt) : null, evidenceCount: Number(item.evidenceCount),
  }; });
}
function normalizeWorkOrder(value: unknown): OperatorWorkOrder | null {
  if (!value || typeof value !== "object") return null;
  const w = value as Record<string, unknown>;
  if (!w.workOrderId) return null;
  return {
    workOrderId: String(w.workOrderId), publicReference: String(w.publicReference), status: String(w.status), scope: String(w.scope),
    vendorId: w.vendorId ? String(w.vendorId) : null, vendorName: w.vendorName ? String(w.vendorName) : null,
    scheduledStart: w.scheduledStart ? String(w.scheduledStart) : null, scheduledEnd: w.scheduledEnd ? String(w.scheduledEnd) : null,
    startedAt: w.startedAt ? String(w.startedAt) : null, completedAt: w.completedAt ? String(w.completedAt) : null,
    completionSummary: w.completionSummary ? String(w.completionSummary) : null,
    estimatedCostMinor: w.estimatedCostMinor !== null && w.estimatedCostMinor !== undefined ? Number(w.estimatedCostMinor) : null,
    actualCostMinor: w.actualCostMinor !== null && w.actualCostMinor !== undefined ? Number(w.actualCostMinor) : null,
    currencyCode: w.currencyCode ? String(w.currencyCode) : null,
    ownerApprovalRequired: Boolean(w.ownerApprovalRequired), ownerApprovalStatus: w.ownerApprovalStatus ? String(w.ownerApprovalStatus) : null,
    canceledReason: w.canceledReason ? String(w.canceledReason) : null, version: Number(w.version), evidenceCount: Number(w.evidenceCount),
  };
}
function normalizeOperatorItems(data: unknown): OperatorMaintenanceItem[] {
  return objects(data, "items").map((raw) => { const item = raw as Record<string, unknown>; return {
    maintenanceRequestId: String(item.maintenanceRequestId), organizationId: String(item.organizationId), publicReference: String(item.publicReference), propertyName: String(item.propertyName), unitCode: String(item.unitCode),
    category: String(item.category), title: String(item.title), description: String(item.description), priorityRequested: item.priorityRequested ? String(item.priorityRequested) : null,
    officialPriority: String(item.officialPriority), status: String(item.status), accessPermission: item.accessPermission ? String(item.accessPermission) : null,
    preferredTimes: windows(item.preferredTimes), createdAt: String(item.createdAt), targetAt: item.targetAt ? String(item.targetAt) : null, evidenceCount: Number(item.evidenceCount),
    workOrder: normalizeWorkOrder(item.workOrder),
  }; });
}
function normalizeVendors(data: unknown): Vendor[] {
  return Array.isArray(data) ? data.map((raw) => { const item = raw as Record<string, unknown>; return {
    vendorId: String(item.vendorId), displayName: String(item.displayName), email: item.email ? String(item.email) : null,
    phoneE164: item.phoneE164 ? String(item.phoneE164) : null, status: String(item.status),
  }; }) : [];
}

export async function getResidentMaintenanceWorkspace(): Promise<{ mode: DataMode; tenancies: MaintenanceTenancy[]; items: ResidentMaintenanceItem[]; requestId?: string }> {
  if (!getPublicSupabaseConfig()) return { mode: "setup", tenancies: [previewTenancy], items: [previewResidentItem] };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_resident_maintenance_workspace");
    if (error || !data) throw error ?? new Error("Maintenance is unavailable.");
    return { mode: "ready", tenancies: normalizeTenancies(data), items: normalizeResidentItems(data) };
  } catch { return { mode: "error", tenancies: [], items: [], requestId: crypto.randomUUID() }; }
}

export async function getResidentMaintenanceDetail(requestId: string) {
  const workspace = await getResidentMaintenanceWorkspace();
  return { mode: workspace.mode, item: workspace.items.find((item) => item.maintenanceRequestId === requestId), requestId: workspace.requestId };
}

export async function getOperatorMaintenanceWorkspace(): Promise<{ mode: DataMode; summary: { open: number; overdue: number; untriaged: number }; items: OperatorMaintenanceItem[]; requestId?: string }> {
  if (!getPublicSupabaseConfig()) return { mode: "setup", summary: { open: 1, overdue: 0, untriaged: 1 }, items: [{ ...previewResidentItem, organizationId: "10000000-0000-4000-8000-000000000001", officialPriority: "medium", status: "new", targetAt: null, workOrder: null }] };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_operator_maintenance_workspace");
    if (error || !data) throw error ?? new Error("Maintenance is unavailable.");
    const raw = data as Record<string, unknown>;
    const summary = raw.summary as Record<string, unknown> | undefined;
    return { mode: "ready", summary: { open: Number(summary?.open ?? 0), overdue: Number(summary?.overdue ?? 0), untriaged: Number(summary?.untriaged ?? 0) }, items: normalizeOperatorItems(data) };
  } catch { return { mode: "error", summary: { open: 0, overdue: 0, untriaged: 0 }, items: [], requestId: crypto.randomUUID() }; }
}

export async function getOperatorWorkOrderDetail(maintenanceRequestId: string) {
  const workspace = await getOperatorMaintenanceWorkspace();
  return { mode: workspace.mode, item: workspace.items.find((item) => item.maintenanceRequestId === maintenanceRequestId), requestId: workspace.requestId };
}

export async function getOperatorVendorDirectory(): Promise<{ mode: DataMode; vendors: Vendor[]; requestId?: string }> {
  if (!getPublicSupabaseConfig()) return { mode: "setup", vendors: [{ vendorId: "b0000000-0000-4000-8000-000000000001", displayName: "Ready Fix Plumbing", email: "dispatch@readyfix.example", phoneE164: "+14045551234", status: "active" }] };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_operator_vendor_directory");
    if (error || !data) throw error ?? new Error("Vendors are unavailable.");
    return { mode: "ready", vendors: normalizeVendors(data) };
  } catch { return { mode: "error", vendors: [], requestId: crypto.randomUUID() }; }
}
