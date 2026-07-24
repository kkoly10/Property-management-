"use client";

import { useState } from "react";
import { LoaderCircle, Megaphone, Send, X } from "lucide-react";
import { useRouter } from "next/navigation";
import type { AnnouncementAudience, AnnouncementProperty, AnnouncementTenancy, OperatorAnnouncement } from "@/lib/data/announcements";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

const audienceLabels: Record<AnnouncementAudience, string> = {
  organization_residents: "All organization residents",
  property_residents: "All property residents",
  selected_tenancies: "Selected tenancies",
  owners: "Property owners",
};
const statusVariant = (status: OperatorAnnouncement["status"]) => status === "published" ? "success" : status === "canceled" ? "neutral" : "warning";

export function AnnouncementManager({
  items,
  properties,
  tenancies,
  disabled,
}: {
  items: OperatorAnnouncement[];
  properties: AnnouncementProperty[];
  tenancies: AnnouncementTenancy[];
  disabled: boolean;
}) {
  const router = useRouter();
  const [propertyId, setPropertyId] = useState(properties[0]?.propertyId ?? "");
  const [audienceType, setAudienceType] = useState<AnnouncementAudience>("property_residents");
  const [selectedTenancyIds, setSelectedTenancyIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [activeAction, setActiveAction] = useState<string>();
  const [error, setError] = useState<string>();
  const selectedProperty = properties.find((property) => property.propertyId === propertyId);
  const availableTenancies = tenancies.filter((tenancy) => tenancy.propertyId === propertyId);

  async function post(url: string, body: unknown, idempotencyKey = crypto.randomUUID()) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error ?? "The announcement action failed.");
    return result as { announcementId: string; version: number };
  }

  async function createAndPublish(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProperty || busy || disabled) return;
    if (audienceType === "selected_tenancies" && selectedTenancyIds.length === 0) {
      setError("Select at least one tenancy.");
      return;
    }
    setBusy(true);
    setError(undefined);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const draft = await post("/api/v1/announcements", {
        organizationId: selectedProperty.organizationId,
        propertyId: audienceType === "organization_residents" ? null : selectedProperty.propertyId,
        title: form.get("title"),
        bodyText: form.get("bodyText"),
        locale: form.get("locale"),
        audienceType,
      });
      await post(`/api/v1/announcements/${draft.announcementId}/publish`, {
        expectedVersion: draft.version,
        selectedTenancyIds: audienceType === "selected_tenancies" ? selectedTenancyIds : [],
      });
      setSelectedTenancyIds([]);
      formElement.reset();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The announcement could not be published.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function publishDraft(item: OperatorAnnouncement) {
    if (item.audienceType === "selected_tenancies") {
      setError("Selected-tenancy drafts must be recreated so the recipient selection can be reviewed.");
      return;
    }
    setActiveAction(item.announcementId);
    setError(undefined);
    try {
      await post(`/api/v1/announcements/${item.announcementId}/publish`, {
        expectedVersion: item.version,
        selectedTenancyIds: [],
      });
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The announcement could not be published.");
    } finally {
      setActiveAction(undefined);
    }
  }

  async function cancelDraft(item: OperatorAnnouncement) {
    setActiveAction(item.announcementId);
    setError(undefined);
    try {
      await post(`/api/v1/announcements/${item.announcementId}/cancel`, { expectedVersion: item.version });
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The announcement could not be canceled.");
    } finally {
      setActiveAction(undefined);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Publish a transactional announcement</CardTitle>
          <CardDescription>Audience expansion is saved as explicit delivery rows. Marketing content is not supported in this P0 workflow.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={createAndPublish}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="announcement-property">Property context</Label><NativeSelect id="announcement-property" value={propertyId} disabled={disabled || busy} onChange={(event) => { setPropertyId(event.target.value); setSelectedTenancyIds([]); }}>{properties.map((property) => <option key={property.propertyId} value={property.propertyId}>{property.propertyName}</option>)}</NativeSelect></div>
              <div className="space-y-2"><Label htmlFor="announcement-audience">Audience</Label><NativeSelect id="announcement-audience" value={audienceType} disabled={disabled || busy} onChange={(event) => { setAudienceType(event.target.value as AnnouncementAudience); setSelectedTenancyIds([]); }}>{Object.entries(audienceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</NativeSelect></div>
            </div>
            {audienceType === "selected_tenancies" ? <fieldset className="space-y-2"><legend className="text-sm font-medium">Select tenancies</legend><div className="grid max-h-56 gap-2 overflow-y-auto rounded-xl border p-3">{availableTenancies.length ? availableTenancies.map((tenancy) => <label key={tenancy.tenancyId} className="flex items-center gap-3 rounded-lg p-2 text-sm hover:bg-muted"><input type="checkbox" checked={selectedTenancyIds.includes(tenancy.tenancyId)} onChange={(event) => setSelectedTenancyIds((current) => event.target.checked ? [...current, tenancy.tenancyId] : current.filter((id) => id !== tenancy.tenancyId))} /><span><span className="font-medium">{tenancy.householdName}</span><span className="ml-2 text-muted-foreground">Unit {tenancy.unitCode}</span></span></label>) : <p className="p-3 text-sm text-muted-foreground">No active tenancies are available for this property.</p>}</div></fieldset> : null}
            <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
              <div className="space-y-2"><Label htmlFor="announcement-title">Title</Label><Input id="announcement-title" name="title" maxLength={200} required disabled={disabled || busy} /></div>
              <div className="space-y-2"><Label htmlFor="announcement-locale">Locale</Label><NativeSelect id="announcement-locale" name="locale" defaultValue="en-US" disabled={disabled || busy}><option value="en-US">English (US)</option><option value="es-MX">Español (MX)</option><option value="fr-CA">Français (CA)</option></NativeSelect></div>
            </div>
            <div className="space-y-2"><Label htmlFor="announcement-body">Announcement</Label><Textarea id="announcement-body" name="bodyText" className="min-h-36" maxLength={20_000} required disabled={disabled || busy} /></div>
            {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
            <Button type="submit" disabled={disabled || busy || !selectedProperty}>{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{busy ? "Publishing…" : "Publish announcement"}</Button>
          </form>
        </CardContent>
      </Card>

      <section className="space-y-3" aria-labelledby="announcement-history-title">
        <div><h2 id="announcement-history-title" className="text-xl font-semibold">Announcement history</h2><p className="mt-1 text-sm text-muted-foreground">Published recipients remain fixed in their delivery rows.</p></div>
        {items.length ? <div className="grid gap-3">{items.map((item) => <Card key={item.announcementId}><CardContent className="p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge variant={statusVariant(item.status)}>{item.status}</Badge><Badge variant="neutral">{audienceLabels[item.audienceType]}</Badge><span className="text-xs text-muted-foreground">{item.locale}</span></div><h3 className="mt-3 font-semibold">{item.title}</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{item.bodyText}</p><p className="mt-3 text-xs text-muted-foreground">{item.propertyName ?? "Organization-wide"} · {item.deliveryCount} deliveries · v{item.version}</p></div>{item.status === "draft" || item.status === "scheduled" ? <div className="flex shrink-0 gap-2"><Button type="button" size="sm" variant="outline" disabled={activeAction === item.announcementId} onClick={() => publishDraft(item)}><Megaphone className="h-4 w-4" />Publish</Button><Button type="button" size="sm" variant="ghost" disabled={activeAction === item.announcementId} onClick={() => cancelDraft(item)}><X className="h-4 w-4" />Cancel</Button></div> : null}</div></CardContent></Card>)}</div> : <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No announcements yet.</CardContent></Card>}
      </section>
    </div>
  );
}
