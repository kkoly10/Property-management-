# P0 RLS Policies and Adversarial Test Matrix v4.1

**Status:** Exact authorization baseline for the P0 schema. All browser reads are denied unless a policy below permits them. All sensitive writes use server commands that re-authorize the actor before using the service role.

## 1. Authorization principles

- Roles belong to organization memberships, not profiles or editable JWT user metadata.
- Property scope narrows a role; it never expands a role.
- Residents, owners, and vendors are relationship users, not operator members.
- Owner access never implies resident PII access.
- Vendor access is limited to assigned work orders and explicitly shared evidence.
- No browser client receives the service-role key.
- A server command must validate organization, permission, property scope, lifecycle state, plan entitlement, and idempotency even though the service role bypasses RLS.

## 2. Helper functions and policies

Apply the following after `12_P0_EXECUTABLE_SCHEMA.sql`.

```sql
begin;

create or replace function private.is_active_org_member(target_org uuid)
returns boolean
language sql stable security definer
set search_path = public,private,pg_temp
as $$
  select exists (
    select 1 from public.organization_memberships m
    where m.organization_id = target_org
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.starts_at <= now()
      and (m.ends_at is null or m.ends_at > now())
  );
$$;

create or replace function private.has_org_permission(target_org uuid, requested_permission text)
returns boolean
language sql stable security definer
set search_path = public,private,pg_temp
as $$
  select exists (
    select 1
    from public.organization_memberships m
    join public.role_permissions rp on rp.role_code = m.role_code
    where m.organization_id = target_org
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.starts_at <= now()
      and (m.ends_at is null or m.ends_at > now())
      and (rp.permission_code = '*' or rp.permission_code = requested_permission)
  );
$$;

create or replace function private.has_property_access(target_property uuid, requested_permission text)
returns boolean
language sql stable security definer
set search_path = public,private,pg_temp
as $$
  select exists (
    select 1
    from public.properties p
    join public.organization_memberships m on m.organization_id = p.organization_id
    join public.role_permissions rp on rp.role_code = m.role_code
    join public.role_definitions rd on rd.code = m.role_code
    where p.id = target_property
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.starts_at <= now()
      and (m.ends_at is null or m.ends_at > now())
      and (rp.permission_code = '*' or rp.permission_code = requested_permission)
      and (
        exists (select 1 from public.membership_property_scopes s where s.membership_id=m.id and s.property_id=p.id)
        or (
          rd.organization_wide_allowed
          and not exists (select 1 from public.membership_property_scopes s2 where s2.membership_id=m.id)
        )
      )
  );
$$;

create or replace function private.has_unscoped_org_permission(target_org uuid, requested_permission text)
returns boolean
language sql stable security definer
set search_path = public,private,pg_temp
as $$
  select exists (
    select 1 from public.organization_memberships m
    join public.role_permissions rp on rp.role_code=m.role_code
    join public.role_definitions rd on rd.code=m.role_code
    where m.organization_id=target_org and m.user_id=(select auth.uid()) and m.status='active'
      and m.starts_at <= now() and (m.ends_at is null or m.ends_at > now())
      and rd.organization_wide_allowed
      and not exists(select 1 from public.membership_property_scopes s where s.membership_id=m.id)
      and (rp.permission_code='*' or rp.permission_code=requested_permission)
  );
$$;

create or replace function private.current_user_person_ids(target_org uuid)
returns setof uuid
language sql stable security definer
set search_path = public,private,pg_temp
as $$
  select ur.relationship_id
  from public.user_relationships ur
  where ur.user_id = (select auth.uid())
    and ur.organization_id = target_org
    and ur.relationship_type = 'resident_person'
    and ur.status = 'active';
$$;

create or replace function private.is_resident_for_tenancy(target_tenancy uuid)
returns boolean
language sql stable security definer
set search_path = public,private,pg_temp
as $$
  select exists (
    select 1
    from public.tenancies t
    join public.household_members hm on hm.household_id=t.household_id
    join public.user_relationships ur
      on ur.organization_id=t.organization_id
     and ur.relationship_type='resident_person'
     and ur.relationship_id=hm.person_id
     and ur.status='active'
    where t.id=target_tenancy
      and ur.user_id=(select auth.uid())
      and hm.starts_on <= current_date
      and (hm.ends_on is null or hm.ends_on >= current_date)
  );
$$;

create or replace function private.is_owner_for_property(target_property uuid)
returns boolean
language sql stable security definer
set search_path = public,private,pg_temp
as $$
  select exists (
    select 1
    from public.ownership_interests oi
    join public.user_relationships ur
      on ur.organization_id=oi.organization_id
     and ur.relationship_type='owner_entity'
     and ur.relationship_id=oi.owner_entity_id
     and ur.status='active'
    where oi.property_id=target_property
      and ur.user_id=(select auth.uid())
      and oi.effective_from <= current_date
      and (oi.effective_to is null or oi.effective_to >= current_date)
  );
$$;

create or replace function private.is_owner_for_property(target_property uuid,target_owner_entity uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.ownership_interests oi
    join public.user_relationships ur
      on ur.organization_id=oi.organization_id
     and ur.relationship_type='owner_entity'
     and ur.relationship_id=oi.owner_entity_id
     and ur.status='active'
    where oi.property_id=target_property
      and oi.owner_entity_id=target_owner_entity
      and ur.user_id=(select auth.uid())
      and oi.effective_from <= current_date
      and (oi.effective_to is null or oi.effective_to >= current_date)
  );
$$;

create or replace function private.is_vendor_for_work_order(target_work_order uuid)
returns boolean
language sql stable security definer
set search_path = public,private,pg_temp
as $$
  select exists (
    select 1
    from public.work_orders w
    join public.user_relationships ur
      on ur.organization_id=w.organization_id
     and ur.relationship_type='vendor_contact'
     and ur.relationship_id=w.vendor_id
     and ur.status='active'
    where w.id=target_work_order
      and ur.user_id=(select auth.uid())
      and w.vendor_id is not null
  );
$$;

create or replace function private.has_announcement_delivery(target_announcement uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.announcement_deliveries ad
    where ad.announcement_id=target_announcement
      and ad.recipient_user_id=(select auth.uid())
  );
$$;

create or replace function private.can_manage_announcement(target_announcement uuid,target_organization uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.announcements a
    where a.id=target_announcement
      and a.organization_id=target_organization
      and (
        (a.property_id is not null and private.has_property_access(a.property_id,'resident.manage'))
        or (a.property_id is null and private.has_unscoped_org_permission(a.organization_id,'resident.manage'))
      )
  );
$$;

revoke all on function private.is_active_org_member(uuid) from public;
revoke all on function private.has_org_permission(uuid,text) from public;
revoke all on function private.has_property_access(uuid,text) from public;
revoke all on function private.has_unscoped_org_permission(uuid,text) from public;
revoke all on function private.current_user_person_ids(uuid) from public;
revoke all on function private.is_resident_for_tenancy(uuid) from public;
revoke all on function private.is_owner_for_property(uuid) from public;
revoke all on function private.is_owner_for_property(uuid,uuid) from public;
revoke all on function private.is_vendor_for_work_order(uuid) from public;
revoke all on function private.has_announcement_delivery(uuid) from public;
revoke all on function private.can_manage_announcement(uuid,uuid) from public;
grant execute on function private.is_active_org_member(uuid) to authenticated;
grant execute on function private.has_org_permission(uuid,text) to authenticated;
grant execute on function private.has_property_access(uuid,text) to authenticated;
grant execute on function private.has_unscoped_org_permission(uuid,text) to authenticated;
grant execute on function private.current_user_person_ids(uuid) to authenticated;
grant execute on function private.is_resident_for_tenancy(uuid) to authenticated;
grant execute on function private.is_owner_for_property(uuid) to authenticated;
grant execute on function private.is_owner_for_property(uuid,uuid) to authenticated;
grant execute on function private.is_vendor_for_work_order(uuid) to authenticated;
grant execute on function private.has_announcement_delivery(uuid) to authenticated;
grant execute on function private.can_manage_announcement(uuid,uuid) to authenticated;

-- Enable RLS on every exposed table.
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.operating_entities enable row level security;
alter table public.accounting_books enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.membership_property_scopes enable row level security;
alter table public.country_profiles enable row level security;
alter table public.provider_connections enable row level security;
alter table public.properties enable row level security;
alter table public.buildings enable row level security;
alter table public.units enable row level security;
alter table public.people enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.owner_entities enable row level security;
alter table public.ownership_interests enable row level security;
alter table public.leases enable row level security;
alter table public.receivable_accounts enable row level security;
alter table public.tenancies enable row level security;
alter table public.user_relationships enable row level security;
alter table public.ledger_accounts enable row level security;
alter table public.journal_transactions enable row level security;
alter table public.journal_entries enable row level security;
alter table public.charge_schedules enable row level security;
alter table public.charges enable row level security;
alter table public.payments enable row level security;
alter table public.payment_attempts enable row level security;
alter table public.payment_allocations enable row level security;
alter table public.payment_refunds enable row level security;
alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
alter table public.vendors enable row level security;
alter table public.maintenance_requests enable row level security;
alter table public.work_orders enable row level security;
alter table public.import_jobs enable row level security;
alter table public.consent_records enable row level security;
alter table public.plan_catalog enable row level security;
alter table public.plan_entitlements enable row level security;
alter table public.organization_subscriptions enable row level security;
alter table public.invitations enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;
alter table public.announcements enable row level security;
alter table public.announcement_deliveries enable row level security;
alter table public.document_deliveries enable row level security;
alter table public.document_acknowledgements enable row level security;
alter table public.privacy_requests enable row level security;
alter table public.owner_approval_requests enable row level security;
alter table public.owner_approval_decisions enable row level security;
alter table public.localized_price_books enable row level security;
alter table public.plan_prices enable row level security;
alter table public.usage_meter_definitions enable row level security;
alter table public.usage_records enable row level security;
alter table public.billing_invoices enable row level security;
alter table public.billing_invoice_lines enable row level security;
alter table public.owner_remittance_records enable row level security;
alter table reporting.owner_statement_snapshots enable row level security;

-- Profile self access.
create policy profiles_self_select on public.profiles for select to authenticated
using (user_id=(select auth.uid()));

-- Reference data.
create policy country_profiles_authenticated_read on public.country_profiles for select to authenticated using (true);
create policy plan_catalog_authenticated_read on public.plan_catalog for select to authenticated using (active);
create policy plan_entitlements_authenticated_read on public.plan_entitlements for select to authenticated using (true);

-- Operator organization access.
create policy organizations_member_read on public.organizations for select to authenticated
using ((select private.is_active_org_member(id)));
create policy memberships_self_or_admin_read on public.organization_memberships for select to authenticated
using (user_id=(select auth.uid()) or (select private.has_org_permission(organization_id,'organization.manage')));
create policy property_scopes_self_or_admin_read on public.membership_property_scopes for select to authenticated
using (
  exists(select 1 from public.organization_memberships m where m.id=membership_id and m.user_id=(select auth.uid()))
  or exists(select 1 from public.organization_memberships m where m.id=membership_id and (select private.has_org_permission(m.organization_id,'organization.manage')))
);
create policy operating_entities_operator_read on public.operating_entities for select to authenticated
using ((select private.has_org_permission(organization_id,'organization.manage')) or (select private.has_org_permission(organization_id,'finance.read')));
create policy accounting_books_operator_read on public.accounting_books for select to authenticated
using ((select private.has_org_permission(organization_id,'finance.read')) or (select private.has_org_permission(organization_id,'finance.manage')));
create policy provider_connections_privileged_read on public.provider_connections for select to authenticated
using ((select private.has_org_permission(organization_id,'finance.manage')) or (select private.has_org_permission(organization_id,'organization.manage')));
create policy subscriptions_org_admin_read on public.organization_subscriptions for select to authenticated
using ((select private.has_org_permission(organization_id,'organization.manage')));

-- Property access across roles.
create policy properties_scoped_read on public.properties for select to authenticated
using (
  (select private.has_property_access(id,'property.read'))
  or (select private.has_property_access(id,'property.manage'))
  or exists(select 1 from public.tenancies t where t.property_id=id and (select private.is_resident_for_tenancy(t.id)))
  or (select private.is_owner_for_property(id))
  or exists(select 1 from public.work_orders w where w.property_id=id and (select private.is_vendor_for_work_order(w.id)))
);
create policy buildings_scoped_read on public.buildings for select to authenticated
using (exists(select 1 from public.properties p where p.id=property_id));
create policy units_scoped_read on public.units for select to authenticated
using (
  (select private.has_property_access(property_id,'property.read'))
  or (select private.has_property_access(property_id,'property.manage'))
  or exists(select 1 from public.tenancies t where t.unit_id=id and (select private.is_resident_for_tenancy(t.id)))
  or (select private.is_owner_for_property(property_id))
  or exists(select 1 from public.work_orders w where w.unit_id=id and (select private.is_vendor_for_work_order(w.id)))
);

-- People and household privacy.
create policy people_operator_or_self_read on public.people for select to authenticated
using (
  id in (select private.current_user_person_ids(organization_id))
  or exists (
    select 1 from public.household_members hm join public.tenancies t on t.household_id=hm.household_id
    where hm.person_id=id and ((select private.has_property_access(t.property_id,'resident.read')) or (select private.has_property_access(t.property_id,'resident.manage')))
  )
  or (select private.has_unscoped_org_permission(organization_id,'resident.read'))
  or (select private.has_unscoped_org_permission(organization_id,'resident.manage'))
);
create policy households_operator_or_resident_read on public.households for select to authenticated
using (
  exists(select 1 from public.tenancies t where t.household_id=id and ((select private.has_property_access(t.property_id,'resident.read')) or (select private.has_property_access(t.property_id,'resident.manage')) or (select private.is_resident_for_tenancy(t.id))))
);
create policy household_members_operator_or_resident_read on public.household_members for select to authenticated
using (exists(select 1 from public.households h where h.id=household_id));

-- Owner identity is visible to operator roles and the owner themself.
create policy owner_entities_scoped_read on public.owner_entities for select to authenticated
using (
  exists(select 1 from public.ownership_interests oi where oi.owner_entity_id=id and ((select private.has_property_access(oi.property_id,'owner.read')) or (select private.has_property_access(oi.property_id,'owner.manage'))))
  or exists(select 1 from public.user_relationships ur where ur.user_id=(select auth.uid()) and ur.organization_id=organization_id and ur.relationship_type='owner_entity' and ur.relationship_id=id and ur.status='active')
);
create policy ownership_interests_scoped_read on public.ownership_interests for select to authenticated
using (
  (select private.has_property_access(property_id,'owner.read'))
  or (select private.has_property_access(property_id,'owner.manage'))
  or (select private.is_owner_for_property(property_id))
);

-- Lease/tenancy/receivables.
create policy leases_scoped_read on public.leases for select to authenticated
using (
  (select private.has_property_access(property_id,'lease.read'))
  or (select private.has_property_access(property_id,'lease.manage'))
  or exists(select 1 from public.tenancies t where t.lease_id=id and (select private.is_resident_for_tenancy(t.id)))
);
create policy tenancies_scoped_read on public.tenancies for select to authenticated
using (
  (select private.has_property_access(property_id,'resident.read'))
  or (select private.has_property_access(property_id,'resident.manage'))
  or (select private.is_resident_for_tenancy(id))
);
create policy receivable_accounts_scoped_read on public.receivable_accounts for select to authenticated
using (
  exists(select 1 from public.tenancies t where t.receivable_account_id=id and (((select private.has_property_access(t.property_id,'finance.read')) or (select private.has_property_access(t.property_id,'finance.manage'))) or (select private.is_resident_for_tenancy(t.id))))
  or (select private.has_unscoped_org_permission(organization_id,'finance.read'))
  or (select private.has_unscoped_org_permission(organization_id,'finance.manage'))
);

-- Finance. Owners receive aggregate snapshots, not resident charge/payment rows.
create policy ledger_accounts_operator_read on public.ledger_accounts for select to authenticated
using ((select private.has_unscoped_org_permission(organization_id,'finance.read')) or (select private.has_unscoped_org_permission(organization_id,'finance.manage')));
create policy journal_transactions_operator_read on public.journal_transactions for select to authenticated
using (
  (select private.has_unscoped_org_permission(organization_id,'finance.read')) or (select private.has_unscoped_org_permission(organization_id,'finance.manage'))
  or exists(select 1 from public.journal_entries je where je.journal_transaction_id=id and je.property_id is not null and ((select private.has_property_access(je.property_id,'finance.read')) or (select private.has_property_access(je.property_id,'finance.manage'))) )
);
create policy journal_entries_operator_read on public.journal_entries for select to authenticated
using (
  (property_id is not null and ((select private.has_property_access(property_id,'finance.read')) or (select private.has_property_access(property_id,'finance.manage'))))
  or (property_id is null and ((select private.has_unscoped_org_permission(organization_id,'finance.read')) or (select private.has_unscoped_org_permission(organization_id,'finance.manage'))))
);
create policy charge_schedules_operator_or_resident_read on public.charge_schedules for select to authenticated
using (
  exists(select 1 from public.tenancies t where t.id=tenancy_id and ((select private.has_property_access(t.property_id,'finance.read')) or (select private.has_property_access(t.property_id,'finance.manage'))))
  or (select private.is_resident_for_tenancy(tenancy_id))
);
create policy charges_operator_or_resident_read on public.charges for select to authenticated
using (
  exists(select 1 from public.tenancies t where t.id=tenancy_id and ((select private.has_property_access(t.property_id,'finance.read')) or (select private.has_property_access(t.property_id,'finance.manage'))))
  or (select private.is_resident_for_tenancy(tenancy_id))
);
create policy payments_operator_or_resident_read on public.payments for select to authenticated
using (
  exists(select 1 from public.tenancies t where t.id=tenancy_id and ((select private.has_property_access(t.property_id,'finance.read')) or (select private.has_property_access(t.property_id,'finance.manage'))))
  or (select private.is_resident_for_tenancy(tenancy_id))
);
create policy payment_attempts_operator_or_resident_read on public.payment_attempts for select to authenticated
using (exists(select 1 from public.payments p where p.id=payment_id));
create policy payment_allocations_operator_or_resident_read on public.payment_allocations for select to authenticated
using (exists(select 1 from public.payments p where p.id=payment_id));
create policy payment_refunds_operator_or_resident_read on public.payment_refunds for select to authenticated
using (exists(select 1 from public.payments p where p.id=payment_id));

-- Documents. Relationship users see only documents explicitly related to their resource.
create policy documents_scoped_read on public.documents for select to authenticated
using (
  (property_id is not null and ((select private.has_property_access(property_id,'documents.read')) or (select private.has_property_access(property_id,'documents.manage'))))
  or (tenancy_id is not null and (select private.is_resident_for_tenancy(tenancy_id)))
  or (owner_entity_id is not null and exists(select 1 from public.user_relationships ur where ur.user_id=(select auth.uid()) and ur.organization_id=organization_id and ur.relationship_type='owner_entity' and ur.relationship_id=owner_entity_id and ur.status='active'))
);
create policy document_versions_parent_read on public.document_versions for select to authenticated
using (exists(select 1 from public.documents d where d.id=document_id));

-- Maintenance and vendors.
create policy vendors_operator_or_self_read on public.vendors for select to authenticated
using (
  exists(select 1 from public.work_orders w where w.vendor_id=id and ((select private.has_property_access(w.property_id,'maintenance.read')) or (select private.has_property_access(w.property_id,'maintenance.manage'))))
  or (select private.has_unscoped_org_permission(organization_id,'maintenance.read'))
  or (select private.has_unscoped_org_permission(organization_id,'maintenance.manage'))
  or exists(select 1 from public.user_relationships ur where ur.user_id=(select auth.uid()) and ur.organization_id=organization_id and ur.relationship_type='vendor_contact' and ur.relationship_id=id and ur.status='active')
);
create policy maintenance_requests_scoped_read on public.maintenance_requests for select to authenticated
using (
  (select private.has_property_access(property_id,'maintenance.read'))
  or (select private.has_property_access(property_id,'maintenance.manage'))
  or (tenancy_id is not null and (select private.is_resident_for_tenancy(tenancy_id)))

);
create policy work_orders_scoped_read on public.work_orders for select to authenticated
using (
  (select private.has_property_access(property_id,'maintenance.read'))
  or (select private.has_property_access(property_id,'maintenance.manage'))
);

-- Owner portal aggregate records.
create policy owner_statement_scoped_read on reporting.owner_statement_snapshots for select to authenticated
using (
  (select private.has_property_access(property_id,'owner.read'))
  or (select private.has_property_access(property_id,'owner.manage'))
  or (select private.is_owner_for_property(property_id,owner_entity_id))
);
create policy owner_remittance_scoped_read on public.owner_remittance_records for select to authenticated
using (
  (select private.has_property_access(property_id,'owner.read'))
  or (select private.has_property_access(property_id,'owner.manage'))
  or (select private.is_owner_for_property(property_id,owner_entity_id))
);

-- Imports and consent.
create policy import_jobs_privileged_read on public.import_jobs for select to authenticated
using (
  (select private.has_unscoped_org_permission(import_jobs.organization_id,'organization.manage'))
  or (source_document_id is not null and exists (
    select 1
    from public.documents d
    where d.id=source_document_id
      and d.property_id is not null
      and (select private.has_property_access(d.property_id,'property.manage'))
  ))
);
create policy consent_records_self_or_admin_read on public.consent_records for select to authenticated
using (user_id=(select auth.uid()) or (organization_id is not null and (select private.has_org_permission(organization_id,'organization.manage'))));
create policy user_relationships_self_or_admin_read on public.user_relationships for select to authenticated
using (user_id=(select auth.uid()) or (select private.has_org_permission(organization_id,'organization.manage')));


-- v4.1 messaging, delivery, privacy, approval and billing policies.
create policy invitations_admin_read on public.invitations for select to authenticated using ((select private.has_org_permission(organization_id,'organization.manage')));
create policy conversations_participant_read on public.conversations for select to authenticated using (exists(select 1 from public.conversation_participants cp where cp.conversation_id=id and cp.user_id=(select auth.uid()) and cp.left_at is null) or (property_id is not null and ((select private.has_property_access(property_id,'resident.read')) or (select private.has_property_access(property_id,'owner.read')))));
create policy conversation_participants_parent_read on public.conversation_participants for select to authenticated using (exists(select 1 from public.conversations c where c.id=conversation_id));
create policy messages_parent_read on public.messages for select to authenticated using (exists(select 1 from public.conversations c where c.id=conversation_id));
create policy announcements_scoped_read on public.announcements for select to authenticated using (
  (select private.can_manage_announcement(id,organization_id))
  or (select private.has_announcement_delivery(id))
);
create policy announcement_deliveries_self_read on public.announcement_deliveries for select to authenticated using (
  recipient_user_id=(select auth.uid())
  or (select private.can_manage_announcement(announcement_id,organization_id))
);
create policy document_deliveries_self_or_manager_read on public.document_deliveries for select to authenticated using (
  recipient_user_id=(select auth.uid())
  or exists (
    select 1
    from public.document_versions dv
    join public.documents d on d.id=dv.document_id and d.organization_id=dv.organization_id
    where dv.id=document_version_id
      and (
        (d.property_id is not null and (select private.has_property_access(d.property_id,'documents.manage')))
        or (d.property_id is null and (select private.has_unscoped_org_permission(document_deliveries.organization_id,'documents.manage')))
      )
  )
);
create policy document_ack_self_or_manager_read on public.document_acknowledgements for select to authenticated using (
  user_id=(select auth.uid())
  or exists (
    select 1
    from public.document_deliveries dd
    join public.document_versions dv on dv.id=dd.document_version_id and dv.organization_id=dd.organization_id
    join public.documents d on d.id=dv.document_id and d.organization_id=dv.organization_id
    where dd.id=document_delivery_id
      and (
        (d.property_id is not null and (select private.has_property_access(d.property_id,'documents.manage')))
        or (d.property_id is null and (select private.has_unscoped_org_permission(document_acknowledgements.organization_id,'documents.manage')))
      )
  )
);
create policy privacy_requests_self_or_admin_read on public.privacy_requests for select to authenticated using (requester_user_id=(select auth.uid()) or (organization_id is not null and (select private.has_org_permission(organization_id,'organization.manage'))));
create policy owner_approval_request_scoped_read on public.owner_approval_requests for select to authenticated using ((select private.has_property_access(property_id,'maintenance.manage')) or (select private.has_property_access(property_id,'owner.manage')) or (select private.is_owner_for_property(property_id,owner_entity_id)));
create policy owner_approval_decision_parent_read on public.owner_approval_decisions for select to authenticated using (exists(select 1 from public.owner_approval_requests r where r.id=approval_request_id and (r.owner_entity_id=owner_approval_decisions.owner_entity_id or (select private.has_property_access(r.property_id,'owner.manage')))));
create policy localized_price_books_read on public.localized_price_books for select to authenticated using (status='active');
create policy plan_prices_read on public.plan_prices for select to authenticated using (true);
create policy usage_meter_definitions_read on public.usage_meter_definitions for select to authenticated using (true);
create policy usage_records_admin_read on public.usage_records for select to authenticated using ((select private.has_org_permission(organization_id,'organization.manage')));
create policy billing_invoices_admin_read on public.billing_invoices for select to authenticated using ((select private.has_org_permission(organization_id,'organization.manage')));
create policy billing_invoice_lines_parent_read on public.billing_invoice_lines for select to authenticated using (exists(select 1 from public.billing_invoices i where i.id=invoice_id));


-- Sanitized relationship projections. These views intentionally select a limited column set and filter with relationship helper functions.
create or replace view reporting.owner_lease_summaries with (security_barrier=true) as
select l.id as lease_id,l.organization_id,l.property_id,l.unit_id,u.unit_code,l.start_date,l.end_date,l.rent_amount_minor,l.currency_code,l.rent_frequency,l.status
from public.leases l join public.units u on u.id=l.unit_id
where private.is_owner_for_property(l.property_id);
create or replace view reporting.owner_maintenance_summaries with (security_barrier=true) as
select mr.id as maintenance_request_id,mr.organization_id,mr.public_reference,mr.property_id,mr.unit_id,mr.category,mr.priority,mr.status,mr.created_at,mr.closed_at
from public.maintenance_requests mr
where private.is_owner_for_property(mr.property_id);
create or replace view reporting.vendor_work_order_assignments with (security_barrier=true) as
select w.id as work_order_id,w.organization_id,w.property_id,w.unit_id,u.unit_code,w.vendor_id,w.status,w.scope,w.scheduled_start,w.scheduled_end,w.started_at,w.completed_at,w.completion_summary,w.estimated_cost_minor,w.actual_cost_minor,w.currency_code,w.version
from public.work_orders w left join public.units u on u.id=w.unit_id
where private.is_vendor_for_work_order(w.id);
create or replace view reporting.resident_work_order_summaries with (security_barrier=true) as
select w.id as work_order_id,w.organization_id,w.property_id,w.unit_id,w.status,w.scheduled_start,w.scheduled_end,w.started_at,w.completed_at,w.completion_summary,w.version
from public.work_orders w
join public.maintenance_requests mr on mr.id=w.maintenance_request_id and mr.organization_id=w.organization_id
where mr.tenancy_id is not null and private.is_resident_for_tenancy(mr.tenancy_id);
revoke all on reporting.owner_lease_summaries,reporting.owner_maintenance_summaries,reporting.vendor_work_order_assignments,reporting.resident_work_order_summaries from anon;
grant usage on schema reporting to authenticated;
grant select on reporting.owner_lease_summaries,reporting.owner_maintenance_summaries,reporting.vendor_work_order_assignments,reporting.resident_work_order_summaries to authenticated;

commit;
```

## 2.1 Relationship-user projection rule

Owners and vendors receive **no direct SELECT policy** on full `leases`, `maintenance_requests`, or `work_orders`. They consume the sanitized `reporting.owner_lease_summaries`, `reporting.owner_maintenance_summaries`, and `reporting.vendor_work_order_assignments` projections or equivalent server query DTOs. These projections omit resident identity, private notes, payment rows, internal cost approvals, and unrelated evidence.

## 3. Write policy

P0 does not grant direct browser writes to tenant business tables. The following are server commands:

- organization/member/property/unit mutations;
- imports;
- lease/tenancy activation;
- charges, journal entries, payments, allocations, refunds, reversals;
- manual payment recording;
- maintenance transitions and assignments;
- owner statement finalization;
- document metadata/version creation.

The server route must:

1. verify an authenticated user;
2. load current membership/relationship from the database;
3. require the command permission;
4. require property scope;
5. require the plan entitlement;
6. validate object lifecycle and version;
7. execute in one database transaction;
8. write audit and outbox records;
9. return the stable response envelope.

## 4. Storage policy

Private bucket paths follow:

```text
organizations/{organization_id}/{resource_type}/{resource_id}/{version_id}/{filename}
```

A signed download URL is created only after the server confirms the caller can read the parent `documents` row. Do not base storage authorization only on a path supplied by the browser.

Uploads use a server-created upload grant containing organization, parent resource, MIME allowlist, size limit, expiry, and nonce. Uploaded files are quarantined until checksum and malware scan complete.

## 5. Mandatory adversarial test matrix

| Test | Actor | Attempt | Expected |
|---|---|---|---|
| RLS-001 | Org A admin | Read Org B property by UUID | 0 rows |
| RLS-002 | Org A admin | Read Org B payment through allocation join | 0 rows |
| RLS-003 | Property-scoped manager | Read unassigned property in same org | 0 rows |
| RLS-004 | Leasing agent | Read journal entries | 0 rows unless explicit finance permission |
| RLS-005 | Accountant | Update journal entry through Data API | denied |
| RLS-006 | Resident A | Read Resident B tenancy in same property | 0 rows |
| RLS-007 | Resident A | Read another household member not in their household | 0 rows |
| RLS-008 | Resident | Read owner statement | 0 rows |
| RLS-009 | Owner | Read resident person/email/payment rows | 0 rows |
| RLS-010 | Owner | Read statement for unowned property | 0 rows |
| RLS-011 | Vendor | Read another vendor’s work order | 0 rows |
| RLS-012 | Vendor | Read resident lease/payment | 0 rows |
| RLS-013 | Revoked member | Read former organization data | 0 rows immediately |
| RLS-014 | Suspended member | Read organization business data | 0 rows unless explicit support-only policy exists |
| RLS-015 | User-editable JWT metadata | Set fake admin role | no effect |
| RLS-016 | Anonymous | Read any tenant table | denied/0 rows |
| RLS-017 | Resident | Guess storage path for another lease | signed URL denied |
| RLS-018 | Owner | Guess maintenance evidence from unrelated property | denied |
| RLS-019 | Service route | Omit command authorization while using service role | integration test fails; route rejected by code review guard |
| RLS-020 | Member with no scopes and non-org-wide role | Read all properties | 0 rows |
| RLS-021 | Expired property-scoped member | Read former assigned property | 0 rows |
| RLS-022 | Property-scoped accountant | Read journal for another property in same org | 0 rows |
| RLS-023 | Property-scoped manager | Read person attached only to another property | 0 rows |
| RLS-024 | Owner | Query base leases or maintenance tables directly | 0 rows; sanitized view only |
| RLS-025 | Vendor | Query base work_orders or maintenance tables directly | 0 rows; sanitized view only |
| RLS-026 | Cross-org child insert | Pair Org A parent with Org B child ID | composite FK violation |
| RLS-027 | Co-owner A | Read statement/remittance/approval addressed to co-owner B on the same property | 0 rows |
| RLS-028 | Resident | Query base work_orders or cost/owner-approval fields | 0 rows; sanitized resident view only |
| RLS-029 | Resident | Read property announcement without an explicit delivery | 0 rows |
| RLS-030 | Property-scoped document manager | Read delivery/import sourced only from another property | 0 rows |

## 6. Financial/database invariant tests

| Test | Expected |
|---|---|
| DB-001 Insert unbalanced journal | transaction fails `JOURNAL_NOT_BALANCED` |
| DB-002 Change book currency after posting | fails `ACCOUNTING_BOOK_CURRENCY_IMMUTABLE` |
| DB-003 Post journal in different currency than book | fails `JOURNAL_CURRENCY_MISMATCH` |
| DB-004 Allocate more than payment amount | fails `PAYMENT_OVERALLOCATED` |
| DB-005 Allocate more than charge amount | fails `CHARGE_OVERALLOCATED` |
| DB-006 Duplicate journal idempotency key in book | unique violation |
| DB-007 Duplicate provider payment intent in connection | unique violation |
| DB-008 Overlapping active tenancy for unit | unique violation |
| DB-009 Two active primary contacts in household | unique violation |
| DB-010 Duplicate pre-organization idempotency key for same actor/route | unique violation |
| DB-011 Successful refunds exceed original payment amount | transaction fails `REFUND_EXCEEDS_PAYMENT` |
| DB-010 Update/delete posted journal entry | fails `APPEND_ONLY_RECORD` |
| DB-011 Update/delete finalized statement snapshot | fails `APPEND_ONLY_RECORD` |
| DB-012 Replay webhook event | one canonical attempt/payment transition only |

## 7. Test implementation

Use pgTAP or SQL integration tests in CI plus authenticated Supabase client tests. Every test creates at least two organizations, two properties per organization, and each relationship role. Tests must use actual JWT/session contexts, not only call helper functions directly.

No RLS phase is complete until negative tests pass. A successful read test alone is insufficient.
