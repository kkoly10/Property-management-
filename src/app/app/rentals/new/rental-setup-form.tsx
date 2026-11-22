"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { homeownerRentalSchema, rentalOperationKeySchema, spaceTypes, type HomeownerRentalInput } from "@/lib/validation/homeowner-rental";
import type { RentalWorkspace } from "@/lib/data/homeowner-rentals";

type Attempt = { key: string; payload: HomeownerRentalInput };
function Field({ name, label, required = false, defaultValue, maxLength = 200 }: { name: string; label: string; required?: boolean; defaultValue?: string; maxLength?: number }) {
  return <div className="space-y-2"><Label htmlFor={name}>{label}</Label><Input id={name} name={name} required={required} defaultValue={defaultValue} maxLength={maxLength} /></div>;
}
function readAttempt(storageKey: string, organizationId: string): Attempt | null {
  const raw = sessionStorage.getItem(storageKey);
  if (!raw) return null;
  const envelope = JSON.parse(raw) as { key?: unknown; payload?: unknown };
  const payload = homeownerRentalSchema.safeParse(envelope?.payload);
  const key = rentalOperationKeySchema.safeParse(envelope?.key);
  if (!payload.success || !key.success || payload.data.organizationId !== organizationId) throw new Error("The saved request is invalid. Check My rentals before starting again.");
  return { key: key.data, payload: payload.data };
}
export function RentalSetupForm({ workspace }: { workspace: RentalWorkspace }) {
  const router = useRouter();
  const [propertyId, setPropertyId] = useState("");
  const [bookId, setBookId] = useState("");
  const [review, setReview] = useState<Attempt | null>(null);
  const [locked, setLocked] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const disabled = workspace.mode !== "ready" || !workspace.actorId || !workspace.organization;
  const organizationId = workspace.organization?.organizationId ?? "";
  const storageKey = `crecy:rental-setup:${workspace.actorId}:${organizationId}`;
  const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
  function restore() {
    if (disabled) return;
    try {
      const saved = readAttempt(storageKey, organizationId);
      if (!saved) { setError("No pending request is saved in this browser tab."); return; }
      setReview(saved); setLocked(true); setError("This earlier submission has an unconfirmed result. Retry the same request safely, or check My rentals.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Saved request unavailable."); }
  }
  function prepare(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || inFlight.current) return;
    setError(null);
    try {
      const saved = readAttempt(storageKey, organizationId);
      if (saved) { setReview(saved); setLocked(true); setError("Resolve your earlier submission before creating another rental."); return; }
      const form = new FormData(event.currentTarget);
      const property = propertyId ? { kind: "existing", propertyId } : {
        kind: "new", accountingBookId: bookId || null,
        legalName: text(form, "legalName"), entityType: text(form, "entityType") || "individual",
        name: (text(form, "propertyName") || text(form, "addressLine1")).slice(0, 160),
        addressLine1: text(form, "addressLine1"), addressLine2: text(form, "addressLine2"),
        locality: text(form, "locality"), subdivisionCode: text(form, "subdivisionCode"),
        postalCode: text(form, "postalCode"), countryCode: text(form, "countryCode"), timeZone: text(form, "timeZone"),
      };
      const parsed = homeownerRentalSchema.safeParse({ organizationId, property, space: {
        name: text(form, "spaceName"), type: text(form, "spaceType"),
        bedrooms: text(form, "bedrooms") ? Number(text(form, "bedrooms")) : null,
        bathrooms: text(form, "bathrooms") ? Number(text(form, "bathrooms")) : null,
        entrance: text(form, "entrance"), kitchen: text(form, "kitchen"),
        bathroom: text(form, "bathroom"), laundry: text(form, "laundry"),
        utilitiesNotes: text(form, "utilitiesNotes"), parkingNotes: text(form, "parkingNotes"),
      } });
      if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check your details."); return; }
      setReview({ key: crypto.randomUUID(), payload: parsed.data });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "This browser cannot retain a safe retry. Enable session storage before submitting."); }
  }
  async function submit() {
    if (!review || disabled || inFlight.current) return;
    inFlight.current = true; setPending(true); setError(null);
    try {
      // Retain the exact submitted payload and key before any write, including across a reload.
      sessionStorage.setItem(storageKey, JSON.stringify(review));
      setLocked(true);
      const response = await fetch("/api/v1/homeowner-rentals", { method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": review.key },
        body: JSON.stringify(review.payload),
      });
      const result = await response.json() as { unitId?: string; error?: string };
      if (!response.ok) {
        if ([400, 401, 403, 422].includes(response.status)) { sessionStorage.removeItem(storageKey); setLocked(false); }
        throw new Error(result.error ?? "The result could not be confirmed. Retry the same request.");
      }
      if (!rentalOperationKeySchema.safeParse(result.unitId).success) throw new Error("The rental response is incomplete. Retry this same request.");
      sessionStorage.removeItem(storageKey);
      router.replace(`/app/rentals/${result.unitId}`); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The connection was interrupted. Retry this same request."); }
    finally { inFlight.current = false; setPending(false); }
  }

  return <form onSubmit={prepare} className="space-y-7">
    {disabled && <p className="rounded-lg border p-4 text-sm">Setup preview. Saving requires a signed-in self-managing workspace.</p>}
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">No listing, messages, or charges are created here.</p>
      <Button type="button" variant="ghost" size="sm" disabled={disabled || pending} onClick={restore}>Resume pending setup</Button></div>
    <fieldset disabled={pending || !!review} className="min-w-0 space-y-7">
      <section className="space-y-5 rounded-xl border bg-card p-5 sm:p-6"><h2 className="text-xl font-semibold">Where is the space?</h2>
        {workspace.properties.length > 0 && <div className="space-y-2"><Label htmlFor="propertyId">Property</Label><NativeSelect id="propertyId" value={propertyId} onChange={(event) => setPropertyId(event.target.value)}><option value="">Add a different property</option>{workspace.properties.map((property) => <option key={property.id} value={property.id}>{property.name} — {property.address_line1}</option>)}</NativeSelect><p className="text-sm text-muted-foreground">Choose an existing home when adding another room or basement there.</p></div>}
        {!propertyId && <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field name="addressLine1" label="Street address" required /></div>
          <Field name="addressLine2" label="Address line 2 (optional)" /><Field name="propertyName" label="Name for this home (optional)" maxLength={160} />
          <Field name="locality" label="City" required maxLength={100} /><Field name="subdivisionCode" label="State or province" required maxLength={100} />
          <Field name="postalCode" label="Postal code" required maxLength={30} />
          <div className="space-y-2"><Label htmlFor="countryCode">Country</Label><NativeSelect name="countryCode" id="countryCode" defaultValue={workspace.organization?.headquartersCountryCode ?? "US"}><option value="US">United States</option><option value="CA">Canada</option><option value="MX">Mexico</option></NativeSelect></div>
          <div className="sm:col-span-2"><Field name="timeZone" label="Property time zone" required defaultValue={workspace.organization?.defaultTimeZone ?? "America/New_York"} maxLength={80} /><p className="mt-2 text-sm text-muted-foreground">Confirm the rental’s local time zone, for example America/New_York. This controls local scheduling.</p></div>
        </div>}
      </section>
      {!propertyId && <section className="space-y-5 rounded-xl border bg-card p-5 sm:p-6"><h2 className="text-xl font-semibold">Who operates this rental?</h2>
        {workspace.books.length > 0 && <div className="space-y-2"><Label htmlFor="rentalAccount">Rental account</Label><NativeSelect id="rentalAccount" value={bookId} onChange={(event) => setBookId(event.target.value)}><option value="">Set up a new rental account</option>{workspace.books.map((book) => <option key={book.id} value={book.id}>{book.name} · {book.functional_currency_code}</option>)}</NativeSelect></div>}
        {!bookId && <div className="grid gap-4 sm:grid-cols-2"><Field name="legalName" label="Your full legal name or business name" required />
          <div className="space-y-2"><Label htmlFor="entityType">Operating as</Label><NativeSelect name="entityType" id="entityType" defaultValue="individual"><option value="individual">An individual</option><option value="sole_proprietor">A sole proprietor</option><option value="company">A company</option></NativeSelect></div></div>}
        <p className="text-sm leading-6 text-muted-foreground">Crecy uses these details to organize the rental’s records and currency. This does not connect a bank account or enable payments.</p>
      </section>}
      <section className="space-y-5 rounded-xl border bg-card p-5 sm:p-6"><h2 className="text-xl font-semibold">Describe the space</h2><div className="grid gap-4 sm:grid-cols-2">
        <Field name="spaceName" label="Rental name, such as Basement apartment" required maxLength={80} />
        <div className="space-y-2"><Label htmlFor="spaceType">Type of space</Label><NativeSelect id="spaceType" name="spaceType" defaultValue="basement">{spaceTypes.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</NativeSelect></div>
        {["bedrooms", "bathrooms"].map((name) => <div key={name} className="space-y-2"><Label htmlFor={name} className="capitalize">{name} (optional)</Label><Input name={name} id={name} type="number" min="0" max="50" step="0.5" /></div>)}
        {["entrance", "kitchen", "bathroom", "laundry"].map((name) => <div key={name} className="space-y-2"><Label htmlFor={name} className="capitalize">{name} access</Label><NativeSelect name={name} id={name} required defaultValue=""><option value="" disabled>Choose access</option><option value="private">Private</option><option value="shared">Shared</option><option value="none">Not provided</option></NativeSelect></div>)}
        <div className="sm:col-span-2"><Field name="utilitiesNotes" label="Utilities included or shared (optional)" maxLength={500} /></div>
        <div className="sm:col-span-2"><Field name="parkingNotes" label="Parking details (optional)" maxLength={500} /></div>
      </div></section>
      <Button type="submit" disabled={disabled} className="w-full sm:w-auto">Review rental setup</Button>
    </fieldset>
    {review && <section aria-label="Review rental setup" className="space-y-4 rounded-xl border border-primary/30 bg-card p-5 sm:p-6"><h2 className="text-xl font-semibold">Review before creating</h2>
      <dl className="space-y-2 text-sm"><div><dt className="text-muted-foreground">Rental</dt><dd className="break-words font-medium">{review.payload.space.name} · {review.payload.space.type.replaceAll("_", " ")}</dd></div>
        <div><dt className="text-muted-foreground">Property</dt><dd className="break-words">{review.payload.property.kind === "new" ? `${review.payload.property.addressLine1}, ${review.payload.property.locality} · ${review.payload.property.timeZone}` : workspace.properties.find((property) => property.id === (review.payload.property.kind === "existing" ? review.payload.property.propertyId : ""))?.address_line1 ?? "Existing property"}</dd></div>
        {["entrance", "kitchen", "bathroom", "laundry"].map((key) => <div key={key} className="flex justify-between gap-3"><dt className="capitalize text-muted-foreground">{key}</dt><dd>{review.payload.space[key as "entrance"]}</dd></div>)}</dl>
      <p className="text-sm leading-6 text-muted-foreground">This creates one rental space and any new property/account records together. It does not activate a lease or generate rent. You can add your existing renter next.</p>
      <div className="flex flex-wrap gap-3"><Button type="button" onClick={submit} disabled={pending || disabled}>{pending ? "Saving rental…" : locked ? "Retry the same request" : "Create my rental"}</Button><Button type="button" variant="outline" disabled={locked || pending} onClick={() => { setReview(null); setError(null); }}>Edit details</Button><Button asChild variant="ghost"><Link href="/app/rentals">Check my rentals</Link></Button></div>
    </section>}
    {error && <p role="alert" className="rounded-lg border border-destructive/40 p-4 text-sm">{error}</p>}
  </form>;
}
