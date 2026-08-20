import "server-only";

import { getPublicSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type SupportOrgRow = { organizationId: string; displayName: string; slug: string; status: string; createdAt: string | null };
export type SupportSessionRow = {
  supportSessionId: string; organizationId: string; organizationName: string | null;
  reason: string; status: string; startedAt: string | null; expiresAt: string | null; endedAt: string | null;
};
export type SupportConsoleState = { mode: "setup" | "ready" | "forbidden" | "error"; organizations: SupportOrgRow[]; sessions: SupportSessionRow[]; requestId?: string };

export type SupportOverview = {
  organizationId: string; displayName: string; slug: string; status: string; createdAt: string | null;
  subscriptionPlanCode: string | null; subscriptionStatus: string | null;
  propertyCount: number; unitCount: number; activeTenancyCount: number; openWorkOrderCount: number; activeMemberCount: number;
};
export type SupportMemberRow = { membershipId: string; roleCode: string; status: string; startsAt: string | null; endsAt: string | null; maskedEmail: string };
export type SupportActivityRow = { actionCode: string; resourceType: string; resourceId: string | null; actorType: string; occurredAt: string };
export type SupportDiagnosticsState = {
  mode: "setup" | "ready" | "no_session" | "forbidden" | "error";
  overview: SupportOverview | null; members: SupportMemberRow[]; activity: SupportActivityRow[]; requestId?: string;
};

const s = (v: unknown) => (v == null ? null : String(v));
const n = (v: unknown) => Number(v ?? 0);
const isNotActor = (message: string) => message.includes("NOT_PLATFORM_ACTOR");
const isNoSession = (message: string) => message.includes("SUPPORT_SESSION_REQUIRED");

function normalizeOrg(raw: unknown): SupportOrgRow {
  const r = raw as Record<string, unknown>;
  return { organizationId: String(r.organizationId), displayName: String(r.displayName ?? ""), slug: String(r.slug ?? ""), status: String(r.status ?? ""), createdAt: s(r.createdAt) };
}
function normalizeSession(raw: unknown): SupportSessionRow {
  const r = raw as Record<string, unknown>;
  return {
    supportSessionId: String(r.supportSessionId), organizationId: String(r.organizationId), organizationName: s(r.organizationName),
    reason: String(r.reason ?? ""), status: String(r.status ?? ""), startedAt: s(r.startedAt), expiresAt: s(r.expiresAt), endedAt: s(r.endedAt),
  };
}

const previewOrgs: SupportOrgRow[] = [
  { organizationId: "20000000-0000-4000-8000-000000000002", displayName: "Northstar Property Group", slug: "northstar", status: "active", createdAt: "2026-06-01T00:00:00.000Z" },
];
const previewSessions: SupportSessionRow[] = [];

export async function getSupportConsoleState(query?: string): Promise<SupportConsoleState> {
  if (!getPublicSupabaseConfig()) return { mode: "setup", organizations: previewOrgs, sessions: previewSessions };
  try {
    const supabase = await createClient();
    const sessionResult = await supabase.rpc("support_list_sessions", { p_limit: 50 });
    if (sessionResult.error) {
      if (isNotActor(sessionResult.error.message)) return { mode: "forbidden", organizations: [], sessions: [] };
      throw sessionResult.error;
    }
    const orgResult = await supabase.rpc("support_lookup_organizations", { p_query: query?.trim() || null, p_limit: 25 });
    if (orgResult.error) throw orgResult.error;
    const sessions = (((sessionResult.data as Record<string, unknown>)?.sessions as unknown[]) ?? []).map(normalizeSession);
    const organizations = (((orgResult.data as Record<string, unknown>)?.organizations as unknown[]) ?? []).map(normalizeOrg);
    return { mode: "ready", organizations, sessions };
  } catch {
    return { mode: "error", organizations: [], sessions: [], requestId: crypto.randomUUID() };
  }
}

export async function getActiveSupportSessions(): Promise<SupportSessionRow[]> {
  if (!getPublicSupabaseConfig()) return [];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("support_list_sessions", { p_limit: 50 });
    if (error) return [];
    const now = Date.now();
    return (((data as Record<string, unknown>)?.sessions as unknown[]) ?? [])
      .map(normalizeSession)
      .filter((row) => row.status === "active" && row.expiresAt != null && new Date(row.expiresAt).getTime() > now);
  } catch {
    return [];
  }
}

export async function getSupportOrganizationDiagnostics(organizationId: string): Promise<SupportDiagnosticsState> {
  if (!getPublicSupabaseConfig()) {
    return {
      mode: "setup",
      overview: { organizationId, displayName: "Northstar Property Group", slug: "northstar", status: "active", createdAt: "2026-06-01T00:00:00.000Z", subscriptionPlanCode: "growth", subscriptionStatus: "trialing", propertyCount: 4, unitCount: 36, activeTenancyCount: 31, openWorkOrderCount: 2, activeMemberCount: 5 },
      members: [{ membershipId: "preview", roleCode: "org_owner", status: "active", startsAt: null, endsAt: null, maskedEmail: "j***@n***" }],
      activity: [{ actionCode: "finance.paymentRecorded", resourceType: "payment", resourceId: null, actorType: "user", occurredAt: "2026-08-01T12:00:00.000Z" }],
    };
  }
  try {
    const supabase = await createClient();
    const overviewResult = await supabase.rpc("support_get_organization_overview", { p_organization_id: organizationId });
    if (overviewResult.error) {
      if (isNoSession(overviewResult.error.message)) return { mode: "no_session", overview: null, members: [], activity: [] };
      if (isNotActor(overviewResult.error.message)) return { mode: "forbidden", overview: null, members: [], activity: [] };
      throw overviewResult.error;
    }
    const [membersResult, activityResult] = await Promise.all([
      supabase.rpc("support_list_organization_members", { p_organization_id: organizationId, p_limit: 50 }),
      supabase.rpc("support_list_recent_activity", { p_organization_id: organizationId, p_limit: 50 }),
    ]);
    if (membersResult.error) throw membersResult.error;
    if (activityResult.error) throw activityResult.error;
    const o = overviewResult.data as Record<string, unknown>;
    const overview: SupportOverview = {
      organizationId: String(o.organizationId), displayName: String(o.displayName ?? ""), slug: String(o.slug ?? ""), status: String(o.status ?? ""), createdAt: s(o.createdAt),
      subscriptionPlanCode: s(o.subscriptionPlanCode), subscriptionStatus: s(o.subscriptionStatus),
      propertyCount: n(o.propertyCount), unitCount: n(o.unitCount), activeTenancyCount: n(o.activeTenancyCount), openWorkOrderCount: n(o.openWorkOrderCount), activeMemberCount: n(o.activeMemberCount),
    };
    const members = (((membersResult.data as Record<string, unknown>)?.members as unknown[]) ?? []).map((raw) => {
      const r = raw as Record<string, unknown>;
      return { membershipId: String(r.membershipId), roleCode: String(r.roleCode ?? ""), status: String(r.status ?? ""), startsAt: s(r.startsAt), endsAt: s(r.endsAt), maskedEmail: String(r.maskedEmail ?? "***") };
    });
    const activity = (((activityResult.data as Record<string, unknown>)?.activity as unknown[]) ?? []).map((raw) => {
      const r = raw as Record<string, unknown>;
      return { actionCode: String(r.actionCode ?? ""), resourceType: String(r.resourceType ?? ""), resourceId: s(r.resourceId), actorType: String(r.actorType ?? ""), occurredAt: String(r.occurredAt ?? "") };
    });
    return { mode: "ready", overview, members, activity };
  } catch {
    return { mode: "error", overview: null, members: [], activity: [], requestId: crypto.randomUUID() };
  }
}
