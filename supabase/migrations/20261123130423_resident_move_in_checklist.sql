begin;

create function public.get_resident_move_in_checklist(p_agreement_id uuid default null)
returns jsonb language sql stable security definer set search_path='' as $$
  with actor as (
    select u.id,lower(trim(u.email)) as email
    from auth.users u where u.id=(select auth.uid()) and u.email_confirmed_at is not null
  ),
  resident_tenancies as (
    select distinct t.id
    from actor a
    join public.user_relationships r on r.user_id=a.id and r.relationship_type='resident_person' and r.status='active'
    join public.household_members m on m.organization_id=r.organization_id and m.person_id=r.relationship_id
    join public.people i on i.id=m.person_id and i.organization_id=m.organization_id and i.archived_at is null
    join public.tenancies t on t.organization_id=m.organization_id and t.household_id=m.household_id
    join public.properties p on p.id=t.property_id and p.organization_id=t.organization_id
    cross join lateral (select (statement_timestamp() at time zone p.time_zone)::date as local_today) dt
    where p_agreement_id is null and (
      (t.status='scheduled' and m.starts_on<=greatest(dt.local_today,t.possession_start)
        and (m.ends_on is null or m.ends_on>=greatest(dt.local_today,t.possession_start)))
      or (t.status='active' and t.possession_start>=dt.local_today-30 and m.starts_on<=dt.local_today
        and (m.ends_on is null or m.ends_on>=dt.local_today))
    )
  ),
  signer_tenancies as (
    select t.id
    from actor u
    join private.rental_agreement_signers s on s.user_id=u.id and s.capacity='lessee'
      and s.agreement_id=p_agreement_id and s.email_at_issue=u.email
    join private.rental_agreement_signatures sig on sig.agreement_id=s.agreement_id and sig.user_id=s.user_id
    join private.rental_agreements a on a.id=s.agreement_id and a.status='executed'
    join private.rental_agreement_application_links b on b.agreement_id=a.id and b.organization_id=a.organization_id
    join public.rental_applications r on r.id=b.application_id and r.organization_id=b.organization_id
      and r.status='converted' and r.verified_at is not null and lower(trim(r.email::text))=u.email
    join private.rental_agreement_filings f on f.agreement_id=a.id and f.organization_id=a.organization_id
      and f.tenancy_id=r.converted_tenancy_id
    join public.tenancies t on t.id=f.tenancy_id and t.organization_id=f.organization_id
      and t.unit_id=a.unit_id and t.property_id=a.property_id and t.status in ('scheduled','active')
    join public.leases l on l.id=t.lease_id and l.organization_id=t.organization_id
      and l.signed_document_version_id=a.source_version_id
    join public.properties p on p.id=t.property_id and p.organization_id=t.organization_id
    cross join lateral (select greatest((statement_timestamp() at time zone p.time_zone)::date,t.possession_start) as member_on) dt
    where exists(
      select 1 from public.household_members m join public.people i on i.id=m.person_id and i.organization_id=m.organization_id
      where m.organization_id=t.organization_id and m.household_id=t.household_id and m.is_financially_responsible
        and lower(trim(i.email::text))=u.email and i.archived_at is null
        and m.starts_on<=dt.member_on and (m.ends_on is null or m.ends_on>=dt.member_on)
    ) and not exists(
      select 1 from public.user_relationships rrv
      join public.household_members m on m.organization_id=rrv.organization_id and m.person_id=rrv.relationship_id
      where rrv.user_id=u.id and rrv.organization_id=t.organization_id and rrv.relationship_type='resident_person'
        and rrv.status='revoked' and m.household_id=t.household_id
    )
  ),
  scope as (select id from resident_tenancies union select id from signer_tenancies),
  projected as (
    select t.id,t.possession_start,p.name as property_name,u.unit_code,coalesce(m.state,'unplanned') as state,
      case when m.state in ('planned','no_show') then m.planned_on end as appointment_on,m.handed_over_on
    from scope s
    join public.tenancies t on t.id=s.id
    join public.properties p on p.id=t.property_id and p.organization_id=t.organization_id
    join public.units u on u.id=t.unit_id and u.organization_id=t.organization_id
    left join private.tenancy_move_in m on m.tenancy_id=t.id and m.organization_id=t.organization_id
    where t.possession_end is null or t.possession_end>=(statement_timestamp() at time zone p.time_zone)::date
    order by t.possession_start asc,t.id
    limit 8
  )
  select jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object(
    'tenancyId',q.id,'propertyName',q.property_name,'unitCode',q.unit_code,'startOn',q.possession_start,
    'state',q.state,'appointmentOn',q.appointment_on,'handedOverOn',q.handed_over_on
  ) order by q.possession_start,q.id),'[]'::jsonb)) from projected q;
$$;
revoke all on function public.get_resident_move_in_checklist(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_resident_move_in_checklist(uuid) to authenticated;

commit;
