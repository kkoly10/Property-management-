-- Phase 2: delivering a document grants its recipient read access to it.
--
-- document_deliveries / document_acknowledgements already let a recipient read their own delivery and
-- acknowledgement rows, but the delivered document itself (documents / document_versions) stayed
-- governed by documents_scoped_read, which only admits a property-scoped operator or a tenancy
-- resident. An operator-delivered *property-scoped* notice was therefore invisible AND undownloadable
-- to the very resident/owner it was delivered to (the signed-URL download route reads document_versions
-- under the same RLS). This extends documents_scoped_read with a "delivered to me" clause so a
-- recipient can read — and, through the existing download route, retrieve — any document delivered to
-- them, and nothing else.
--
-- The check goes through a security-definer helper, NOT an inline subquery: documents_scoped_read
-- referencing document_versions inline would recurse (document_versions_parent_read references
-- documents), so the helper resolves the delivery with RLS bypassed, exactly like the other private.*
-- gates in this policy. Same policy name (authority policy count unchanged); forward-only, mirroring
-- phase_3_existing_lease.
begin;

create or replace function private.is_document_delivery_recipient(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.document_deliveries dd
    join public.document_versions dv on dv.id = dd.document_version_id
    where dv.document_id = p_document_id
      and dd.recipient_user_id = (select auth.uid())
  );
$$;
revoke all on function private.is_document_delivery_recipient(uuid) from public;
grant execute on function private.is_document_delivery_recipient(uuid) to authenticated;

drop policy documents_scoped_read on public.documents;
create policy documents_scoped_read on public.documents for select to authenticated using (
  (property_id is not null and (private.has_property_access(property_id,'documents.read') or private.has_property_access(property_id,'documents.manage')))
  or (property_id is null and (private.has_unscoped_org_permission(organization_id,'documents.read') or private.has_unscoped_org_permission(organization_id,'documents.manage')))
  or (tenancy_id is not null and private.is_resident_for_tenancy(tenancy_id))
  or private.is_document_delivery_recipient(id)
);

commit;
