import { UsersRound } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Wordmark } from "@/components/brand/wordmark";
import { createClient } from "@/lib/supabase/server";
import { StaffInvitationAcceptance } from "@/app/settings/team/accept/staff-invitation-acceptance";

export const dynamic = "force-dynamic";

export default async function StaffInvitationPage({
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
            <span className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"><UsersRound className="h-6 w-6" /></span>
            <CardTitle>Join the operator team</CardTitle>
            <CardDescription>This 72-hour invitation grants only the role, properties, and date range selected by the operator.</CardDescription>
          </CardHeader>
          <CardContent><StaffInvitationAcceptance token={token ?? null} signedIn={Boolean(auth.user)} /></CardContent>
        </Card>
      </div>
    </main>
  );
}
