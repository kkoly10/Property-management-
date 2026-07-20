import { AlertCircle, Building2 } from "lucide-react";
import { PropertyForm } from "@/app/onboarding/property/property-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPropertySetupOptions } from "@/lib/data/portfolio";

export const dynamic = "force-dynamic";

export default async function PropertyOnboardingPage() {
  const setup = await getPropertySetupOptions();
  return (
    <Card>
      <CardHeader className="border-b"><span className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground"><Building2 className="h-5 w-5" /></span><CardTitle className="text-2xl">Add your first property</CardTitle><CardDescription>Attach the property to one operating entity and one single-currency accounting book.</CardDescription></CardHeader>
      <CardContent className="pt-6">
        {setup.mode === "setup" ? <Alert variant="info" className="mb-6"><AlertCircle className="h-5 w-5" /><AlertTitle>Setup preview</AlertTitle><AlertDescription>Connect Supabase before submitting. The form is populated with a safe preview book.</AlertDescription></Alert> : null}
        {setup.books.length ? <PropertyForm books={setup.books} /> : <Alert variant="warning"><AlertCircle className="h-5 w-5" /><AlertTitle>Create an accounting book first</AlertTitle><AlertDescription>A property must belong to an operating entity and accounting book.</AlertDescription></Alert>}
      </CardContent>
    </Card>
  );
}
