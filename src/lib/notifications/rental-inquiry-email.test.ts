import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderNotification } from "./templates";
import { senderFor, unsubscribeUrlFor } from "./sender";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://app.crecyos.com");
  vi.stubEnv("NEXT_PUBLIC_RENTALS_ORIGIN", "https://rent.crecyos.com");
});
afterEach(() => vi.unstubAllEnvs());

describe("rental inquiry verification email", () => {
  it("puts the opaque credential in a rentals-host fragment and is not unsubscribable", () => {
    const token = "a".repeat(64);
    const rendered = renderNotification({
      templateCode: "rental_inquiry_verification",
      locale: "en-US",
      payload: { listingTitle: "Garden apartment", verificationToken: token },
    });
    expect(rendered?.ctaUrl).toBe(`https://rent.crecyos.com/inquiries/verify#token=${token}`);
    expect(rendered?.body).toContain("does not reserve the rental or approve an application");
    expect(senderFor("rental_inquiry_verification").audience).toBe("operator");
    expect(unsubscribeUrlFor("rental_inquiry_verification")).toBeNull();
  });

  it("never lets a payload choose an outbound destination", () => {
    const rendered = renderNotification({
      templateCode: "rental_inquiry_verification",
      locale: "en-US",
      payload: {
        listingTitle: "Garden apartment",
        verificationToken: "b".repeat(64),
        verificationUrl: "https://evil.example/phish",
      },
    });
    expect(rendered?.body).not.toContain("evil.example");
    expect(rendered?.ctaUrl).toContain("rent.crecyos.com/inquiries/verify#token=");
  });
});
