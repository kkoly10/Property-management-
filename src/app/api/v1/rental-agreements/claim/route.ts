import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prepareInvitedAccountToken } from "@/lib/auth/prepare-invited-account";
import { sendAuthLink } from "@/lib/auth/send-auth-link";
import { classifyHost } from "@/lib/runtime/host";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const tokenSchema = z.strictObject({ token: z.string().regex(/^[0-9a-f]{64}$/) });
const exactClaimSchema = z.strictObject({ agreementId: z.uuid() });
const claimReceiptSchema = z.object({ agreementId: z.uuid(), claimed: z.literal(true), replayed: z.boolean() });
const invitationSchema = z.object({ agreementId: z.uuid(), expectedEmail: z.email(), throttled: z.literal(false) });
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });
const unavailable = () => reply({ error: "This signing invitation is unavailable to your account." }, 404);

export async function POST(request: Request) {
  const url = new URL(request.url);
  const host = classifyHost(url.host);
  if ((host.kind !== "living-root" && host.kind !== "living-community" && host.kind !== "development")
    || url.searchParams.get("surface") !== "participant") return unavailable();
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) return unavailable();
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return unavailable();
  const input = await request.json().catch(() => null);
  const exact = exactClaimSchema.safeParse(input);
  const invitation = tokenSchema.safeParse(input);
  if (!exact.success && !invitation.success) return unavailable();

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    let agreementId = exact.success ? exact.data.agreementId : null;
    if (invitation.success) {
      const admin = createAdminClient();
      const { data, error } = await admin.rpc("begin_rental_application_signer_access", {
        p_token_hash: createHash("sha256").update(invitation.data.token).digest("hex"),
        p_request_email: !user,
      });
      if (error) return reply({ error: "Signing access is temporarily unavailable. Retry in a minute." }, 503);
      if (data?.throttled === true) return reply({ emailRequested: true }, 202);
      const info = invitationSchema.safeParse(data);
      if (!info.success) return unavailable();
      agreementId = info.data.agreementId;
      const email = info.data.expectedEmail;
      if (user) {
        if (user.email?.trim().toLowerCase() !== email || !user.email_confirmed_at) return unavailable();
      } else {
        const token = await prepareInvitedAccountToken(admin, email);
        if (!token.ok) return reply({ error: "Signing access is temporarily unavailable. Retry in a minute." }, 503);
        await sendAuthLink({ email, tokenHash: token.tokenHash, actionType: "magiclink", audience: "resident",
          next: `/documents/agreements/${agreementId}/claim` });
        return reply({ emailRequested: true }, 202);
      }
    }

    if (!agreementId || !user?.email_confirmed_at) return unavailable();
    const { data, error } = await supabase.rpc("claim_rental_application_agreement", { p_agreement_id: agreementId });
    if (error) return error.code === "42501" ? unavailable() : reply({ error: "Signing access is temporarily unavailable. Retry in a minute." }, 503);
    const receipt = claimReceiptSchema.safeParse(data);
    if (!receipt.success || receipt.data.agreementId !== agreementId) {
      return reply({ error: "Signing access could not be confirmed. Retry this request." }, 502);
    }
    return reply(receipt.data);
  } catch {
    return reply({ error: "Signing access is temporarily unavailable. Retry in a minute." }, 503);
  }
}
