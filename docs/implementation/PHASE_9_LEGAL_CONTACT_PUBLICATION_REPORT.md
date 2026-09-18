# Phase 9 — Legal contact publication: Terms and Privacy Notice 1.0.1

**No migration.** This release changes source artifacts only; the database is untouched.

## The defect

`operator_terms` and `privacy_notice` were published at 1.0.0 on 2026-09-04 carrying **placeholder**
contact addresses — `legal@crecy.example` and `privacy@crecy.example`. A published legal document that
tells a reader to write to an address which does not exist is not a cosmetic problem: section 8 of the
Terms and section 7 of the Privacy Notice are the only routes a person has to raise a question or
exercise a data right.

## What shipped

**New current artifacts, version 1.0.1, effective 2026-09-18, published.** Each differs from 1.0.0 in
exactly two places: the `**Effective … · Version …**` line, and the contact address, which is now the
founder-approved `legal@crecyos.com` / `privacy@crecyos.com`. No substantive term changed and no term
was added. `esign_consent` is untouched at 1.0.0 — it points signers at whoever sent them the document,
so it never carried a Crecy address to correct.

**1.0.0 preserved verbatim.** `src/lib/legal/documents/archive/{operator-terms,privacy-notice}-1.0.0.ts`
hold the exact bytes that were published, placeholder addresses and all. They were produced by copying
the files before 1.0.1 was written, and their content hashes were captured *before* any edit and pinned
in `registry.test.ts`, so the archive is provably the artifact that was live rather than a retyping of
it.

**A second collection, not a second registry entry.** `registry.ts` gains `ARCHIVE`, read by two new
functions and by nothing else:

* `listArchivedLegalDocuments()` — every superseded artifact.
* `findLegalDocumentVersion(code, version)` — one exact artifact, current or superseded, for checking a
  stored consent record against the bytes that were accepted. No "latest" fallback, deliberately: a
  lookup that quietly answered with a newer document would defeat its own purpose.

`REGISTRY` still holds exactly one artifact per code and per route. That is the whole safety property.
`findLegalDocumentByRoute` resolves by array order, so a second entry sharing `/legal/operator-terms`
would make the canonical public page resolve to whichever copy happened to be listed first. An archived
version cannot become active, cannot be routed to, cannot appear on `/legal` or in the sitemap and
cannot be picked up by consent resolution — not by convention, but because no resolver reads `ARCHIVE`.

**Consent binding** moves from `operator_terms@1.0.0+privacy_notice@1.0.0#…` to
`operator_terms@1.0.1+privacy_notice@1.0.1#c90d483de53d518f`. Nothing about the mechanism changed: the
page and the server action both call `resolveOrganizationConsent`, nothing is hardcoded, and the action
still refuses a submitted version that does not match the one it resolves for itself.

**Legacy consent records are untouched.** The three production rows carrying
`legal_document_version = "2026-07-20"` predate the registry entirely. They are not translated into
`operator_terms@1.0.0` or anything else: that string is an honest record of what was stored at the time,
and rewriting it would invent evidence rather than correct it. This release binds future consent only.

**`/legal` copy.** The index said *"Every version Crecy has published"*, which stopped being true the
moment a version was archived out of it. It now says it lists the current version of each document. One
sentence; the page is otherwise unchanged, as are both document pages.

## Content hashes

| Artifact | Content hash (SHA-256) |
| --- | --- |
| `operator_terms@1.0.1` (current) | `99028e766b60313dbf603bf9c60deaefb277586479116b3daabd7444b7b03c6a` |
| `privacy_notice@1.0.1` (current) | `e4ef7c4b38a170f74bc2f9da40cd1722854157a59bb58d14d691b4ed6d1864a3` |
| `esign_consent@1.0.0` (unchanged) | `a1f507cd714448e745d13d1b2e2614549fd7ab44560d5d2f3cef28034f8f2dc7` |
| `operator_terms@1.0.0` (archived, pinned) | `be0bf7fff53879921ddfb81110a8057d565e87c5e9a1b399ed68a675d17269f3` |
| `privacy_notice@1.0.0` (archived, pinned) | `e3b45572ec322c6e2323c2b99166a2b4354f1df0975b494b01495bb9eb091e81` |

The ESIGN hash is byte-identical to the value captured before this work began. That is the proof it was
not bumped, not a claim that it wasn't.

## Verification

Two guards were checked by breaking them on purpose and confirming the suite failed, then restored:

* Silently "correcting" the placeholder in the archived 1.0.0 Terms → the pinned-hash assertion fails
  with *"operator_terms@1.0.0 has been edited since it was published"*.
* Adding the archived artifact to `REGISTRY` ahead of the current one → three assertions fail, the
  decisive one being *"/legal/operator-terms resolved to an archived artifact"*.

`registry.test.ts` additionally proves the current documents resolve at 1.0.1 and published, carry the
approved addresses, retain no `crecy.example` anywhere in the **active** set (while the archive still
carries them, as it must), state their own version in the body a person reads, bind organization consent
to 1.0.1+1.0.1, and produce a binding distinct from the superseded pair.

`actions.test.ts` drives the real server action against the real registry with `CRECY_DEPLOYMENT_ENV=production`:
a binding built from the archived 1.0.0 artifacts is refused with *"changed while you were on this
page"* **before any database call**, a forged composite hash is refused the same way, and a valid
submission reaches `create_organization_as_actor` with the version the server resolved for itself.

`e2e/legal-consent.spec.ts` confirms it in a browser: both canonical pages render `published`,
`Version 1.0.1 · effective 2026-09-18`, the real contact address, no `crecy.example`, and a 64-character
content hash; `/legal/esign-consent` still renders 1.0.0; and the onboarding consent statement names
both documents at 1.0.1 with a matching hidden `consentVersion`.
