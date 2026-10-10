"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, EyeOff, ImagePlus, Link2, Pause, RotateCcw, Search, Send, XCircle } from "lucide-react";
import { z } from "zod";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { exactMoneyMinor } from "@/lib/validation/homeowner-lease";
import type { ListingPhotoOption, RentalListingRow } from "@/lib/data/rental-listings";

type FormState = {
  title: string; summary: string; rentAmount: string; availableOn: string;
  leaseTermText: string; petsText: string; utilitiesText: string; parkingText: string;
};
type ListingResponse = {
  listingId: string; publicId: string; status: RentalListingRow["status"];
  visibility: "unlisted" | "discoverable"; version: number; photoCount?: number; previousPublicId?: string;
  discoveredAt?: string | null;
};
class RequestFailure extends Error {
  constructor(message: string, public status: number) { super(message); }
}
async function jsonRequest(url: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body: unknown = await response.json();
  if (!response.ok) {
    const message = typeof body === "object" && body && "error" in body ? String(body.error) : "The request could not be completed.";
    throw new RequestFailure(message, response.status);
  }
  return body;
}

const responseSchema = z.object({
  listingId: z.uuid(), publicId: z.uuid(),
  status: z.enum(["draft", "published", "paused", "closed"]),
  visibility: z.enum(["unlisted", "discoverable"]), version: z.number().int().positive(),
  photoCount: z.number().int().nonnegative().optional(), previousPublicId: z.uuid().optional(),
  discoveredAt: z.string().nullable().optional(),
});
const imageTypes = ["image/png", "image/jpeg"];

function initialForm(listing: RentalListingRow | null, unitName: string): FormState {
  return {
    title: listing?.title ?? unitName,
    summary: listing?.summary ?? "",
    rentAmount: listing ? (listing.rent_amount_minor / 100).toFixed(2) : "",
    availableOn: listing?.available_on ?? "",
    leaseTermText: listing?.lease_term_text ?? "",
    petsText: listing?.pets_text ?? "",
    utilitiesText: listing?.utilities_text ?? "",
    parkingText: listing?.parking_text ?? "",
  };
}

export function RentalListingForm({
  organizationId, unitId, unitName, currencyCode, initialListing, initialPhotos, shareOrigin, disabled,
}: {
  organizationId: string; unitId: string; unitName: string; currencyCode: string;
  initialListing: RentalListingRow | null; initialPhotos: ListingPhotoOption[];
  shareOrigin: string; disabled: boolean;
}) {
  const [form, setForm] = useState(() => initialForm(initialListing, unitName));
  const [listing, setListing] = useState(initialListing);
  const [photos, setPhotos] = useState(initialPhotos);
  const [selectedIds, setSelectedIds] = useState(() => new Set(initialPhotos.filter((photo) => photo.attached).map((photo) => photo.versionId)));
  const [altText, setAltText] = useState<Record<string, string>>(() => Object.fromEntries(initialPhotos.map((photo) => [photo.versionId, photo.altText])));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState<"save" | "status" | "rotate" | "visibility" | null>(null);
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const operationRef = useRef<{ key: string; body: unknown } | null>(null);
  const statusOperationRef = useRef<{ key: string; body: unknown; status: "published" | "paused" | "closed" } | null>(null);
  const rotateOperationRef = useRef<{ key: string; body: unknown } | null>(null);
  const visibilityOperationRef = useRef<{ key: string; body: unknown; visibility: "unlisted" | "discoverable" } | null>(null);
  const versionRef = useRef(initialListing?.version ?? 0);
  const shareUrl = listing ? `${shareOrigin}/l/${listing.public_id}` : null;
  const interactionLocked = disabled || busy || uncertain !== null;

  function edit<K extends keyof FormState>(key: K, value: FormState[K]) {
    if (uncertain) return;
    operationRef.current = null;
    statusOperationRef.current = null;
    rotateOperationRef.current = null;
    visibilityOperationRef.current = null;
    setForm((current) => ({ ...current, [key]: value }));
    setDirty(true); setError(null); setMessage(null);
  }
  function togglePhoto(versionId: string) {
    if (uncertain) return;
    operationRef.current = null;
    statusOperationRef.current = null;
    rotateOperationRef.current = null;
    visibilityOperationRef.current = null;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(versionId)) next.delete(versionId); else next.add(versionId);
      return next;
    });
    setDirty(true); setError(null); setMessage(null);
  }
  function applyResult(result: ListingResponse) {
    versionRef.current = result.version;
    setListing((current) => ({
      ...(current ?? {
        id: result.listingId, organization_id: organizationId, property_id: "", unit_id: unitId,
        title: form.title, summary: form.summary, rent_amount_minor: exactMoneyMinor(form.rentAmount) ?? 0,
        currency_code: currencyCode, available_on: form.availableOn, lease_term_text: form.leaseTermText,
        pets_text: form.petsText, utilities_text: form.utilitiesText, parking_text: form.parkingText,
        published_at: null, discovered_at: null,
      }),
      id: result.listingId, public_id: result.publicId, status: result.status,
      visibility: result.visibility, version: result.version,
      discovered_at: result.discoveredAt ?? null,
      title: form.title, summary: form.summary,
      rent_amount_minor: exactMoneyMinor(form.rentAmount) ?? 0, available_on: form.availableOn,
      lease_term_text: form.leaseTermText, pets_text: form.petsText,
      utilities_text: form.utilitiesText, parking_text: form.parkingText,
    }));
  }
  function cleanSelectedPhotos() {
    return photos.filter((photo) => selectedIds.has(photo.versionId) && photo.status === "clean");
  }
  function saveBody() {
    const rentAmountMinor = exactMoneyMinor(form.rentAmount);
    if (rentAmountMinor === null || rentAmountMinor < 0) throw new Error("Enter rent with no more than two decimal places.");
    if (!form.title.trim()) throw new Error("Add a title for this rental.");
    if (!z.iso.date().safeParse(form.availableOn).success) throw new Error("Choose a valid available date.");
    return {
      organizationId, unitId, expectedVersion: versionRef.current,
      details: {
        title: form.title.trim(), summary: form.summary, rentAmountMinor, availableOn: form.availableOn,
        leaseTermText: form.leaseTermText, petsText: form.petsText,
        utilitiesText: form.utilitiesText, parkingText: form.parkingText, visibility: "unlisted",
        photos: cleanSelectedPhotos().map((photo) => ({
          documentVersionId: photo.versionId, altText: altText[photo.versionId] ?? "",
        })),
      },
    };
  }

  async function saveDraft() {
    if (disabled || busy || (uncertain !== null && uncertain !== "save")) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const body = saveBody();
      operationRef.current ??= { key: crypto.randomUUID(), body };
      const operation = operationRef.current;
      const result = responseSchema.parse(await jsonRequest("/api/v1/rental-listings", {
        method: "POST", headers: { "content-type": "application/json", "idempotency-key": operation.key },
        body: JSON.stringify(operation.body),
      }));
      applyResult(result);
      operationRef.current = null;
      setUncertain(null);
      setDirty(false);
      setMessage("Listing draft saved. It is not public until you publish it.");
    } catch (caught) {
      const definite = caught instanceof RequestFailure && caught.status < 500;
      if (definite) {
        operationRef.current = null;
        setUncertain(null);
      } else {
        setUncertain("save");
      }
      setError(definite
        ? (caught instanceof Error ? caught.message : "The listing could not be saved.")
        : "Crecy could not confirm the save result. Use the recovery action below to retry the exact same request.");
    } finally { setBusy(false); }
  }

  async function changeStatus(status: "published" | "paused" | "closed") {
    if (disabled || busy || dirty || !listing || (uncertain !== null && uncertain !== "status")) return;
    if (!statusOperationRef.current) {
      if (status === "closed" && !window.confirm("Close this listing permanently? The share link will stop working.")) return;
      statusOperationRef.current = {
        key: crypto.randomUUID(),
        status,
        body: { organizationId, listingId: listing.id, expectedVersion: versionRef.current, status },
      };
    } else if (statusOperationRef.current.status !== status) {
      return;
    }
    const operation = statusOperationRef.current;
    setBusy(true); setError(null); setMessage(null);
    try {
      const result = responseSchema.parse(await jsonRequest("/api/v1/rental-listings/status", {
        method: "POST", headers: { "content-type": "application/json", "idempotency-key": operation.key },
        body: JSON.stringify(operation.body),
      }));
      applyResult(result);
      statusOperationRef.current = null;
      setUncertain(null);
      setMessage(status === "published"
        ? "Listing published as unlisted/shareable. It is not in Crecy marketplace search."
        : status === "paused" ? "Listing paused. The share link no longer opens the listing."
        : "Listing closed. Its share link no longer opens the listing.");
      if (status === "closed") router.refresh();
    } catch (caught) {
      const definite = caught instanceof RequestFailure && caught.status < 500;
      if (definite) {
        statusOperationRef.current = null;
        setUncertain(null);
      } else {
        setUncertain("status");
      }
      setError(definite
        ? (caught instanceof Error ? caught.message : "The listing status could not be changed.")
        : "Crecy could not confirm the status result. Use the recovery action below to retry the exact same request.");
    } finally { setBusy(false); }
  }

  async function rotateLink() {
    if (disabled || busy || dirty || !listing || listing.status === "closed"
      || (uncertain !== null && uncertain !== "rotate")) return;
    if (!rotateOperationRef.current) {
      if (!window.confirm("Replace this share link? Anyone using the old link will lose access.")) return;
      rotateOperationRef.current = {
        key: crypto.randomUUID(),
        body: { organizationId, listingId: listing.id, expectedVersion: versionRef.current },
      };
    }
    const operation = rotateOperationRef.current;
    setBusy(true); setError(null); setMessage(null);
    try {
      const result = responseSchema.parse(await jsonRequest("/api/v1/rental-listings/rotate", {
        method: "POST", headers: { "content-type": "application/json", "idempotency-key": operation.key },
        body: JSON.stringify(operation.body),
      }));
      applyResult(result);
      rotateOperationRef.current = null;
      setUncertain(null);
      setMessage("Share link replaced. The previous URL no longer resolves.");
    } catch (caught) {
      const definite = caught instanceof RequestFailure && caught.status < 500;
      if (definite) {
        rotateOperationRef.current = null;
        setUncertain(null);
      } else {
        setUncertain("rotate");
      }
      setError(definite
        ? (caught instanceof Error ? caught.message : "The share link could not be replaced.")
        : "Crecy could not confirm the link replacement. Use the recovery action below to retry the exact same request.");
    } finally { setBusy(false); }
  }

  async function changeVisibility(visibility: "unlisted" | "discoverable") {
    if (disabled || busy || dirty || !listing || listing.status !== "published"
      || (uncertain !== null && uncertain !== "visibility")) return;
    if (!visibilityOperationRef.current) {
      visibilityOperationRef.current = {
        key: crypto.randomUUID(),
        visibility,
        body: { organizationId, listingId: listing.id, expectedVersion: versionRef.current, visibility },
      };
    } else if (visibilityOperationRef.current.visibility !== visibility) {
      return;
    }
    const operation = visibilityOperationRef.current;
    setBusy(true); setError(null); setMessage(null);
    try {
      const result = responseSchema.parse(await jsonRequest("/api/v1/rental-listings/visibility", {
        method: "POST", headers: { "content-type": "application/json", "idempotency-key": operation.key },
        body: JSON.stringify(operation.body),
      }));
      applyResult(result);
      visibilityOperationRef.current = null;
      setUncertain(null);
      setMessage(visibility === "discoverable"
        ? "Listing added to Crecy discovery. Renters can now find it in Crecy search."
        : "Listing removed from Crecy discovery. The direct share link still works.");
    } catch (caught) {
      const definite = caught instanceof RequestFailure && caught.status < 500;
      if (definite) {
        visibilityOperationRef.current = null;
        setUncertain(null);
      } else {
        setUncertain("visibility");
      }
      setError(definite
        ? (caught instanceof Error ? caught.message : "Discovery could not be changed.")
        : "Crecy could not confirm the discovery change. Retry the exact same action.");
    } finally { setBusy(false); }
  }

  async function uploadPhoto() {
    const file = fileRef.current?.files?.[0];
    if (disabled || busy || uncertain || !file) return;
    if (!imageTypes.includes(file.type) || file.size <= 0 || file.size > 25 * 1024 * 1024) {
      setError("Choose a PNG or JPEG photo up to 25 MB."); return;
    }
    setBusy(true); setError(null); setMessage(null);
    try {
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const checksum = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      const grant = z.object({ grantId: z.uuid(), uploadUrl: z.url(), storagePath: z.string().min(1) })
        .parse(await jsonRequest("/api/v1/documents/upload-grants", {
          method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
          body: JSON.stringify({
            organizationId, parent: { type: "unit", id: unitId }, documentType: "rental_listing_photo",
            title: `Listing photo — ${file.name}`.slice(0, 200),
            originalFilename: file.name, mimeType: file.type, sizeBytes: file.size,
          }),
        }));
      const token = new URL(grant.uploadUrl).searchParams.get("token");
      if (!token) throw new Error("The private upload could not be prepared.");
      const uploaded = await createClient().storage.from("private-documents")
        .uploadToSignedUrl(grant.storagePath, token, file, { contentType: file.type });
      if (uploaded.error) throw uploaded.error;
      const finalized = z.object({ documentId: z.uuid(), versionId: z.uuid() })
        .parse(await jsonRequest("/api/v1/documents/finalize", {
          method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
          body: JSON.stringify({ grantId: grant.grantId, sha256Hex: checksum }),
        }));
      setPhotos((current) => [{
        versionId: finalized.versionId, documentId: finalized.documentId, status: "quarantined",
        originalFilename: file.name, mimeType: file.type, uploadedAt: new Date().toISOString(),
        altText: "", sortOrder: null, attached: false,
      }, ...current]);
      if (fileRef.current) fileRef.current.value = "";
      setMessage("Photo received. Wait for malware scanning before selecting it for the listing.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The photo upload could not be confirmed.");
    } finally { setBusy(false); }
  }

  const pendingDocumentIds = [...new Set(
    photos.filter((photo) => !["clean", "rejected"].includes(photo.status)).map((photo) => photo.documentId),
  )].sort().join(",");

  useEffect(() => {
    if (disabled || !pendingDocumentIds) return;
    let stopped = false; let attempts = 0;
    const ids = pendingDocumentIds.split(",");
    const poll = async () => {
      if (stopped || ++attempts > 60) return;
      try {
        const result = z.object({ versions: z.array(z.object({
          documentId: z.uuid(), uploadStatus: z.string(), filename: z.string().nullable(),
        })) }).parse(await (await fetch(`/api/v1/documents/scan-status?ids=${encodeURIComponent(ids.join(","))}`, { cache: "no-store" })).json());
        const statuses = new Map(result.versions.map((row) => [row.documentId, row.uploadStatus]));
        if (!stopped) {
          setPhotos((current) => {
            let changed = false;
            const next = current.map((photo) => {
              const status = statuses.get(photo.documentId) ?? photo.status;
              if (status !== photo.status) changed = true;
              return status === photo.status ? photo : { ...photo, status };
            });
            return changed ? next : current;
          });
        }
      } catch { /* Manual save remains available; a poll failure never mutates the listing. */ }
    };
    void poll();
    const timer = setInterval(poll, 5000);
    return () => { stopped = true; clearInterval(timer); };
  }, [disabled, pendingDocumentIds]);

  const selectedCleanCount = cleanSelectedPhotos().length;
  const publishReady = Boolean(listing && !dirty && form.summary.trim().length >= 20 && selectedCleanCount >= 1);

  return (
    <div className="space-y-8">
      {disabled ? (
        <Alert>
          <AlertTitle>Listing preview only</AlertTitle>
          <AlertDescription>Connect and sign in to a self-managing workspace to save, upload or publish.</AlertDescription>
        </Alert>
      ) : null}
      {error ? <Alert variant="destructive"><AlertTitle>Listing not changed</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      {uncertain ? (
        <Alert>
          <AlertTitle>Confirm the previous operation before editing</AlertTitle>
          <AlertDescription>
            Crecy did not receive a definitive response. Retry the same {uncertain === "save" ? "save" : uncertain === "status" ? "status change" : uncertain === "rotate" ? "link replacement" : "discovery change"}; the original operation key is preserved.
          </AlertDescription>
        </Alert>
      ) : null}
      {message ? <Alert><AlertTitle>Listing update</AlertTitle><AlertDescription>{message}</AlertDescription></Alert> : null}

      {listing ? (
        <section className="rounded-xl border bg-card p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Share status</p>
              <p className="mt-1 text-lg font-semibold capitalize">{listing.status}</p>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                {listing.status === "published" && listing.visibility === "discoverable"
                  ? "Anyone with the link can view this listing, and renters can also find it in Crecy search."
                  : listing.status === "published"
                    ? "Anyone with the link can view this listing. It is not included in Crecy search."
                    : listing.status === "paused" ? "The saved listing is not viewable from its public link or search."
                    : listing.status === "closed" ? "This listing is closed permanently."
                    : "This draft is visible only inside your management workspace."}
              </p>
            </div>
            <span className="w-fit rounded-full border px-3 py-1.5 text-xs font-semibold">
              {listing.visibility === "discoverable" ? "Visible in Crecy search" : "Unlisted / shareable"}
            </span>
          </div>
          {shareUrl ? (
            <div className="mt-5 flex flex-col gap-2 border-t pt-4 sm:flex-row">
              <Input aria-label="Shareable listing URL" value={shareUrl} readOnly className="font-mono text-xs" />
              <Button type="button" variant="outline" disabled={interactionLocked} onClick={async () => {
                await navigator.clipboard.writeText(shareUrl); setMessage("Share link copied.");
              }}><Copy aria-hidden="true" className="h-4 w-4" />Copy</Button>
              <Button type="button" variant="outline" disabled={busy || dirty || listing.status === "closed" || (uncertain !== null && uncertain !== "rotate")} onClick={rotateLink}>
                <RotateCcw aria-hidden="true" className="h-4 w-4" />Replace link
              </Button>
            </div>
          ) : null}
          {listing.status === "published" ? (
            <div className="mt-4 flex flex-col gap-3 rounded-lg bg-muted/45 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-xl text-sm leading-6 text-muted-foreground">
                {listing.visibility === "discoverable"
                  ? "Crecy search is on for this listing. Removing it from discovery keeps the direct share link working."
                  : "Crecy search is off. Turn it on only when you want renters to discover this listing inside Crecy."}
              </p>
              <Button
                type="button"
                variant={listing.visibility === "discoverable" ? "outline" : "default"}
                disabled={disabled || busy || dirty || (uncertain !== null && uncertain !== "visibility")}
                onClick={() => changeVisibility(listing.visibility === "discoverable" ? "unlisted" : "discoverable")}
              >
                {listing.visibility === "discoverable"
                  ? <><EyeOff aria-hidden="true" className="h-4 w-4" />Remove from discovery</>
                  : <><Search aria-hidden="true" className="h-4 w-4" />Add to Crecy discovery</>}
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="space-y-5">
        <div>
          <h2 className="text-xl font-semibold">What renters will see</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Street address, postal code, tenant records and management data are never copied into the public listing.
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="listing-title">Listing title</Label>
            <Input id="listing-title" className="mt-2" value={form.title} maxLength={160} disabled={interactionLocked}
              onChange={(event) => edit("title", event.target.value)} />
          </div>
          <div>
            <Label htmlFor="listing-rent">Monthly rent ({currencyCode})</Label>
            <Input id="listing-rent" className="mt-2" inputMode="decimal" placeholder="1350.00" value={form.rentAmount}
              disabled={interactionLocked} onChange={(event) => edit("rentAmount", event.target.value)} />
          </div>
          <div>
            <Label htmlFor="listing-available">Available on</Label>
            <Input id="listing-available" className="mt-2" type="date" value={form.availableOn}
              disabled={interactionLocked} onChange={(event) => edit("availableOn", event.target.value)} />
          </div>
        </div>
        <div>
          <Label htmlFor="listing-summary">Description</Label>
          <Textarea id="listing-summary" className="mt-2 min-h-32" maxLength={3000} value={form.summary}
            disabled={interactionLocked} onChange={(event) => edit("summary", event.target.value)}
            placeholder="Describe the space, what makes it useful, and the expectations a renter should know before asking about it." />
          <p className="mt-2 text-xs text-muted-foreground">At least 20 characters are required to publish.</p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div><Label htmlFor="listing-lease-term">Lease term</Label><Input id="listing-lease-term" className="mt-2"
            value={form.leaseTermText} maxLength={500} disabled={interactionLocked}
            onChange={(event) => edit("leaseTermText", event.target.value)} placeholder="12-month lease preferred" /></div>
          <div><Label htmlFor="listing-pets">Pets</Label><Input id="listing-pets" className="mt-2"
            value={form.petsText} maxLength={500} disabled={interactionLocked}
            onChange={(event) => edit("petsText", event.target.value)} placeholder="Ask about pets" /></div>
          <div><Label htmlFor="listing-utilities">Utilities</Label><Textarea id="listing-utilities" className="mt-2"
            value={form.utilitiesText} maxLength={1000} disabled={interactionLocked}
            onChange={(event) => edit("utilitiesText", event.target.value)} /></div>
          <div><Label htmlFor="listing-parking">Parking</Label><Textarea id="listing-parking" className="mt-2"
            value={form.parkingText} maxLength={1000} disabled={interactionLocked}
            onChange={(event) => edit("parkingText", event.target.value)} /></div>
        </div>
      </section>

      <section className="space-y-5 border-t pt-7">
        <div>
          <h2 className="text-xl font-semibold">Listing photos</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Photos stay in Crecy&apos;s private document bucket. Only scanner-clean versions you select are used by the share page.
          </p>
        </div>
        <div className="flex flex-col gap-3 rounded-xl border bg-muted/25 p-4 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <Label htmlFor="listing-photo-upload">Add a PNG or JPEG</Label>
            <Input ref={fileRef} id="listing-photo-upload" type="file" accept="image/png,image/jpeg"
              className="mt-2" disabled={interactionLocked} />
          </div>
          <Button type="button" variant="outline" disabled={interactionLocked} onClick={uploadPhoto}>
            <ImagePlus aria-hidden="true" className="h-4 w-4" />Upload securely
          </Button>
        </div>
        {photos.length ? (
          <div className="divide-y rounded-xl border">
            {photos.map((photo) => {
              const clean = photo.status === "clean";
              return (
                <div key={photo.versionId} className="grid gap-3 p-4 sm:grid-cols-[auto_1fr]">
                  <input type="checkbox" aria-label={`Use ${photo.originalFilename}`} className="mt-1 h-4 w-4 accent-primary"
                    checked={selectedIds.has(photo.versionId)} disabled={interactionLocked || !clean}
                    onChange={() => togglePhoto(photo.versionId)} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold">{photo.originalFilename}</p>
                      <span className="rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize">
                        {photo.status === "quarantined" ? "scan pending" : photo.status}
                      </span>
                    </div>
                    {selectedIds.has(photo.versionId) ? (
                      <div className="mt-3">
                        <Label htmlFor={`alt-${photo.versionId}`}>Photo description</Label>
                        <Input id={`alt-${photo.versionId}`} className="mt-2" maxLength={240}
                          value={altText[photo.versionId] ?? ""} disabled={interactionLocked}
                          onChange={(event) => {
                            operationRef.current = null;
                            setAltText((current) => ({ ...current, [photo.versionId]: event.target.value }));
                            setDirty(true);
                          }} placeholder="Private entrance and front walkway" />
                      </div>
                    ) : !clean ? <p className="mt-2 text-xs text-muted-foreground">This photo cannot be published until scanning finishes cleanly.</p> : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">No listing photos uploaded yet.</p>}
      </section>

      <section className="border-t pt-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Save before publishing</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Saving keeps the listing private. Publishing turns on only the unlisted share URL.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={disabled || busy || listing?.status === "closed" || (uncertain !== null && uncertain !== "save")} onClick={saveDraft}>
              Save draft
            </Button>
            {listing?.status === "published" ? (
              <Button type="button" variant="outline" disabled={disabled || busy || dirty || (uncertain !== null && uncertain !== "status")} onClick={() => changeStatus("paused")}>
                <Pause aria-hidden="true" className="h-4 w-4" />Pause
              </Button>
            ) : listing && listing.status !== "closed" ? (
              <Button type="button" disabled={disabled || busy || !publishReady || (uncertain !== null && uncertain !== "status")} onClick={() => changeStatus("published")}>
                <Send aria-hidden="true" className="h-4 w-4" />Publish share link
              </Button>
            ) : null}
            {listing && listing.status !== "closed" ? (
              <Button type="button" variant="outline" disabled={disabled || busy || dirty || (uncertain !== null && uncertain !== "status")} onClick={() => changeStatus("closed")}>
                <XCircle aria-hidden="true" className="h-4 w-4" />Close listing
              </Button>
            ) : null}
          </div>
        </div>
        {listing && !dirty && selectedCleanCount < 1 && listing.status !== "closed" ? (
          <p className="mt-4 text-sm text-muted-foreground">Select at least one scanner-clean photo before publishing.</p>
        ) : null}
        {listing?.status === "published" && shareUrl ? (
          <p className="mt-4 text-sm text-muted-foreground">
            <Link2 aria-hidden="true" className="mr-1 inline h-4 w-4" />
            This URL is shareable, not private. Anyone who receives it can view the published listing.
          </p>
        ) : null}
      </section>
    </div>
  );
}
