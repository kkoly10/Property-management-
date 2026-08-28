# v4.2 Batch B — public Crecy launch surface

Reported separately from Batch A and Batch A.1, per file 27 §15. Batch A and A.1 are unchanged by this
batch except for one file — `src/lib/supabase/proxy.ts` — and that change is described in full below.

---

## 1. What Batch B is

File 27 §6 makes the marketing website binding launch scope, and opens with the requirement that "the
root route must no longer redirect directly to signup on the public marketing host." Before this batch,
`src/app/page.tsx` was four lines: `redirect("/signup")`. Crecy had a product and no front door.

This batch builds the front door: six public routes, the navigation and footer that connect them, the
legal centre folded into the same shell, and the SEO fundamentals that decide what a crawler sees.

---

## 2. Routes

| Route | Rendering | What it is |
|---|---|---|
| `/` | static | The 12-section homepage sequence file 27 §6 specifies |
| `/product` | static | The workflow tour: portfolio, leasing/import, rent/accounting, payments/reconciliation, maintenance, documents, communications, owner visibility |
| `/pricing` | static shell + client explorer | Monthly/annual toggle, US/CA/MX price book selector, four plans, overage, 500+ path, entitlement comparison, payment disclosure |
| `/crecy-living` | static | The resident surface, described as a resident experience and explicitly not as a marketplace |
| `/security` | static | Evidence-safe trust page, ending with what Crecy does *not* claim |
| `/pilot` | static | Early-program conversion through self-service signup |
| `/legal`, `/legal/[slug]` | static / SSG | Moved into the marketing shell so a reader of the terms can still reach the site |

`src/app/page.tsx` is deleted. `/` is now `src/app/(marketing)/page.tsx`, inside a route group so the
header and footer are shared without adding a path segment.

---

## 3. Prices cannot drift toward a mock

File 11 §7 exists because generated marketing images showed a $49 Starter, a $129 Growth and a $279 Pro.
None of those numbers are real, and the most likely way a wrong price reaches production is someone
"correcting" the page toward an image they remember.

So `src/lib/marketing/pricing.ts` holds the price books in minor units, and
`src/lib/marketing/pricing.test.ts` **parses file 11's own markdown tables** and asserts every monthly
price, annual price, included-unit count and overage rate matches. The spec is the fixture. Editing a
price on the page without editing the founder-approved spec fails the build.

Verified by mutation: changing US Growth from `4_900` to `12_900` — the mock's number — fails the suite.

---

## 4. Claims

Every public page is scanned by `src/lib/marketing/surface.test.ts` for the claims file 18 §1 prohibits:
SOC 2 certification, "enterprise-grade security", "trusted by", uptime percentages, traction counts,
instant settlement, guarantees, pen-test claims, legal-certification claims, and accessibility
conformance claims. The scan covers the shared header, footer and section components as well as the
pages, because the footer is where such a claim would most plausibly be added.

The scan strips comments and JSX attribute values first, so it measures what a visitor reads. Without
that, `/security` failed its own guard for naming the banned phrases in a comment explaining the rule —
and a guard that forces you to stop naming the rule is a guard that gets deleted.

SOC 2 is handled by a proximity rule rather than absence: the topic must be addressed, and every mention
must sit beside a negation. `/security` closes with an explicit "what we do not claim" section — no SOC 2
report, no uptime figure, no pen-test claim, accessibility as a target, no guarantees, availability being
prepared. That section is what makes the rest of the page credible.

No customer logos, names, counts, testimonials or case studies appear anywhere. There are none to show.

Product compositions render real Crecy screen shapes with sample values, and the "Sample data" badge
lives on the shared `ProductComposition` component so it cannot be omitted per instance (file 18 §4).

---

## 5. SEO and host behavior (file 27 §7)

- Unique title, description, canonical, Open Graph and Twitter card per page, from
  `marketingMetadata()`. `MARKETING_ORIGIN` is pinned to the marketing host rather than inferred from
  the request, so a preview deployment cannot publish canonicals pointing at itself.
- `sitemap.xml` is generated from the same route list the navigation renders, plus the legal registry.
- `robots.txt` disallows every authenticated prefix **without a trailing slash**, because robots.txt
  matching is a prefix match and `/login/` would leave the bare `/login` page crawlable.
- Semantic headings: exactly one `<h1>` per page, asserted statically and in the browser.
- Responsive navigation: a CSS-only mobile disclosure, so a static page ships no JavaScript to open a
  list of five links.

---

## 6. The proxy change — the one Batch A file this batch touches

`src/lib/supabase/proxy.ts` (Next 16's middleware) held its own hardcoded `protectedPrefixes` array,
separate from the indexing list. They had already drifted: `/documents` and `/more` were indexing-blocked
but not session-gated.

Both now derive from one classification in `src/lib/marketing/navigation.ts`:

- `PRIVATE_PREFIXES` — not indexable. Includes `/login`, `/signup`, `/invitations`, `/api`.
- `AUTHENTICATED_PREFIXES` — requires a session. A deliberate **subset**: the entry points must stay
  reachable or nobody can ever get in. A test asserts the subset relation, so a surface can never
  require a session while remaining indexable.
- `ANONYMOUS_EXCEPTIONS` — `/documents/secure`, redeemed anonymously because the token *is* the
  credential. Gating it would break document delivery for exactly the recipients who have no account.
- Matching is on segment boundaries, so `/home` cannot swallow a future `/homepage`.

### The defect this batch's own adversarial review caught

The first version of this change made caching the inverse of protection: `no-store` unless protected.
That was wrong twice over. It would have made `/login`, `/signup` and `/invitations/accept`
shared-cacheable — and an invitation page names its invitee. Worse, `updateSession` calls
`createServerClient`, which can rotate the session and write `Set-Cookie` onto the response; a cacheable
response carrying that header hands one visitor's session to the next.

The fix is ordering, not classification. Public pages return **before** the session client is
constructed. Everything that reaches the client is `private, no-store` without exception.
`src/lib/supabase/proxy.test.ts` asserts the ordering behaviorally — the mocked `createServerClient`
counts its constructions, and a public page must produce zero.

---

## 7. Verification

**Static gate — `npm run check`, EXIT=0**

| Stage | Result |
|---|---|
| `eslint .` | clean |
| `tsc --noEmit` | clean |
| `vitest run` | **304 passed / 48 files** (was 257 / 45) |
| `test:db` | full migration replay + RPC suite green |
| `schedule:check`, `migrations:check` | clean |
| `next build` | 45 static pages generated |

**Browser — `npx playwright test`, 73 passed** (was 58; 15 new)

Batch B browser coverage:

- Every public route renders with exactly one `<h1>` and no horizontal overflow, at **375×812** and
  **1440×900**, checked independently.
- The root serves the marketing page rather than redirecting, with both required CTAs.
- Desktop navigation reaches all five marketing pages; the mobile menu opens, and its links are hidden
  from the tab order until it does.
- The footer exposes Product, Pricing, Crecy Living, Security, Pilot, Log in, Start free and Legal.
- Pricing: canonical US monthly prices, the annual switch, all three price books, the overage rate, the
  500+ threshold, the 30-day trial, and the payment disclosure — read out of the live DOM.
- The comparison table scrolls inside its own container instead of widening the page.
- `robots.txt` and `sitemap.xml` fetched and asserted.
- Unique title/description/canonical per page, with `og:url` matching the canonical.
- A legal document renders inside the public shell with one `<main>`, its content hash, and metadata
  carrying its publication state.

### Mutation testing — 17 mutations, 17 caught

Every new assertion was proven load-bearing by breaking the thing it guards:

| # | Mutation | Result |
|---|---|---|
| M1 | `requiresSession` loses segment-boundary matching | CAUGHT |
| M2 | `/documents` drops out of the gated list | CAUGHT |
| M3 | Secure-link anonymous exception removed | CAUGHT |
| M4 | `/login` becomes shared-cacheable | CAUGHT |
| M5 | robots blocks directories only, leaving bare `/login` crawlable | CAUGHT |
| M6 | US Growth price drifts to the mock's number | CAUGHT |
| M7 | A "trusted by" claim appears in copy | CAUGHT |
| M8 | An unqualified SOC 2 sentence appears | CAUGHT *(see below)* |
| M9 | Nav advertises a route with no page behind it | CAUGHT |
| M10 | The SOC 2 denial is flipped into a claim | CAUGHT |
| M11 | Accessibility target becomes a conformance claim | CAUGHT |
| M12 | An uptime figure appears | CAUGHT |
| M13 | A 2000px element overflows the page | CAUGHT (desktop +736px, phone +1645px) |
| M14 | Public early-return moves after `createServerClient` | CAUGHT |
| M15 | The login redirect is disabled | CAUGHT |
| M16 | `no-store` dropped from authenticated responses | CAUGHT |
| M17 | A certification claim is added to the shared footer | CAUGHT |

**M8 survived on the first run and that mattered.** The original SOC 2 guard split the source into
"sentences" and required a negation in each one containing "SOC 2". In JSX, a sentence boundary is
meaningless — the surrounding class lists and code supplied a stray "not", and an unqualified
`SOC 2 aligned controls protect every organization.` heading passed. The guard was rewritten to strip
attribute values and check a 120-character proximity window, plus assert the denial verbatim. M8, M10,
M11 and M12 were then all caught. The first version was theatre; it is recorded here rather than
quietly replaced.

---

## 8. What Batch B does not claim

- **Public launch surface: implemented, not certified.** The pages exist, are green in the browser
  suite, and are claim-checked. They have not been reviewed by a human, seen a designer, or been
  deployed to the marketing host.
- **No deployment.** Nothing in this batch has been deployed anywhere. `MARKETING_ORIGIN` defaults to
  `https://crecy.com`; the host has not been pointed at this build, and `app.crecy.com` host routing is
  described in file 27 §7 but not exercised — one Next codebase can serve both, and that routing is
  still unproven.
- **No copy review.** Every claim is traceable to files 11, 16, 18 and 27, but nobody has read the
  finished pages for tone, accuracy of emphasis, or the things a founder would want said differently.
- **Accessibility is a target, not an audit.** Semantic headings, one `<h1>` per page, labelled
  navigation landmarks, an accessible mobile disclosure and no horizontal overflow are all asserted.
  WCAG 2.2 AA conformance is not claimed, because no audit has been run.
- **The legal documents are still drafts.** Both remain `state: "draft"` at `0.1.0-draft`. The legal
  centre displays that state, and the batch does not change it — publishing is a counsel decision.
- **No open-graph images.** Open Graph metadata is present; no image asset is attached, because none
  exists and generating one would be fabricating brand material.

---

## 9. Five-state position after Batch B

| State (file 27 §2) | Position |
|---|---|
| **Product implementation** | Unchanged by this batch. |
| **Runtime operational** | Unchanged by this batch, except that the proxy now gates `/documents` and `/more`, which it previously did not. |
| **Public launch surface** | **Implemented and green, not certified.** All six required routes plus the legal centre ship, with navigation, footer, sitemap, robots, per-page metadata and responsive validation. Not deployed, not human-reviewed, no OG imagery. |
| **Provider configured/certified** | Unchanged — Stripe and transactional mail remain environment-blocked. |
| **Launch certified** | No. Not deployed; providers unconfigured; legal documents draft; the organization-context contract migration still awaits its compatible deployed build. |

Nothing in this batch moves Crecy closer to "launch certified" on any axis except the marketing surface
itself. The pilot is not complete and this batch does not make it so.
