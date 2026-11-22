import "server-only";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";

export function rentalApplicationRateLimit(request: Request, purpose: "submission" | "recovery") {
  const secret = process.env.RENTAL_INQUIRY_RATE_LIMIT_SECRET?.trim();
  if (!secret || secret.includes("replace_me") || secret.length < 32) return null;

  // Missing or malformed edge metadata must never disable the production network budget.
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  if (isIP(forwarded) === 0 && process.env.NODE_ENV === "production") return null;

  const networkNamespace = purpose === "submission" ? "rental-application-ip" : "rental-application-recovery-ip";
  return {
    networkHash: isIP(forwarded) ? createHmac("sha256", secret).update(`${networkNamespace}:${forwarded}`).digest("hex") : null,
    recoveryContactHash: (reference: string, email: string) =>
      createHmac("sha256", secret).update(`rental-application-recovery-contact:${reference}:${email}`).digest("hex"),
  };
}
