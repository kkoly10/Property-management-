# v4.2 Batch A4 — Legal publication and version binding

## The defect

Onboarding sent a **hardcoded** `p_terms_version: "2026-07-20"` to `create_organization`, which wrote a
`consent_records` row with that string as `legal_document_version` and a `sha256` evidence hash over it.

There was no document with that version. No artifact anywhere in the repository. No route to read one.
And the checkbox beside it read *"I agree to the Terms and acknowledge the Privacy Notice"* while
**linking to nothing at all**.

So the product recorded, for every workspace ever created, a signed-looking consent record that pointed
at a date. File 27 §8 names this directly: *"consent evidence must point to an actual published
artifact/version shown to the user."*

## What shipped

| Layer | Artifact |
| --- | --- |
| Types | `src/lib/legal/types.ts` — code, audience, locale, jurisdictions, version, effective date, publication state, canonical route, body |
| Registry | `src/lib/legal/registry.ts` — resolution, content hashing, consent binding, the production gate |
| Documents | `src/lib/legal/documents/{operator-terms,privacy-notice}.ts` — **draft placeholders** |
| Public routes | `/legal` (index) and `/legal/[documentSlug]` (canonical per-document route) |
| Onboarding | `src/app/onboarding/organization/{page,actions,organization-form}.tsx` |
| Tests | `src/lib/legal/registry.test.ts` (15), `e2e/legal-consent.spec.ts` (7 browser) |

## How consent evidence became real

The version recorded on the consent record is **derived from the exact bytes of the documents that were
shown**:

```
operator_terms@0.1.0-draft+privacy_notice@0.1.0-draft#<16 hex of composite hash>
```

`contentHash` covers code, version, locale, effective date **and body**, so:

- editing a document changes its hash, which changes the recorded version string — a silently amended
  document can never masquerade as the one an earlier operator accepted;
- two documents with the same body but different codes or versions never collide;
- a purely cosmetic change (the UI title) does not change it, because it does not change what was agreed.

The composite is order-independent, so the same two documents always produce the same evidence.

The page resolves the documents, renders their titles, versions and effective dates as **links**, and
puts the resolved version in a hidden field. The action re-resolves and **refuses the submission if the
two disagree** — which is what happens if the page was rendered against a different build than the one
handling the submit. The version cannot drift from what was displayed.

Each document is readable at its canonical public route, which prints its version, effective date,
publication state and **content hash**, so anyone can check a stored consent record against the real
artifact.

## Failing closed in production

`resolveOrganizationConsent({ requirePublished })` returns `LEGAL_DOCUMENT_NOT_PUBLISHED` rather than a
binding, and the action returns a clear configuration error instead of creating the workspace. **This
means production organization creation is blocked until a human publishes the documents** — which is the
intent: refusing is better than inventing evidence.

`NODE_ENV` turned out to be the wrong signal — a preview deployment, a local `next start` and the E2E
harness all run with `NODE_ENV=production` while serving nobody real, and the gate initially blocked the
demo suite's own onboarding page. The gate now reads the **deployment environment**
(`CRECY_DEPLOYMENT_ENV`, or Vercel's `VERCEL_ENV`), with a deliberately strict default: an unlabeled
build that thinks it is production **is treated as production**. A non-production environment has to say
so. Vercel sets `VERCEL_ENV` itself; the Playwright harness declares `CRECY_DEPLOYMENT_ENV=test`.

Outside production a draft is allowed so the flow is testable, and the screen says so — the draft
version appears in the evidence string, so such a record can never be mistaken for a production
acceptance.

## Verification

`npm run check` green: lint, typecheck, **237 vitest tests across 42 files**, `test:db`,
`schedule:check`, build. **58/58 demo Playwright tests pass**, including 7 new legal-consent tests.

Unit tests assert: every registry field is well-formed and every consent document has a reachable
canonical route; the content hash changes on any substantive edit and is stable otherwise; the binding
string names both artifacts and changes when the text changes at the same version numbers; the
resolution fails closed on an unpublished document, reports drafts when it allows them, and never
returns the literal `"2026-07-20"`; and the environment gate is strict on production, strict on an
unlabeled build, and relaxed only where a non-production environment declared itself.

Browser tests assert: the index lists every artifact with version and state; each document is readable
at its canonical route and prints its content hash; a draft says it is not published; the onboarding
consent statement **names and links to each artifact with its version and effective date**; a draft is
disclosed rather than presented as ordinary terms; and the hidden consent version matches the derived
format and is not the old literal.

## The human gate that remains open (this is the point, not an omission)

Both documents ship as **`state: "draft"`**. A coding agent may build the publishing mechanism and draft
placeholders; **final legal approval is a professional production gate** under the founder register and
file 27 §5.A4. Publishing means a qualified human reviews the text, sets `state: "published"`, and gives
it a real version.

Until then: **production organization creation fails closed.** That is a visible launch gate, not a
defect, and it must not be worked around by flipping the state without review.

## Not done here (stated, not hidden)

- The registry covers the two documents organization creation binds. The same model is designed to
  govern **portal terms, e-sign consent, payment disclosure, subscription/cancellation terms and
  communications notice** — those bindings are not built yet.
- Consent is recorded through the existing `create_organization` command, which takes a single
  `p_terms_version` text. The composite binding string fits that column, but per-document consent rows
  would be a better model if acceptance ever needs to be revoked per document.
- The documents are English (`en-US`) only, though the type carries `locale` and the product supports
  `es-MX`, `en-CA` and `fr-CA`. Translated versions are a publishing task, not a code change.
