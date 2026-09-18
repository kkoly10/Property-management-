# Phase 9 — Terms and Privacy Notice 1.0.1: real contacts, and only capabilities that exist

**No migration.** This release changes source artifacts only; the database is untouched.

## The defects

Two kinds, both factual rather than substantive.

**Placeholder contacts.** `operator_terms` and `privacy_notice` were published at 1.0.0 on 2026-09-04
carrying `legal@crecy.example` and `privacy@crecy.example`. A published legal document that tells a
reader to write to an address which does not exist is not a cosmetic problem: section 8 of the Terms and
section 7 of the Privacy Notice are the only routes a person has to raise a question or exercise a data
right.

**Claims about capabilities the pilot does not have.** Adversarial review of the 1.0.1 text found four,
each describing something a reader could reasonably expect and not get:

* Terms §2 — *"presents portals to the residents, owners and vendors you invite."* There is no vendor
  portal in the launch product; `vendor.crecyos.com` is a future surface, so no operator can give a
  vendor access to anything.
* Privacy §4 — *"service providers to host the product, deliver messages, scan uploaded files and
  process payments."* Malware scanning is deliberately **not** active for the controlled pilot, so the
  notice described an inspection that does not happen.
* Privacy §4 — *"the resident, owner or vendor the record is about"*, in the section that answers *who
  else sees it*. Naming a vendor there says a vendor can see a record. They cannot.
* Privacy §4 — *"service providers to host the product, deliver messages and process payments"*, stated
  as present tense. Hosting is active; the mail relay and Stripe are built but unconfigured, so those
  flows are not happening yet. See the section below for why they are made conditional rather than
  removed.

## What shipped

**Current artifacts at version 1.0.1, effective 2026-09-18, published.** They correct 1.0.0 in two
ways: the contact addresses are now the founder-approved `legal@crecyos.com` / `privacy@crecyos.com`,
and the three statements above are removed.

Nothing was added and no obligation changed in either direction. Removing a claim about a capability
that is not active is **not** a removal of functionality — the functionality was never there to
describe. The scanning claim in particular is removed rather than reversed: the documents now say
nothing about inspection either way, because asserting that files are *not* inspected would be a new
statement rather than the withdrawal of an inaccurate one. Privacy §1 still names vendors, correctly —
an operator does enter records *about* vendors, which is a different claim from a vendor having access.

These corrections were made **before** 1.0.1 was merged or published to production, so 1.0.1 was never
an accepted artifact and remains 1.0.1 rather than becoming 1.0.2. The published 1.0.0 artifacts are
untouched, as they must be.

`esign_consent` is untouched at 1.0.0 — it points signers at whoever sent them the document, so it never
carried a Crecy address to correct, and it claims nothing about portals or scanning.

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
`operator_terms@1.0.1+privacy_notice@1.0.1#0e3afb1d0b81de7b`. Nothing about the mechanism changed: the
page and the server action both call `resolveOrganizationConsent`, nothing is hardcoded, and the action
still refuses a submitted version that does not match the one it resolves for itself.

**Legacy consent records are untouched.** The three production rows carrying
`legal_document_version = "2026-07-20"` predate the registry entirely. They are not translated into
`operator_terms@1.0.0` or anything else: that string is an honest record of what was stored at the time,
and rewriting it would invent evidence rather than correct it. This release binds future consent only.

**`/legal` copy.** The index said *"Every version Crecy has published"*, which stopped being true the
moment a version was archived out of it. It now says it lists the current version of each document. One
sentence; the page is otherwise unchanged, as are both document pages.

## The third state: conditional, not present and not absent

The same Privacy §4 sentence originally said service providers **deliver messages** and **process
payments**, and neither the mail relay nor Stripe is configured for the pilot. Neither of the two
obvious answers is right. Stating them flatly describes flows that are not happening. Deleting them
under-discloses real processing the moment either feature is switched on, which is the worse failure
for a privacy notice — a reader would have been told the list was complete.

So they are stated as conditional:

> We use service providers to host the product. When messaging or payment features are enabled, service
> providers may also deliver messages and process payments; each is bound to handle data only as
> instructed.

Hosting is active and stays flat. This is a different situation from scanning, which is removed
outright because it is deliberately not being activated at all — there is no condition under which the
pilot inspects an upload, so there is nothing to make conditional.

The archived 1.0.0 files were not touched, including their explanatory comments — a comment is outside
the hashed object and could safely be reworded, but "leave the historical artifact alone" is the
simpler rule to keep.

## Content hashes

| Artifact | Content hash (SHA-256) |
| --- | --- |
| `operator_terms@1.0.1` (current) | `4500fab7b997db58194b95d58ee189ee0b278de19f9b1ea47b258f177c1dfcdf` |
| `privacy_notice@1.0.1` (current) | `422303ef24e95f03347493f9d5f6748d5237d061dec99c4c692dabac1cf17c4b` |
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

A third was checked the same way: reinstating all three capability claims fails exactly the three guards
that exist for them — *"offers a portal to vendors"*, *"claims uploaded files are inspected"* and *"a
vendor is still named among the people who can see a record"* — while the archived-hash assertions stay
green, confirming the mutation touched only the active artifacts.

`registry.test.ts` additionally proves the current documents resolve at 1.0.1 and published, carry the
approved addresses, retain no `crecy.example` anywhere in the **active** set (while the archive still
carries them, as it must), state their own version in the body a person reads, bind organization consent
to 1.0.1+1.0.1, produce a binding distinct from the superseded pair, offer a portal only to residents
and owners, claim no inspection of uploaded files, and name vendors only as the subject of records —
Privacy §1 — never as people with product access.

`actions.test.ts` drives the real server action against the real registry with `CRECY_DEPLOYMENT_ENV=production`:
a binding built from the archived 1.0.0 artifacts is refused with *"changed while you were on this
page"* **before any database call**, a forged composite hash is refused the same way, and a valid
submission reaches `create_organization_as_actor` with the version the server resolved for itself.

`e2e/legal-consent.spec.ts` confirms it in a browser: both canonical pages render `published`,
`Version 1.0.1 · effective 2026-09-18`, the real contact address, no `crecy.example`, and a 64-character
content hash; `/legal/esign-consent` still renders 1.0.0; and the onboarding consent statement names
both documents at 1.0.1 with a matching hidden `consentVersion`.
