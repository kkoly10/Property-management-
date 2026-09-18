# Phase 6 — Vendor workflow closure: contextual creation + vendor management

**Migration:** `supabase/migrations/20260918090000_phase_6_vendor_management.sql` (forward-only,
functions only — authority table/policy counts unchanged at 77/59).

## The gap

A brand-new organization could not complete the maintenance journey without database access. The
pieces each existed and the seam between them did not:

* `create_vendor` shipped in phase 6, and `/app/vendors` could call it — but only from its own page.
  On the maintenance request, where the vendor is actually chosen, an organization with no vendors got
  the sentence *"No vendors yet."* and nothing else. Following that instruction meant navigating away
  from a half-filled work order and losing the scope, priority, estimated cost, currency and
  owner-approval selection already typed into it.
* Nothing could **change** a vendor afterwards. A wrong phone number, a contractor who stops working
  with the organization, a duplicate added in a hurry — each needed a `psql` session to correct, and
  there was no way to stop assigning work to a vendor short of deleting the row (which
  `work_orders.vendor_id on delete restrict` rightly refuses).

## What shipped

**Command (`public.update_vendor`)** — the one mutation, mirroring `create_vendor` step for step:
`security definer`, `set search_path=''`, auth gate → idempotency-key validation →
`private.has_unscoped_org_permission(org,'maintenance.manage')` → field validation → org-scoped vendor
load → request hash → idempotency lookup on route `UpdateVendor` → mutation → `audit.audit_events` +
`private.outbox_events` under one correlation id → completed record → camelCase response. Sentinels:
`AUTHENTICATION_REQUIRED`, `INVALID_IDEMPOTENCY_KEY`, `ORGANIZATION_SCOPE_DENIED`,
`INVALID_VENDOR_NAME|EMAIL|PHONE|STATUS`, `VENDOR_NOT_FOUND`, `IDEMPOTENCY_CONFLICT`,
`COMMAND_IN_PROGRESS`.

It **replaces** the mutable fields rather than merging them. With a merge a null email means both
"leave it alone" and "clear it" and the caller cannot say which; a full replacement makes "clear the
email" expressible, and the API schema therefore requires `email`/`phoneE164` as *nullable*, not
optional.

**Read (`public.get_operator_vendor_management_workspace`)** — vendors in EVERY status, with
`workOrderCount`, `openWorkOrderCount`, `lastAssignedAt` and `canManage`. Deliberately a different
function from `get_operator_vendor_directory`, which filters to `status='active'` and is what the
assignment screen reads. Keeping them apart is what lets a vendor vanish from new work orders the
moment they go inactive while staying visible to whoever has to manage them.

The unscoped 0-argument form is **never granted to `authenticated`**. It is a collection surface —
no organization argument, so it returns every vendor the caller can see across every organization they
belong to — which is the defect the phase-8 contract release
(`migrations-contract/20260828130000`) closed on the other operator collection surfaces. That one
needed a separate release only because the deployed fetchers still called them with no arguments;
nothing calls this one unscoped, so it is born closed and the `security definer` wrapper still
reaches it.

**Surfaces**
* `PATCH /api/v1/vendors/[vendorId]` — `safeParse` → 400, `auth.getUser()` → 401, RPC, then the
  sentinel ladder (scope → 403, not-found → 404, conflict/in-progress → 409, validation → 422).
* `src/lib/data/maintenance.ts` — `getOperatorVendorManagement(organizationId)` and
  `getOperatorVendorDetail(organizationId, vendorId)`, the latter derived from the former so an id
  outside the caller's organization simply has no record to return.
* `/app/vendors` now reads the management workspace (not the assignment directory, which would have
  hidden every inactive vendor) and its rows link to `/app/vendors/[vendorId]`.
* `/app/vendors/[vendorId]` — identity, contact details, status, assignment context, edit, status
  change and archive. No delete: work orders reference vendors by id and must keep naming them.
* `AssignVendorForm` — contextual **Add vendor**, open by default when there are none.

## Three load-bearing details in the contextual form

* The vendor fields are **not** a nested `<form>`. That is invalid markup and the browser resolves it
  by discarding the inner one; they are a div whose button is `type="button"`.
* **Enter** inside a vendor field is intercepted. Left alone it submits the enclosing work-order form,
  which is the opposite of what someone typing a vendor name intends.
* Creation does **not** call `router.refresh()`. Refreshing re-renders the server component and takes
  the half-filled work order with it; the new vendor is appended to local state, selected, and focus
  moves to the vendor field. That is the entire point of doing this here rather than on the directory
  page.

## Historical references

Preserved by construction rather than by care: status is a column on the vendor, work orders reference
the vendor by id, nothing deletes, and the work-order projection joins `display_name` without
filtering on status. A completed work order keeps naming its vendor after that vendor is archived —
asserted in `test:db`, not assumed.

## Verification

* `npm run test:db` — vendor coverage added inside the existing recurring-charges chain: scoped
  coordinator denied (`ORGANIZATION_SCOPE_DENIED`), foreign vendor id (`VENDOR_NOT_FOUND`), foreign
  organization (`ORGANIZATION_SCOPE_DENIED`), status/email/phone validation, idempotent replay,
  inactive vendor rejected by `create_and_assign_work_order`, archived vendor absent from the
  assignment directory but present in the management workspace, the historical work order still
  naming the archived vendor, audit/idempotency/retention counts, and the unscoped workspace
  unreachable by `authenticated`.
* `src/app/app/maintenance/[requestId]/assign-vendor-form.test.tsx` — the work-order draft survives a
  failed creation and the retry that succeeds; the new vendor becomes the selection; no vendor is
  created until the vendor form is submitted; Enter adds the vendor rather than creating the work
  order; focus lands on the name field on open and the vendor field on success.
* `e2e/vendors.spec.ts` — the affordance sits with the field it serves, the directory leads to a
  vendor and back, the management form is labelled and offers archiving rather than deletion, and
  none of the three surfaces scrolls horizontally at 390 / 768 / 1024 / 1440.
