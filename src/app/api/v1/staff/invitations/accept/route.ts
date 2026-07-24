import { createHash } from "node:crypto";
import { staffDatabaseError, staffErrorResponse } from "@/lib/api/staff";
import { createClient } from "@/lib/supabase/server";
import { acceptStaffInvitationSchema } from "@/lib/validation/staff";

export async function POST(request: Request) {
  const parsed = acceptStaffInvitationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return staffErrorResponse("INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Check the invitation.", 400);
  }
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    return staffErrorResponse("AUTHENTICATION_REQUIRED", "Sign in with the invited email address.", 401);
  }
  const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
  const { data, error } = await supabase.rpc("accept_staff_invitation", {
    p_token_hash: tokenHash,
  });
  if (error || !data) return staffDatabaseError(error?.message ?? "");
  return Response.json(data);
}
