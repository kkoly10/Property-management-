"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { renewalReceipt, type RenewalCommand, type TenancyRenewal } from "@/lib/validation/tenancy-renewal";

export function RenewalView({ record, organizationId }: { record: TenancyRenewal; organizationId: string }) {
  const router = useRouter();
  const inFlight = useRef(false);
  const [pending, setPending] = useState<RenewalCommand | null>(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(false);
  const [change, setChange] = useState<{ id: string; state: string } | null>(null);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const waiting = change && !record.renewals.some((renewal) => renewal.id === change.id && renewal.state === change.state);
  const locked = busy || !!pending || reload || !!waiting;
  const scheduled = record.renewals.find((renewal) => renewal.state === "scheduled");
  const canApply = scheduled && record.tenancyStatus === "active" && record.localToday >= scheduled.startOn
    && record.localToday <= scheduled.endOn && (!scheduled.firstChargeOn || record.localToday <= scheduled.firstChargeOn);
  const amount = BigInt(record.rentMinor);
  const scale = BigInt(100);
  const rent = new Intl.NumberFormat("en-US", { style: "currency", currency: record.currency })
    .formatToParts(amount / scale)
    .map((part) => part.type === "fraction" ? (amount % scale).toString().padStart(2, "0") : part.value)
    .join("");

  async function send(command: RenewalCommand) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(command);
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/v1/tenancies/${record.tenancyId}/renewal`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command),
      });
      const data = await response.json();
      const result = renewalReceipt.safeParse(data);
      if (response.ok && result.success && result.data.tenancyId === record.tenancyId) {
        setChange({ id: result.data.renewalId, state: result.data.state });
        setPending(null);
        setMessage({ error: false, text: `Renewal ${result.data.state}.` });
        router.refresh();
      } else if (response.status >= 400 && response.status < 500) {
        setPending(null);
        if ([401, 404, 409].includes(response.status)) setReload(true);
        setMessage({ error: true, text: typeof data?.error === "string" ? data.error : "Check the renewal details." });
      } else {
        setMessage({ error: true, text: "The result could not be confirmed. Retry the same request." });
      }
    } catch {
      setMessage({ error: true, text: "The result could not be confirmed. Retry the same request." });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  const scope = () => ({ organizationId, operationKey: crypto.randomUUID() });
  function schedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    if (fields.get("confirmed") !== "on") return;
    void send({ ...scope(), action: "schedule", priorLeaseId: record.currentLeaseId, endOn: String(fields.get("endOn")),
      firstChargeOn: record.firstContinuingChargeOn, documentVersionId: String(fields.get("documentVersionId")), confirmed: true });
  }

  return <div className="max-w-3xl space-y-6">
    <header className="space-y-3">
      <Button asChild variant="outline"><Link href={`/app/tenancies/${record.tenancyId}/closeout`}>Return to tenancy</Link></Button>
      <h1 className="text-3xl font-semibold tracking-tight">Tenancy renewal</h1>
      <p className="break-words text-muted-foreground">{record.householdName} · {record.propertyName}</p>
    </header>
    <Card>
      <CardHeader><CardTitle>Current recorded term</CardTitle></CardHeader>
      <CardContent>
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Lease dates</dt><dd>{record.currentStart} to {record.currentEnd ?? "open-ended"}</dd></div>
          <div><dt className="text-muted-foreground">Scheduled rent</dt><dd>{rent} · {record.cadence}</dd></div>
        </dl>
      </CardContent>
    </Card>

    {message && <p role={message.error ? "alert" : "status"} className={message.error ? "text-sm text-destructive" : "text-sm"}>{message.text}</p>}
    {pending && <Button variant="outline" disabled={busy} onClick={() => void send(pending)}>{busy ? "Saving…" : "Retry same request"}</Button>}
    {(reload || waiting) && <Button variant="outline" onClick={() => window.location.reload()}>Reload renewal</Button>}
    {record.canManage && !scheduled && record.canSchedule && <Card>
      <CardHeader>
        <CardTitle>Schedule a signed renewal</CardTitle>
        <CardDescription>Record a contiguous fixed term for the same household and rent schedule. Upload the signed PDF to this property as a signed lease, then wait for scanning.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={schedule}>
          <fieldset disabled={locked} className="space-y-4">
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div><dt className="text-muted-foreground">Renewed term starts</dt><dd>{record.renewalStart}</dd></div>
              <div><dt className="text-muted-foreground">First recurring charge in the renewed term</dt><dd>{record.firstContinuingChargeOn ?? "None"}</dd></div>
            </dl>
            <label className="block space-y-1 text-sm"><span>Renewed term ends</span>
              <Input type="date" name="endOn" min={record.firstContinuingChargeOn ?? record.renewalStart ?? undefined} required /></label>
            {record.documents.length ? <label className="block space-y-1 text-sm"><span>Signed renewal PDF</span>
              <NativeSelect name="documentVersionId" defaultValue="" required>
                <option value="" disabled>Select scanned PDF</option>
                {record.documents.map((document) => <option key={document.id} value={document.id}>{document.label}</option>)}
              </NativeSelect></label> : <Button variant="outline" asChild><Link href="/app/documents">Open documents</Link></Button>}
            <label className="flex items-start gap-3 text-sm">
              <input name="confirmed" type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" required />
              I confirm this signed renewal keeps the same household, rent, currency, and billing dates shown here. Applying it makes the PDF available to eligible residents.
            </label>
            <Button type="submit" disabled={!record.documents.length}>Schedule renewal</Button>
          </fieldset>
        </form>
      </CardContent>
    </Card>}

    {scheduled && <Card>
      <CardHeader><CardTitle>Scheduled renewal</CardTitle>
        <CardDescription>{scheduled.startOn} to {scheduled.endOn} · First charge {scheduled.firstChargeOn ?? "none"}. The signed term applies when an authorized operator records the transition.</CardDescription>
      </CardHeader>
      {record.canManage && <CardContent className="flex flex-wrap gap-3">
        {canApply ? <Button disabled={locked} onClick={() => void send({ ...scope(), action: "apply", renewalId: scheduled.id })}>Apply dated renewal</Button>
          : <p className="basis-full text-sm text-muted-foreground">Apply during the renewal term while the same household holds possession and before the first recurring charge date has passed.</p>}
        <Button type="button" variant="outline" disabled={locked} onClick={() => void send({ ...scope(), action: "cancel", renewalId: scheduled.id })}>Cancel scheduled renewal</Button>
      </CardContent>}
    </Card>}
    {record.renewals.some((renewal) => renewal.state !== "scheduled") && <Card>
      <CardHeader><CardTitle>Renewal history</CardTitle></CardHeader>
      <CardContent><ul className="divide-y text-sm">
        {record.renewals.filter((renewal) => renewal.state !== "scheduled").map((renewal) => <li key={renewal.id} className="flex flex-wrap justify-between gap-2 py-3">
          <div><p>{renewal.startOn} to {renewal.endOn}</p>
            <p className="text-muted-foreground">Previous term {renewal.priorStart} to {renewal.priorEnd}</p></div>
          <span className="capitalize">{renewal.state}</span>
        </li>)}
      </ul></CardContent>
    </Card>}
    {!scheduled && !record.canSchedule && <p className="text-sm text-muted-foreground">Fixed-term renewal scheduling is available for an active tenancy with an eligible current rent schedule and property permissions.</p>}
  </div>;
}
