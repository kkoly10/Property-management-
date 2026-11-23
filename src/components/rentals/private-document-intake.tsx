import { Badge } from "@/components/ui/badge";
import type { RentalEvidenceIntakeStatus } from "@/lib/rental-evidence/http";

const explanations: Record<RentalEvidenceIntakeStatus, string> = {
  private_uploads: "With the saved listing settings, new applicants can upload private documents after email verification and sign-in.",
  no_policy: "New applications collect contact and move-in details. Private uploads require an approved policy for this property.",
  needs_requirements: "New applications collect contact and move-in details. Save application requirements to use the property’s approved document policy.",
  outside_policy: "New applications collect contact and move-in details. The saved document requirements fall outside the approved policy.",
  intake_paused: "This property has an approved policy. New applications collect contact and move-in details while private upload intake is paused.",
  unavailable: "Crecy could not confirm the current intake mode. Refresh to try again.",
};

export function PrivateDocumentIntake({ status }: { status: RentalEvidenceIntakeStatus }) {
  const label = status === "private_uploads" ? "Private uploads" : status === "unavailable" ? "Status unavailable" : "Contact only";
  return (
    <section aria-label="Application intake" className="space-y-2 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">Application intake</h2>
        <Badge variant={status === "private_uploads" ? "success" : "neutral"}>{label}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">{explanations[status]}</p>
    </section>
  );
}
