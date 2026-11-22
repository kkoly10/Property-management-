"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { initialActionState } from "@/lib/actions/state";
import { attachImportedAgreementAction } from "@/lib/tenancies/imported-agreement-action";

export function FileImportedAgreementForm({ organizationId, tenancyId, choices }: {
  organizationId: string;
  tenancyId: string;
  choices: { versionId: string; title: string; filename: string; version: number }[];
}) {
  const [result, action, pending] = useActionState(attachImportedAgreementAction, initialActionState);
  return <form action={action} className="space-y-4">
    <input type="hidden" name="organizationId" value={organizationId} />
    <input type="hidden" name="tenancyId" value={tenancyId} />
    <div className="space-y-2">
      <Label htmlFor="imported-agreement-version">Scanned signed agreement</Label>
      <NativeSelect id="imported-agreement-version" name="versionId" defaultValue="" required>
        <option value="">Choose the exact PDF version</option>
        {choices.map((choice) => <option key={choice.versionId} value={choice.versionId}>{choice.title} · v{choice.version} · {choice.filename}</option>)}
      </NativeSelect>
    </div>
    <label className="flex items-start gap-2 text-sm">
      <input className="mt-1 h-4 w-4 shrink-0 accent-primary" type="checkbox" name="confirmed" required />
      <span>I confirm this is the signed lease for the household and terms already recorded on this tenancy.</span>
    </label>
    {result.message ? <p role={result.status === "error" ? "alert" : "status"} className={result.status === "error" ? "text-sm text-destructive" : "text-sm"}>{result.message}</p> : null}
    <Button type="submit" disabled={pending}>{pending ? "Filing…" : "File signed PDF"}</Button>
  </form>;
}
