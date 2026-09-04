"use client";

import Link from "next/link";
import { useState } from "react";
import { BellRing, CheckCircle2, FileLock2, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { NOTIFICATION_PREFERENCE_PATH } from "@/lib/notifications/preference-routes";
import type { LinkAudience } from "@/lib/runtime/host";
import type {
  NotificationDeliverySummary,
  NotificationPreferenceProfile,
  RecentNotificationDelivery,
} from "@/lib/data/notification-preferences";
import {
  notificationCategories,
  notificationChannels,
  type NotificationCategory,
  type NotificationChannel,
  type NotificationChannelMatrix,
} from "@/lib/validation/notification-preferences";

/**
 * The five categories are `private.notification_template_category`'s five non-NULL values, taken from
 * `notificationCategories` rather than restated. That is what keeps access mail unsuppressible: the
 * function returns NULL for invitations, so no toggle for them can exist here to begin with.
 *
 * Only the WORDING varies by audience. The record behind it does not: `public.notification_preferences`
 * is keyed by `(user_id, category, channel)`, so an operator who is also an owner is editing one set of
 * preferences through two doors, and both doors must name the same thing recognizably.
 */
const categoryLabels: Record<LinkAudience, Record<NotificationCategory, string>> = {
  resident: {
    payments: "Payments and receipts",
    maintenance: "Maintenance updates",
    messages: "New messages",
    documents: "Documents and acknowledgements",
    announcements: "Property announcements",
  },
  operator: {
    payments: "Payments and receipts",
    maintenance: "Maintenance and work orders",
    messages: "New messages",
    documents: "Documents and statements",
    announcements: "Announcements",
  },
  owner: {
    payments: "Payments and distributions",
    maintenance: "Maintenance approvals",
    messages: "New messages",
    documents: "Statements and documents",
    announcements: "Announcements",
  },
};
const channelLabels: Record<NotificationChannel, string> = {
  email: "Email",
  sms: "SMS",
  whatsapp: "WhatsApp",
  push: "Push",
};
const deliverySummaryLabels: Array<[keyof NotificationDeliverySummary, string]> = [
  ["queued", "Queued"],
  ["processing", "Processing"],
  ["sent", "Sent"],
  ["failed", "Failed"],
  ["deadLetter", "Needs review"],
];

export function NotificationPreferencesForm({
  audience,
  profile,
  initialChannels,
  deliverySummary,
  recentDeliveries,
  disabled,
}: {
  /** Which surface is rendering this. Changes the wording and the return path, never the record. */
  audience: LinkAudience;
  profile: NotificationPreferenceProfile;
  initialChannels: NotificationChannelMatrix;
  deliverySummary: NotificationDeliverySummary;
  recentDeliveries: RecentNotificationDelivery[];
  disabled: boolean;
}) {
  const router = useRouter();
  const labels = categoryLabels[audience];
  const [channels, setChannels] = useState(initialChannels);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();

  function toggle(channel: NotificationChannel, category: NotificationCategory) {
    setChannels((current) => ({
      ...current,
      [channel]: { ...current[channel], [category]: !current[channel][category] },
    }));
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || disabled) return;
    setBusy(true);
    setError(undefined);
    setSuccess(undefined);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/v1/notification-preferences", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          locale: form.get("locale"),
          reduceMotion: form.get("reduceMotion") === "on",
          highContrast: form.get("highContrast") === "on",
          textScale: form.get("textScale"),
          channels,
          expectedVersion: profile.version,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error ?? "The notification preferences could not be saved.");
      setSuccess("Your notification and accessibility preferences were saved.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The notification preferences could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-6" onSubmit={save}>
      <Card>
        <CardHeader>
          <CardTitle>Transactional notifications</CardTitle>
          <CardDescription>
            Choose where Crecy may send operational updates. In-app notices and security alerts remain available even when an external channel is off.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/*
            Below md the matrix is a list of per-category groups, not the table.
            Measured: the table needs ~678px to show every channel column, so inside a card at a 390px
            viewport the scroll container was 300px wide against 640px of content — 0 of 20 checkboxes
            and 4 of 5 column headers were off-screen, with no affordance saying it scrolled. The page's
            primary control read as simply missing. Doc 15 §7 sanctions "prioritized cards or
            horizontal-scroll tables on mobile; critical actions remain reachable" — the table only
            satisfies that from md up, which is where it is shown. Exactly one of the two renders at any
            width, and `display:none` keeps the hidden one out of the tab order and the a11y tree.
          */}
          <div className="space-y-3 md:hidden">
            {notificationCategories.map((category) => (
              <fieldset key={category} className="rounded-xl border p-4">
                <legend className="px-1 text-sm font-medium">{labels[category]}</legend>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  {notificationChannels.map((channel) => {
                    const unavailable = (channel === "sms" || channel === "whatsapp") && !profile.hasPhone;
                    return (
                      <label
                        key={channel}
                        className={`flex items-center gap-2.5 rounded-lg border p-3 text-sm ${unavailable ? "opacity-60" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={channels[channel][category]}
                          disabled={disabled || busy || unavailable}
                          onChange={() => toggle(channel, category)}
                          className="h-4 w-4 rounded border-input accent-primary"
                        />
                        {channelLabels[channel]}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="border-b py-3 pr-4 text-left font-medium text-muted-foreground">Update type</th>
                  {notificationChannels.map((channel) => (
                    <th key={channel} className="border-b px-3 py-3 text-center font-medium text-muted-foreground">
                      {channelLabels[channel]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {notificationCategories.map((category) => (
                  <tr key={category}>
                    <th className="border-b py-4 pr-4 text-left font-medium">{labels[category]}</th>
                    {notificationChannels.map((channel) => {
                      const phoneChannel = channel === "sms" || channel === "whatsapp";
                      const unavailable = phoneChannel && !profile.hasPhone;
                      return (
                        <td key={channel} className="border-b px-3 py-4 text-center">
                          <input
                            type="checkbox"
                            aria-label={`${labels[category]} by ${channelLabels[channel]}`}
                            checked={channels[channel][category]}
                            disabled={disabled || busy || unavailable}
                            onChange={() => toggle(channel, category)}
                            className="h-4 w-4 rounded border-input accent-primary"
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!profile.hasPhone ? (
            <Alert variant="info">
              <BellRing className="h-5 w-5" />
              <AlertDescription>Add a verified phone number to your profile before enabling SMS or WhatsApp.</AlertDescription>
            </Alert>
          ) : null}
          <p className="text-xs leading-5 text-muted-foreground">
            Preferences are saved independently of provider availability. A channel is used only when the operator and Crecy have configured a compliant delivery provider.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Language and accessibility</CardTitle>
          <CardDescription>These choices follow your account across resident, owner, and operator surfaces.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="preference-locale">Language and region</Label>
              <NativeSelect id="preference-locale" name="locale" defaultValue={profile.locale} disabled={disabled || busy}>
                <option value="en-US">English (United States)</option>
                <option value="es-MX">Español (México)</option>
                <option value="en-CA">English (Canada)</option>
                <option value="fr-CA">Français (Canada)</option>
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="preference-text-scale">Text size</Label>
              <NativeSelect id="preference-text-scale" name="textScale" defaultValue={profile.textScale} disabled={disabled || busy}>
                <option value="standard">Standard</option>
                <option value="large">Large</option>
              </NativeSelect>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-start gap-3 rounded-xl border p-4">
              <input type="checkbox" name="reduceMotion" defaultChecked={profile.reduceMotion} disabled={disabled || busy} className="mt-0.5 h-4 w-4 rounded border-input accent-primary" />
              <span><span className="block text-sm font-medium">Reduce motion</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">Minimize nonessential animation and movement.</span></span>
            </label>
            <label className="flex items-start gap-3 rounded-xl border p-4">
              <input type="checkbox" name="highContrast" defaultChecked={profile.highContrast} disabled={disabled || busy} className="mt-0.5 h-4 w-4 rounded border-input accent-primary" />
              <span><span className="block text-sm font-medium">Higher contrast</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">Use stronger visual separation where supported.</span></span>
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Marketing communications</CardTitle>
          <CardDescription>Marketing consent is separate from operational notifications.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-muted/30 p-4">
            <div><p className="text-sm font-medium">Email and SMS marketing</p><p className="mt-1 text-xs text-muted-foreground">No marketing consent is recorded through this screen.</p></div>
            <Badge variant="neutral">Off</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Delivery diagnostics</CardTitle>
          <CardDescription>Last 30 days. Addresses, provider identifiers, and message payloads are never shown here.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {deliverySummaryLabels.map(([key, label]) => (
              <div key={key} className="rounded-xl border bg-muted/20 p-3">
                <p className="font-mono text-xl font-semibold">{deliverySummary[key]}</p>
                <p className="mt-1 text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
          {recentDeliveries.length ? (
            <div className="divide-y rounded-xl border">
              {recentDeliveries.map((item) => (
                <div key={item.notificationJobId} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium">{item.templateCode.replaceAll("_", " ")}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()} · {item.channel} · {item.attempts} attempts</p>
                  </div>
                  <Badge variant={item.status === "sent" ? "success" : item.status === "failed" || item.status === "dead_letter" ? "warning" : "info"}>
                    {item.latestDeliveryStatus ?? item.status.replaceAll("_", " ")}
                  </Badge>
                </div>
              ))}
            </div>
          ) : <p className="rounded-xl border bg-muted/20 p-6 text-center text-sm text-muted-foreground">No recent delivery activity.</p>}
        </CardContent>
      </Card>

      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      {success ? <Alert variant="info"><CheckCircle2 className="h-5 w-5" /><AlertDescription>{success}</AlertDescription></Alert> : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={disabled || busy}>
          {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
          {busy ? "Saving…" : "Save preferences"}
        </Button>
        <Button variant="ghost" asChild><Link href={`/settings/privacy?returnTo=${NOTIFICATION_PREFERENCE_PATH[audience]}`}><FileLock2 className="h-4 w-4" />Privacy requests</Link></Button>
      </div>
    </form>
  );
}

