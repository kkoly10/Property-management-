import "server-only";

import type { DataMode } from "@/lib/data/maintenance";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { privacyRequestTypes } from "@/lib/validation/privacy";

export type PrivacyRequestType = typeof privacyRequestTypes[number];
export type PrivacyRequestStatus =
  | "submitted"
  | "identity_verification"
  | "operator_action_required"
  | "processing"
  | "fulfilled"
  | "partially_fulfilled"
  | "denied"
  | "canceled";

export type PrivacyOrganization = {
  organizationId: string;
  organizationName: string;
  countryCode: "US" | "CA" | "MX";
};

export type PrivacyRequestItem = {
  privacyRequestId: string;
  organizationId: string | null;
  organizationName: string | null;
  requestType: PrivacyRequestType;
  jurisdictionCode: string | null;
  controllerRole: "platform" | "operator" | "joint_review_required";
  status: PrivacyRequestStatus;
  identityVerificationStatus: "pending" | "verified" | "failed" | "waived";
  submittedAt: string;
  dueAt: string;
  completedAt: string | null;
  version: number;
  jobCount: number;
  queuedJobCount: number;
  blockedByHold: boolean;
  canVerify: boolean;
  canCancel: boolean;
};

export type PrivacyRequestWorkspace = {
  mode: DataMode;
  authenticatorLevel: "aal1" | "aal2";
  organizations: PrivacyOrganization[];
  items: PrivacyRequestItem[];
  requestId?: string;
};

const previewOrganization: PrivacyOrganization = {
  organizationId: "10000000-0000-4000-8000-000000000001",
  organizationName: "Maple Court Management",
  countryCode: "US",
};

const previewItem: PrivacyRequestItem = {
  privacyRequestId: "90000000-0000-4000-8000-000000000001",
  organizationId: previewOrganization.organizationId,
  organizationName: previewOrganization.organizationName,
  requestType: "export",
  jurisdictionCode: "US-VA",
  controllerRole: "operator",
  status: "identity_verification",
  identityVerificationStatus: "pending",
  submittedAt: "2026-07-24T12:00:00Z",
  dueAt: "2026-08-23T12:00:00Z",
  completedAt: null,
  version: 1,
  jobCount: 2,
  queuedJobCount: 2,
  blockedByHold: false,
  canVerify: true,
  canCancel: true,
};

const list = (value: unknown, key: string) => {
  const root = value as Record<string, unknown> | null;
  return Array.isArray(root?.[key]) ? root[key] as unknown[] : [];
};
const nullableString = (value: unknown) => value === null || value === undefined ? null : String(value);
const countryCode = (value: unknown): PrivacyOrganization["countryCode"] =>
  value === "CA" || value === "MX" ? value : "US";

function normalizeOrganization(value: unknown): PrivacyOrganization {
  const item = value as Record<string, unknown>;
  return {
    organizationId: String(item.organizationId),
    organizationName: String(item.organizationName),
    countryCode: countryCode(item.countryCode),
  };
}

function normalizeItem(value: unknown): PrivacyRequestItem {
  const item = value as Record<string, unknown>;
  return {
    privacyRequestId: String(item.privacyRequestId),
    organizationId: nullableString(item.organizationId),
    organizationName: nullableString(item.organizationName),
    requestType: String(item.requestType) as PrivacyRequestType,
    jurisdictionCode: nullableString(item.jurisdictionCode),
    controllerRole: String(item.controllerRole) as PrivacyRequestItem["controllerRole"],
    status: String(item.status) as PrivacyRequestStatus,
    identityVerificationStatus: String(item.identityVerificationStatus) as PrivacyRequestItem["identityVerificationStatus"],
    submittedAt: String(item.submittedAt),
    dueAt: String(item.dueAt),
    completedAt: nullableString(item.completedAt),
    version: Number(item.version),
    jobCount: Number(item.jobCount),
    queuedJobCount: Number(item.queuedJobCount),
    blockedByHold: Boolean(item.blockedByHold),
    canVerify: Boolean(item.canVerify),
    canCancel: Boolean(item.canCancel),
  };
}

/**
 * Two contracts, not one filter. Residents and owners have a privacy right regardless of any operator
 * membership, so with no context this uses the RELATIONSHIP projection — organizations they hold an
 * active relationship with, and nothing else. An operator supplies their active organization.
 */
export async function getPrivacyRequestWorkspace(organizationId: string | null = null): Promise<PrivacyRequestWorkspace> {
  if (!getPublicSupabaseConfig()) {
    return {
      mode: "setup",
      authenticatorLevel: "aal1",
      organizations: [previewOrganization],
      items: [previewItem],
    };
  }

  try {
    const supabase = await createClient();
    const { data, error } = organizationId
      ? await supabase.rpc("get_privacy_request_workspace", { p_organization_id: organizationId })
      : await supabase.rpc("get_relationship_privacy_request_workspace");
    if (error || !data) throw error ?? new Error("Privacy requests are unavailable.");
    const root = data as Record<string, unknown>;
    return {
      mode: "ready",
      authenticatorLevel: root.authenticatorLevel === "aal2" ? "aal2" : "aal1",
      organizations: list(data, "organizations").map(normalizeOrganization),
      items: list(data, "items").map(normalizeItem),
    };
  } catch {
    return {
      mode: "error",
      authenticatorLevel: "aal1",
      organizations: [],
      items: [],
      requestId: crypto.randomUUID(),
    };
  }
}
