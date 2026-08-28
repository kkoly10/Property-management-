/**
 * The versioned legal registry (file 27 §5.A4).
 *
 * Before this, onboarding sent a hardcoded `p_terms_version: "2026-07-20"` to `create_organization`
 * and recorded a consent record against it. There was no document with that version, no artifact
 * anywhere in the repository, no route to read one, and the checkbox linked to nothing. The consent
 * evidence pointed at a string, not a thing.
 *
 * Every binding document now declares what it is, which version it is, whether it has actually been
 * published, and where a person can read it — and consent evidence is derived from the exact bytes of
 * the artifacts that were shown.
 */
export type LegalPublicationState = "draft" | "published" | "retired";

export type LegalAudience = "operator" | "resident" | "owner" | "vendor" | "public";

/** "*" means the document applies wherever Crecy operates; otherwise ISO 3166-1 alpha-2. */
export type LegalJurisdiction = "*" | "US" | "CA" | "MX";

export type LegalDocument = {
  /** Stable identifier used in consent evidence. Never reused for a different document. */
  code: string;
  title: string;
  audience: LegalAudience;
  locale: string;
  jurisdictions: LegalJurisdiction[];
  /** Semantic version. A new version is a new artifact, never an edit of a published one. */
  version: string;
  /** ISO date this version takes effect. */
  effectiveDate: string;
  state: LegalPublicationState;
  /** The canonical public route where this exact version can be read. */
  route: string;
  /** The exact text rendered at that route. The content hash is derived from it. */
  body: string;
};

/** A document plus the immutable hash of what it actually says. */
export type ResolvedLegalDocument = LegalDocument & { contentHash: string };
