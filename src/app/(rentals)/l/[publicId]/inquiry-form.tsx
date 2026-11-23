"use client";

import { useRef, useState } from "react";
import { Send } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { rentalInquiryTopics, rentalInquiryTopicLabels } from "@/lib/rental-inquiry-topics";

type Fields = { firstName: string; lastName: string; email: string; question: string; topic: string };
class RequestFailure extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export function RentalInquiryForm({ publicId }: { publicId: string }) {
  const [fields, setFields] = useState<Fields>({ firstName: "", lastName: "", email: "", question: "", topic: "" });
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operation = useRef<{ key: string; body: unknown } | null>(null);
  const locked = busy || uncertain || sent;

  function edit(key: keyof Fields, value: string) {
    if (locked) return;
    operation.current = null;
    setFields((current) => ({ ...current, [key]: value }));
    setError(null);
  }

  async function submit() {
    if (busy || sent || (uncertain && !operation.current)) return;
    setBusy(true); setError(null);
    try {
      operation.current ??= {
        key: crypto.randomUUID(),
        body: {
          publicId,
          firstName: fields.firstName,
          lastName: fields.lastName,
          email: fields.email,
          question: fields.question,
          topic: fields.topic || undefined,
          locale: "en-US",
        },
      };
      const current = operation.current;
      const response = await fetch("/api/v1/rental-inquiries", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": current.key },
        body: JSON.stringify(current.body),
      });
      const body = await response.json().catch(() => null) as { error?: unknown } | null;
      if (!response.ok) {
        throw new RequestFailure(
          typeof body?.error === "string" ? body.error : "Your question could not be submitted.",
          response.status,
        );
      }
      operation.current = null;
      setUncertain(false);
      setSent(true);
    } catch (caught) {
      const definite = caught instanceof RequestFailure && caught.status < 500;
      if (definite) {
        operation.current = null;
        setUncertain(false);
      } else {
        setUncertain(true);
      }
      setError(caught instanceof Error ? caught.message : "Your question could not be confirmed.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <Alert>
        <AlertTitle>Check your email</AlertTitle>
        <AlertDescription>
          Verify your email address before the question is shared with the landlord. This does not reserve the rental.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-3.5">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Question not confirmed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {uncertain ? (
        <Alert>
          <AlertTitle>Confirm the previous submission</AlertTitle>
          <AlertDescription>
            The response was interrupted. Retry the same question before editing so Crecy does not create a duplicate.
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-3 min-[380px]:grid-cols-2">
        <div>
          <Label htmlFor="inquiry-first-name">First name</Label>
          <Input id="inquiry-first-name" className="mt-1.5" autoComplete="given-name"
            value={fields.firstName} disabled={locked} onChange={(e) => edit("firstName", e.target.value)} />
        </div>
        <div>
          <Label htmlFor="inquiry-last-name">Last name</Label>
          <Input id="inquiry-last-name" className="mt-1.5" autoComplete="family-name"
            value={fields.lastName} disabled={locked} onChange={(e) => edit("lastName", e.target.value)} />
        </div>
      </div>

      <div>
        <Label htmlFor="inquiry-email">Email</Label>
        <Input id="inquiry-email" className="mt-1.5" type="email" autoComplete="email"
          value={fields.email} disabled={locked} onChange={(e) => edit("email", e.target.value)} />
      </div>
      <div>
        <Label htmlFor="inquiry-topic">Topic <span className="font-normal text-muted-foreground">(optional)</span></Label>
        <select id="inquiry-topic"
          className="mt-1.5 h-11 w-full rounded-md border border-input bg-card px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 sm:h-10 sm:text-sm"
          value={fields.topic} disabled={locked} onChange={(e) => edit("topic", e.target.value)}>
          <option value="">Select a topic</option>
          {rentalInquiryTopics.map((topic) => (
            <option key={topic} value={topic}>{rentalInquiryTopicLabels[topic].en}</option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor="inquiry-question">Question about this rental</Label>
        <Textarea id="inquiry-question" className="mt-1.5 min-h-24" maxLength={2000}
          placeholder="For example, is water included in the rent?"
          value={fields.question} disabled={locked} onChange={(e) => edit("question", e.target.value)} />
        <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
          Do not include Social Security numbers, ID numbers, or banking details.
        </p>
      </div>
      <Button type="button" onClick={submit} disabled={busy || sent}>
        <Send aria-hidden="true" className="h-4 w-4" />
        {uncertain ? "Retry same question" : busy ? "Sending…" : "Email my question"}
      </Button>
      <p className="text-xs leading-5 text-muted-foreground">
        Sending a question does not reserve the rental, approve an application, or guarantee a response.
      </p>
    </div>
  );
}
