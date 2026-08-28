import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OrganizationForm } from "@/app/onboarding/organization/organization-form";
import { resolveOrganizationConsent, requiresPublishedLegalDocuments } from "@/lib/legal/registry";

export const dynamic = "force-dynamic";

export default function OrganizationOnboardingPage() {
  // Resolved here so the form shows the SAME artifacts the action will bind consent to, and so the
  // version travels with the submission.
  const consent = resolveOrganizationConsent({ requirePublished: requiresPublishedLegalDocuments() });

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="mb-2"><Badge variant="info">Growth trial · 14 days</Badge></div>
        <CardTitle className="text-2xl">Create your workspace</CardTitle>
        <CardDescription>Set the operating defaults your team will see. You can add more countries, entities, and books later.</CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        <OrganizationForm
          consentDocuments={consent.ok ? consent.binding.documents.map((document) => ({
            code: document.code,
            title: document.title,
            version: document.version,
            effectiveDate: document.effectiveDate,
            route: document.route,
            state: document.state,
          })) : []}
          consentVersion={consent.ok ? consent.binding.version : null}
          consentBlockedReason={consent.ok ? null : consent.reason}
        />
      </CardContent>
    </Card>
  );
}
