-- Bounded, sanitized, permission-aware search for the operator workspace.
begin;

create index properties_org_name_prefix_idx
  on public.properties(organization_id,(lower(name)) text_pattern_ops)
  where status<>'archived';
create index units_property_code_prefix_idx
  on public.units(property_id,(lower(unit_code)) text_pattern_ops)
  where operational_status<>'retired';
create index households_org_name_prefix_idx
  on public.households(organization_id,(lower(display_name)) text_pattern_ops);
create index leases_property_reference_prefix_idx
  on public.leases(property_id,(lower(external_reference)) text_pattern_ops)
  where external_reference is not null;
create index payments_org_reference_prefix_idx
  on public.payments(organization_id,(lower(public_reference)) text_pattern_ops);
create index maintenance_requests_org_reference_prefix_idx
  on public.maintenance_requests(organization_id,(lower(public_reference)) text_pattern_ops);
create index maintenance_requests_org_title_prefix_idx
  on public.maintenance_requests(organization_id,(lower(title)) text_pattern_ops);
create index work_orders_org_reference_prefix_idx
  on public.work_orders(organization_id,(lower(public_reference)) text_pattern_ops);
create index documents_org_title_prefix_idx
  on public.documents(organization_id,(lower(title)) text_pattern_ops)
  where status not in ('archived','void');
create index owner_entities_org_name_prefix_idx
  on public.owner_entities(organization_id,(lower(display_name)) text_pattern_ops)
  where status='active';

create or replace function public.get_operator_global_search(
  p_query text,
  p_limit integer default 24
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_organization_id uuid;
  v_query text := lower(trim(coalesce(p_query,'')));
  v_prefix text;
  v_limit integer := coalesce(p_limit,24);
  v_result jsonb;
begin
  if v_actor_id is null then
    raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED';
  end if;
  if length(v_query)<2 then
    raise exception using errcode='22023',message='SEARCH_QUERY_TOO_SHORT';
  end if;
  if length(v_query)>80 then
    raise exception using errcode='22023',message='SEARCH_QUERY_TOO_LONG';
  end if;
  if v_limit<1 or v_limit>50 then
    raise exception using errcode='22023',message='SEARCH_LIMIT_OUT_OF_BOUNDS';
  end if;

  select m.organization_id
    into v_organization_id
  from public.organization_memberships m
  join public.organizations o on o.id=m.organization_id
  where m.user_id=v_actor_id
    and m.status='active'
    and m.starts_at<=now()
    and (m.ends_at is null or m.ends_at>now())
    and o.status in ('trial','active')
  order by m.created_at,m.id
  limit 1;

  if v_organization_id is null then
    raise exception using errcode='42501',message='OPERATOR_ORGANIZATION_DENIED';
  end if;

  v_prefix := v_query||'%';

  with search_rows as (
    select
      'property'::text as kind,
      p.id as resource_id,
      p.name::text as title,
      concat_ws(', ',p.address_line1,p.locality,p.subdivision_code)::text as subtitle,
      p.status::text as status,
      p.id as property_id,
      p.name::text as property_name,
      concat('/app/properties/',p.id)::text as href,
      case
        when lower(p.name)=v_query then 0
        when lower(p.address_line1)=v_query then 1
        else 2
      end as match_rank,
      1 as kind_rank
    from public.properties p
    where p.organization_id=v_organization_id
      and p.status<>'archived'
      and (
        private.has_property_access(p.id,'property.read')
        or private.has_property_access(p.id,'property.manage')
      )
      and (lower(p.name) like v_prefix or lower(p.address_line1) like v_prefix)

    union all

    select
      'unit',u.id,concat('Unit ',u.unit_code),p.name,u.operational_status::text,
      p.id,p.name,concat('/app/properties/',p.id),
      case when lower(u.unit_code)=v_query then 0 else 2 end,2
    from public.units u
    join public.properties p on p.id=u.property_id
    where u.organization_id=v_organization_id
      and u.operational_status<>'retired'
      and (
        private.has_property_access(u.property_id,'property.read')
        or private.has_property_access(u.property_id,'property.manage')
      )
      and lower(u.unit_code) like v_prefix

    union all

    select
      'resident',t.id,h.display_name,concat(p.name,' · Unit ',u.unit_code),t.status::text,
      p.id,p.name,concat('/app/residents?tenancyId=',t.id),
      case when lower(h.display_name)=v_query then 0 else 2 end,3
    from public.tenancies t
    join public.households h on h.id=t.household_id
    join public.properties p on p.id=t.property_id
    join public.units u on u.id=t.unit_id
    where t.organization_id=v_organization_id
      and (
        private.has_property_access(t.property_id,'resident.read')
        or private.has_property_access(t.property_id,'resident.manage')
      )
      and lower(h.display_name) like v_prefix

    union all

    select
      'lease',l.id,coalesce(l.external_reference,concat('Lease · Unit ',u.unit_code)),
      concat(p.name,' · Unit ',u.unit_code),l.status::text,
      p.id,p.name,concat('/app/properties/',p.id),
      case when lower(coalesce(l.external_reference,''))=v_query then 0 else 2 end,4
    from public.leases l
    join public.properties p on p.id=l.property_id
    join public.units u on u.id=l.unit_id
    where l.organization_id=v_organization_id
      and l.external_reference is not null
      and (
        private.has_property_access(l.property_id,'lease.read')
        or private.has_property_access(l.property_id,'lease.manage')
      )
      and lower(l.external_reference) like v_prefix

    union all

    select
      'payment',pay.id,pay.public_reference,
      concat(p.name,' · ',pay.currency_code,' ',to_char(pay.amount_minor/100.0,'FM999999999990D00')),
      pay.status::text,p.id,p.name,concat('/app/payments/',pay.id),
      case when lower(pay.public_reference)=v_query then 0 else 2 end,5
    from public.payments pay
    join public.tenancies t on t.id=pay.tenancy_id
    join public.properties p on p.id=t.property_id
    where pay.organization_id=v_organization_id
      and (
        private.has_property_access(t.property_id,'finance.read')
        or private.has_property_access(t.property_id,'finance.manage')
      )
      and lower(pay.public_reference) like v_prefix

    union all

    select
      'maintenance_request',mr.id,mr.public_reference,
      concat(p.name,' · ',mr.title),mr.status::text,
      p.id,p.name,concat('/app/maintenance/',mr.id),
      case
        when lower(mr.public_reference)=v_query then 0
        when lower(mr.title)=v_query then 1
        else 2
      end,6
    from public.maintenance_requests mr
    join public.properties p on p.id=mr.property_id
    where mr.organization_id=v_organization_id
      and (
        private.has_property_access(mr.property_id,'maintenance.read')
        or private.has_property_access(mr.property_id,'maintenance.manage')
      )
      and (lower(mr.public_reference) like v_prefix or lower(mr.title) like v_prefix)

    union all

    select
      'work_order',wo.id,wo.public_reference,
      concat(p.name,' · ',mr.public_reference),wo.status::text,
      p.id,p.name,concat('/app/maintenance/',wo.maintenance_request_id),
      case when lower(wo.public_reference)=v_query then 0 else 2 end,7
    from public.work_orders wo
    join public.maintenance_requests mr on mr.id=wo.maintenance_request_id
    join public.properties p on p.id=wo.property_id
    where wo.organization_id=v_organization_id
      and (
        private.has_property_access(wo.property_id,'maintenance.read')
        or private.has_property_access(wo.property_id,'maintenance.manage')
      )
      and lower(wo.public_reference) like v_prefix

    union all

    select
      'document',d.id,d.title,
      concat_ws(' · ',replace(d.document_type,'_',' '),p.name),d.status::text,
      d.property_id,p.name,concat('/app/documents?documentId=',d.id),
      case when lower(d.title)=v_query then 0 else 2 end,8
    from public.documents d
    left join public.properties p on p.id=d.property_id
    where d.organization_id=v_organization_id
      and d.status not in ('archived','void')
      and (
        (
          d.property_id is not null
          and (
            private.has_property_access(d.property_id,'documents.read')
            or private.has_property_access(d.property_id,'documents.manage')
          )
        )
        or (
          d.property_id is null
          and (
            private.has_unscoped_org_permission(d.organization_id,'documents.read')
            or private.has_unscoped_org_permission(d.organization_id,'documents.manage')
          )
        )
      )
      and lower(d.title) like v_prefix

    union all

    select
      'owner_entity',oe.id,oe.display_name,p.name,oe.status,
      p.id,p.name,concat('/app/owner-statements/',oe.id),
      case when lower(oe.display_name)=v_query then 0 else 2 end,9
    from public.owner_entities oe
    join public.ownership_interests oi
      on oi.organization_id=oe.organization_id
     and oi.owner_entity_id=oe.id
     and oi.effective_from<=current_date
     and (oi.effective_to is null or oi.effective_to>=current_date)
    join public.properties p on p.id=oi.property_id
    where oe.organization_id=v_organization_id
      and oe.status='active'
      and (
        private.has_property_access(oi.property_id,'owner.read')
        or private.has_property_access(oi.property_id,'owner.manage')
      )
      and lower(oe.display_name) like v_prefix
  ),
  limited as (
    select *
    from search_rows
    order by match_rank,kind_rank,lower(title),resource_id
    limit v_limit
  )
  select jsonb_build_object(
    'query',v_query,
    'limit',v_limit,
    'items',coalesce(jsonb_agg(jsonb_build_object(
      'kind',l.kind,
      'resourceId',l.resource_id,
      'title',l.title,
      'subtitle',l.subtitle,
      'status',l.status,
      'propertyId',l.property_id,
      'propertyName',l.property_name,
      'href',l.href
    ) order by l.match_rank,l.kind_rank,lower(l.title),l.resource_id),'[]'::jsonb)
  )
  into v_result
  from limited l;

  return v_result;
end;
$$;

revoke all on function public.get_operator_global_search(text,integer) from public,anon;
grant execute on function public.get_operator_global_search(text,integer) to authenticated;

commit;
