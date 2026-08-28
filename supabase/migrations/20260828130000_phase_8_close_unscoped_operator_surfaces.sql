-- Phase 8 (v4.2 Batch A3): close the unscoped operator collection surfaces.
--
-- APPLY THIS ONLY AFTER the code that calls the organization-scoped forms is deployed.
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

commit;
