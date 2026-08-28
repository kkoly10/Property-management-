import "server-only";

import { getPublicSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { DataMode } from "@/lib/data/maintenance";

export type OwnerApprovalItem = {
  approvalRequestId: string;
  ownerEntityId: string;
  ownerName: string;
  propertyName: string;
  unitCode: string | null;
  workOrderId: string;
  workOrderReference: string;
  workOrderStatus: string;
  scope: string;
  approvalType: string;
  amountMinor: number | null;
  currencyCode: string | null;
  evidenceCount: number;
  status: string;
  reason: string | null;
  requestedAt: string;
  decidedAt: string | null;
  version: number;
};

const previewApproval: OwnerApprovalItem = {
  approvalRequestId: "d0000000-0000-4000-8000-000000000001",
  ownerEntityId: "d1000000-0000-4000-8000-000000000001",
  ownerName: "Maple Court Holdings",
  propertyName: "Maple Court",
  unitCode: "101",
  workOrderId: "d2000000-0000-4000-8000-000000000001",
  workOrderReference: "WO-8A53D10B7E4C",
  workOrderStatus: "awaiting_approval",
  scope: "Diagnose and repair the furnace.",
  approvalType: "work_order_estimate",
  amountMinor: 150000,
  currencyCode: "USD",
  evidenceCount: 2,
  status: "pending",
  reason: null,
  requestedAt: "2026-07-23T16:30:00Z",
  decidedAt: null,
  version: 1,
};

function normalizeItems(data: unknown): OwnerApprovalItem[] {
  const source = (data as Record<string, unknown> | null)?.items;
  if (!Array.isArray(source)) return [];
  return source.map((raw) => {
    const item = raw as Record<string, unknown>;
    return {
      approvalRequestId: String(item.approvalRequestId),
      ownerEntityId: String(item.ownerEntityId),
      ownerName: String(item.ownerName),
      propertyName: String(item.propertyName),
      unitCode: item.unitCode ? String(item.unitCode) : null,
      workOrderId: String(item.workOrderId),
      workOrderReference: String(item.workOrderReference),
      workOrderStatus: String(item.workOrderStatus),
      scope: String(item.scope),
      approvalType: String(item.approvalType),
      amountMinor: item.amountMinor !== null && item.amountMinor !== undefined ? Number(item.amountMinor) : null,
      currencyCode: item.currencyCode ? String(item.currencyCode) : null,
      evidenceCount: Number(item.evidenceCount),
      status: String(item.status),
      reason: item.reason ? String(item.reason) : null,
      requestedAt: String(item.requestedAt),
      decidedAt: item.decidedAt ? String(item.decidedAt) : null,
      version: Number(item.version),
    };
  });
}

type ApprovalWorkspace = { mode: DataMode; items: OwnerApprovalItem[]; requestId?: string };

async function getWorkspace(
  rpc: "get_owner_approval_workspace" | "get_operator_owner_approval_workspace",
  organizationId: string | null = null,
): Promise<ApprovalWorkspace> {
  if (!getPublicSupabaseConfig()) return { mode: "setup", items: [previewApproval] };
  // The operator variant is organization-scoped; the owner variant is scoped by the caller's own
  // owner entity and has no operator organization to name.
  if (rpc === "get_operator_owner_approval_workspace" && !organizationId) return { mode: "error", items: [] };
  try {
    const supabase = await createClient();
    const { data, error } = organizationId
      ? await supabase.rpc(rpc, { p_organization_id: organizationId })
      : await supabase.rpc(rpc);
    if (error || !data) throw error ?? new Error("Owner approvals are unavailable.");
    return { mode: "ready", items: normalizeItems(data) };
  } catch {
    return { mode: "error", items: [], requestId: crypto.randomUUID() };
  }
}

export function getOwnerApprovalWorkspace() {
  return getWorkspace("get_owner_approval_workspace");
}

export async function getOwnerApprovalDetail(approvalRequestId: string) {
  const workspace = await getOwnerApprovalWorkspace();
  return { mode: workspace.mode, item: workspace.items.find((item) => item.approvalRequestId === approvalRequestId), requestId: workspace.requestId };
}

export function getOperatorOwnerApprovalWorkspace(organizationId: string | null) {
  return getWorkspace("get_operator_owner_approval_workspace", organizationId);
}
