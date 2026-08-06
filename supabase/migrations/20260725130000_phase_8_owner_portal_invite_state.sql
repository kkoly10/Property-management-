-- Phase 8: surface each owner entity's contact email and portal-invitation state on the operator
-- owner-statement workspace, so the operator can invite an owner to Crecy Owner from the statements
-- screen (the last deferred piece of the resident/owner invitation vertical). The invite command,
-- API route, and acceptance page already support owner_entity end to end; this only feeds the button.
--
-- invitationState mirrors the residents directory (active > invited > not_invited), derived from
-- public.user_relationships (relationship_type='owner_entity', relationship_id=owner_entity_id).
-- Computed inside this security-definer RPC so it reads user_relationships directly, avoiding the
-- RLS read blind-spot the resident button has to work around. Otherwise identical to the shipped
-- get_operator_owner_statement_workspace (phase_7_owner_remittances).
begin;

create or replace function public.get_operator_owner_statement_workspace()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with eligible as (
    select
      oi.organization_id,
      oi.owner_entity_id,
      oe.display_name as owner_name,
      oe.email as owner_email,
      oi.property_id,
      p.name as property_name,
      p.accounting_book_id,
      b.functional_currency_code as currency_code,
      min(oi.effective_from) as effective_from,
      case when bool_or(oi.effective_to is null) then null else max(oi.effective_to) end as effective_to
    from public.ownership_interests oi
    join public.owner_entities oe
      on oe.organization_id=oi.organization_id
     and oe.id=oi.owner_entity_id
     and oe.status='active'
    join public.properties p
      on p.organization_id=oi.organization_id
     and p.id=oi.property_id
    join public.accounting_books b
      on b.organization_id=p.organization_id
     and b.id=p.accounting_book_id
    where (select auth.uid()) is not null
      and private.has_property_access(oi.property_id,'owner.manage')
      and private.has_property_access(oi.property_id,'finance.manage')
      and private.has_plan_entitlement(oi.organization_id,'portal.owner.standard',true)
    group by
      oi.organization_id,oi.owner_entity_id,oe.display_name,oe.email,oi.property_id,p.name,
      p.accounting_book_id,b.functional_currency_code
  )
  select jsonb_build_object(
    'owners',coalesce(jsonb_agg(jsonb_build_object(
      'organizationId',e.organization_id,
      'ownerEntityId',e.owner_entity_id,
      'ownerName',e.owner_name,
      'email',e.owner_email,
      'invitationState',coalesce((
        select case
          when bool_or(ur.status='active') then 'active'
          when bool_or(ur.status='invited') then 'invited'
          else 'not_invited' end
        from public.user_relationships ur
        where ur.organization_id=e.organization_id
          and ur.relationship_type='owner_entity'
          and ur.relationship_id=e.owner_entity_id
          and ur.status in ('active','invited')
      ),'not_invited'),
      'propertyId',e.property_id,
      'propertyName',e.property_name,
      'accountingBookId',e.accounting_book_id,
      'currencyCode',e.currency_code,
      'effectiveFrom',e.effective_from,
      'effectiveTo',e.effective_to,
      'ownerPayableMinor',private.owner_payable_balance(
        e.organization_id,e.accounting_book_id,e.owner_entity_id,e.property_id
      ),
      'evidenceDocuments',coalesce(docs.items,'[]'::jsonb),
      'remittances',coalesce(remittances.items,'[]'::jsonb),
      'latestStatement',case when s.id is null then null else jsonb_build_object(
        'statementSnapshotId',s.id,
        'statementSeriesId',s.statement_series_id,
        'periodStart',s.period_start,
        'periodEnd',s.period_end,
        'versionNumber',s.version_number,
        'netOwnerPositionMinor',s.net_owner_position_minor,
        'remittedMinor',coalesce(series_remittances.amount_minor,0),
        'availableToRemitMinor',least(
          greatest(s.net_owner_position_minor-coalesce(series_remittances.amount_minor,0),0),
          greatest(private.owner_payable_balance(
            e.organization_id,e.accounting_book_id,e.owner_entity_id,e.property_id
          ),0)
        ),
        'finalizedAt',s.finalized_at
      ) end
    ) order by e.property_name,e.owner_name),'[]'::jsonb)
  )
  from eligible e
  left join lateral (
    select latest.*
    from reporting.owner_statement_snapshots latest
    where latest.organization_id=e.organization_id
      and latest.accounting_book_id=e.accounting_book_id
      and latest.owner_entity_id=e.owner_entity_id
      and latest.property_id=e.property_id
    order by latest.period_end desc,latest.version_number desc
    limit 1
  ) s on true
  left join lateral (
    select coalesce(sum(r.amount_minor),0)::bigint as amount_minor
    from public.owner_remittance_records r
    join reporting.owner_statement_snapshots linked
      on linked.id=r.statement_snapshot_id
     and linked.organization_id=r.organization_id
    where linked.statement_series_id=s.statement_series_id
  ) series_remittances on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'documentId',d.id,
      'title',d.title,
      'originalFilename',latest.original_filename
    ) order by d.created_at desc) as items
    from public.documents d
    join lateral (
      select dv.original_filename
      from public.document_versions dv
      where dv.organization_id=d.organization_id
        and dv.document_id=d.id
        and dv.upload_status='clean'
      order by dv.version_number desc
      limit 1
    ) latest on true
    where d.organization_id=e.organization_id
      and d.property_id=e.property_id
      and d.document_type='owner_remittance_evidence'
      and d.status='active'
  ) docs on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'remittanceId',r.id,
      'publicReference',r.public_reference,
      'statementSnapshotId',r.statement_snapshot_id,
      'amountMinor',r.amount_minor,
      'currencyCode',r.currency_code,
      'paidOn',r.paid_on,
      'externalReference',r.external_reference,
      'recordedAt',r.recorded_at,
      'evidenceDocumentId',r.evidence_document_id
    ) order by r.paid_on desc,r.recorded_at desc) as items
    from public.owner_remittance_records r
    where r.organization_id=e.organization_id
      and r.accounting_book_id=e.accounting_book_id
      and r.owner_entity_id=e.owner_entity_id
      and r.property_id=e.property_id
  ) remittances on true;
$$;
revoke all on function public.get_operator_owner_statement_workspace()
  from public,anon,authenticated,service_role;
grant execute on function public.get_operator_owner_statement_workspace() to authenticated;

commit;
