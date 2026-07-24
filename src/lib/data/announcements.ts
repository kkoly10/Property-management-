import "server-only";

import { getPublicSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { DataMode } from "@/lib/data/maintenance";

export type AnnouncementAudience = "organization_residents" | "property_residents" | "selected_tenancies" | "owners";
export type OperatorAnnouncement = {
  announcementId: string;
  organizationId: string;
  propertyId: string | null;
  propertyName: string | null;
  title: string;
  bodyText: string;
  locale: string;
  audienceType: AnnouncementAudience;
  status: "draft" | "scheduled" | "publishing" | "published" | "canceled";
  deliveryCount: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
};
export type AnnouncementProperty = { organizationId: string; propertyId: string; propertyName: string };
export type AnnouncementTenancy = AnnouncementProperty & { tenancyId: string; unitCode: string; householdName: string };
export type RecipientAnnouncement = {
  announcementId: string;
  deliveryId: string;
  propertyId: string | null;
  propertyName: string | null;
  title: string;
  bodyText: string;
  locale: string;
  audienceType: AnnouncementAudience;
  deliveryStatus: string;
  deliveredAt: string | null;
  publishedAt: string;
};

const previewProperty: AnnouncementProperty = {
  organizationId: "10000000-0000-4000-8000-000000000001",
  propertyId: "20000000-0000-4000-8000-000000000002",
  propertyName: "Maple Court",
};
const previewAnnouncement: OperatorAnnouncement = {
  announcementId: "a0000000-0000-4000-8000-000000000001",
  ...previewProperty,
  title: "Water service notice",
  bodyText: "Water service will be paused Tuesday from 10 AM until noon.",
  locale: "en-US",
  audienceType: "property_residents",
  status: "published",
  deliveryCount: 24,
  publishedAt: "2026-07-24T15:00:00Z",
  createdAt: "2026-07-24T14:50:00Z",
  updatedAt: "2026-07-24T15:00:00Z",
  version: 2,
};

const nullableString = (value: unknown) => value === null || value === undefined ? null : String(value);
const list = (data: unknown, key: string) => {
  const value = (data as Record<string, unknown> | null)?.[key];
  return Array.isArray(value) ? value : [];
};

function normalizeOperatorAnnouncement(value: unknown): OperatorAnnouncement {
  const item = value as Record<string, unknown>;
  return {
    announcementId: String(item.announcementId),
    organizationId: String(item.organizationId),
    propertyId: nullableString(item.propertyId),
    propertyName: nullableString(item.propertyName),
    title: String(item.title),
    bodyText: String(item.bodyText),
    locale: String(item.locale),
    audienceType: String(item.audienceType) as AnnouncementAudience,
    status: String(item.status) as OperatorAnnouncement["status"],
    deliveryCount: Number(item.deliveryCount),
    publishedAt: nullableString(item.publishedAt),
    createdAt: String(item.createdAt),
    updatedAt: String(item.updatedAt),
    version: Number(item.version),
  };
}
function normalizeProperty(value: unknown): AnnouncementProperty {
  const item = value as Record<string, unknown>;
  return {
    organizationId: String(item.organizationId),
    propertyId: String(item.propertyId),
    propertyName: String(item.propertyName),
  };
}

function normalizeTenancy(value: unknown): AnnouncementTenancy {
  const item = value as Record<string, unknown>;
  return {
    ...normalizeProperty(item),
    tenancyId: String(item.tenancyId),
    unitCode: String(item.unitCode),
    householdName: String(item.householdName),
  };
}

function normalizeRecipientAnnouncement(value: unknown): RecipientAnnouncement {
  const item = value as Record<string, unknown>;
  return {
    announcementId: String(item.announcementId),
    deliveryId: String(item.deliveryId),
    propertyId: nullableString(item.propertyId),
    propertyName: nullableString(item.propertyName),
    title: String(item.title),
    bodyText: String(item.bodyText),
    locale: String(item.locale),
    audienceType: String(item.audienceType) as AnnouncementAudience,
    deliveryStatus: String(item.deliveryStatus),
    deliveredAt: nullableString(item.deliveredAt),
    publishedAt: String(item.publishedAt),
  };
}

export async function getOperatorAnnouncementWorkspace(): Promise<{
  mode: DataMode;
  items: OperatorAnnouncement[];
  properties: AnnouncementProperty[];
  tenancies: AnnouncementTenancy[];
  requestId?: string;
}> {
  if (!getPublicSupabaseConfig()) {
    return {
      mode: "setup",
      items: [previewAnnouncement],
      properties: [previewProperty],
      tenancies: [{ ...previewProperty, tenancyId: "30000000-0000-4000-8000-000000000003", unitCode: "101", householdName: "Jordan household" }],
    };
  }
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_operator_announcement_workspace");
    if (error || !data) throw error ?? new Error("Announcements are unavailable.");
    return {
      mode: "ready",
      items: list(data, "items").map(normalizeOperatorAnnouncement),
      properties: list(data, "properties").map(normalizeProperty),
      tenancies: list(data, "tenancies").map(normalizeTenancy),
    };
  } catch {
    return { mode: "error", items: [], properties: [], tenancies: [], requestId: crypto.randomUUID() };
  }
}

export async function getRecipientAnnouncementWorkspace(): Promise<{
  mode: DataMode;
  items: RecipientAnnouncement[];
  requestId?: string;
}> {
  if (!getPublicSupabaseConfig()) {
    return {
      mode: "setup",
      items: [{
        announcementId: previewAnnouncement.announcementId,
        deliveryId: "b0000000-0000-4000-8000-000000000001",
        propertyId: previewAnnouncement.propertyId,
        propertyName: previewAnnouncement.propertyName,
        title: previewAnnouncement.title,
        bodyText: previewAnnouncement.bodyText,
        locale: previewAnnouncement.locale,
        audienceType: previewAnnouncement.audienceType,
        deliveryStatus: "delivered",
        deliveredAt: previewAnnouncement.publishedAt,
        publishedAt: previewAnnouncement.publishedAt!,
      }],
    };
  }
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_recipient_announcement_workspace");
    if (error || !data) throw error ?? new Error("Announcements are unavailable.");
    return { mode: "ready", items: list(data, "items").map(normalizeRecipientAnnouncement) };
  } catch {
    return { mode: "error", items: [], requestId: crypto.randomUUID() };
  }
}
