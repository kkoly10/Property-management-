"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { DocumentUploadForm } from "@/app/app/documents/document-upload-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { exactMoneyMinor } from "@/lib/validation/homeowner-lease";
import { depositEntry, depositReceipt, type DepositCommand, type DepositEntryKind, type TenancyDeposit } from "@/lib/validation/tenancy-deposit";
import { formatBalance } from "./tenancy-closeout-view";

const titles: Record<DepositEntryKind, string> = {
  obligation: "Deposit obligation",
  receipt: "External receipt",
  refund: "External refund",
  deduction: "External deduction",
  other: "Other external disposition",
  correction: "Correction",
};
export function DepositRegister({ register, organizationId, property }: {
  register: TenancyDeposit; organizationId: string; property: { id: string; name: string };
}) {
  const router = useRouter();
  const inFlight = useRef(false);
  const [action, setAction] = useState<DepositEntryKind>("obligation");
  const [pending, setPending] = useState<DepositCommand | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedVersion, setSavedVersion] = useState(0);
  const [needsReload, setNeedsReload] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [formKey, setFormKey] = useState(0);
  const waiting = savedVersion > register.version;
  const money = (amountMinor: string) => formatBalance(amountMinor, register.currency);
  const receipts = register.entries.filter((entry) => entry.kind === "receipt" && entry.remainingMinor !== null && entry.remainingMinor !== "0");
  const corrections = register.entries.filter((entry) => entry.kind !== "obligation" && entry.kind !== "correction" && !entry.corrected);
  const byId = new Map(register.entries.map((entry) => [entry.id, entry]));
  const isDisposition = action === "refund" || action === "deduction" || action === "other";
  const isExternal = action === "receipt" || isDisposition;
  const isRevision = action === "obligation" && register.obligationMinor !== null;
  const needsDetail = isRevision || action === "deduction" || action === "other" || action === "correction";
  const available = action === "obligation"
    || (action === "receipt" && register.obligationMinor !== null)
    || (isDisposition && receipts.length > 0 && (action !== "deduction" || register.evidenceOptions.length > 0))
    || (action === "correction" && corrections.length > 0);

  async function send(command: DepositCommand) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setPending(command);
    setMessage(null);
    try {
      const response = await fetch(`/api/v1/tenancies/${register.tenancyId}/deposit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
      const data = await response.json();
      const result = depositReceipt.safeParse(data);
      if (response.ok && result.success && result.data.tenancyId === register.tenancyId) {
        setSavedVersion(result.data.version);
        setPending(null);
        setFormKey((previous) => previous + 1);
        setMessage({ error: false, text: "Deposit record saved." });
        router.refresh();
      } else if (response.status >= 400 && response.status < 500) {
        setPending(null);
        if ([401, 404, 409].includes(response.status)) setNeedsReload(true);
        setMessage({ error: true, text: typeof data?.error === "string" ? data.error : "Check the deposit entry." });
      } else {
        setMessage({ error: true, text: "The result could not be confirmed. Retry the same request." });
      }
    } catch {
      setMessage({ error: true, text: "The result could not be confirmed. Retry the same request." });
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const value = (field: string) => String(fields.get(field) ?? "");
    const amount = exactMoneyMinor(value("amount").trim());
    const entry = depositEntry.safeParse({
      kind: action,
      ...(action === "correction" ? {} : { effectiveOn: value("effectiveOn"), amountMinor: amount }),
      ...(isExternal ? { reference: value("reference"), confirmed: fields.get("confirmed") === "on" } : {}),
      ...(action === "receipt" ? { custodian: value("custodian") } : {}),
      ...(isDisposition || action === "correction" ? { targetId: value("targetId") } : {}),
      ...(needsDetail ? { detail: value("detail") } : {}),
      ...(action === "deduction" ? {
        evidenceVersionId: value("evidenceVersionId"), noticeReference: value("noticeReference"),
        approvalReference: value("approvalReference"),
      } : {}),
    });
    if (!entry.success) {
      setMessage({ error: true, text: "Check the required fields. Use up to two decimal places for amounts." });
      return;
    }
    void send({ organizationId, operationKey: crypto.randomUUID(), expectedVersion: register.version, entry: entry.data });
  }

  return <Card>
    <CardHeader>
      <CardTitle>Security deposit</CardTitle>
      <CardDescription>Track the deposit obligation and confirmed external activity. Crecy records the evidence separately from the posted receivable balance.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-6">
      <dl className="grid gap-4 text-sm sm:grid-cols-4">
        <div><dt className="text-muted-foreground">Obligation</dt><dd className="break-words font-medium">{register.obligationMinor === null ? "Unrecorded" : money(register.obligationMinor)}</dd></div>
        <div><dt className="text-muted-foreground">Received externally</dt><dd className="break-words font-medium">{money(register.receivedMinor)}</dd></div>
        <div><dt className="text-muted-foreground">Accounted for externally</dt><dd className="break-words font-medium">{money(register.disposedMinor)}</dd></div>
        <div><dt className="text-muted-foreground">Still held externally</dt><dd className="break-words font-medium">{money(register.heldMinor)}</dd></div>
      </dl>
      {register.obligationMinor !== null && BigInt(register.receivedMinor) > BigInt(register.obligationMinor)
        && <p className="text-sm text-muted-foreground">Recorded receipts exceed the recorded obligation.</p>}

      {register.entries.length > 0 && <section className="space-y-2">
        <h2 className="text-base font-semibold">Deposit history</h2>
        <ul className="divide-y rounded-lg border">
          {register.entries.map((entry) => {
            const target = entry.targetId ? byId.get(entry.targetId) : undefined;
            return <li key={entry.id} className="space-y-1 break-words px-3 py-3 text-sm">
              <p className="flex flex-wrap items-center justify-between gap-x-3 font-medium">
                <span>{titles[entry.kind]} · {entry.effectiveOn}{entry.corrected ? " · Corrected" : ""}</span>
                {entry.kind !== "correction" && <span>{money(entry.amountMinor)}</span>}
              </p>
              {entry.reference && <p className="text-muted-foreground">External reference {entry.reference}</p>}
              {entry.custodian && <p className="text-muted-foreground">Custody {entry.custodian}</p>}
              {target && <p className="text-muted-foreground">Entry {target.version} · {titles[target.kind]}</p>}
              {entry.detail && <p>{entry.detail}</p>}
              {entry.noticeReference && <p className="text-muted-foreground">Notice {entry.noticeReference}</p>}
              {entry.approvalReference && <p className="text-muted-foreground">Approval {entry.approvalReference}</p>}
              {entry.evidenceVersionId && <p className="text-muted-foreground">Evidence {register.evidenceOptions.find((option) =>
                option.id === entry.evidenceVersionId)?.label ?? entry.evidenceVersionId}</p>}
            </li>;
          })}
        </ul>
      </section>}

      {message && <p role={message.error ? "alert" : "status"} className={message.error ? "text-sm text-destructive" : "text-sm"}>{message.text}</p>}
      {pending && <Button variant="outline" onClick={() => void send(pending)} disabled={busy}>{busy ? "Saving…" : "Retry same request"}</Button>}
      {(needsReload || waiting) && <Button variant="outline" onClick={() => window.location.reload()}>Reload deposit register</Button>}

      {register.canManage && <form key={formKey} onSubmit={submit} className="border-t pt-4">
        <fieldset disabled={busy || !!pending || needsReload || waiting} className="space-y-3">
          <legend className="mb-2 text-base font-semibold">Record deposit evidence</legend>
          <label className="block space-y-1 text-sm">
            <span>Entry type</span>
            <NativeSelect value={action} onChange={(event) => {
              setAction(event.target.value as DepositEntryKind);
              setMessage(null);
            }}>
              <option value="obligation">{register.obligationMinor === null ? "Record obligation" : "Revise obligation"}</option>
              <option value="receipt" disabled={register.obligationMinor === null}>Record external receipt</option>
              <option value="refund" disabled={!receipts.length}>Record external refund</option>
              <option value="deduction" disabled={!receipts.length}>Record external deduction</option>
              <option value="other" disabled={!receipts.length}>Record other external disposition</option>
              <option value="correction" disabled={!corrections.length}>Correct an entry</option>
            </NativeSelect>
          </label>
          <div key={action} className="space-y-3">
            {action !== "correction" && <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1 text-sm"><span>Amount ({register.currency})</span>
                <Input name="amount" inputMode="decimal" maxLength={18} required /></label>
              <label className="block space-y-1 text-sm"><span>{isExternal ? "External activity date" : "Effective date"}</span>
                <Input name="effectiveOn" type="date" defaultValue={register.localToday} max={isExternal ? register.localToday : undefined} required /></label>
            </div>}
            {(isDisposition || action === "correction") && <label className="block space-y-1 text-sm">
              <span>{isDisposition ? "Source receipt" : "Entry to correct"}</span>
              <NativeSelect name="targetId" defaultValue="" required>
                <option value="" disabled>Select an entry</option>
                {(isDisposition ? receipts : corrections).map((entry) => <option key={entry.id} value={entry.id}>
                  {entry.version} · {titles[entry.kind]} · {entry.effectiveOn} · {money(entry.remainingMinor ?? entry.amountMinor)}
                </option>)}
              </NativeSelect>
            </label>}
            {isExternal && <label className="block space-y-1 text-sm"><span>External evidence reference</span>
              <Input name="reference" maxLength={120} required /></label>}
            {action === "receipt" && <label className="block space-y-1 text-sm"><span>External custodian or custody record</span>
              <Input name="custodian" maxLength={120} required /></label>}
            {needsDetail && <label className="block space-y-1 text-sm"><span>{isRevision || action === "correction" ? "Correction reason" : "Disposition details"}</span>
              <Input name="detail" maxLength={500} required /></label>}
            {action === "deduction" && <div className="space-y-3">
              {register.evidenceOptions.length ? <label className="block space-y-1 text-sm"><span>Evidence document version</span>
                <NativeSelect name="evidenceVersionId" defaultValue="" required>
                  <option value="" disabled>Select evidence</option>
                  {register.evidenceOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                </NativeSelect></label> : <p className="text-sm text-muted-foreground">Upload evidence and wait for scanning before recording the deduction.</p>}
              <label className="block space-y-1 text-sm"><span>Notice reference</span><Input name="noticeReference" maxLength={120} required /></label>
              <label className="block space-y-1 text-sm"><span>Approval reference</span><Input name="approvalReference" maxLength={120} required /></label>
            </div>}
            {isExternal && <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="confirmed" className="mt-0.5 h-4 w-4 shrink-0" required />
              I confirm that this activity already occurred outside Crecy.</label>}
            {isExternal && <p className="text-xs text-muted-foreground">Use reference IDs. Keep payment credentials and bank account numbers in the external system.</p>}
          </div>
          <Button type="submit" disabled={!available}>{action === "correction" ? "Save correction" : "Save deposit record"}</Button>
        </fieldset>
      </form>}
      {register.canUploadEvidence && <details className="rounded-lg border p-4">
        <summary className="cursor-pointer text-sm font-semibold">Upload deduction evidence</summary>
        <div className="pt-4"><DocumentUploadForm organizationId={organizationId} properties={[]} disabled={false}
          depositEvidenceProperty={property} /></div>
        <Button variant="outline" className="mt-3" onClick={() => router.refresh()}>Refresh scanned evidence</Button>
      </details>}
    </CardContent>
  </Card>;
}
