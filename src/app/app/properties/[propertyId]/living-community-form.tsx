"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ExternalLink,
  ImageIcon,
  LoaderCircle,
  Save,
  Send,
} from "lucide-react";
import type { OperatorLivingCommunityProfile } from "@/lib/data/living-community";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const lines = (value: string) =>
  value.split("\n").map((item) => item.trim()).filter(Boolean);

export function LivingCommunityForm({
  propertyId,
  propertyName,
  profile,
  disabled,
}: {
  propertyId: string;
  propertyName: string;
  profile: OperatorLivingCommunityProfile | null;
  disabled: boolean;
}) {
  const router = useRouter();
  const [subdomain, setSubdomain] = useState(profile?.subdomain ?? "");
  const [displayName, setDisplayName] = useState(profile?.displayName ?? propertyName);
  const [publicAddressText, setPublicAddressText] = useState(profile?.publicAddressText ?? "");
  const [headline, setHeadline] = useState(profile?.headline ?? "Welcome home.");
  const [leasingEmail, setLeasingEmail] = useState(profile?.leasingEmail ?? "");
  const [leasingPhoneE164, setLeasingPhoneE164] = useState(profile?.leasingPhoneE164 ?? "");
  const [officeHours, setOfficeHours] = useState(profile?.officeHours.join("\n") ?? "");
  const [amenities, setAmenities] = useState(profile?.amenities.join("\n") ?? "");
  const [noticeTitle, setNoticeTitle] = useState(profile?.publicNoticeTitle ?? "");
  const [noticeBody, setNoticeBody] = useState(profile?.publicNoticeBody ?? "");
  const [status, setStatus] = useState<"draft" | "published" | "archived">(profile?.status ?? "draft");
  const [version, setVersion] = useState(profile?.version ?? 0);
  const [pending, setPending] = useState<"draft" | "published" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  const previewUrl = subdomain.trim()
    ? "https://" + subdomain.trim().toLowerCase() + ".crecyliving.com/login"
    : null;

  async function save(nextStatus: "draft" | "published") {
    if (disabled || pending) return;
    setPending(nextStatus);
    setError(null);
    setSaved(null);
    idempotencyKey.current ??= crypto.randomUUID();

    try {
      const response = await fetch("/api/v1/living-community-profile", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey.current,
        },
        body: JSON.stringify({
          propertyId,
          subdomain,
          displayName,
          publicAddressText,
          headline,
          leasingEmail,
          leasingPhoneE164,
          officeHours: lines(officeHours),
          amenities: lines(amenities),
          publicNoticeTitle: noticeTitle,
          publicNoticeBody: noticeBody,
          status: nextStatus,
          expectedVersion: version,
        }),
      });

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        idempotencyKey.current = null;
        setError(typeof body?.error === "string" ? body.error : "The resident portal settings could not be saved.");
        return;
      }

      setVersion(Number(body.version ?? version + 1));
      setStatus(nextStatus);
      setSaved(nextStatus === "published" ? "Resident portal published." : "Draft saved.");
      idempotencyKey.current = null;
      router.refresh();
    } catch {
      idempotencyKey.current = null;
      setError("The resident portal settings could not be saved.");
    } finally {
      setPending(null);
    }
  }

  const media = [
    ["Hero", profile?.heroImageUrl],
    ["Lobby", profile?.lobbyImageUrl],
    ["Courtyard", profile?.courtyardImageUrl],
    ["Model home", profile?.modelHomeImageUrl],
  ] as const;

  return (
    <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.15fr)_minmax(330px,.85fr)]">
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="living-display-name">Community name</Label>
            <Input
              id="living-display-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={160}
              disabled={disabled}
              className="mt-2"
            />
          </div>
          <div>
            <Label htmlFor="living-subdomain">Crecy Living address</Label>
            <div className="mt-2 flex rounded-md border border-input bg-card shadow-xs focus-within:ring-2 focus-within:ring-ring/30">
              <Input
                id="living-subdomain"
                value={subdomain}
                onChange={(event) => setSubdomain(event.target.value.toLowerCase())}
                maxLength={63}
                disabled={disabled}
                placeholder="oak-residences"
                className="border-0 shadow-none focus-visible:ring-0"
              />
              <span className="flex items-center border-l px-3 text-xs text-muted-foreground">.crecyliving.com</span>
            </div>
          </div>
        </div>

        <div>
          <Label htmlFor="living-headline">Resident welcome line</Label>
          <Input
            id="living-headline"
            value={headline}
            onChange={(event) => setHeadline(event.target.value)}
            maxLength={160}
            disabled={disabled}
            className="mt-2"
          />
        </div>

        <div>
          <Label htmlFor="living-address">Public community address</Label>
          <Input
            id="living-address"
            value={publicAddressText}
            onChange={(event) => setPublicAddressText(event.target.value)}
            maxLength={300}
            disabled={disabled}
            placeholder="101 Example Avenue, Richmond, VA 23220"
            className="mt-2"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">Only the address written here is exposed on the public login surface.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="living-email">Leasing email</Label>
            <Input
              id="living-email"
              type="email"
              value={leasingEmail}
              onChange={(event) => setLeasingEmail(event.target.value)}
              disabled={disabled}
              className="mt-2"
            />
          </div>
          <div>
            <Label htmlFor="living-phone">Leasing phone</Label>
            <Input
              id="living-phone"
              value={leasingPhoneE164}
              onChange={(event) => setLeasingPhoneE164(event.target.value)}
              disabled={disabled}
              placeholder="+15405551234"
              className="mt-2"
            />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <Label htmlFor="living-office-hours">Office hours</Label>
            <Textarea
              id="living-office-hours"
              value={officeHours}
              onChange={(event) => setOfficeHours(event.target.value)}
              disabled={disabled}
              placeholder={"Mon–Fri · 9:00 AM–6:00 PM\nSat · 10:00 AM–4:00 PM"}
              className="mt-2 min-h-32"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">One public line per row.</p>
          </div>
          <div>
            <Label htmlFor="living-amenities">Featured amenities</Label>
            <Textarea
              id="living-amenities"
              value={amenities}
              onChange={(event) => setAmenities(event.target.value)}
              disabled={disabled}
              placeholder={"Resident lounge\nFitness center\nPackage lockers"}
              className="mt-2 min-h-32"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">One amenity per row. Keep this to the spaces residents actually use.</p>
          </div>
        </div>

        <div className="border-t pt-5">
          <p className="text-sm font-semibold">Public notice</p>
          <p className="mt-1 text-xs text-muted-foreground">Optional community-level information shown before or after sign-in.</p>
          <div className="mt-4 space-y-4">
            <Input
              aria-label="Public notice title"
              value={noticeTitle}
              onChange={(event) => setNoticeTitle(event.target.value)}
              disabled={disabled}
              placeholder="Pool maintenance"
              maxLength={160}
            />
            <Textarea
              aria-label="Public notice body"
              value={noticeBody}
              onChange={(event) => setNoticeBody(event.target.value)}
              disabled={disabled}
              placeholder="The pool will be closed Saturday from 8 AM to 1 PM."
              maxLength={2000}
              className="min-h-24"
            />
          </div>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Resident portal not saved</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {saved ? (
          <Alert variant="success">
            <CheckCircle2 aria-hidden="true" className="h-5 w-5" />
            <AlertTitle>{saved}</AlertTitle>
            <AlertDescription>Version {version}. The published community surface uses only the public-safe projection.</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 border-t pt-5">
          <Button type="button" variant="outline" disabled={disabled || Boolean(pending)} onClick={() => save("draft")}>
            {pending === "draft" ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Save aria-hidden="true" className="h-4 w-4" />}
            {pending === "draft" ? "Saving…" : "Save draft"}
          </Button>
          <Button type="button" disabled={disabled || Boolean(pending)} onClick={() => save("published")}>
            {pending === "published" ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Send aria-hidden="true" className="h-4 w-4" />}
            {pending === "published" ? "Publishing…" : status === "published" ? "Publish changes" : "Publish resident portal"}
          </Button>
          <Badge variant={status === "published" ? "success" : "neutral"}>{status}</Badge>
        </div>
      </div>

      <aside className="space-y-5">
        <div className="overflow-hidden rounded-[1rem] border bg-card">
          <div className="border-b px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Resident portal preview</p>
                <p className="mt-1 text-xs text-muted-foreground">Public identity only — no resident data.</p>
              </div>
              {previewUrl && status === "published" ? (
                <Button asChild variant="ghost" size="sm">
                  <a href={previewUrl} target="_blank" rel="noreferrer">
                    Open <ExternalLink aria-hidden="true" className="h-4 w-4" />
                  </a>
                </Button>
              ) : null}
            </div>
          </div>

          <div className="p-5">
            <div className="overflow-hidden rounded-[0.9rem] bg-[#0b3427] text-white">
              <div className="relative aspect-[16/10] bg-[linear-gradient(135deg,#087f55,#064e3b)]">
                {profile?.heroImageUrl ? (
                  <Image src={profile.heroImageUrl} alt="" fill sizes="360px" className="object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <ImageIcon aria-hidden="true" className="h-7 w-7 text-white/45" />
                  </div>
                )}
                <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_45%,rgba(4,18,14,.76))]" />
                <div className="absolute inset-x-0 bottom-0 p-4">
                  <p className="text-lg font-semibold">{displayName || propertyName}</p>
                  <p className="mt-1 text-xs text-white/75">{publicAddressText || "Resident portal"}</p>
                </div>
              </div>
            </div>
            <p className="mt-4 break-all text-xs text-muted-foreground">
              {previewUrl ?? "Choose a community address to create the Living URL."}
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-[1rem] border bg-card">
          <div className="border-b px-5 py-4">
            <p className="text-sm font-semibold">Community media</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Media is intentionally managed separately from public text and publishing.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-px bg-border">
            {media.map(([label, src]) => (
              <div key={label} className="bg-card p-3">
                <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-muted">
                  {src ? (
                    <Image src={src} alt="" fill sizes="180px" className="object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <ImageIcon aria-hidden="true" className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <p className="mt-2 text-xs font-medium">{label}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{src ? "Assigned" : "Not assigned"}</p>
              </div>
            ))}
          </div>
          <div className="border-t px-5 py-4">
            <p className="text-xs leading-5 text-muted-foreground">
              Upload and replacement controls will activate through Crecy-managed storage; raw third-party image URLs are never accepted.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
