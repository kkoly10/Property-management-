import { EntityBookForm } from "@/app/onboarding/entity/entity-book-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default function EntityOnboardingPage() {
  return <Card><CardHeader className="border-b"><CardTitle className="text-2xl">Add an operating entity and book</CardTitle><CardDescription>The legal entity receives rent and owns its accounting records. Each book keeps one functional currency.</CardDescription></CardHeader><CardContent className="pt-6"><EntityBookForm /></CardContent></Card>;
}
