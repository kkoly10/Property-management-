import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { invitationDatabaseError, invitationErrorResponse } from "@/lib/api/invitations";
import { acceptRelationshipInvitationSchema } from "@/lib/validation/invitations";

export async function POST(request: Request) {
  const parsed = acceptRelationshipInvitationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return invitationErrorResponse("INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Check the invitation.", 400);
  }
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    return invitationErrorResponse("AUTHENTICATION_REQUIRED", "Sign in with the invited email address.", 401);
  }
  const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
  const { data, error } = await supabase.rpc("accept_relationship_invitation", {
    p_token_hash: tokenHash,
  });
  if (error || !data) return invitationDatabaseError(error?.message ?? "");
  return Response.json(data);
}
