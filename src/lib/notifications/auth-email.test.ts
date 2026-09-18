import { describe, expect, it } from "vitest";
import { AUTH_EMAIL_ACTION_TYPES, VERIFY_OTP_TYPE, isAuthEmailActionType, isSecurityNotification, renderAuthEmail } from "./auth-email";
import { renderEmailHtml } from "./html-email";

const LANGUAGES = ["en", "es", "fr"] as const;
const CONFIRM = "https://app.crecyos.com/auth/confirm?token_hash=abc123def456ghi789&type=magiclink";

describe("the Supabase Auth email family", () => {
  it("renders every action type the hook contract can send, in every language", () => {
    for (const actionType of AUTH_EMAIL_ACTION_TYPES) {
      for (const language of LANGUAGES) {
        const rendered = renderAuthEmail({ actionType, language, confirmUrl: CONFIRM, token: "123456" });
        expect(rendered.subject.length, `${actionType}/${language}: subject`).toBeGreaterThan(8);
        expect(rendered.heading, `${actionType}/${language}: heading`).toBeTruthy();
        expect(rendered.body.length, `${actionType}/${language}: body`).toBeGreaterThan(20);
        expect(rendered.language, `${actionType}/${language}`).toBe(language);
      }
    }
  });

  it("gives an action a button and a security notification none", () => {
    // A notification reports something that already happened. There is nothing to confirm, and a
    // button on "your password was changed" is how a recipient gets trained to click one on a forgery.
    for (const actionType of AUTH_EMAIL_ACTION_TYPES) {
      const rendered = renderAuthEmail({ actionType, language: "en", confirmUrl: CONFIRM, token: "123456" });
      if (isSecurityNotification(actionType)) {
        expect(rendered.ctaUrl, `${actionType} should have no call to action`).toBeUndefined();
        expect(rendered.body, `${actionType} leaked the link`).not.toContain(CONFIRM);
      } else if (VERIFY_OTP_TYPE[actionType]) {
        expect(rendered.ctaUrl, `${actionType} should link to the confirm endpoint`).toBe(CONFIRM);
      }
    }
  });

  it("tells a reauthentication recipient the code instead of giving them a link", () => {
    const rendered = renderAuthEmail({ actionType: "reauthentication", language: "en", confirmUrl: CONFIRM, token: "123456" });
    expect(rendered.ctaUrl).toBeUndefined();
    expect(rendered.body).toContain("123456");
    expect(rendered.body).not.toContain(CONFIRM);
  });

  it("says what to do if the recipient did not do this, on every message", () => {
    for (const actionType of AUTH_EMAIL_ACTION_TYPES) {
      for (const language of LANGUAGES) {
        const rendered = renderAuthEmail({ actionType, language, confirmUrl: CONFIRM, token: "123456" });
        expect(rendered.securityNote, `${actionType}/${language}`).toBeTruthy();
      }
    }
  });

  it("never renders a confirmation link that is not http(s)", () => {
    const rendered = renderAuthEmail({ actionType: "magiclink", language: "en", confirmUrl: "javascript:alert(1)" });
    expect(rendered.ctaUrl).toBeUndefined();
    expect(rendered.body).not.toContain("javascript:");
  });

  it("claims no capability that is not configured", () => {
    // The phone-change notice reports a change; it must not read as though Crecy sends SMS.
    for (const language of LANGUAGES) {
      const rendered = renderAuthEmail({ actionType: "phone_changed_notification", language });
      expect(rendered.body).not.toMatch(/\bSMS\b|\btext message\b|\bmensaje de texto\b|\bSMS\b/i);
    }
  });

  it("only maps the action types that actually have a verifyOtp type", () => {
    // `reauthentication` is verified with a typed code, and the notifications are not verifiable at
    // all. Inventing an OTP type for them would build a confirmation endpoint for nothing.
    expect(VERIFY_OTP_TYPE.reauthentication).toBeUndefined();
    for (const actionType of AUTH_EMAIL_ACTION_TYPES.filter(isSecurityNotification)) {
      expect(VERIFY_OTP_TYPE[actionType], actionType).toBeUndefined();
    }
    expect(Object.keys(VERIFY_OTP_TYPE).sort()).toEqual(["email", "email_change", "invite", "magiclink", "recovery", "signup"]);
  });

  it("recognises exactly the documented action types", () => {
    expect(isAuthEmailActionType("magiclink")).toBe(true);
    expect(isAuthEmailActionType("password_changed_notification")).toBe(true);
    expect(isAuthEmailActionType("not_a_real_action")).toBe(false);
    expect(isAuthEmailActionType(null)).toBe(false);
  });

  it("renders through the same Crecy design system as every other message", () => {
    for (const audience of ["operator", "resident", "owner"] as const) {
      const rendered = renderAuthEmail({ actionType: "recovery", language: "fr", confirmUrl: CONFIRM });
      const html = renderEmailHtml({
        subject: rendered.subject,
        body: rendered.body,
        audience,
        language: "fr",
        heading: rendered.heading,
        ctaLabel: rendered.ctaLabel,
        ctaUrl: rendered.ctaUrl,
        securityNote: rendered.securityNote,
        unsubscribeUrl: null,
      });
      expect(html, `${audience}: language`).toContain('lang="fr"');
      // The ampersand in the query string is escaped in the href, as it must be, so the assertion
      // is on a distinctive unescaped fragment rather than on the raw URL.
      expect(html, `${audience}: cta`).toContain("token_hash=abc123def456ghi789");
      // Authentication mail is never unsubscribable — opting out of the message that lets you sign in
      // would lock you out of your own account.
      expect(html, `${audience}: unsubscribe`).not.toContain("Gérer les préférences");
    }
  });
});
