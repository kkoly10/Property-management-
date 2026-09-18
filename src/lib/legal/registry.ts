import { createHash } from "node:crypto";
import { operatorTerms } from "@/lib/legal/documents/operator-terms";
import { privacyNotice } from "@/lib/legal/documents/privacy-notice";
import { esignConsent } from "@/lib/legal/documents/esign-consent";
import { operatorTermsV1_0_0 } from "@/lib/legal/documents/archive/operator-terms-1.0.0";
import { privacyNoticeV1_0_0 } from "@/lib/legal/documents/archive/privacy-notice-1.0.0";
import type { LegalDocument, LegalJurisdiction, ResolvedLegalDocument } from "@/lib/legal/types";

/**
 * The registry, and the rules for turning a set of shown artifacts into consent evidence.
 *
 * The central guarantee: the version recorded on a consent record is DERIVED from the exact bytes of
 * the documents the user was shown. It cannot drift from them, because editing a document changes its
 * content hash and therefore changes the recorded version string.
 */
// esignConsent is registered so its exact bytes resolve to a content hash and a readable route, but it is
// deliberately NOT in ORGANIZATION_CONSENT_CODES: it gates document signing, not workspace creation.
//
// REGISTRY holds the CURRENT artifact for each code — exactly one per code and one per canonical route.
// That is not a style preference: `findLegalDocumentByRoute` resolves by array order, so a second entry
// sharing a route would make /legal/operator-terms resolve to whichever copy happened to be listed
// first. Every resolver below reads REGISTRY and only REGISTRY.
const REGISTRY: LegalDocument[] = [operatorTerms, privacyNotice, esignConsent];

/**
 * Superseded published artifacts, preserved verbatim.
 *
 * A published document is never edited in place, so replacing one leaves the old bytes somewhere. They
 * live here rather than in REGISTRY, and the separation is the whole safety property: an archived
 * version cannot become the active document, cannot be reached by canonical route, cannot appear on
 * /legal or in the sitemap, and cannot be picked up by consent resolution — not by convention, but
 * because no resolver looks at this array. It is read only by the history lookup below, which exists so
 * that a consent record naming an old version can still be checked against what was actually accepted.
 *
 * Adding a version here is the second half of publishing a new one. `registry.test.ts` pins each
 * archived artifact's content hash and asserts this collection never collides with REGISTRY.
 */
const ARCHIVE: LegalDocument[] = [operatorTermsV1_0_0, privacyNoticeV1_0_0];

/** The documents a person must accept to create an organization. */
export const ORGANIZATION_CONSENT_CODES = ["operator_terms", "privacy_notice"] as const;

/**
 * A separator that cannot appear inside any field, so no two different documents can serialize to the
 * same string. Written as an escape on purpose: a literal control character here would make this file
 * binary to git — no reviewable diff on the one module that defines how consent evidence is derived —
 * and any editor that strips it would silently change every hash, and therefore every future
 * consent_records.legal_document_version, breaking verification of already-stored records.
 */
const SEPARATOR = "\u0000";

export function contentHash(document: LegalDocument): string {
  // The hash covers identity AND content, so two documents with the same body but different codes or
  // versions never collide, and a body edit can never keep the same hash.
  const canonical = [document.code, document.version, document.locale, document.effectiveDate, document.body].join(SEPARATOR);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function resolveDocument(document: LegalDocument): ResolvedLegalDocument {
  return { ...document, contentHash: contentHash(document) };
}

export function listLegalDocuments(): ResolvedLegalDocument[] {
  return REGISTRY.map(resolveDocument);
}

export function findLegalDocumentByRoute(route: string): ResolvedLegalDocument | null {
  const match = REGISTRY.find((document) => document.route === route);
  return match ? resolveDocument(match) : null;
}

/** Every superseded artifact, for evidence verification. Never a source of active documents. */
export function listArchivedLegalDocuments(): ResolvedLegalDocument[] {
  return ARCHIVE.map(resolveDocument);
}

/**
 * Look up one exact artifact by code and version, current or superseded.
 *
 * This is the evidence-verification primitive: given `operator_terms@1.0.0` off a stored consent
 * record, it returns the bytes that version actually carried, so the record can be checked rather than
 * taken on trust. It asks for an exact version on purpose — there is no "latest" fallback, because a
 * lookup that quietly answered with a newer document would defeat the point.
 */
export function findLegalDocumentVersion(code: string, version: string): ResolvedLegalDocument | null {
  const match = [...REGISTRY, ...ARCHIVE].find((document) => document.code === code && document.version === version);
  return match ? resolveDocument(match) : null;
}

export function findLegalDocument(
  code: string,
  options?: { locale?: string; jurisdiction?: LegalJurisdiction },
): ResolvedLegalDocument | null {
  const candidates = REGISTRY.filter((document) => {
    if (document.code !== code) return false;
    if (options?.locale && document.locale !== options.locale) return false;
    if (options?.jurisdiction && !document.jurisdictions.includes("*") && !document.jurisdictions.includes(options.jurisdiction)) return false;
    return true;
  });
  if (candidates.length === 0) return null;
  // Prefer a published version over a draft, then the latest effective date.
  const ranked = [...candidates].sort((a, b) => {
    if (a.state !== b.state) return a.state === "published" ? -1 : b.state === "published" ? 1 : 0;
    return b.effectiveDate.localeCompare(a.effectiveDate);
  });
  return resolveDocument(ranked[0]);
}

export type ConsentBinding = {
  documents: ResolvedLegalDocument[];
  /** The exact string persisted as consent_records.legal_document_version. */
  version: string;
};

/**
 * Build the consent evidence for a set of documents.
 *
 * The string names every artifact and its version in a readable form, then pins them with a composite
 * hash of their content hashes. Reading a stored consent record therefore tells you *which* documents
 * were accepted, and lets you prove that a document in the repository today is or is not the one that
 * was actually shown.
 */
export function buildConsentBinding(documents: ResolvedLegalDocument[]): ConsentBinding {
  const ordered = [...documents].sort((a, b) => a.code.localeCompare(b.code));
  const composite = createHash("sha256")
    .update(ordered.map((d) => `${d.code}@${d.version}:${d.contentHash}`).join("|"), "utf8")
    .digest("hex")
    .slice(0, 16);
  const label = ordered.map((d) => `${d.code}@${d.version}`).join("+");
  return { documents: ordered, version: `${label}#${composite}` };
}

export type OrganizationConsentResolution =
  | { ok: true; binding: ConsentBinding; unpublished: ResolvedLegalDocument[] }
  | { ok: false; reason: "MISSING_LEGAL_DOCUMENT" | "LEGAL_DOCUMENT_NOT_PUBLISHED"; missing: string[] };

/**
 * Resolve the documents that must be shown and accepted to create an organization.
 *
 * `requirePublished` is the production gate. File 27 §5.A4: *"In production, if a required binding
 * document is not published, organization creation must fail closed with a clear configuration error
 * rather than recording invented consent evidence."* Outside production a draft may be used so the
 * flow is testable, and the binding string carries the draft version so such a record can never be
 * mistaken for a production consent.
 */
export function resolveOrganizationConsent(options?: {
  jurisdiction?: LegalJurisdiction;
  requirePublished?: boolean;
}): OrganizationConsentResolution {
  const documents: ResolvedLegalDocument[] = [];
  const missing: string[] = [];

  for (const code of ORGANIZATION_CONSENT_CODES) {
    const document = findLegalDocument(code, { jurisdiction: options?.jurisdiction });
    if (!document || document.state === "retired") missing.push(code);
    else documents.push(document);
  }
  if (missing.length > 0) return { ok: false, reason: "MISSING_LEGAL_DOCUMENT", missing };

  const unpublished = documents.filter((document) => document.state !== "published");
  if (options?.requirePublished && unpublished.length > 0) {
    return { ok: false, reason: "LEGAL_DOCUMENT_NOT_PUBLISHED", missing: unpublished.map((d) => d.code) };
  }

  return { ok: true, binding: buildConsentBinding(documents), unpublished };
}

/**
 * The deployment environments this application recognizes.
 *
 * A closed set on purpose. An unrecognized value is a typo or a rename, and the wrong thing to do with
 * a typo is to guess: `CRECY_DEPLOYMENT_ENV=produciton` silently becoming "development" would relax the
 * legal gate on a real production deployment because someone fat-fingered one letter.
 */
export const RECOGNIZED_DEPLOYMENT_ENVIRONMENTS = ["production", "preview", "development", "test"] as const;
export type DeploymentEnvironment = (typeof RECOGNIZED_DEPLOYMENT_ENVIRONMENTS)[number];

export class DeploymentEnvironmentError extends Error {
  constructor(value: string) {
    super(
      `Unrecognized CRECY_DEPLOYMENT_ENV "${value}". Use one of: ${RECOGNIZED_DEPLOYMENT_ENVIRONMENTS.join(", ")}. `
      + "Crecy will not guess a deployment environment, because guessing wrong relaxes the legal publication gate.",
    );
    this.name = "DeploymentEnvironmentError";
  }
}

/**
 * Whether consent must bind to PUBLISHED artifacts here.
 *
 * Three rules, in this order, and the order is the whole design:
 *
 *   1. **Vercel has the last word on production.** `VERCEL_ENV` is set by the platform, not by us. If
 *      it says `production`, this IS a production deployment and published documents are required —
 *      no application-level variable may weaken that. An override that can turn off the gate on real
 *      production is not a gate.
 *   2. **An unrecognized override throws.** Not "falls back to development", not "assumes production
 *      and continues" — throws, so a misconfiguration is a loud failure at the point of use rather
 *      than a silent relaxation nobody notices until consent records are already wrong.
 *   3. **Anything unlabeled is treated as production.** A self-hosted deployment that sets nothing
 *      fails closed. A non-production environment has to say so.
 */
export function requiresPublishedLegalDocuments(): boolean {
  const platform = process.env.VERCEL_ENV?.trim().toLowerCase();
  // Rule 1. Checked FIRST and returned immediately, so no override below can reach it.
  if (platform === "production") return true;

  const declared = process.env.CRECY_DEPLOYMENT_ENV?.trim().toLowerCase();
  if (declared) {
    // Rule 2.
    if (!(RECOGNIZED_DEPLOYMENT_ENVIRONMENTS as readonly string[]).includes(declared)) {
      throw new DeploymentEnvironmentError(process.env.CRECY_DEPLOYMENT_ENV as string);
    }
    return declared === "production";
  }

  // A Vercel preview or development deployment is genuinely not production.
  if (platform === "preview" || platform === "development") return false;

  // Rule 3.
  return process.env.NODE_ENV === "production";
}
