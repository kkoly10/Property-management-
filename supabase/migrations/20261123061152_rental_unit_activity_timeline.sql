begin;

create index rental_activity_outbox_lookup on private.outbox_events
  (organization_id,aggregate_type,aggregate_id,occurred_at desc,id)
  where aggregate_type in ('rental_inquiry','rental_tour','rental_application','rental_agreement');
create index rental_activity_signature_lookup on audit.audit_events(organization_id,resource_id,occurred_at desc,id)
  where resource_type='rental_agreement' and action_code='rental_agreement.signed';

create function public.get_rental_unit_activity(p_organization_id uuid,p_unit_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_unit public.units%rowtype;
  v_pipeline boolean;
  v_agreements boolean;
  v_events jsonb;
  v_action jsonb;
begin
  perform private.enter_organization_context(p_organization_id);
  select u.* into v_unit from public.units u
  join public.properties p on p.id=u.property_id and p.organization_id=u.organization_id
  join public.organizations o on o.id=u.organization_id and o.customer_path='self_managing'
  where u.organization_id=p_organization_id and u.id=p_unit_id and u.archived_at is null
    and u.operational_status='active' and p.archived_at is null and p.status<>'archived';
  if not found then raise exception using errcode='P0002',message='RENTAL_ACTIVITY_UNAVAILABLE'; end if;
  v_pipeline:=private.has_property_access(v_unit.property_id,'lease.manage')
    or private.has_property_access(v_unit.property_id,'property.manage');
  v_agreements:=private.can_manage_rental_agreement(p_organization_id,v_unit.property_id)
    and private.is_agreement_actor_verified(auth.uid());
  if not (v_pipeline or v_agreements) then
    raise exception using errcode='P0002',message='RENTAL_ACTIVITY_UNAVAILABLE';
  end if;

  -- Resolve canonical entity ownership before reading its events. Explicit
  -- labels prevent outbox payloads, audit details, or applicant files leaking.
  with anchors(kind,id,reference,target_id) as (
    select 'inquiry',i.id,i.public_reference,null::uuid from public.rental_inquiries i
      where v_pipeline and i.organization_id=p_organization_id and i.unit_id=p_unit_id
        and i.property_id=v_unit.property_id and i.verified_at is not null
    union all
    select 'tour',t.id,t.public_reference,null::uuid from public.rental_tour_requests t
      where v_pipeline and t.organization_id=p_organization_id and t.unit_id=p_unit_id
        and t.property_id=v_unit.property_id and t.verified_at is not null
    union all
    select 'application',a.id,a.public_reference,null::uuid from public.rental_applications a
      where v_pipeline and a.organization_id=p_organization_id and a.unit_id=p_unit_id
        and a.property_id=v_unit.property_id and a.verified_at is not null
    union all
    select 'agreement',a.id,app.public_reference,a.id from private.rental_agreements a
      left join private.rental_agreement_application_links l on l.agreement_id=a.id and l.organization_id=a.organization_id
      left join public.rental_applications app on app.id=l.application_id and app.organization_id=a.organization_id
        and app.property_id=a.property_id and app.unit_id=a.unit_id and app.verified_at is not null
      where v_agreements and a.organization_id=p_organization_id and a.unit_id=p_unit_id and a.property_id=v_unit.property_id
  ), labels(kind,event_type,label) as (values
    ('inquiry','rental_inquiry.verified','Rental question received'),
    ('inquiry','rental_inquiry.closed','Rental question closed'),
    ('tour','rental_tour.verified','Tour request received'),
    ('tour','rental_tour.confirmed','Tour confirmed'),
    ('tour','rental_tour.rescheduled','Tour rescheduled'),
    ('tour','rental_tour.cancelled','Tour canceled'),
    ('application','rental_application.verified','Application email verified'),
    ('application','rental_application.evidence_submitted','Application submitted for review'),
    ('application','rental_application.evidence_changes_requested','Application update requested'),
    ('application','rental_application.lease_prepared','Lease preparation started'),
    ('application','rental_application.withdrawn','Application withdrawn'),
    ('application','rental_application.closed','Application closed'),
    ('application','rental_application.converted','Tenancy recorded'),
    ('agreement','rental_agreement.issued','Signing request created'),
    ('agreement','rental_agreement.signer_access_claimed','Renter opened signing access'),
    ('agreement','rental_agreement.executed','All parties signed'),
    ('agreement','rental_agreement.filed','Signed agreement filed'),
    ('agreement','rental_agreement.bound_to_tenancy','Agreement linked to tenancy'),
    ('agreement','rental_agreement.declined','Signing request declined'),
    ('agreement','rental_agreement.void','Signing request voided'),
    ('agreement','rental_agreement.expired','Signing request expired')
  ), events as (
    select e.id,e.occurred_at,a.kind,a.reference,a.target_id,l.label
    from anchors a join private.outbox_events e on e.organization_id=p_organization_id
      and e.aggregate_type='rental_'||a.kind and e.aggregate_id=a.id
    join labels l on l.kind=a.kind and l.event_type=e.event_type
    union all
    -- Signature audit is canonical and also covers older packets without
    -- a signed outbox event. Avoid a duplicate after the new notification job.
    select e.id,e.occurred_at,a.kind,a.reference,a.target_id,'A party signed'
    from anchors a join audit.audit_events e on e.organization_id=p_organization_id and e.resource_id=a.id
      and e.resource_type='rental_agreement' and e.action_code='rental_agreement.signed'
    where a.kind='agreement'
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'occurredAt',e.occurred_at,'kind',e.kind,'label',e.label,
    'reference',case when e.reference ~ '^(INQ|TOUR|APP)-[A-Z0-9]{6,24}$' then e.reference end,'targetId',e.target_id)
    order by e.occurred_at desc,e.id desc),'[]'::jsonb)
    into v_events from (select * from events order by occurred_at desc,id desc limit 15) e;

  -- Pick one live priority. The events remain historical after an item closes.
  with options(priority,id,at,kind,reference,target_id,label) as (
    select 1,a.id,a.closed_at,'agreement',null::text,a.id,
      case when f.agreement_id is null then 'File signed agreement' else 'Continue lease setup' end
    from private.rental_agreements a
    left join private.rental_agreement_filings f on f.agreement_id=a.id and f.organization_id=a.organization_id
    left join private.rental_agreement_application_links l on l.agreement_id=a.id and l.organization_id=a.organization_id
    left join public.rental_applications app on app.id=l.application_id and app.organization_id=a.organization_id
      and app.property_id=a.property_id and app.unit_id=a.unit_id
    where v_agreements and a.organization_id=p_organization_id and a.unit_id=p_unit_id and a.property_id=v_unit.property_id
      and a.status='executed' and f.tenancy_id is null and (l.agreement_id is null or app.status='lease_preparation')
    union all
    select 2,a.id,a.verified_at,'application',a.public_reference,null::uuid,'Review application'
    from public.rental_applications a where v_pipeline and a.organization_id=p_organization_id and a.unit_id=p_unit_id
      and a.property_id=v_unit.property_id and a.verified_at is not null and a.status='submitted'
      and not exists(select 1 from private.rental_application_evidence_packets p
        where p.organization_id=a.organization_id and p.application_id=a.id and p.status not in ('submitted','selected'))
    union all
    select 3,t.id,t.verified_at,'tour',t.public_reference,null::uuid,'Review tour request'
    from public.rental_tour_requests t where v_pipeline and t.organization_id=p_organization_id and t.unit_id=p_unit_id
      and t.property_id=v_unit.property_id and t.verified_at is not null and t.status='requested' and t.cancelled_at is null
    union all
    select 4,i.id,i.verified_at,'inquiry',i.public_reference,null::uuid,'Open rental question'
    from public.rental_inquiries i where v_pipeline and i.organization_id=p_organization_id and i.unit_id=p_unit_id
      and i.property_id=v_unit.property_id and i.verified_at is not null and i.status='open'
  )
  select jsonb_build_object('kind',n.kind,'label',n.label,
    'reference',case when n.reference ~ '^(INQ|TOUR|APP)-[A-Z0-9]{6,24}$' then n.reference end,'targetId',n.target_id)
  into v_action from options n order by n.priority,n.at desc,n.id desc limit 1;
  return jsonb_build_object('unitId',p_unit_id,'events',v_events,'nextAction',v_action);
end;
$$;
revoke all on function public.get_rental_unit_activity(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_rental_unit_activity(uuid,uuid) to authenticated;

commit;
