import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OrganizationForm } from "@/app/onboarding/organization/organization-form";

export const dynamic = "force-dynamic";

export default function OrganizationOnboardingPage() {
  return (
    <Card>
      <CardHeader className="border-b">
        <div className="mb-2"><Badge variant="info">Growth trial · 14 days</Badge></div>
        <CardTitle className="text-2xl">Create your workspace</CardTitle>
        <CardDescription>Set the operating defaults your team will see. You can add more countries, entities, and books later.</CardDescription>
      </CardHeader>
      <CardContent className="pt-6"><OrganizationForm /></CardContent>
    </Card>
  );
}
