# Homeowner shared-listing contract — Batch B1

Status: implementation contract under FD-HR-002–005. Local-only until release approval.

## Outcome
A self-managing landlord can create one open advertising record for a rental unit, attach scanned-clean
photos, publish it as an unlisted/shareable link, pause/close it, and rotate the public identifier.
A closed listing remains historical; the unit may later start a new draft with a new public identifier.
No Crecy discovery/search surface is enabled by this slice.

## Public/private boundary
The listing is a separate advertising snapshot. It references the private property/unit internally but
never exposes the base property row. V1 public location is city/state-or-province/country only; street,
postal code, accounting data, tenant data, private documents and organization internals are never part
of the public DTO.

Photos reuse the existing private-document upload and malware-scan lifecycle with
`document_type='rental_listing_photo'` and a unit parent. A listing may publish only clean exact
document versions. The public server reads only versions explicitly attached to a currently published
listing and mints short-lived signed image URLs; the storage bucket remains private. Listing photos are
advertising media: they stay out of the operational document register and a database trigger refuses
recipient document-delivery rows for them.

## Publication model
- status: draft | published | paused | closed
- visibility is stored separately: unlisted | discoverable
- this slice accepts/publishes only `unlisted`; `discoverable` is a reserved later state
- an unlisted URL is not called private; anyone with it may view it
- unlisted pages emit noindex/nofollow and robots excludes the /l/ family without hiding /landlords
- rent-host share pages skip Supabase Auth/session construction and return private,no-store; they are public-by-link, not shared-cache content
- publishing requires rent, available date, summary and at least one clean photo
- the landlord can rotate the public UUID to invalidate a leaked share link
- editing a published listing returns it to draft before the changed snapshot can be shared again
- closing is terminal for that listing record, but does not permanently prevent a later new listing for the unit
- existing managed units never become listings automatically

## Mutation and isolation
Writes are command-only, idempotent, version-checked, audited and evented. Every command revalidates
the unit/property against the submitted organization and requires current property.manage access.
The customer path must be self_managing for this first release. Direct browser writes are revoked.
A public read path uses a sanitized server DTO; anonymous roles receive no base-table SELECT grant.

## Adversarial pass incorporated before build
- guessed UUID: returns no listing unless the row is published
- paused/closed/draft: public read returns not found
- photo from another unit/org: rejected at save
- quarantined/rejected photo: rejected at publish/save selection
- newer photo version: exact selected version is what is displayed; no implicit latest substitution
- stale edit tab: expected-version conflict
- retry after timeout: same idempotency key returns stored result
- listing visibility changed to discoverable early: publish rejected
- listing link leaked: rotate public identifier; old URL stops resolving
- property/member scope revoked: next write denied
- resident/anon base-table reads and all direct writes: denied
