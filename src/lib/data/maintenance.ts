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
export type OperatorMaintenanceItem = {
  maintenanceRequestId: string; publicReference: string; propertyName: string; unitCode: string; category: string;
  title: string; description: string; priorityRequested: string | null; officialPriority: string; status: string;
  accessPermission: string | null; preferredTimes: Array<{ start: string; end: string }>; createdAt: string;
  targetAt: string | null; evidenceCount: number;
};

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
function normalizeOperatorItems(data: unknown): OperatorMaintenanceItem[] {
  return objects(data, "items").map((raw) => { const item = raw as Record<string, unknown>; return {
    maintenanceRequestId: String(item.maintenanceRequestId), publicReference: String(item.publicReference), propertyName: String(item.propertyName), unitCode: String(item.unitCode),
    category: String(item.category), title: String(item.title), description: String(item.description), priorityRequested: item.priorityRequested ? String(item.priorityRequested) : null,
    officialPriority: String(item.officialPriority), status: String(item.status), accessPermission: item.accessPermission ? String(item.accessPermission) : null,
    preferredTimes: windows(item.preferredTimes), createdAt: String(item.createdAt), targetAt: item.targetAt ? String(item.targetAt) : null, evidenceCount: Number(item.evidenceCount),
  }; });
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
  if (!getPublicSupabaseConfig()) return { mode: "setup", summary: { open: 1, overdue: 0, untriaged: 1 }, items: [{ ...previewResidentItem, officialPriority: "medium", status: "new", targetAt: null }] };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_operator_maintenance_workspace");
    if (error || !data) throw error ?? new Error("Maintenance is unavailable.");
    const raw = data as Record<string, unknown>;
    const summary = raw.summary as Record<string, unknown> | undefined;
    return { mode: "ready", summary: { open: Number(summary?.open ?? 0), overdue: Number(summary?.overdue ?? 0), untriaged: Number(summary?.untriaged ?? 0) }, items: normalizeOperatorItems(data) };
  } catch { return { mode: "error", summary: { open: 0, overdue: 0, untriaged: 0 }, items: [], requestId: crypto.randomUUID() }; }
}
