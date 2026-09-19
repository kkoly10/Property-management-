import { KeyRound } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Wordmark } from "@/components/brand/wordmark";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { RelationshipInvitationAcceptance } from "./relationship-invitation-acceptance";

export const dynamic = "force-dynamic";

export default async function RelationshipInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  /*
   * Without a configured backend this page used to crash with a 500 before it rendered a single
   * element — which made it, together with the other invitation screen, one of only two surfaces in
   * the product with no mobile evidence at all. It is also the first screen an invited person ever
   * sees, opened from an email, almost always on a phone.
   *
   * It renders an unavailable state, NOT a preview of acceptance. Every other surface falls back to
   * sample data in this mode; an invitation screen must not, because a mocked acceptance control is
   * an activation affordance with no invitation behind it. Nothing below offers an action.
   */
  if (!getPublicSupabaseConfig()) {
    return (
      <main className="min-h-screen bg-[#f6f8fb] gutter-5 py-5 lg:py-10">
        <div className="mx-auto max-w-xl space-y-8">
          <Wordmark />
          <Card>
            <CardHeader>
              <span className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground"><KeyRound className="h-6 w-6" /></span>
              <CardTitle>Portal activation unavailable</CardTitle>
              <CardDescription>This invitation cannot be opened right now. Request a new invitation from your property team, or try the link again shortly.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </main>
    );
  }

  const [{ token }, supabase] = await Promise.all([searchParams, createClient()]);
  const { data: auth } = await supabase.auth.getUser();
  return (
    <main className="min-h-screen bg-[#f6f8fb] gutter-5 py-5 lg:py-10">
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
