import { z } from "zod";

export const notificationChannels = ["email", "sms", "whatsapp", "push"] as const;
export const notificationCategories = ["payments", "maintenance", "messages", "documents", "announcements"] as const;
export const supportedPreferenceLocales = ["en-US", "es-MX", "en-CA", "fr-CA"] as const;

export type NotificationChannel = typeof notificationChannels[number];
export type NotificationCategory = typeof notificationCategories[number];
export type NotificationChannelMatrix = Record<NotificationChannel, Record<NotificationCategory, boolean>>;

const categoryChoices = z.object({
  payments: z.boolean(),
  maintenance: z.boolean(),
  messages: z.boolean(),
  documents: z.boolean(),
  announcements: z.boolean(),
}).strict();

export const updateNotificationPreferencesSchema = z.object({
  locale: z.enum(supportedPreferenceLocales),
  reduceMotion: z.boolean(),
  highContrast: z.boolean(),
  textScale: z.enum(["standard", "large"]),
  channels: z.object({
    email: categoryChoices,
    sms: categoryChoices,
    whatsapp: categoryChoices,
    push: categoryChoices,
  }).strict(),
  expectedVersion: z.number().int().positive(),
}).strict();

