# 27 — Launch Layer and Runtime Readiness Specification

**Status:** Authoritative correction to the Crecy v4 implementation program  
**Authority date:** 2026-08-27  
**Applies to:** public launch, pilot readiness, runtime operations, marketing surfaces, legal-document publication, provider activation, deployment, and launch certification  
**Base truth:** PR #35 head `d7e47541fb7983c4255a4137c6e691f9415f1734` contains substantial product-engine work but is not a complete launch candidate.

---

## 1. Why this specification exists

The prior v4 package specified the product engine in depth but did not convert several public-business and runtime dependencies into binding implementation scope. That allowed an agent to become close to feature-complete while the product still lacked a real public homepage, production legal-document binding, an operational document-scan lifecycle, scheduled execution, canonical multi-organization context, proven deployment, and disaster-recovery evidence.

This file corrects that program-level defect.

Crecy must now be evaluated as three explicit systems:

1. **Product Layer** — Crecy OS, Crecy Living, Crecy Owner, ledger, payments, maintenance, documents, imports, communications, support.
2. **Runtime Layer** — schedulers, document scanning, workers, provider connectivity, organization context, observability, deployment, backup/restore.
3. **Launch Layer** — public website, pricing, product story, trust, signup conversion, legal publishing/version binding, SEO, commercial claims, country launch posture.

No coding agent may treat Product Layer completion as equivalent to runtime, pilot, beta, or public-launch completion.

---

## 2. Completion vocabulary is binding

Track these states independently:

### 2.1 Product implementation complete
A required domain journey exists end to end in code and passes the repository test gate.

### 2.2 Runtime operationally complete
Every required background or unattended behavior has a real caller/orchestrator, failure diagnostics, recovery behavior, and execution evidence. A worker route with no scheduler is not operationally complete.

### 2.3 Public launch surface complete
Anonymous prospective customers can discover Crecy, understand the product, see truthful pricing, reach signup/login, access required public trust/legal information, and navigate the site on desktop/mobile.

### 2.4 Provider configured/certified
External systems such as Stripe, transactional mail, and malware scanning are configured in the target environment and exercised through their real sandbox/production-approved paths.

### 2.5 Launch certified
The anonymous-to-operational journey in §16 passes, deployment and restore evidence exist, no unresolved critical/high launch defect remains, and all human/professional launch gates are either approved or explicitly marked outstanding.

Agents must not summarize these five states as one percentage or one word such as `complete`.

---

## 3. Immediate repository truth that must not be hidden

At the authority date:

- `src/app/page.tsx` redirects `/` to `/signup`; a public Crecy marketing homepage does not exist.
- The marketing reference and safe-claims policy exist, but marketing routes were not binding screen scope.
- `finalize_document` correctly places new versions in `upload_status='quarantined'`, but no product scan pipeline advances versions to `clean` or `rejected`.
- Worker-capable routes exist for recurring charge generation and transactional notification dispatch, but no repository-defined scheduler invokes them.
- Operator shell/dashboard code may implicitly select one organization; the specified organization switcher/canonical context is not complete.
- Organization onboarding records a hardcoded legal version while the corresponding published Terms/Privacy artifacts do not exist.
- PR #35 contains substantial import and notification work and must be preserved rather than rewritten.
- Stripe and mail provider certification remain external-configuration gates.
- A production deployment and restore drill must be proven, not inferred from a successful build.

These are launch gaps, not reasons to discard the strong domain engine.

---

## 4. Preserve existing strong work

Do not rewrite working multi-tenant RLS, double-entry ledger behavior, payment orchestration, import architecture, maintenance lifecycle, resident portal, owner portal, support control plane, notification queue/worker logic, secure-link design, upload-grant architecture, audit/outbox, or idempotency infrastructure merely because the launch program changed.

Fix the missing boundaries around them.

---

## 5. Batch A — Runtime safety and unattended operation

Batch A is the first correction batch and is required before the repository can be called a launch candidate.

### A1. Document malware-scan lifecycle

Preserve the existing safe default:

`quarantined -> scanning -> clean | rejected`

Requirements:

- browser users may never mark a version clean;
- create durable scan-job state or an equivalent provider-neutral lifecycle;
- enqueue exactly one scan operation per finalized version;
- claim jobs safely under concurrency;
- verify immutable `document_version_id`, storage bucket/path, and expected SHA-256 before applying a result;
- record provider identifier/reference and `malware_scanned_at` when available;
- clean result sets `upload_status='clean'`;
- infected/unsafe result sets `upload_status='rejected'` plus a bounded non-sensitive reason;
- provider/system failure remains retryable and never implies clean;
- stalled scan work is recoverable;
- duplicate callbacks/retries are idempotent;
- rejected/quarantined/scanning versions remain unavailable to normal download/delivery/lease/import workflows;
- a deterministic local/test adapter may be used for automated tests;
- production activation remains blocked until a real approved scanner or private scanning service is configured.

Required E2E:

1. upload -> quarantined -> scanning -> clean -> authorized download/use succeeds;
2. upload -> rejected -> downstream use remains blocked;
3. stale/mismatched SHA scan result cannot clean a different object/version.

Manual SQL edits that set `upload_status='clean'` must not be accepted as product certification once this lifecycle exists.

### A2. Runtime scheduler/orchestrator

Vercel is the intended hosting target. The existing worker/domain logic should be reused.

Add repository-defined scheduled orchestration for at least:

- transactional notification dispatch and stalled-job recovery;
- document-scan polling/dispatch where the selected scanner requires it;
- recurring rent charge generation;
- other stale operational recovery jobs required by the product.

Do not expose service-role credentials to the browser. Cron/worker authentication must fail closed, use secrets only from environment configuration, and avoid credentials in URLs.

#### Recurring-charge time-zone invariant

Do not use one naive UTC `current_date` for every property.

Rent generation must derive the operational date in the property's configured time zone, select only schedules actually due for that local date, process bounded batches, use stable idempotent worker-run identifiers, and remain duplicate-safe across repeated/overlapping scheduler invocations.

Add boundary tests for properties in materially different North American time zones around UTC midnight/month boundaries.

### A3. Canonical active-organization context

Replace systemic implicit-first-organization behavior.

Required behavior:

- load all active organizations available to the authenticated operator;
- automatically choose only when exactly one valid organization exists;
- when multiple exist, use one canonical active context and expose the specified operator organization switcher;
- persist context through a secure server-controlled mechanism;
- validate active membership when context is established/used;
- revoked/expired membership invalidates access immediately;
- switching context refreshes all organization-scoped product data;
- every sensitive server query/RPC receives an explicit organization ID;
- no fetcher independently chooses its own organization;
- no silent fallback to another organization when selected access disappears.

Audit at minimum dashboard, imports, properties, residents, leasing, payments, maintenance, owners, documents, communications, team/settings, billing, search and exports.

Required browser test: one operator with two organizations switches context and every audited surface follows the same organization without mixed rows.

### A4. Legal publication/version binding

Remove the current fake binding where onboarding references a hardcoded legal version that has no corresponding published artifact.

Build a typed/versioned legal registry or equivalent source of truth containing at minimum:

- document code;
- audience;
- locale;
- jurisdiction/addendum applicability;
- version;
- effective date;
- publication state (`draft | published | retired`);
- canonical public route;
- immutable content hash/evidence identifier.

Organization creation must resolve and display the actually published Operator Terms and Privacy Notice, link to them, send the exact displayed versions to the command, and persist evidence for those artifacts.

In production, if a required binding document is not published, organization creation must fail closed with a clear configuration error rather than recording invented consent evidence.

The same model later governs portal terms, e-sign consent, payment disclosure, subscription/cancellation terms, and communications notice where acceptance is required.

Agents may build the publishing mechanism and draft placeholders, but final legal approval remains a professional production gate under the existing founder register and compliance specification.

---

## 6. Batch B — Public Crecy launch surface

The marketing website is binding launch scope. The root route must no longer redirect directly to signup on the public marketing host.

Use the approved `Calm Global Infrastructure` direction from file 16 and the safe-claims rules in file 18.

Visual requirements:

- light connected canvas;
- strong typography and generous hierarchy;
- restrained card use;
- minimal eyebrow labels;
- no container around every paragraph/section;
- no generic AI-SaaS gradient/glass aesthetic;
- no fake enterprise chrome;
- no fictional customer logos, traction, certification, uptime, or performance claims;
- product imagery should come from real Crecy UI/demo compositions, not fabricated customer evidence;
- desktop and mobile spacing/overflow must be reviewed independently.

### Required routes

#### `/`
Hero:

**Rental operations, finally connected.**

Explain that Crecy connects properties, residents, rent, maintenance, documents, and owner visibility in one clear system.

Primary CTA: **Start free**  
Secondary CTA: **See the platform**

Homepage sequence:

1. Hero + real product composition;
2. Crecy OS -> Crecy Living -> Crecy Owner relationship;
3. rent/accounting story;
4. maintenance story;
5. documents/leasing story;
6. owner-visibility story;
7. migration/import story;
8. North America design story using evidence-safe wording;
9. pricing preview;
10. trust/security architecture;
11. final CTA;
12. complete public footer.

#### `/product`
Workflow-oriented product explanation covering portfolio/residents, leasing/import, rent/accounting, payments/reconciliation, maintenance, documents, communications, and owner visibility.

#### `/pricing`
Use only file 11 for prices/limits/entitlements.

Required:

- monthly/annual toggle;
- US/Canada/Mexico price-book selector;
- Free/Starter/Growth/Pro;
- exact included-unit limits;
- correct overage rules;
- 500+ custom path;
- 30-day no-card Growth trial;
- feature comparison grounded in approved entitlements;
- accurate payment-processing disclosure.

Never copy generated-mock pricing.

#### `/crecy-living`
Explain resident balance/payment, receipts, maintenance, documents, announcements/messages and mobile-first PWA. Do not market it as a public marketplace.

#### `/security`
Evidence-safe trust page covering tenant isolation, role/property-scoped access, audit history, MFA for privileged actions, private document storage, scan lifecycle once implemented, Stripe connected-account model, data minimization, and constrained support access.

No SOC 2 claim or certification-equivalent language without evidence.

#### `/pilot`
Clear early-program/start-free conversion page. Use self-service signup when enabled; otherwise use the approved pilot-request mechanism. No invented customer evidence.

### Public navigation/footer

At minimum expose Product, Pricing, Crecy Living, Security, Pilot/Start Free, Login, and the public legal/trust center.

---

## 7. SEO and host behavior

Implement production marketing fundamentals:

- unique metadata/title/description by public page;
- canonical URLs;
- Open Graph metadata;
- sitemap;
- robots policy;
- accessible semantic headings;
- responsive navigation/mobile menu;
- no layout overflow;
- truthful structured data only;
- authenticated/private app routes excluded from public indexing.

Respect the approved domain architecture (corrected; authority is FD-037):

- `crecyos.com` public Crecy marketing site — the canonical public origin;
- `www.crecyos.com` 308-redirects to `https://crecyos.com`;
- `app.crecyos.com` Crecy OS operator application and auth entry;
- `crecyliving.com` Crecy Living resident root, with community portals under `*.crecyliving.com`;
- `owner.crecyos.com` Crecy Owner portal;
- `vendor.crecyos.com` reserved for the future Crecy Vendor surface — defining the host does not authorize building the product.

`crecy.com`, `app.crecy.com`, `owner.crecy.com` and `vendor.crecy.com` are NOT owned and must not appear as canonical product
domains in code, copy, metadata or configuration.

The domain is `crecyos.com`; the visible company and master brand remains **Crecy**. Do not rename headings, logos, navigation
or marketing copy to "CrecyOS" merely because that is the domain. "Crecy OS" names the operator product specifically;
resident-facing surfaces say "Crecy Living" and owner-facing surfaces say "Crecy Owner". This is one product family, not four
separate companies.

One Next.js codebase may serve multiple hosts, but host routing must be intentional and tested. Do not make `app.crecyos.com`
behave like the marketing root by accident, and do not let host routing make authenticated responses publicly cacheable.

---

## 8. Transactional mail activation

The PR #35 queue/relay abstraction may remain. Email is not operational merely because jobs can be claimed.

A real transactional-mail provider adapter/configuration must eventually prove:

- invitation delivery;
- secure document link delivery;
- payment/receipt notifications;
- maintenance notifications;
- message/announcement notifications where in scope;
- retryable provider failure;
- terminal invalid-recipient behavior;
- provider message ID persistence;
- secure-link token scrubbing after terminal state.

Never commit provider credentials or fake provider success.

---

## 9. Stripe activation

Preserve the canonical Stripe Connect design. Do not rewrite payment architecture to satisfy launch hardening.

Provider certification requires configured test/live-appropriate credentials and an end-to-end provider path:

resident initiates -> real Stripe test/provider interaction -> signed webhook -> canonical pending/succeeded/failed state -> allocation -> receipt -> reconciliation evidence.

External configuration is a gate, not permission to fabricate success.

---

## 10. Deployment and observability

A passing `next build` is not deployment evidence.

For Vercel, document and implement:

- preview/production environment matrix;
- required environment-variable manifest;
- scheduled-job configuration;
- health/readiness surface;
- worker failure diagnostics;
- build/test gate before promotion;
- rollback procedure;
- domain mapping expectations;
- runtime/build-log inspection path.

Do not claim `not deployed` solely because GitHub Actions or `vercel.json` are absent; verify the actual hosting state. Do not claim `deployed` without a real reachable deployment/environment check.

---

## 11. Backup and restore

Create a reproducible restore exercise for a disposable/staging environment.

Evidence must include:

- source backup/snapshot identity;
- restore execution;
- schema/version validation;
- representative org/property/tenancy/ledger/document metadata validation;
- journal count/balance checks;
- auth/storage dependency handling;
- start/end timestamps;
- achieved RPO/RTO;
- defects found and corrected.

A written runbook without a performed restore is not launch certification.

---

## 12. Public legal/trust center

Create public routes for the document families required by file 09, with regional/addendum structure for US, Canada/Quebec/French, and Mexico.

The product may publish draft content in development/admin preview, but production consent cannot bind to `draft` or nonexistent content.

Not every legal/trust document requires acceptance. Informational policies may be linked from the footer without forcing consent.

Final counsel-approved text remains a human/professional launch gate.

---

## 13. Marketing claims

File 18 remains authoritative. In particular, do not publish:

- SOC 2 or certification claims without evidence;
- fake customer logos/testimonials/counts;
- legally compliant/certified lease claims;
- instant settlement claims for delayed rails;
- absolute security/privacy guarantees;
- country `available` claims before the country's actual activation gates pass.

Approved pre-launch phrasing includes `Designed for the United States, Canada, and Mexico` and other language explicitly permitted by file 18.

---

## 14. New implementation order

Do not stop after each item to ask what to do next. Work dependency-first:

### Batch A — Runtime safety
1. document scan lifecycle;
2. scheduler/orchestrator;
3. canonical active-organization context;
4. legal registry/version binding and removal of fake consent version.

### Batch B — Public Crecy
1. homepage;
2. product;
3. pricing;
4. Crecy Living marketing;
5. security/trust;
6. pilot conversion;
7. public legal center shell;
8. SEO/navigation/footer/host routing.

### Batch C — Production activation framework
1. transactional mail provider configuration/certification;
2. Stripe provider certification;
3. Vercel deployment/cron/domain configuration;
4. observability;
5. restore drill.

The milestone after these batches is **Crecy Launch Candidate**, not merely `remaining P0 complete`.

---

## 15. Required checkpoint report

Every major checkpoint must report separately:

- current SHA;
- main SHA vs working head;
- files/migrations added;
- product workflows passed;
- runtime workflows passed;
- public marketing pages passed;
- legal documents: draft/published/missing;
- schedulers: configured/exercised/failed;
- scanner: implemented/configured/exercised/failed;
- Stripe: implemented/configured/certified;
- email: implemented/configured/certified;
- deployment: none/preview/production;
- restore drill: not run/failed/passed;
- connected E2E counts;
- critical/high defects;
- remaining launch gates.

External gates must remain visible rather than being converted into fake success.

---

## 16. Launch certification journey

The launch suite starts before authentication.

Required reference journey:

1. anonymous user visits `/`;
2. navigates product and pricing;
3. starts signup;
4. views and accepts the actual currently published binding terms/privacy artifacts;
5. creates organization and entity/book/property;
6. imports or creates an occupied tenancy;
7. uploads a document;
8. document clears the actual scan lifecycle without manual SQL edits;
9. recurring charge appears because the configured scheduler/orchestrator invoked the domain engine;
10. resident is invited and activates;
11. resident sees balance;
12. provider payment path works when Stripe certification environment is enabled;
13. transactional notification is delivered when mail provider environment is enabled;
14. maintenance lifecycle works;
15. owner statement/owner view works;
16. operator switches to a second organization and all audited surfaces switch without data mixing.

The final certification report must explicitly separate:

- code passed;
- runtime/scheduled passed;
- provider-configured passed;
- legal content published;
- deployment passed;
- professional/human gates outstanding.

That separation is the corrected definition of launch readiness for Crecy.
