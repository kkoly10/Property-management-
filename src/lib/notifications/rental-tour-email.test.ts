import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderNotification } from "./templates";
import { senderFor, unsubscribeUrlFor } from "./sender";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://app.crecyos.com");
  vi.stubEnv("NEXT_PUBLIC_RENTALS_ORIGIN", "https://rent.crecyos.com");
});
afterEach(() => vi.unstubAllEnvs());

describe("rental tour email", () => {
  it("keeps the verification credential in the rentals-host fragment", () => {
    const token = "a".repeat(64);
    const rendered = renderNotification({
      templateCode: "rental_tour_verification",
      locale: "en-US",
      payload: { listingTitle: "Garden apartment", verificationToken: token },
    });
    expect(rendered?.ctaUrl).toBe(`https://rent.crecyos.com/tours/verify#token=${token}`);
    expect(rendered?.body).toContain("does not confirm a tour or reserve the rental");
    expect(senderFor("rental_tour_verification").audience).toBe("operator");
    expect(unsubscribeUrlFor("rental_tour_verification")).toBeNull();
  });

  it("sends confirmed time and private meeting location without approval language", () => {
    const rendered = renderNotification({
      templateCode: "rental_tour_confirmed",
      locale: "en-US",
      payload: {
        listingTitle: "Garden apartment",
        confirmedStartAt: "2026-11-10T23:00:00Z",
        timeZone: "America/New_York",
        meetingLocation: "77 Hidden Court, Fairfax, VA",
      },
    });
    expect(rendered?.body).toContain("77 Hidden Court, Fairfax, VA");
    expect(rendered?.body).toContain("30-minute tour");
    expect(rendered?.body).toContain("does not reserve the rental or approve an application");
    expect(rendered?.body).not.toMatch(/qualified|screened|accepted/i);
    expect(unsubscribeUrlFor("rental_tour_confirmed")).toBeNull();
  });

  it("does not let the verification payload choose another host", () => {
    const rendered = renderNotification({
      templateCode: "rental_tour_verification",
      locale: "en-US",
      payload: {
        listingTitle: "Garden apartment",
        verificationToken: "b".repeat(64),
        verificationUrl: "https://evil.example/phish",
      },
    });
    expect(rendered?.body).not.toContain("evil.example");
    expect(rendered?.ctaUrl).toContain("rent.crecyos.com/tours/verify#token=");
  });
});
