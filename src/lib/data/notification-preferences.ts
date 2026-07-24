import "server-only";

import type { DataMode } from "@/lib/data/maintenance";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type {
  NotificationChannel,
  NotificationCategory,
  NotificationChannelMatrix,
} from "@/lib/validation/notification-preferences";

export type NotificationPreferenceProfile = {
  locale: "en-US" | "es-MX" | "en-CA" | "fr-CA";
  reduceMotion: boolean;
  highContrast: boolean;
  textScale: "standard" | "large";
  version: number;
  hasEmail: boolean;
  hasPhone: boolean;
};

export type NotificationDeliverySummary = {
  queued: number;
  processing: number;
  sent: number;
  failed: number;
  canceled: number;
  deadLetter: number;
};

export type RecentNotificationDelivery = {
  notificationJobId: string;
  templateCode: string;
  channel: "in_app" | NotificationChannel;
  status: string;
  attempts: number;
  createdAt: string;
  latestDeliveryStatus: string | null;
  latestDeliveryAt: string | null;
};

export type NotificationPreferencesWorkspace = {
  mode: DataMode;
  profile: NotificationPreferenceProfile | null;
  channels: NotificationChannelMatrix;
  marketing: { email: false; sms: false };
  deliverySummary: NotificationDeliverySummary;
  recentDeliveries: RecentNotificationDelivery[];
  requestId?: string;
};

const categories: NotificationCategory[] = ["payments", "maintenance", "messages", "documents", "announcements"];
const channelNames: NotificationChannel[] = ["email", "sms", "whatsapp", "push"];
const defaultChannels = (): NotificationChannelMatrix => ({
  email: { payments: true, maintenance: true, messages: true, documents: true, announcements: true },
  sms: { payments: false, maintenance: false, messages: false, documents: false, announcements: false },
  whatsapp: { payments: false, maintenance: false, messages: false, documents: false, announcements: false },
  push: { payments: false, maintenance: false, messages: false, documents: false, announcements: false },
});
const emptySummary = (): NotificationDeliverySummary => ({
  queued: 0,
  processing: 0,
  sent: 0,
  failed: 0,
  canceled: 0,
  deadLetter: 0,
});
const nullableString = (value: unknown) => value === null || value === undefined ? null : String(value);

function normalizeChannels(value: unknown): NotificationChannelMatrix {
  const root = value as Record<string, unknown> | null;
  const fallback = defaultChannels();
  return Object.fromEntries(channelNames.map((channel) => {
    const source = root?.[channel] as Record<string, unknown> | undefined;
    return [channel, Object.fromEntries(categories.map((category) => [
      category,
      typeof source?.[category] === "boolean" ? source[category] : fallback[channel][category],
    ]))];
  })) as NotificationChannelMatrix;
}

function normalizeWorkspace(data: unknown, mode: DataMode): NotificationPreferencesWorkspace {
  const root = data as Record<string, unknown>;
  const profile = root.profile as Record<string, unknown> | null;
  const summary = root.deliverySummary as Record<string, unknown> | null;
  const deliveries = Array.isArray(root.recentDeliveries) ? root.recentDeliveries : [];
  return {
    mode,
    profile: profile ? {
      locale: String(profile.locale) as NotificationPreferenceProfile["locale"],
      reduceMotion: Boolean(profile.reduceMotion),
      highContrast: Boolean(profile.highContrast),
      textScale: profile.textScale === "large" ? "large" : "standard",
      version: Number(profile.version),
      hasEmail: Boolean(profile.hasEmail),
      hasPhone: Boolean(profile.hasPhone),
    } : null,
    channels: normalizeChannels(root.channels),
    marketing: { email: false, sms: false },
    deliverySummary: {
      queued: Number(summary?.queued ?? 0),
      processing: Number(summary?.processing ?? 0),
      sent: Number(summary?.sent ?? 0),
      failed: Number(summary?.failed ?? 0),
      canceled: Number(summary?.canceled ?? 0),
      deadLetter: Number(summary?.deadLetter ?? 0),
    },
    recentDeliveries: deliveries.map((value) => {
      const item = value as Record<string, unknown>;
      return {
        notificationJobId: String(item.notificationJobId),
        templateCode: String(item.templateCode),
        channel: String(item.channel) as RecentNotificationDelivery["channel"],
        status: String(item.status),
        attempts: Number(item.attempts),
        createdAt: String(item.createdAt),
        latestDeliveryStatus: nullableString(item.latestDeliveryStatus),
        latestDeliveryAt: nullableString(item.latestDeliveryAt),
      };
    }),
  };
}

const previewWorkspace = (): NotificationPreferencesWorkspace => ({
  mode: "setup",
  profile: {
    locale: "en-US",
    reduceMotion: false,
    highContrast: false,
    textScale: "standard",
    version: 1,
    hasEmail: true,
    hasPhone: false,
  },
  channels: defaultChannels(),
  marketing: { email: false, sms: false },
  deliverySummary: emptySummary(),
  recentDeliveries: [],
});

export async function getNotificationPreferencesWorkspace(): Promise<NotificationPreferencesWorkspace> {
  if (!getPublicSupabaseConfig()) return previewWorkspace();
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_notification_preferences_workspace");
    if (error || !data) throw error ?? new Error("Notification preferences are unavailable.");
    return normalizeWorkspace(data, "ready");
  } catch {
    return {
      ...previewWorkspace(),
      mode: "error",
      profile: null,
      recentDeliveries: [],
      requestId: crypto.randomUUID(),
    };
  }
}

