"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, FileCheck2, History, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { LeasePropertyOption, LeaseUnitOption, SignedLeaseDocumentOption } from "@/lib/data/leasing";

type MemberDraft = { id: string; firstName: string; lastName: string; email: string; phoneE164: string; primaryContact: boolean; financiallyResponsible: boolean };
type LeaseDraft = {
  propertyId: string; unitId: string; householdName: string; members: MemberDraft[];
  source: "operator_supplied" | "imported"; externalReference: string; startDate: string; endDate: string;
  rentAmount: string; rentFrequency: "weekly" | "biweekly" | "monthly" | "quarterly" | "semiannual" | "annual" | "custom";
  signedDocumentId: string; openingBalance: string; firstChargeDueDate: string;
};
type ActivationResult = { householdId: string; leaseId: string; tenancyId: string; receivableAccountId: string; chargeScheduleId: string };

const emptyMember = (id: string): MemberDraft => ({ id, firstName: "", lastName: "", email: "", phoneE164: "", primaryContact: false, financiallyResponsible: false });

function moneyToMinor(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || !Number.isSafeInteger(Math.round(amount * 100))) return null;
  return Math.round(amount * 100);
}

export function ExistingLeaseForm({ properties, units, documents, initialPropertyId, disabled }: {
  properties: LeasePropertyOption[]; units: LeaseUnitOption[]; documents: SignedLeaseDocumentOption[]; initialPropertyId?: string; disabled: boolean;
}) {
  const initialProperty = properties.find((property) => property.id === initialPropertyId) ?? properties[0];
  const [draft, setDraft] = useState<LeaseDraft>({
    propertyId: initialProperty?.id ?? "", unitId: "", householdName: "", members: [{ ...emptyMember("primary"), primaryContact: true, financiallyResponsible: true }],
    source: "operator_supplied", externalReference: "", startDate: "", endDate: "", rentAmount: "", rentFrequency: "monthly",
    signedDocumentId: "", openingBalance: "0.00", firstChargeDueDate: "",
  });
  const [pending, setPending] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ActivationResult | null>(null);
  const idempotencyKey = useRef<string | null>(null);
  const dirty = useRef(false);

  useEffect(() => {
    if (dirty.current && !result) localStorage.setItem("crecy:existing-lease-draft", JSON.stringify(draft));
  }, [draft, result]);

  const selectedProperty = properties.find((property) => property.id === draft.propertyId);
  const availableUnits = units.filter((unit) => unit.propertyId === draft.propertyId);
  const availableDocuments = documents.filter((document) => document.propertyId === draft.propertyId && (!document.unitId || !draft.unitId || document.unitId === draft.unitId));

  function update(patch: Partial<LeaseDraft>) {
    dirty.current = true;
    idempotencyKey.current = null;
    setReviewing(false); setResult(null); setError(null); setDraft((current) => ({ ...current, ...patch }));
  }
  function updateMember(index: number, patch: Partial<MemberDraft>) {
    dirty.current = true;
    idempotencyKey.current = null;
    setReviewing(false);
    setDraft((current) => ({ ...current, members: current.members.map((member, memberIndex) => memberIndex === index ? { ...member, ...patch } : member) }));
  }
  function makePrimary(index: number) {
    dirty.current = true;
    idempotencyKey.current = null;
    setReviewing(false);
    setDraft((current) => ({ ...current, members: current.members.map((member, memberIndex) => ({ ...member, primaryContact: memberIndex === index })) }));
  }

  function resumeSavedDraft() {
    try {
      const saved = localStorage.getItem("crecy:existing-lease-draft");
      if (!saved) { setError("No saved lease draft is available in this browser."); return; }
      const parsed = JSON.parse(saved) as LeaseDraft;
      setDraft({ ...parsed, propertyId: initialPropertyId || parsed.propertyId, members: parsed.members.map((member) => ({ ...member, id: member.id || crypto.randomUUID() })) });
      setReviewing(false); setError(null); dirty.current = false; idempotencyKey.current = null;
    } catch {
      localStorage.removeItem("crecy:existing-lease-draft");
      setError("The saved draft could not be restored.");
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProperty || disabled) return;
    const rentAmountMinor = moneyToMinor(draft.rentAmount);
    const openingBalanceMinor = moneyToMinor(draft.openingBalance || "0");
    if (rentAmountMinor === null || rentAmountMinor < 0 || openingBalanceMinor === null) {
      setError("Enter valid rent and opening-balance amounts with no more than two decimal places."); return;
    }
    if (!reviewing) { setReviewing(true); return; }
    setPending(true); setError(null);
    idempotencyKey.current ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/v1/tenancies/activate-existing-lease", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey.current },
        body: JSON.stringify({
          organizationId: selectedProperty.organizationId, propertyId: draft.propertyId, unitId: draft.unitId,
          household: { displayName: draft.householdName, members: draft.members.map((member) => ({ firstName: member.firstName, lastName: member.lastName, email: member.email || undefined, phoneE164: member.phoneE164 || undefined, primaryContact: member.primaryContact, financiallyResponsible: member.financiallyResponsible })) },
          lease: { source: draft.source, externalReference: draft.externalReference || undefined, startDate: draft.startDate, endDate: draft.endDate || undefined, rentAmountMinor, currencyCode: selectedProperty.currencyCode, rentFrequency: draft.rentFrequency, signedDocumentId: draft.signedDocumentId },
          openingBalanceMinor, firstChargeDueDate: draft.firstChargeDueDate || undefined,
        }),
      });
      const body = await response.json() as ActivationResult & { error?: string };
      if (!response.ok) { idempotencyKey.current = null; throw new Error(body.error ?? "The tenancy could not be activated."); }
      setResult(body); localStorage.removeItem("crecy:existing-lease-draft");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The tenancy could not be activated.");
    } finally {
      setPending(false);
    }
  }

  if (result) return (
    <Card className="border-[#abefc6] bg-[#f6fef9]"><CardHeader><span className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-[#dcfae6] text-success"><CheckCircle2 className="h-6 w-6" /></span><CardTitle>Tenancy activated</CardTitle><CardDescription>The household, lease, receivable account, and recurring rent schedule committed together.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="rounded-lg border bg-white p-4 font-mono text-xs text-muted-foreground">Tenancy {result.tenancyId}</div><div className="flex flex-wrap gap-3"><Button asChild><Link href="/app/residents">View residents</Link></Button><Button variant="outline" onClick={() => window.location.reload()}>Record another lease</Button></div></CardContent></Card>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex justify-end"><Button type="button" size="sm" variant="outline" onClick={resumeSavedDraft}><History className="h-4 w-4" />Resume saved draft</Button></div>
      <Card><CardHeader><p className="font-mono text-xs font-semibold text-primary">01 · Home</p><CardTitle>Property and unit</CardTitle><CardDescription>The property book fixes the lease currency. An occupied unit cannot be activated twice.</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="lease-property">Property</Label><NativeSelect id="lease-property" required value={draft.propertyId} disabled={disabled || pending} onChange={(event) => update({ propertyId: event.target.value, unitId: "", signedDocumentId: "" })}><option value="" disabled>Select property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</NativeSelect></div>
        <div className="space-y-2"><Label htmlFor="lease-unit">Unit</Label><NativeSelect id="lease-unit" required value={draft.unitId} disabled={disabled || pending || !draft.propertyId} onChange={(event) => update({ unitId: event.target.value, signedDocumentId: "" })}><option value="" disabled>Select unit</option>{availableUnits.map((unit) => <option key={unit.id} value={unit.id}>Unit {unit.unitCode}</option>)}</NativeSelect></div>
      </CardContent></Card>

      <Card><CardHeader><div className="flex items-start justify-between gap-4"><div><p className="font-mono text-xs font-semibold text-primary">02 · Household</p><CardTitle className="mt-2">Resident household</CardTitle><CardDescription>Exactly one member must be the primary contact.</CardDescription></div><Button type="button" size="sm" variant="outline" disabled={pending || draft.members.length >= 12} onClick={() => update({ members: [...draft.members, emptyMember(crypto.randomUUID())] })}><Plus className="h-4 w-4" />Add member</Button></div></CardHeader><CardContent className="space-y-5">
        <div className="space-y-2"><Label htmlFor="household-name">Household display name</Label><Input id="household-name" required maxLength={160} value={draft.householdName} onChange={(event) => update({ householdName: event.target.value })} placeholder="Rivera household" /></div>
        {draft.members.map((member, index) => <div key={member.id} className="rounded-xl border bg-muted/20 p-4"><div className="mb-4 flex items-center justify-between"><p className="font-semibold">Member {index + 1}</p>{draft.members.length > 1 ? <Button type="button" size="icon" variant="ghost" aria-label={`Remove member ${index + 1}`} onClick={() => update({ members: draft.members.filter((candidate) => candidate.id !== member.id).map((item, memberIndex) => ({ ...item, primaryContact: item.primaryContact || (memberIndex === 0 && !draft.members.some((candidate) => candidate.id !== member.id && candidate.primaryContact)) })) })}><Trash2 className="h-4 w-4" /></Button> : null}</div><div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label htmlFor={`first-${member.id}`}>First name</Label><Input id={`first-${member.id}`} required value={member.firstName} onChange={(event) => updateMember(index, { firstName: event.target.value })} /></div><div className="space-y-2"><Label htmlFor={`last-${member.id}`}>Last name</Label><Input id={`last-${member.id}`} required value={member.lastName} onChange={(event) => updateMember(index, { lastName: event.target.value })} /></div><div className="space-y-2"><Label htmlFor={`email-${member.id}`}>Email</Label><Input id={`email-${member.id}`} type="email" value={member.email} onChange={(event) => updateMember(index, { email: event.target.value })} /></div><div className="space-y-2"><Label htmlFor={`phone-${member.id}`}>Phone (E.164)</Label><Input id={`phone-${member.id}`} placeholder="+12025550110" value={member.phoneE164} onChange={(event) => updateMember(index, { phoneE164: event.target.value })} /></div></div><div className="mt-4 flex flex-wrap gap-5 text-sm"><label className="flex items-center gap-2"><input type="radio" name="primary-contact" checked={member.primaryContact} onChange={() => makePrimary(index)} />Primary contact</label><label className="flex items-center gap-2"><input type="checkbox" checked={member.financiallyResponsible} onChange={(event) => updateMember(index, { financiallyResponsible: event.target.checked })} />Financially responsible</label></div></div>)}
      </CardContent></Card>

      <Card><CardHeader><p className="font-mono text-xs font-semibold text-primary">03 · Lease</p><CardTitle>Dates, rent, and signed document</CardTitle><CardDescription>Crecy records and operationalizes the operator-supplied agreement; it does not certify legal sufficiency.</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="lease-source">Source</Label><NativeSelect id="lease-source" value={draft.source} onChange={(event) => update({ source: event.target.value as LeaseDraft["source"] })}><option value="operator_supplied">Operator supplied</option><option value="imported">Imported</option></NativeSelect></div><div className="space-y-2"><Label htmlFor="external-reference">External reference</Label><Input id="external-reference" maxLength={120} value={draft.externalReference} onChange={(event) => update({ externalReference: event.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="start-date">Start date</Label><Input id="start-date" type="date" required value={draft.startDate} onChange={(event) => update({ startDate: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="end-date">End date</Label><Input id="end-date" type="date" value={draft.endDate} onChange={(event) => update({ endDate: event.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="rent-amount">Rent amount ({selectedProperty?.currencyCode ?? "currency"})</Label><Input id="rent-amount" inputMode="decimal" required placeholder="1850.00" value={draft.rentAmount} onChange={(event) => update({ rentAmount: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="rent-frequency">Frequency</Label><NativeSelect id="rent-frequency" value={draft.rentFrequency} onChange={(event) => update({ rentFrequency: event.target.value as LeaseDraft["rentFrequency"] })}><option value="weekly">Weekly</option><option value="biweekly">Every two weeks</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="semiannual">Twice yearly</option><option value="annual">Annual</option><option value="custom">Custom</option></NativeSelect></div>
        <div className="space-y-2 md:col-span-2"><Label htmlFor="signed-document">Scanned-clean signed lease</Label><NativeSelect id="signed-document" required value={draft.signedDocumentId} disabled={!draft.propertyId || pending} onChange={(event) => update({ signedDocumentId: event.target.value })}><option value="" disabled>Select document</option>{availableDocuments.map((document) => <option key={document.id} value={document.id}>{document.title} — {document.filename}</option>)}</NativeSelect><p className="text-xs text-muted-foreground">Upload and scan the signed lease in Documents first if it is not listed.</p></div>
      </CardContent></Card>

      <Card><CardHeader><p className="font-mono text-xs font-semibold text-primary">04 · Activate</p><CardTitle>Opening position and review</CardTitle><CardDescription>A nonzero opening balance requires finance permission and posts a balanced journal.</CardDescription></CardHeader><CardContent className="space-y-5"><div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label htmlFor="opening-balance">Opening balance ({selectedProperty?.currencyCode ?? "currency"})</Label><Input id="opening-balance" inputMode="decimal" value={draft.openingBalance} onChange={(event) => update({ openingBalance: event.target.value })} /><p className="text-xs text-muted-foreground">Positive means owed; negative means resident credit.</p></div><div className="space-y-2"><Label htmlFor="first-charge">First recurring charge date</Label><Input id="first-charge" type="date" value={draft.firstChargeDueDate} onChange={(event) => update({ firstChargeDueDate: event.target.value })} /></div></div>{reviewing ? <div className="rounded-xl border border-primary/20 bg-secondary/40 p-5"><p className="font-mono text-xs font-semibold uppercase tracking-wide text-primary">Final review</p><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">Home</dt><dd className="mt-1 font-medium">{selectedProperty?.name} · Unit {availableUnits.find((unit) => unit.id === draft.unitId)?.unitCode}</dd></div><div><dt className="text-muted-foreground">Household</dt><dd className="mt-1 font-medium">{draft.householdName} · {draft.members.length} member{draft.members.length === 1 ? "" : "s"}</dd></div><div><dt className="text-muted-foreground">Lease</dt><dd className="mt-1 font-medium">{draft.startDate} → {draft.endDate || "ongoing"}</dd></div><div><dt className="text-muted-foreground">Rent</dt><dd className="mt-1 font-mono font-semibold">{selectedProperty?.currencyCode} {draft.rentAmount} · {draft.rentFrequency}</dd></div></dl><p className="mt-4 text-xs leading-5 text-muted-foreground">Confirm the operator-supplied terms and signed document are correct. Activation cannot silently overwrite an existing tenancy.</p></div> : null}<Alert variant="info"><FileCheck2 className="h-5 w-5" /><AlertTitle>Atomic activation</AlertTitle><AlertDescription>Household, lease, tenancy, schedule, signed-document link, and any opening journal either all commit or all roll back.</AlertDescription></Alert>{error ? <Alert variant="destructive"><AlertTitle>Activation stopped</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}<Button type="submit" size="lg" className="w-full" disabled={disabled || pending || !availableDocuments.length}>{pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{pending ? "Activating…" : reviewing ? "Confirm and activate tenancy" : "Review tenancy"}</Button></CardContent></Card>
    </form>
  );
}
