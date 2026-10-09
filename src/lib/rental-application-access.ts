import "server-only";
import { cookies } from "next/headers";

const COOKIE_PREFIX = process.env.NODE_ENV === "production"
  ? "__Host-crecy-rental-application-"
  : "crecy-rental-application-";

// The public reference is not an access credential. Each application receives
// its own HttpOnly cookie so verifying another listing cannot revoke local access.
export function applicationAccessCookieName(reference: string): string | null {
  return /^APP-[0-9A-F]{12}$/.test(reference) ? `${COOKIE_PREFIX}${reference}` : null;
}

export const applicationAccessCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 30 * 24 * 60 * 60,
};

export async function applicationAccessToken(reference: string) {
  const name = applicationAccessCookieName(reference);
  if (!name) return null;
  const value = (await cookies()).get(name)?.value ?? "";
  return /^[0-9a-f]{64}$/.test(value) ? value : null;
}
