import "server-only";

import type { DataMode } from "@/lib/data/maintenance";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { staffRoleCodes } from "@/lib/validation/staff";

export type StaffRoleCode = typeof staffRoleCodes[number];
export type StaffMember = {
  membershipId: string;
  userId: string;
  displayName: string;
  email: string | null;
  roleCode: StaffRoleCode;
  roleName: string;
  status: "invited" | "active" | "suspended" | "revoked";
  mfaRequired: boolean;
  startsAt: string;
  endsAt: string | null;
  propertyIds: string[];
  isCurrentUser: boolean;
  version: number;
};
export type StaffInvitation = {
  invitationId: string;
  membershipId: string;
  email: string;
  status: "pending" | "accepted" | "expired" | "revoked" | "superseded";
  expiresAt: string;
  createdAt: string;
};
export type StaffRole = {
  code: StaffRoleCode;
  displayName: string;
  organizationWideAllowed: boolean;
  sensitive: boolean;
};
export type StaffProperty = { propertyId: string; propertyName: string };
export type StaffWorkspace = {
  mode: DataMode;
  authenticatorLevel: "aal1" | "aal2";
  organization: {
    organizationId: string;
    organizationName: string;
    planCode: string;
  } | null;
  staffSeatCount: number;
  staffSeatLimit: number | null;
  members: StaffMember[];
  invitations: StaffInvitation[];
  roles: StaffRole[];
  properties: StaffProperty[];
  requestId?: string;
};

const preview: StaffWorkspace = {
  mode: "setup",
  authenticatorLevel: "aal2",
  organization: {
    organizationId: "10000000-0000-4000-8000-000000000001",
    organizationName: "Maple Court Management",
    planCode: "growth",
  },
  staffSeatCount: 2,
  staffSeatLimit: 5,
  members: [{
    membershipId: "20000000-0000-4000-8000-000000000002",
    userId: "30000000-0000-4000-8000-000000000003",
    displayName: "Alex Morgan",
    email: "alex@example.com",
    roleCode: "org_owner",
    roleName: "Organization owner",
    status: "active",
    mfaRequired: true,
    startsAt: "2026-07-20T12:00:00Z",
    endsAt: null,
    propertyIds: [],
    isCurrentUser: true,
    version: 1,
  }, {
    membershipId: "40000000-0000-4000-8000-000000000004",
    userId: "50000000-0000-4000-8000-000000000005",
    displayName: "Jordan Lee",
    email: "jordan@example.com",
    roleCode: "leasing_agent",
    roleName: "Leasing agent",
    status: "invited",
    mfaRequired: false,
    startsAt: "2026-07-24T12:00:00Z",
    endsAt: null,
    propertyIds: ["60000000-0000-4000-8000-000000000006"],
    isCurrentUser: false,
    version: 1,
  }],
  invitations: [],
  roles: [
    { code: "org_owner", displayName: "Organization owner", organizationWideAllowed: true, sensitive: true },
    { code: "org_admin", displayName: "Organization administrator", organizationWideAllowed: true, sensitive: true },
    { code: "property_manager", displayName: "Property manager", organizationWideAllowed: true, sensitive: false },
    { code: "leasing_agent", displayName: "Leasing agent", organizationWideAllowed: false, sensitive: false },
    { code: "accountant", displayName: "Accountant", organizationWideAllowed: true, sensitive: true },
    { code: "maintenance_coordinator", displayName: "Maintenance coordinator", organizationWideAllowed: false, sensitive: false },
    { code: "read_only_auditor", displayName: "Read-only auditor", organizationWideAllowed: true, sensitive: false },
  ],
  properties: [{ propertyId: "60000000-0000-4000-8000-000000000006", propertyName: "Maple Court" }],
};

const array = (value: unknown, key: string) => {
  const candidate = (value as Record<string, unknown> | null)?.[key];
  return Array.isArray(candidate) ? candidate : [];
};
const nullableString = (value: unknown) => value === null || value === undefined ? null : String(value);

const normalizeMember = (value: unknown): StaffMember => {
  const item = value as Record<string, unknown>;
  return {
    membershipId: String(item.membershipId),
    userId: String(item.userId),
    displayName: String(item.displayName),
    email: nullableString(item.email),
    roleCode: String(item.roleCode) as StaffRoleCode,
    roleName: String(item.roleName),
    status: String(item.status) as StaffMember["status"],
    mfaRequired: Boolean(item.mfaRequired),
    startsAt: String(item.startsAt),
    endsAt: nullableString(item.endsAt),
    propertyIds: Array.isArray(item.propertyIds) ? item.propertyIds.map(String) : [],
    isCurrentUser: Boolean(item.isCurrentUser),
    version: Number(item.version),
  };
};

export async function getStaffWorkspace(): Promise<StaffWorkspace> {
  if (!getPublicSupabaseConfig()) return preview;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_staff_management_workspace");
    if (error || !data) throw error ?? new Error("Staff access is unavailable.");
    const root = data as Record<string, unknown>;
    const organization = root.organization as Record<string, unknown> | null;
    return {
      mode: "ready",
      authenticatorLevel: root.authenticatorLevel === "aal2" ? "aal2" : "aal1",
      organization: organization ? {
        organizationId: String(organization.organizationId),
        organizationName: String(organization.organizationName),
        planCode: String(organization.planCode),
      } : null,
      staffSeatCount: Number(root.staffSeatCount),
      staffSeatLimit: root.staffSeatLimit === null ? null : Number(root.staffSeatLimit),
      members: array(data, "members").map(normalizeMember),
      invitations: array(data, "invitations").map((value) => {
        const item = value as Record<string, unknown>;
        return {
          invitationId: String(item.invitationId),
          membershipId: String(item.membershipId),
          email: String(item.email),
          status: String(item.status) as StaffInvitation["status"],
          expiresAt: String(item.expiresAt),
          createdAt: String(item.createdAt),
        };
      }),
      roles: array(data, "roles").map((value) => {
        const item = value as Record<string, unknown>;
        return {
          code: String(item.code) as StaffRoleCode,
          displayName: String(item.displayName),
          organizationWideAllowed: Boolean(item.organizationWideAllowed),
          sensitive: Boolean(item.sensitive),
        };
      }),
      properties: array(data, "properties").map((value) => {
        const item = value as Record<string, unknown>;
        return { propertyId: String(item.propertyId), propertyName: String(item.propertyName) };
      }),
    };
  } catch {
    return {
      ...preview,
      mode: "error",
      organization: null,
      members: [],
      invitations: [],
      roles: [],
      properties: [],
      staffSeatCount: 0,
      staffSeatLimit: null,
      requestId: crypto.randomUUID(),
    };
  }
}
