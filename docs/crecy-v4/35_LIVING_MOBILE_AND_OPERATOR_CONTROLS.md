# Crecy Living Mobile Login and Operator Community Controls

**Review date:** 2026-09-05  
**Scope:** mobile community login, operator property workspace, community metadata command boundary  
**Authority:** files 29–34 plus current property-scope/RLS and command conventions

## 1. Mobile login correction

The first community-login implementation was visually complete only at desktop width because the image-led Living stage lived inside a `hidden lg:block` region.

On mobile, the remaining form column was also vertically centered across the viewport. On an iPhone/in-app browser this produced a large blank region above the Crecy wordmark and removed the community photograph entirely.

The corrected contract is:

- mobile auth content starts near the top of the page;
- desktop keeps the two-column stage/form composition;
- an explicit Living community renders its hero directly in the mobile login column;
- the hero carries community name and demo/product context;
- unknown/root Living hosts do not receive invented community imagery;
- authentication behavior is unchanged.

## 2. Operator property workspace

Each operator property workspace now owns a **Resident portal** section.

The section manages only public community-presentation metadata:

- community display name;
- Crecy Living subdomain;
- public address;
- resident welcome line;
- leasing email/phone;
- public office-hours lines;
- featured amenities;
- optional public notice;
- draft/published state.

The form includes a public-only visual preview and current media-assignment status.

## 3. Media boundary

Public text/publishing and binary media upload are deliberately separate commands.

The operator control does not accept arbitrary image URLs. Current media assignments are displayed read-only.

A real upload/replacement action must use Crecy-managed storage and retain the same-origin `/media/...` rule from file 34. Until the correct Crecy storage project is connected, no fake upload button is presented as functional.

## 4. Save/publish command

`save_living_community_profile` is:

- authenticated;
- checked with `property.manage`;
- property-scoped;
- idempotent;
- optimistic-version controlled;
- audited;
- outbox-backed.

The command preserves existing media fields while public metadata is edited.

A stale operator session receives `VERSION_CONFLICT` rather than overwriting another operator's changes.

## 5. Runtime boundary

The connected Supabase account still does not expose the Crecy/Property-management project.

Therefore:

- the migration and command are repository-authoritative;
- the operator control degrades to a truthful read-only setup state when the table/function is absent;
- no migration has been applied to an unrelated Supabase project;
- runtime save/publish is not certified until the exact Crecy project is identified and migrations are applied there.

## 6. Regression guard

`src/lib/design/living-mobile-community-controls.test.ts` protects:

- mobile top alignment;
- direct mobile community hero rendering;
- property-workspace Resident portal placement;
- no arbitrary operator media URL input;
- property permission checks;
- optimistic version control;
- idempotency/audit event usage;
- preservation of assigned media during metadata saves.
