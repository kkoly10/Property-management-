"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, FileLock2, LoaderCircle, Send, ShieldCheck, X } from "lucide-react";
import { useRouter } from "next/navigation";
import type {
  PrivacyOrganization,
  PrivacyRequestItem,
  PrivacyRequestType,
} from "@/lib/data/privacy";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

const requestTypeLabels: Record<PrivacyRequestType, string> = {
  access: "Access or know",
  correction: "Correct personal information",
  deletion: "Delete eligible information",
  export: "Portable data export",
  restriction: "Restrict processing",
  objection: "Object to processing",
  withdraw_consent: "Withdraw consent",
  appeal: "Appeal a decision",
};

const statusLabel = (value: string) => value.replaceAll("_", " ");
const statusVariant = (status: PrivacyRequestItem["status"]) =>
  status === "fulfilled" || status === "partially_fulfilled"
    ? "success"
    : status === "canceled" || status === "denied"
      ? "neutral"
      : "warning";

async function post(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error ?? "The privacy request action failed.");
  return result;
}

export function PrivacyRequestCenter({
  authenticatorLevel,
  organizations,
  items,
  disabled,
}: {
  authenticatorLevel: "aal1" | "aal2";
  organizations: PrivacyOrganization[];
  items: PrivacyRequestItem[];
  disabled: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [activeAction, setActiveAction] = useState<string>();
  const [cancelingId, setCancelingId] = useState<string>();
  const [cancellationReason, setCancellationReason] = useState("");
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();

  async function submitRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || disabled) return;
    setBusy(true);
    setError(undefined);
    setSuccess(undefined);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const controller = String(form.get("controller") ?? "platform");
    try {
      await post("/api/v1/privacy/requests", {
        organizationId: controller === "platform" ? null : controller,
        requestType: form.get("requestType"),
        jurisdictionCode: form.get("jurisdictionCode"),
      });
      formElement.reset();
      setSuccess("Your request was recorded. Its status and verification steps appear below.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The privacy request could not be submitted.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyRequest(item: PrivacyRequestItem) {
    setActiveAction(item.privacyRequestId);
    setError(undefined);
    setSuccess(undefined);
    try {
      await post(`/api/v1/privacy/requests/${item.privacyRequestId}/verify`, {
        expectedVersion: item.version,
      });
      setSuccess("Identity verification was recorded and eligible jobs are now queued.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Identity verification could not be recorded.");
    } finally {
      setActiveAction(undefined);
    }
  }

  async function cancelRequest(item: PrivacyRequestItem) {
    setActiveAction(item.privacyRequestId);
    setError(undefined);
    setSuccess(undefined);
    try {
      await post(`/api/v1/privacy/requests/${item.privacyRequestId}/cancel`, {
        expectedVersion: item.version,
        reason: cancellationReason,
      });
      setCancelingId(undefined);
      setCancellationReason("");
      setSuccess("The request and its pending jobs were canceled.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The privacy request could not be canceled.");
    } finally {
      setActiveAction(undefined);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Submit a privacy request</CardTitle>
          <CardDescription>
            Select the operator when your request concerns a rental relationship. Select Crecy when it concerns the platform account itself.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={submitRequest}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="privacy-controller">Who should review this?</Label>
                <NativeSelect id="privacy-controller" name="controller" disabled={disabled || busy} defaultValue={organizations[0]?.organizationId ?? "platform"}>
                  {organizations.map((organization) => (
                    <option key={organization.organizationId} value={organization.organizationId}>
                      {organization.organizationName} ({organization.countryCode})
                    </option>
                  ))}
                  <option value="platform">Crecy platform privacy team</option>
                </NativeSelect>
              </div>
              <div className="space-y-2">
                <Label htmlFor="privacy-request-type">Request type</Label>
                <NativeSelect id="privacy-request-type" name="requestType" disabled={disabled || busy} defaultValue="access">
                  {Object.entries(requestTypeLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </NativeSelect>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="privacy-jurisdiction">Jurisdiction code <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input id="privacy-jurisdiction" name="jurisdictionCode" maxLength={11} placeholder="US-VA, CA-ON, or MX" disabled={disabled || busy} />
              <p className="text-xs leading-5 text-muted-foreground">Leave blank to use the selected operator&apos;s headquarters country.</p>
            </div>
            <Alert variant="info">
              <FileLock2 className="h-5 w-5" />
              <AlertDescription>Deletion requests are checked for legal holds, financial records, signed documents, and operator retention instructions. Submitting a request does not promise immediate deletion.</AlertDescription>
            </Alert>
            {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
            {success ? <Alert variant="info"><CheckCircle2 className="h-5 w-5" /><AlertDescription>{success}</AlertDescription></Alert> : null}
            <Button type="submit" disabled={disabled || busy}>
              {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {busy ? "Submitting…" : "Submit request"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <section className="space-y-3" aria-labelledby="privacy-request-history">
        <div>
          <h2 id="privacy-request-history" className="text-xl font-semibold">Request history</h2>
          <p className="mt-1 text-sm text-muted-foreground">Status reflects identity verification, controller routing, and private job progress.</p>
        </div>
        {items.length ? (
          <div className="grid gap-3">
            {items.map((item) => (
              <Card key={item.privacyRequestId}>
                <CardContent className="p-5">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={statusVariant(item.status)}>{statusLabel(item.status)}</Badge>
                        <Badge variant={item.identityVerificationStatus === "verified" ? "success" : "info"}>
                          identity {item.identityVerificationStatus}
                        </Badge>
                      </div>
                      <h3 className="mt-3 font-semibold">{requestTypeLabels[item.requestType]}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{item.organizationName ?? "Crecy platform privacy team"} · {item.jurisdictionCode ?? "Jurisdiction pending"}</p>
                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
                        <span>Submitted {new Date(item.submittedAt).toLocaleDateString()}</span>
                        <span>Target date {new Date(item.dueAt).toLocaleDateString()}</span>
                        <span>{item.queuedJobCount} of {item.jobCount} jobs queued</span>
                        <span>v{item.version}</span>
                      </div>
                      {item.blockedByHold ? <p className="mt-3 text-sm font-medium text-warning">One or more jobs are blocked by a legal or retention hold.</p> : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
                      {item.canVerify ? authenticatorLevel === "aal2" ? (
                        <Button type="button" size="sm" variant="outline" disabled={activeAction === item.privacyRequestId} onClick={() => verifyRequest(item)}>
                          <ShieldCheck className="h-4 w-4" />Verify identity
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" asChild>
                          <Link href="/settings/security/mfa?returnTo=/settings/privacy"><ShieldCheck className="h-4 w-4" />Verify identity</Link>
                        </Button>
                      ) : null}
                      {item.canCancel && cancelingId !== item.privacyRequestId ? (
                        <Button type="button" size="sm" variant="ghost" onClick={() => { setCancelingId(item.privacyRequestId); setCancellationReason(""); }}>
                          <X className="h-4 w-4" />Cancel request
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  {cancelingId === item.privacyRequestId ? (
                    <div className="mt-5 space-y-3 rounded-xl border bg-muted/30 p-4">
                      <div className="space-y-2">
                        <Label htmlFor={`privacy-cancel-${item.privacyRequestId}`}>Cancellation reason <span className="font-normal text-muted-foreground">(optional)</span></Label>
                        <Input id={`privacy-cancel-${item.privacyRequestId}`} value={cancellationReason} maxLength={500} onChange={(event) => setCancellationReason(event.target.value)} disabled={activeAction === item.privacyRequestId} />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant="outline" disabled={activeAction === item.privacyRequestId} onClick={() => cancelRequest(item)}>
                          {activeAction === item.privacyRequestId ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                          Confirm cancellation
                        </Button>
                        <Button type="button" size="sm" variant="ghost" disabled={activeAction === item.privacyRequestId} onClick={() => setCancelingId(undefined)}>Keep request</Button>
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No privacy requests yet.</CardContent></Card>
        )}
      </section>
    </div>
  );
}
