import type { LinkAudience } from "@/lib/runtime/host";

/**
 * Where each audience manages its notification preferences.
 *
 * One map, deliberately in a module with no `server-only`, because both sides of the same promise read
 * it: the relay puts this path in a List-Unsubscribe header, and the preference page itself links back
 * to it. A header that pointed at a path no page served would be the "workspace URL" defect again — a
 * URL advertised to a recipient that never resolved — so `sender.test.ts` asserts every path here is
 * routable on its own audience's origin under `routeForHost`.
 *
 * The preference RECORD is not audience-scoped: `public.notification_preferences` is keyed by
 * `(user_id, category, channel)` alone. These are three doors onto one set of preferences, which is why
 * a user who is both an operator and an owner sees the same toggles through either.
 */
export const NOTIFICATION_PREFERENCE_PATH: Record<LinkAudience, string> = {
  operator: "/settings/notifications",
  resident: "/more/preferences",
  owner: "/owner/preferences",
};
