# Crecy Living Community Presentation Contract

**Status:** Implementation authority  
**Decision date:** 2026-09-05  
**Applies to:** `*.crecyliving.com` login, authenticated Living home, community imagery, and future operator community-branding controls.

## 1. Purpose

Crecy Living should feel connected to a resident's actual home and community, not like Crecy OS recolored green.

The community presentation layer is therefore a separate, deliberately public-safe projection. It may provide place identity and operator-published community information, but it is not a tenancy, finance, document, maintenance, owner, or authorization contract.

A Living community hostname is presentation context only. It never grants access to resident data.

## 2. Maple Court design fixture

The repository includes one deterministic fictional community used for design, preview, screenshot review, and marketing/product proof:

- `/public/media/maple-court/exterior.webp`
- `/public/media/maple-court/lobby.webp`
- `/public/media/maple-court/courtyard.webp`
- `/public/media/maple-court/model-home.webp`

These four images are one coherent property family. They are not placeholders for arbitrary real properties and must not be selected by matching only a property name.

The explicit demo community label is `maplecourt`. It is reserved from operator-created community profiles so a real property can never collide with the bundled fixture. Public Maple Court surfaces visibly identify themselves as a demo community rather than silently presenting generated media as a real operator property.

## 3. Public-safe data model

`public.living_community_profiles` may contain only intentionally publishable community presentation fields:

- community subdomain and display name;
- optional operator-written public address text;
- optional public headline;
- optional leasing-office email and phone;
- optional public office-hours strings;
- optional amenities;
- hero/lobby/courtyard/model-home media URLs;
- optional public notice title/body;
- publication state and provenance metadata.

The table does **not** contain:
- resident or household identity;
- lease or tenancy details;
- balances, charges, payments, or bank/card information;
- private documents;
- maintenance/vendor/internal-note data;
- owner data;
- internal organization IDs in the anonymous projection.

## 4. Anonymous community lookup

`get_public_living_community_profile(subdomain)` is the only anonymous community-presentation contract.

It:
- returns only a published profile;
- returns no organization, property, tenancy, household, or resident identifiers;
- accepts a single valid community label already constrained by the host classifier;
- does not imply any authenticated access.

Unknown communities return no profile. The application does not invent a property from the hostname.

## 5. Authenticated resident lookup

`get_resident_living_community_profiles()` is authenticated and resolves community profiles only through the current user's active `resident_person` relationship, active household membership, active/scheduled tenancy, and the tenancy's exact property.

The client receives a tenancy id solely so the already-authorized resident home can match each safe presentation to the correct home.

## 6. Visual behavior

### Community login

On `{community}.crecyliving.com`:
- the green Crecy Living wordmark remains the product identity;
- the community hero image becomes the dominant place signal;
- the community name is visible before authentication;
- only public-safe contact/amenity/presentation information may appear;
- sign-in remains the same authentication system underneath.

On the Living root, no property is guessed; the generic Living treatment remains.

### Authenticated home

After sign-in, the community hero is matched by tenancy id.

Critical resident work stays above decorative imagery:
1. home identity;
2. balance and upcoming payment;
3. maintenance/messages/documents;
4. community notices;
5. community gallery;
6. recent payment history.

The gallery is asymmetric and image-led rather than a row of equal feature cards.

## 7. Media ownership

The database stores same-origin presentation paths, not binary image contents.

Community media URLs are restricted to same-origin `/media/...` image files. Both the database constraint and server-side normalizer reject third-party URLs, path traversal, query strings, fragments, and non-image extensions. This avoids turning operator-configurable media into a resident-tracking pixel or a route escape.

The current Maple Court media is bundled with the application because it is a deterministic fictional design fixture. Real operator media should later use a controlled Crecy upload/storage pipeline that publishes into the same-origin media namespace, plus a dedicated operator edit command rather than arbitrary direct table writes.

## 8. Migration/runtime boundary

The SQL migration is committed to repository history so schema authority is explicit. It must not be claimed as applied to a production Supabase project unless the exact Crecy Supabase project is positively identified and the migration is executed there.

The application degrades safely:
- unknown/unconfigured communities receive no invented public profile;
- Maple Court remains available only as the explicit named demo fixture;
- authenticated production residents receive community media only from the resident-scoped RPC when the database contract is live.

## 9. Quality gate

Community presentation fails review if:
- a hostname is treated as authorization;
- an unknown community receives Maple Court imagery;
- a public RPC exposes internal organization/property/tenancy identifiers;
- resident financial or private relationship data appears before authentication;
- generated demo imagery is silently represented as a real operator property;
- photographs displace payment, maintenance, or communication tasks from the resident hierarchy.
