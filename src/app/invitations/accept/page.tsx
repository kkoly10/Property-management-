import { KeyRound } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Wordmark } from "@/components/brand/wordmark";
import { createClient } from "@/lib/supabase/server";
import { RelationshipInvitationAcceptance } from "./relationship-invitation-acceptance";

export const dynamic = "force-dynamic";

export default async function RelationshipInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const [{ token }, supabase] = await Promise.all([searchParams, createClient()]);
  const { data: auth } = await supabase.auth.getUser();
  return (
    <main className="min-h-screen bg-[#f6f8fb] p-5 lg:p-10">
      <div className="mx-auto max-w-xl space-y-8">
        <Wordmark />
        <Card>
          <CardHeader>
            <span className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"><KeyRound className="h-6 w-6" /></span>
            <CardTitle>Activate your portal</CardTitle>
            <CardDescription>This 72-hour invitation links your account to the resident or owner record your property team invited.</CardDescription>
          </CardHeader>
          <CardContent><RelationshipInvitationAcceptance token={token ?? null} signedIn={Boolean(auth.user)} /></CardContent>
        </Card>
      </div>
    </main>
  );
}
