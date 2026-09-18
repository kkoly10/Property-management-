import { afterEach, describe, expect, it } from "vitest";
import {
  ORGANIZATION_CONSENT_CODES,
  buildConsentBinding,
  contentHash,
  findLegalDocument,
  findLegalDocumentByRoute,
  findLegalDocumentVersion,
  listArchivedLegalDocuments,
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

/**
 * The published pilot artifacts, and the line between the current ones and their history.
 *
 * 1.0.0 of the Terms and the Privacy Notice went out carrying placeholder `@crecy.example` contact
 * addresses. Correcting them is a publication, not an edit: 1.0.1 carries the founder-approved
 * addresses and 1.0.0 is kept verbatim, because a consent record naming it has to stay checkable
 * against the bytes that were actually shown.
 *
 * These assertions are what stop the two halves from blurring — an archive that quietly becomes the
 * active document, or a current document that quietly stops being current.
 */
describe("the published pilot artifacts", () => {
  const CURRENT_VERSIONS: Record<string, string> = {
    operator_terms: "1.0.1",
    privacy_notice: "1.0.1",
    // Untouched by this release. ESIGN's contact instruction points at the sender of the document, not
    // at Crecy, so it never carried a placeholder address to correct.
    esign_consent: "1.0.0",
  };
  const APPROVED_CONTACTS: Record<string, string> = {
    operator_terms: "legal@crecyos.com",
    privacy_notice: "privacy@crecyos.com",
  };

  /**
   * Pinned so an accidental edit to a historical artifact fails loudly.
   *
   * These are the content hashes the 1.0.0 documents had while they were the live, published
   * artifacts — captured before 1.0.1 was written. If one of these fails, someone has changed the text
   * of a version that was already shown to people. That is not a test to update: it is a decision
   * about what past acceptances mean, and the fix is to restore the bytes.
   */
  const PINNED_HASHES: Record<string, string> = {
    "operator_terms@1.0.0": "be0bf7fff53879921ddfb81110a8057d565e87c5e9a1b399ed68a675d17269f3",
    "privacy_notice@1.0.0": "e3b45572ec322c6e2323c2b99166a2b4354f1df0975b494b01495bb9eb091e81",
    "esign_consent@1.0.0": "a1f507cd714448e745d13d1b2e2614549fd7ab44560d5d2f3cef28034f8f2dc7",
  };

  const current = (code: string) => {
    const document = findLegalDocument(code);
    expect(document, `${code} is missing from the active registry`).not.toBeNull();
    return document!;
  };

  it("resolves the corrected Terms and Privacy Notice as the current published artifacts", () => {
    for (const code of ORGANIZATION_CONSENT_CODES) {
      const document = current(code);
      expect(document.version, `${code} is not the corrected version`).toBe(CURRENT_VERSIONS[code]);
      expect(document.state, `${code} is not published`).toBe("published");
      expect(document.effectiveDate).toBe("2026-09-18");
    }
  });

  it("carries the founder-approved contact address in each current document", () => {
    for (const [code, contact] of Object.entries(APPROVED_CONTACTS)) {
      expect(current(code).body, `${code} does not name ${contact}`).toContain(contact);
    }
  });

  it("has no placeholder contact left anywhere in the current documents", () => {
    // Scoped to the ACTIVE registry on purpose: the archived 1.0.0 artifacts still contain the
    // placeholder, and must, because that is what they said.
    for (const document of listLegalDocuments()) {
      expect(document.body, `${document.code}@${document.version} still carries a placeholder address`)
        .not.toMatch(/crecy\.example/);
    }
  });

  /** Line wrapping is a source-file concern; what a reader sees is the text with it collapsed. */
  const flat = (body: string) => body.replace(/\s+/g, " ");
  const sentences = (body: string) => flat(body).split(/(?<=\.)\s+/);

  it("offers a portal only to the people who actually have one", () => {
    // There is no vendor portal in the launch product — `vendor.crecyos.com` is a future surface — so
    // 1.0.0's "portals to the residents, owners and vendors you invite" named a capability an operator
    // could not give anyone. The positive pin and the negative sweep are both needed: the first catches
    // a deletion that loses the sentence, the second catches the claim coming back in other words.
    expect(flat(current("operator_terms").body)).toContain("presents portals to the residents and owners you invite.");
    for (const document of listLegalDocuments()) {
      for (const sentence of sentences(document.body)) {
        if (!/portal/i.test(sentence)) continue;
        expect(sentence, `${document.code}@${document.version} offers a portal to vendors`).not.toMatch(/vendor/i);
      }
    }
  });

  it("claims no inspection of uploaded files, because none is active", () => {
    // Malware scanning is deliberately not switched on for the controlled pilot, so 1.0.0's "service
    // providers to host the product, deliver messages, scan uploaded files and process payments"
    // described an inspection that does not happen. The claim is removed rather than reversed: the
    // documents now say nothing either way, because asserting that files are NOT inspected would be a
    // new statement rather than the withdrawal of an inaccurate one.
    for (const document of listLegalDocuments()) {
      expect(document.body, `${document.code}@${document.version} claims uploaded files are inspected`)
        .not.toMatch(/\b(scan|scans|scanned|scanning|virus|malware)\b/i);
    }
  });

  it("names vendors as the subject of records, never as people with product access", () => {
    // The distinction the correction turns on. Section 4 answers "who else sees it", so naming a vendor
    // there says a vendor can see something — they cannot. Section 1 names vendors correctly: an
    // operator does enter records ABOUT vendors, and deleting that would be an over-correction that
    // hides real processing from the person the data is about.
    const privacy = current("privacy_notice");
    const whoSeesIt = privacy.body.split(/\n## /).find((section) => section.startsWith("4. Who else sees it"));
    expect(whoSeesIt, "the notice no longer has a 'Who else sees it' section to check").toBeTruthy();
    expect(flat(whoSeesIt as string), "a vendor is still named among the people who can see a record")
      .not.toMatch(/vendor/i);
    expect(flat(privacy.body)).toContain("operational records an operator enters about their residents, owners and vendors");
  });

  it("describes messaging and payments as conditional, because neither is switched on", () => {
    // Three different accuracy failures are possible in one sentence, and the notice has to avoid all
    // three: claiming a flow that is not happening, dropping a flow that will happen, and losing the
    // one that is happening now. Hosting is live and stated flatly; the transactional mail relay and
    // Stripe are built but unconfigured, so those are stated as conditional. Silence about them would
    // under-disclose real processing the moment either feature is enabled — the worse failure here.
    const privacy = current("privacy_notice");
    const whoSeesIt = flat(privacy.body.split(/\n## /).find((section) => section.startsWith("4. Who else sees it")) as string);
    expect(whoSeesIt).toContain("We use service providers to host the product.");
    expect(whoSeesIt).toContain(
      "When messaging or payment features are enabled, service providers may also deliver messages and process payments",
    );
    expect(whoSeesIt, "the notice presents messaging and payment flows as already happening")
      .not.toContain("host the product, deliver messages and process payments");
  });

  it("states its own version and effective date in the text a person reads", () => {
    // The badge on /legal/<slug> comes from the metadata; the "Effective … · Version …" line comes from
    // the body. If they disagree the page shows one version and the document claims another, which is
    // the same class of lie as an unversioned edit.
    for (const document of [...listLegalDocuments(), ...listArchivedLegalDocuments()]) {
      expect(document.body, `${document.code}@${document.version} does not state its own identity`)
        .toContain(`Effective ${document.effectiveDate} \u00b7 Version ${document.version}`);
    }
  });

  it("preserves the superseded 1.0.0 artifacts byte for byte, placeholders and all", () => {
    const archived = listArchivedLegalDocuments();
    expect(archived.map((d) => `${d.code}@${d.version}`).sort()).toEqual(["operator_terms@1.0.0", "privacy_notice@1.0.0"]);
    for (const document of archived) {
      const key = `${document.code}@${document.version}`;
      expect(document.contentHash, `${key} has been edited since it was published`).toBe(PINNED_HASHES[key]);
      expect(document.effectiveDate).toBe("2026-09-04");
      expect(document.state).toBe("published");
      // The placeholder is the reason 1.0.1 exists. Cleaning it up here would rewrite history.
      expect(document.body).toMatch(/crecy\.example/);
    }
  });

  it("leaves the ESIGN consent disclosure at 1.0.0, unchanged", () => {
    // It is not part of organization consent and was not part of this release. `sign_document` records
    // the exact version a signer was shown, so an unnoticed bump here would rewrite the disclosure
    // behind every past signature.
    const esign = current("esign_consent");
    expect(esign.version).toBe("1.0.0");
    expect(esign.effectiveDate).toBe("2026-09-04");
    expect(esign.state).toBe("published");
    expect(esign.contentHash).toBe(PINNED_HASHES["esign_consent@1.0.0"]);
  });

  it("binds organization consent to the corrected artifacts", () => {
    const resolution = resolveOrganizationConsent({ requirePublished: true });
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    expect(resolution.binding.version).toMatch(/^operator_terms@1\.0\.1\+privacy_notice@1\.0\.1#[0-9a-f]{16}$/);
    expect(resolution.unpublished).toEqual([]);
  });

  it("produces a different binding than the superseded artifacts did", () => {
    // The decisive property of the correction. If these matched, a record written against 1.0.0 and one
    // written against 1.0.1 would be indistinguishable, and the placeholder addresses would be
    // retroactively laundered into the corrected text.
    const superseded = buildConsentBinding(listArchivedLegalDocuments());
    const resolution = resolveOrganizationConsent({ requirePublished: true });
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    expect(superseded.version).toMatch(/^operator_terms@1\.0\.0\+privacy_notice@1\.0\.0#[0-9a-f]{16}$/);
    expect(resolution.binding.version).not.toBe(superseded.version);
  });

  it("resolves every canonical public route to the current artifact, never an archived one", () => {
    const archivedHashes = new Set(listArchivedLegalDocuments().map((d) => d.contentHash));
    for (const document of listLegalDocuments()) {
      const routed = findLegalDocumentByRoute(document.route);
      expect(routed?.contentHash, `${document.route} did not resolve to the current artifact`).toBe(document.contentHash);
      expect(archivedHashes.has(routed!.contentHash), `${document.route} resolved to an archived artifact`).toBe(false);
      expect(routed!.version).toBe(CURRENT_VERSIONS[document.code]);
    }
  });

  it("never lets a second artifact compete for a code or a canonical route", () => {
    // findLegalDocumentByRoute resolves by array order, so a duplicate route would make the public page
    // resolve to whichever copy was listed first. This is the guard against someone adding an archived
    // version straight into the active registry.
    const codes = listLegalDocuments().map((d) => d.code);
    const routes = listLegalDocuments().map((d) => d.route);
    expect(new Set(codes).size, "two active artifacts share a code").toBe(codes.length);
    expect(new Set(routes).size, "two active artifacts share a canonical route").toBe(routes.length);
    for (const archived of listArchivedLegalDocuments()) {
      const key = `${archived.code}@${archived.version}`;
      expect(codes.includes(archived.code), `${key} is archived but its code is unknown to the registry`).toBe(true);
      expect(
        listLegalDocuments().some((d) => d.code === archived.code && d.version === archived.version),
        `${key} exists in BOTH the active registry and the archive`,
      ).toBe(false);
    }
  });

  it("looks up an exact historical version, and refuses to answer with a newer one", () => {
    const historical = findLegalDocumentVersion("operator_terms", "1.0.0");
    expect(historical?.contentHash).toBe(PINNED_HASHES["operator_terms@1.0.0"]);
    // The current artifact is reachable through the same lookup...
    expect(findLegalDocumentVersion("operator_terms", "1.0.1")?.version).toBe("1.0.1");
    // ...but a version that was never published resolves to nothing rather than to the closest match.
    expect(findLegalDocumentVersion("operator_terms", "0.9.0")).toBeNull();
    expect(findLegalDocumentVersion("nonexistent_document", "1.0.0")).toBeNull();
  });
});
