import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applicationAccessToken, applicationAccessCookieName, applicationAccessCookieOptions } from "@/lib/rental-application-access";

const headers = { "Cache-Control": "private, no-store" };
const reply = (body: unknown, status: number) => NextResponse.json(body, { status, headers });

export async function POST(request: Request) {
  const key = request.headers.get("idempotency-key");
  if (!key || key.length < 8 || key.length > 200) {
    return reply({ error: "The withdrawal request could not be prepared." }, 400);
  }
  const refs = new URL(request.url).searchParams.getAll("ref");
  const reference = refs.length === 1 ? refs[0] : "";
  const access = await applicationAccessToken(reference);
  const cookieName = applicationAccessCookieName(reference);
  if (!access || !cookieName) return reply({ error: "Application access is no longer available." }, 404);
  try {
    const { data, error } = await createAdminClient().rpc("withdraw_public_rental_application", {
      p_access_token: access, p_idempotency_key: key,
    });
    if (error || !data) {
      const message = error?.message ?? "";
      if (error?.code === "P0002") return reply({ error: "Application access is no longer available." }, 404);
      if (message.includes("APPLICATION_NOT_WITHDRAWABLE")) return reply({ error: "This application can no longer be withdrawn." }, 409);
      if (message.includes("IDEMPOTENCY_CONFLICT")) return reply({ error: "This operation key has already been used." }, 409);
      return reply({ error: "Withdrawal could not be confirmed. Retry the same operation." }, 502);
    }
    // A successful RPC transport envelope is not a confirmed withdrawal.
    // In particular, never clear this reference's only access cookie for an
    // unexpected receipt: the applicant must be able to retry the same key.
    if (data.withdrawn !== true || data.applicationReference !== reference
      || data.status !== "withdrawn" || typeof data.version !== "number"
      || !Number.isSafeInteger(data.version) || data.version < 2) {
      return reply({ error: "Withdrawal could not be confirmed. Retry the same operation." }, 502);
    }
    const response = NextResponse.json(data, { headers });
    response.cookies.set(cookieName, "", { ...applicationAccessCookieOptions, maxAge: 0 });
    return response;
  } catch {
    return reply({ error: "Withdrawal could not be confirmed. Retry the same operation." }, 502);
  }
}
