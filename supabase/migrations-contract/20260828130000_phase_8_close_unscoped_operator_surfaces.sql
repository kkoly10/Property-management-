-- CONTRACT RELEASE — see supabase/migrations-contract/README.md before applying.
--
-- Phase 8 (v4.2 Batch A3 + A.1): close the unscoped operator collection surfaces, and the browser
-- organization-creation surface.
--
-- APPLY THIS ONLY AFTER the compatible build is deployed AND verified in the target environment.
--
-- Every other migration in this project is additive and safe to apply out of band ahead of a deploy.
-- This one is not, and the split exists to make that impossible to miss: the previously deployed
-- fetchers call these functions with NO arguments, so revoking first breaks the operator dashboard,
-- maintenance queue, payments, vendors and search with "permission denied" until the new build is live.
--
-- What it closes: the COLLECTION surfaces — the ones that take no resource and therefore return every
-- row the caller can see across every organization they belong to. That union is the defect. Their
-- organization-scoped replacements were added by 20260828120000.
--
-- Deliberately NOT revoked: resource-id surfaces (get_payment_detail, get_import_job_detail,
-- get_conversation_detail, ...), which return ONE resource belonging to exactly one organization and
-- so cannot mix tenants; RLS already decides whether the caller may see it, and residents and owners
-- legitimately call several of them with no operator organization to supply. Likewise
-- get_conversation_workspace and get_privacy_request_workspace, which serve the portals too.
--
-- Authority: no table, no policy, no function. Counts unchanged.
begin;

revoke execute on function public.get_operator_announcement_workspace() from authenticated;
revoke execute on function public.get_operator_maintenance_workspace() from authenticated;
revoke execute on function public.get_operator_vendor_directory() from authenticated;
revoke execute on function public.get_operator_owner_statement_workspace() from authenticated;
revoke execute on function public.get_operator_owner_approval_workspace() from authenticated;
revoke execute on function public.get_operator_payment_summary() from authenticated;
revoke execute on function public.get_operator_receivables_summary() from authenticated;
revoke execute on function public.get_settlement_reconciliation_workspace() from authenticated;
revoke execute on function public.get_manual_payment_options() from authenticated;
revoke execute on function public.get_payment_connection_settings() from authenticated;
revoke execute on function public.get_operator_global_search(text,integer) from authenticated;

-- ── A.1: the organization-creation write boundary ───────────────────────────────────────────────
-- The legal publication gate lives in the server action, which is only a boundary once the browser
-- cannot reach the write directly. public.create_organization accepts an arbitrary p_terms_version, so
-- while `authenticated` holds this grant a signed-in browser can record consent against a document
-- that was never published and never shown.
--
-- The implementation is unchanged and still reachable: create_organization is a thin wrapper over
-- create_organization_as_actor, which the Next server action calls with a service-role key and an
-- actor derived from auth.getUser(). Removing this grant closes the direct path only.
--
-- Safe only after the build whose onboarding uses the server boundary is live: the PREVIOUS build
-- calls this function from the browser, so revoking early breaks onboarding entirely.
revoke execute on function public.create_organization(text,text,text,char(2),text,text,text,text) from authenticated;

-- ── A.1: the two shared collection surfaces ─────────────────────────────────────────────────────
-- These answered BOTH the relationship question and the operator question, and their operator half is
-- organization-wide — so an operator could union organizations simply by calling the older RPC. The
-- split contracts (get_relationship_* and the A3 organization-scoped forms) replace them.
--
-- Safe only after the build that calls the split contracts is live: the PREVIOUS build serves the
-- resident, owner and operator messaging and privacy screens from these.
revoke execute on function public.get_conversation_workspace() from authenticated;
revoke execute on function public.get_privacy_request_workspace() from authenticated;

commit;
