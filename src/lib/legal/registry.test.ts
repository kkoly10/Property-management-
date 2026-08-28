import { afterEach, describe, expect, it } from "vitest";
import {
  ORGANIZATION_CONSENT_CODES,
  buildConsentBinding,
  contentHash,
  findLegalDocument,
  findLegalDocumentByRoute,
  listLegalDocuments,
  resolveDocument,
  DeploymentEnvironmentError,
  requiresPublishedLegalDocuments,
  resolveOrganizationConsent,
} from "./registry";
import type { LegalDocument } from "./types";

const base: LegalDocument = {
  code: "operator_terms",
  title: "Terms",
  audience: "operator",
  locale: "en-US",
  jurisdictions: ["*"],
  version: "1.0.0",
  effectiveDate: "2026-01-01",
  state: "published",
  route: "/legal/operator-terms",
  body: "The agreement.",
};

describe("the registry itself", () => {
  it("declares every field a binding artifact needs", () => {
    for (const document of listLegalDocuments()) {
      expect(document.code).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(document.version).toBeTruthy();
      expect(document.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(["draft", "published", "retired"]).toContain(document.state);
      expect(document.route.startsWith("/legal/")).toBe(true);
      expect(document.jurisdictions.length).toBeGreaterThan(0);
      expect(document.body.length).toBeGreaterThan(400);
      expect(document.contentHash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("gives every consent document a reachable canonical route", () => {
    for (const code of ORGANIZATION_CONSENT_CODES) {
      const document = findLegalDocument(code);
      expect(document, `${code} is missing from the registry`).not.toBeNull();
      expect(findLegalDocumentByRoute(document!.route)?.code).toBe(code);
    }
  });
});

describe("contentHash", () => {
  it("changes when ANY part of the artifact changes", () => {
    // This is what makes consent evidence meaningful: a stored version can be checked against the
    // document in the repository, and an edited document cannot masquerade as the accepted one.
    const original = contentHash(base);
    expect(contentHash({ ...base, body: "The agreement, amended." })).not.toBe(original);
    expect(contentHash({ ...base, version: "1.0.1" })).not.toBe(original);
    expect(contentHash({ ...base, effectiveDate: "2026-02-01" })).not.toBe(original);
    expect(contentHash({ ...base, code: "privacy_notice" })).not.toBe(original);
    // A field that does not change what was agreed does not change the hash.
    expect(contentHash({ ...base, title: "Renamed in the UI" })).toBe(original);
  });

  it("is stable for identical input", () => {
    expect(contentHash(base)).toBe(contentHash({ ...base }));
  });

  it("is pinned to an exact value, so the serialization cannot change unnoticed", () => {
    // Without this, any edit to the canonical serialization — a changed separator, a reordered or
    // added field — would silently change every hash, therefore every future
    // consent_records.legal_document_version, and quietly break verification of records already
    // stored. Relative assertions cannot catch that; only a pinned value can.
    //
    // If this fails you have changed how consent evidence is derived. That is a decision about
    // existing records, not a test to update.
    expect(contentHash(base)).toBe("bff5bc688624b13e6d12c7ff09fd585488446317b34bdb5389e7007f0d8797d9");
  });
});

describe("buildConsentBinding", () => {
  const privacy: LegalDocument = { ...base, code: "privacy_notice", route: "/legal/privacy-notice", body: "The notice.", version: "2.1.0" };

  it("names every artifact and version, then pins them with a composite hash", () => {
    const binding = buildConsentBinding([resolveDocument(base), resolveDocument(privacy)]);
    expect(binding.version).toMatch(/^operator_terms@1\.0\.0\+privacy_notice@2\.1\.0#[0-9a-f]{16}$/);
  });

  it("does not depend on the order the documents were passed in", () => {
    const forward = buildConsentBinding([resolveDocument(base), resolveDocument(privacy)]);
    const reverse = buildConsentBinding([resolveDocument(privacy), resolveDocument(base)]);
    expect(reverse.version).toBe(forward.version);
  });

  it("changes when the accepted text changes, even at the same version numbers", () => {
    // The decisive property. Silently editing a published document must not leave earlier consent
    // records looking like they accepted the new text.
    const before = buildConsentBinding([resolveDocument(base), resolveDocument(privacy)]);
    const after = buildConsentBinding([resolveDocument({ ...base, body: "The agreement, quietly amended." }), resolveDocument(privacy)]);
    expect(after.version).not.toBe(before.version);
  });
});

describe("resolveOrganizationConsent", () => {
  it("resolves both required documents and derives a version from them", () => {
    const resolution = resolveOrganizationConsent();
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    expect(resolution.binding.documents.map((d) => d.code).sort()).toEqual([...ORGANIZATION_CONSENT_CODES].sort());
    for (const code of ORGANIZATION_CONSENT_CODES) {
      expect(resolution.binding.version).toContain(code);
    }
    // Never the hardcoded literal this slice removed.
    expect(resolution.binding.version).not.toBe("2026-07-20");
  });

  it("fails closed when a required document is not published", () => {
    // The production gate. Recording consent against a draft would be inventing evidence.
    const resolution = resolveOrganizationConsent({ requirePublished: true });
    if (resolution.ok) {
      // If the documents have since been published by a human, there must be nothing unpublished left.
      expect(resolution.unpublished).toEqual([]);
      return;
    }
    expect(resolution.reason).toBe("LEGAL_DOCUMENT_NOT_PUBLISHED");
    expect(resolution.missing.length).toBeGreaterThan(0);
    for (const code of resolution.missing) expect(ORGANIZATION_CONSENT_CODES).toContain(code as never);
  });

  it("reports drafts even when it allows them outside production", () => {
    const resolution = resolveOrganizationConsent({ requirePublished: false });
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    const draftCodes = resolution.unpublished.map((d) => d.code);
    const published = resolution.binding.documents.filter((d) => d.state === "published").map((d) => d.code);
    // Every required document is accounted for as either published or explicitly flagged as a draft.
    expect([...draftCodes, ...published].sort()).toEqual([...ORGANIZATION_CONSENT_CODES].sort());
    // A draft version is visible in the evidence string, so such a record can never be mistaken for a
    // production acceptance.
    for (const document of resolution.unpublished) {
      expect(resolution.binding.version).toContain(document.version);
    }
  });

  it("only offers documents that apply where the operator is", () => {
    for (const code of ORGANIZATION_CONSENT_CODES) {
      const document = findLegalDocument(code, { jurisdiction: "MX" });
      expect(document, `${code} does not apply in MX`).not.toBeNull();
      expect(document!.jurisdictions.includes("*") || document!.jurisdictions.includes("MX")).toBe(true);
    }
  });
});

describe("requiresPublishedLegalDocuments", () => {
  const saved = { ...process.env };
  // NODE_ENV is typed readonly; this suite deliberately varies it to exercise the fallback.
  const setNodeEnv = (value: string) => {
    (process.env as Record<string, string | undefined>).NODE_ENV = value;
  };
  const clearEnvironment = () => {
    delete process.env.CRECY_DEPLOYMENT_ENV;
    delete process.env.VERCEL_ENV;
  };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("requires published documents on a Vercel production deployment", () => {
    clearEnvironment();
    process.env.VERCEL_ENV = "production";
    expect(requiresPublishedLegalDocuments()).toBe(true);
  });

  it("does NOT let an application override weaken a known Vercel production deployment", () => {
    // The decisive rule. VERCEL_ENV is set by the platform; CRECY_DEPLOYMENT_ENV is set by whoever
    // edits the project's variables. If the second could switch off the gate on real production, the
    // gate would be advisory — and one copied `.env` line would be enough to record consent against
    // unpublished drafts for every workspace created from then on.
    clearEnvironment();
    process.env.VERCEL_ENV = "production";
    for (const override of ["development", "preview", "test"]) {
      process.env.CRECY_DEPLOYMENT_ENV = override;
      expect(requiresPublishedLegalDocuments(), `override "${override}" weakened Vercel production`).toBe(true);
    }
  });

  it("throws on an unrecognized environment rather than guessing", () => {
    // A typo must not silently become "development". This is the exact misspelling the reviewer named.
    clearEnvironment();
    process.env.CRECY_DEPLOYMENT_ENV = "produciton";
    expect(() => requiresPublishedLegalDocuments()).toThrow(DeploymentEnvironmentError);
    expect(() => requiresPublishedLegalDocuments()).toThrow(/produciton/);
    for (const bogus of ["prod", "staging", "PRODUCTION_", "live", " "]) {
      process.env.CRECY_DEPLOYMENT_ENV = bogus;
      if (bogus.trim() === "") {
        // An all-whitespace value is indistinguishable from unset, and unset falls through to rule 3.
        expect(() => requiresPublishedLegalDocuments()).not.toThrow();
      } else {
        expect(() => requiresPublishedLegalDocuments(), `"${bogus}" did not fail closed`).toThrow(DeploymentEnvironmentError);
      }
    }
  });

  it("relaxes only for a recognized non-production environment", () => {
    clearEnvironment();
    for (const environment of ["preview", "development", "test"]) {
      process.env.CRECY_DEPLOYMENT_ENV = environment;
      expect(requiresPublishedLegalDocuments(), `${environment} should not require published`).toBe(false);
    }
    process.env.CRECY_DEPLOYMENT_ENV = "production";
    expect(requiresPublishedLegalDocuments()).toBe(true);
  });

  it("treats a Vercel preview or development deployment as non-production without an override", () => {
    clearEnvironment();
    for (const platform of ["preview", "development"]) {
      process.env.VERCEL_ENV = platform;
      expect(requiresPublishedLegalDocuments()).toBe(false);
    }
  });

  it("treats an unlabeled production build as production rather than defaulting to lax", () => {
    // The safe default. A self-hosted deployment that sets neither variable must fail closed.
    clearEnvironment();
    setNodeEnv("production");
    expect(requiresPublishedLegalDocuments()).toBe(true);
  });

  it("is not strict for an unlabeled non-production runtime", () => {
    clearEnvironment();
    setNodeEnv("development");
    expect(requiresPublishedLegalDocuments()).toBe(false);
  });
});
