import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderEmailHtml } from "./html-email";
import { renderNotification } from "./templates";
import { isAccessMail, senderFor, unsubscribeUrlFor } from "./sender";

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
    expect(rendered?.subject).toBe("Confirm your rental inquiry");
    expect(rendered?.preheader).toBe("Verify your email to share your question with the landlord.");
    expect(rendered?.body).toContain(`Verify my email: https://rent.crecyos.com/inquiries/verify#token=${token}`);
    expect(rendered?.body).toContain("On the next page, select “Verify my email”");
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

describe("verified rental inquiry landlord email", () => {
  const code = "message_rental_inquiry_received";
  const unitId = "b4b58943-a1cf-412f-a949-a89a375ddd9a";
  const reference = "INQ-1234ABCDEF90";
  const workspace = `https://app.crecyos.com/app/rentals/${unitId}/inquiries`;
  const preferences = "https://app.crecyos.com/settings/notifications";

  it.each([
    ["en-US", "en", "New rental inquiry", "Open rental inquiries", "Inquiry reference"],
    ["es-MX", "es", "Nueva consulta sobre tu alquiler", "Abrir consultas de alquiler", "Referencia de la consulta"],
    ["fr-CA", "fr", "Nouvelle question sur votre location", "Ouvrir les questions sur la location", "Référence de la question"],
  ])("renders a localized operator link in HTML and plain text (%s)", (locale, language, subject, action, label) => {
    const rendered = renderNotification({
      templateCode: code,
      locale,
      payload: { unitId, inquiryReference: reference },
    })!;
    expect(rendered).toMatchObject({
      language, subject, ctaUrl: workspace, ctaLabel: action,
      details: [{ label, value: reference }],
    });
    expect(rendered.preheader?.length).toBeLessThan(90);
    expect(rendered.body).toContain(`${action}: ${workspace}`);
    expect(rendered.body).toContain(reference);
    const html = renderEmailHtml({
      ...rendered, audience: senderFor(code).audience, unsubscribeUrl: unsubscribeUrlFor(code),
    });
    expect(html).toContain(`lang="${language}"`);
    expect(html).toContain(`href="${workspace}"`);
    expect(html).toContain(action);
    expect(html).toContain(reference);
    expect(html).toContain(`href="${preferences}"`);
  });

  it("categorizes the alert as messages and routes its preferences to Crecy OS", () => {
    expect(senderFor(code)).toMatchObject({ audience: "operator", unsubscribable: true });
    expect(isAccessMail(code)).toBe(false);
    expect(unsubscribeUrlFor(code)).toBe(preferences);
  });

  it("allows only a UUID for the CTA and a formatted optional reference, with no inquiry content", () => {
    const payload = {
      unitId,
      inquiryReference: "https://unexpected.example",
      listingTitle: "Private street address",
      email: "applicant@example.com",
      firstName: "Sam Applicant",
      question: "Private inquiry text",
      verificationToken: "f".repeat(64),
      inquiriesUrl: "https://unexpected.example",
    };
    const rendered = renderNotification({ templateCode: code, locale: "en-US", payload })!;
    expect(rendered.ctaUrl).toBe(workspace);
    expect(rendered.details).toBeUndefined();
    expect(JSON.stringify(rendered)).not.toMatch(
      /unexpected\.example|applicant@example\.com|Sam Applicant|Private (street address|inquiry text)|f{64}/,
    );
    const invalid = renderNotification({
      templateCode: code, locale: "en-US", payload: { ...payload, unitId: unitId + "/../settings" },
    })!;
    expect(invalid.ctaUrl).toBeUndefined();
    expect(invalid.body).not.toContain("https://");
  });
});
