begin;

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  property_id uuid,
  title text not null check (length(trim(title)) between 1 and 200),
  body_text text not null check (length(trim(body_text)) between 1 and 20000),
  locale text not null check (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  audience_type text not null check (
    audience_type in ('organization_residents','property_residents','selected_tenancies','owners')
  ),
  status text not null default 'draft' check (
    status in ('draft','scheduled','publishing','published','canceled')
  ),
  scheduled_at timestamptz,
  published_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  unique (organization_id,id),
  foreign key (organization_id)
    references public.organizations(id) on delete restrict,
  foreign key (organization_id,property_id)
    references public.properties(organization_id,id) on delete restrict,
  check (
    (audience_type='organization_residents' and property_id is null)
    or (audience_type<>'organization_residents' and property_id is not null)
  ),
  check (published_at is null or status='published'),
  check (scheduled_at is null or status in ('scheduled','published','canceled'))
);
create index announcements_org_status_updated_idx
  on public.announcements(organization_id,status,updated_at desc);
create index announcements_property_status_updated_idx
  on public.announcements(property_id,status,updated_at desc)
  where property_id is not null;
create index announcements_created_by_idx
  on public.announcements(created_by);
create trigger announcements_touch
before update on public.announcements
for each row execute function private.touch_updated_at();

create table public.announcement_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  announcement_id uuid not null,
  recipient_user_id uuid not null references auth.users(id) on delete restrict,
  recipient_relationship_type text not null check (
    recipient_relationship_type in ('resident_person','owner_entity')
  ),
  recipient_relationship_id uuid not null,
  delivery_status text not null default 'queued' check (
    delivery_status in ('queued','sent','delivered','failed','suppressed','read')
  ),
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (
    announcement_id,recipient_user_id,
    recipient_relationship_type,recipient_relationship_id
  ),
  foreign key (organization_id)
    references public.organizations(id) on delete restrict,
  foreign key (organization_id,announcement_id)
    references public.announcements(organization_id,id) on delete cascade,
  check (delivered_at is null or delivery_status in ('delivered','read')),
  check (read_at is null or delivery_status='read')
);
create index announcement_deliveries_user_created_idx
  on public.announcement_deliveries(recipient_user_id,created_at desc);
create index announcement_deliveries_announcement_status_idx
  on public.announcement_deliveries(announcement_id,delivery_status);

create or replace function private.can_manage_announcement(
  p_announcement_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.announcements a
    where a.id=p_announcement_id
      and (
        (
          a.property_id is not null
          and private.has_property_access(a.property_id,'resident.manage')
        )
        or (
          a.property_id is null
          and private.has_unscoped_org_permission(
            a.organization_id,'resident.manage'
          )
        )
      )
  );
$$;
revoke all on function private.can_manage_announcement(uuid)
  from public,anon,authenticated,service_role;

create or replace function private.has_announcement_delivery(
  p_announcement_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.announcement_deliveries d
    where d.announcement_id=p_announcement_id
      and d.recipient_user_id=(select auth.uid())
  );
$$;
revoke all on function private.has_announcement_delivery(uuid)
  from public,anon,authenticated,service_role;

alter table public.announcements enable row level security;
alter table public.announcement_deliveries enable row level security;
create policy announcements_authorized_read
on public.announcements for select to authenticated
using (
  (select private.can_manage_announcement(id))
  or (select private.has_announcement_delivery(id))
);
create policy announcement_deliveries_authorized_read
on public.announcement_deliveries for select to authenticated
using (
  recipient_user_id=(select auth.uid())
  or (select private.can_manage_announcement(announcement_id))
);
revoke all on table public.announcements
  from public,anon,authenticated,service_role;
revoke all on table public.announcement_deliveries
  from public,anon,authenticated,service_role;

create or replace function public.create_announcement(
  p_organization_id uuid,
  p_property_id uuid,
  p_title text,
  p_body_text text,
  p_locale text,
  p_audience_type text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_scope text;
  v_title text := trim(p_title);
  v_body_text text := trim(p_body_text);
  v_request_hash text;
  v_previous private.idempotency_records%rowtype;
  v_announcement_id uuid := gen_random_uuid();
  v_correlation_id uuid := gen_random_uuid();
  v_response jsonb;
begin
  if v_actor_id is null then
    raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key))<8 then
    raise exception using errcode='22023',message='IDEMPOTENCY_KEY_REQUIRED';
  end if;
  if v_title is null or length(v_title) not between 1 and 200 then
    raise exception using errcode='22023',message='INVALID_ANNOUNCEMENT_TITLE';
  end if;
  if v_body_text is null or length(v_body_text) not between 1 and 20000 then
    raise exception using errcode='22023',message='INVALID_ANNOUNCEMENT_BODY';
  end if;
  if p_locale is null or p_locale !~ '^[a-z]{2}(-[A-Z]{2})?$' then
    raise exception using errcode='22023',message='INVALID_LOCALE';
  end if;
  if p_audience_type not in (
    'organization_residents','property_residents','selected_tenancies','owners'
  ) then
    raise exception using errcode='22023',message='INVALID_ANNOUNCEMENT_AUDIENCE';
  end if;
  if p_audience_type='organization_residents' then
    if p_property_id is not null
       or not private.has_unscoped_org_permission(
         p_organization_id,'resident.manage'
       ) then
      raise exception using errcode='42501',message='ORGANIZATION_SCOPE_DENIED';
    end if;
  elsif p_property_id is null
        or not exists (
          select 1 from public.properties p
          where p.id=p_property_id
            and p.organization_id=p_organization_id
        )
        or not private.has_property_access(
          p_property_id,'resident.manage'
        ) then
    raise exception using errcode='42501',message='PROPERTY_SCOPE_DENIED';
  end if;

  v_actor_scope := 'user:'||v_actor_id::text;
  v_request_hash := encode(sha256(convert_to(concat_ws(
    '|',p_organization_id,p_property_id,v_title,v_body_text,
    p_locale,p_audience_type
  ),'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(
    '|',p_organization_id,v_actor_scope,'CreateAnnouncement',
    trim(p_idempotency_key)
  ),0));
  select * into v_previous
  from private.idempotency_records r
  where r.organization_id=p_organization_id
    and r.actor_scope=v_actor_scope
    and r.route='CreateAnnouncement'
    and r.idempotency_key=trim(p_idempotency_key);
  if found then
    if v_previous.request_hash<>v_request_hash then
      raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT';
    end if;
    if v_previous.state='completed' then
      return v_previous.response_body;
    end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;

  insert into private.idempotency_records(
    organization_id,actor_user_id,actor_scope,route,idempotency_key,
    request_hash,expires_at
  ) values (
    p_organization_id,v_actor_id,v_actor_scope,'CreateAnnouncement',
    trim(p_idempotency_key),v_request_hash,now()+interval '24 hours'
  );
  insert into public.announcements(
    id,organization_id,property_id,title,body_text,locale,
    audience_type,created_by
  ) values (
    v_announcement_id,p_organization_id,p_property_id,v_title,v_body_text,
    p_locale,p_audience_type,v_actor_id
  );
  insert into audit.audit_events(
    organization_id,actor_user_id,actor_type,action_code,resource_type,
    resource_id,correlation_id,after_data
  ) values (
    p_organization_id,v_actor_id,'user','announcement.created',
    'announcement',v_announcement_id,v_correlation_id,jsonb_build_object(
      'propertyId',p_property_id,
      'audienceType',p_audience_type,
      'locale',p_locale,
      'titleLength',length(v_title),
      'bodyLength',length(v_body_text)
    )
  );
  v_response := jsonb_build_object(
    'announcementId',v_announcement_id,
    'organizationId',p_organization_id,
    'propertyId',p_property_id,
    'title',v_title,
    'bodyText',v_body_text,
    'locale',p_locale,
    'audienceType',p_audience_type,
    'status','draft',
    'version',1
  );
  update private.idempotency_records r
  set state='completed',response_status=201,response_body=v_response,
      resource_type='announcement',resource_id=v_announcement_id,
      completed_at=now()
  where r.organization_id=p_organization_id
    and r.actor_scope=v_actor_scope
    and r.route='CreateAnnouncement'
    and r.idempotency_key=trim(p_idempotency_key);
  return v_response;
end;
$$;
revoke all on function public.create_announcement(
  uuid,uuid,text,text,text,text,text
) from public,anon,authenticated,service_role;
grant execute on function public.create_announcement(
  uuid,uuid,text,text,text,text,text
) to authenticated;

create or replace function public.publish_announcement(
  p_announcement_id uuid,
  p_selected_tenancy_ids uuid[],
  p_expected_version integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_scope text;
  v_announcement public.announcements%rowtype;
  v_selected_tenancy_ids uuid[];
  v_request_hash text;
  v_previous private.idempotency_records%rowtype;
  v_correlation_id uuid := gen_random_uuid();
  v_published_at timestamptz := now();
  v_delivery_count integer := 0;
  v_response jsonb;
begin
  if v_actor_id is null then
    raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key))<8 then
    raise exception using errcode='22023',message='IDEMPOTENCY_KEY_REQUIRED';
  end if;
  if p_expected_version is null or p_expected_version<1 then
    raise exception using errcode='22023',message='EXPECTED_VERSION_REQUIRED';
  end if;
  select coalesce(array_agg(distinct selected_id order by selected_id),'{}'::uuid[])
  into v_selected_tenancy_ids
  from unnest(coalesce(p_selected_tenancy_ids,'{}'::uuid[])) selected_id
  where selected_id is not null;

  select * into v_announcement
  from public.announcements a
  where a.id=p_announcement_id
    and private.can_manage_announcement(a.id);
  if not found then
    raise exception using errcode='P0002',message='ANNOUNCEMENT_NOT_FOUND';
  end if;

  v_actor_scope := 'user:'||v_actor_id::text;
  v_request_hash := encode(sha256(convert_to(concat_ws(
    '|',p_announcement_id,p_expected_version,
    array_to_string(v_selected_tenancy_ids,',')
  ),'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(
    '|',v_announcement.organization_id,v_actor_scope,
    'PublishAnnouncement',trim(p_idempotency_key)
  ),0));
  select * into v_previous
  from private.idempotency_records r
  where r.organization_id=v_announcement.organization_id
    and r.actor_scope=v_actor_scope
    and r.route='PublishAnnouncement'
    and r.idempotency_key=trim(p_idempotency_key);
  if found then
    if v_previous.request_hash<>v_request_hash then
      raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT';
    end if;
    if v_previous.state='completed' then
      return v_previous.response_body;
    end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;

  select * into v_announcement
  from public.announcements a
  where a.id=p_announcement_id
  for update;
  if v_announcement.status not in ('draft','scheduled') then
    raise exception using errcode='23514',message='ANNOUNCEMENT_NOT_PUBLISHABLE';
  end if;
  if v_announcement.version<>p_expected_version then
    raise exception using errcode='40001',message='ANNOUNCEMENT_VERSION_CONFLICT';
  end if;
  if v_announcement.audience_type='selected_tenancies' then
    if cardinality(v_selected_tenancy_ids)=0 then
      raise exception using errcode='22023',message='SELECTED_TENANCIES_REQUIRED';
    end if;
    if (
      select count(distinct t.id)
      from public.tenancies t
      where t.id=any(v_selected_tenancy_ids)
        and t.organization_id=v_announcement.organization_id
        and t.property_id=v_announcement.property_id
        and t.status in (
          'scheduled','active','notice_given','move_out_in_progress'
        )
    )<>cardinality(v_selected_tenancy_ids) then
      raise exception using errcode='42501',message='TENANCY_AUDIENCE_SCOPE_DENIED';
    end if;
  elsif cardinality(v_selected_tenancy_ids)>0 then
    raise exception using errcode='22023',message='SELECTED_TENANCIES_NOT_ALLOWED';
  end if;

  insert into private.idempotency_records(
    organization_id,actor_user_id,actor_scope,route,idempotency_key,
    request_hash,expires_at
  ) values (
    v_announcement.organization_id,v_actor_id,v_actor_scope,
    'PublishAnnouncement',trim(p_idempotency_key),v_request_hash,
    now()+interval '24 hours'
  );

  with recipients as (
    select distinct
      ur.user_id,
      ur.relationship_type,
      ur.relationship_id
    from public.user_relationships ur
    join public.household_members hm
      on hm.organization_id=ur.organization_id
     and hm.person_id=ur.relationship_id
     and hm.starts_on<=current_date
     and (hm.ends_on is null or hm.ends_on>=current_date)
    join public.tenancies t
      on t.organization_id=hm.organization_id
     and t.household_id=hm.household_id
     and t.status in (
       'scheduled','active','notice_given','move_out_in_progress'
     )
    where ur.organization_id=v_announcement.organization_id
      and ur.relationship_type='resident_person'
      and ur.status='active'
      and v_announcement.audience_type in (
        'organization_residents','property_residents','selected_tenancies'
      )
      and (
        v_announcement.audience_type='organization_residents'
        or t.property_id=v_announcement.property_id
      )
      and (
        v_announcement.audience_type<>'selected_tenancies'
        or t.id=any(v_selected_tenancy_ids)
      )
    union
    select distinct
      ur.user_id,
      ur.relationship_type,
      ur.relationship_id
    from public.user_relationships ur
    join public.ownership_interests oi
      on oi.organization_id=ur.organization_id
     and oi.owner_entity_id=ur.relationship_id
     and oi.property_id=v_announcement.property_id
     and oi.effective_from<=current_date
     and (oi.effective_to is null or oi.effective_to>=current_date)
    where ur.organization_id=v_announcement.organization_id
      and ur.relationship_type='owner_entity'
      and ur.status='active'
      and v_announcement.audience_type='owners'
  )
  insert into public.announcement_deliveries(
    organization_id,announcement_id,recipient_user_id,
    recipient_relationship_type,recipient_relationship_id,
    delivery_status,delivered_at
  )
  select
    v_announcement.organization_id,p_announcement_id,
    recipients.user_id,recipients.relationship_type,
    recipients.relationship_id,'delivered',v_published_at
  from recipients
  on conflict (
    announcement_id,recipient_user_id,
    recipient_relationship_type,recipient_relationship_id
  ) do nothing;
  get diagnostics v_delivery_count = row_count;
  if v_delivery_count=0 then
    raise exception using errcode='23514',message='ANNOUNCEMENT_AUDIENCE_EMPTY';
  end if;

  update public.announcements a
  set status='published',published_at=v_published_at,version=a.version+1
  where a.id=p_announcement_id;

  insert into private.notification_jobs(
    organization_id,template_code,locale,channel,recipient_user_id,
    payload,idempotency_key
  )
  select
    d.organization_id,'announcement_published',
    coalesce(p.locale,v_announcement.locale),'in_app',d.recipient_user_id,
    jsonb_build_object(
      'announcementId',p_announcement_id,
      'propertyId',v_announcement.property_id,
      'audienceType',v_announcement.audience_type
    ),
    'announcement:'||p_announcement_id::text||':'||
      d.recipient_user_id::text||':'||d.recipient_relationship_id::text
  from public.announcement_deliveries d
  left join public.profiles p on p.user_id=d.recipient_user_id
  where d.announcement_id=p_announcement_id
  on conflict (channel,idempotency_key) do nothing;

  insert into audit.audit_events(
    organization_id,actor_user_id,actor_type,action_code,resource_type,
    resource_id,correlation_id,after_data
  ) values (
    v_announcement.organization_id,v_actor_id,'user',
    'announcement.published','announcement',p_announcement_id,
    v_correlation_id,jsonb_build_object(
      'propertyId',v_announcement.property_id,
      'audienceType',v_announcement.audience_type,
      'deliveryCount',v_delivery_count,
      'version',v_announcement.version+1
    )
  );
  insert into private.outbox_events(
    organization_id,event_type,aggregate_type,aggregate_id,
    correlation_id,payload
  ) values (
    v_announcement.organization_id,'announcement.published',
    'announcement',p_announcement_id,v_correlation_id,
    jsonb_build_object(
      'announcementId',p_announcement_id,
      'propertyId',v_announcement.property_id,
      'audienceType',v_announcement.audience_type,
      'deliveryCount',v_delivery_count
    )
  );

  v_response := jsonb_build_object(
    'announcementId',p_announcement_id,
    'status','published',
    'publishedAt',v_published_at,
    'deliveryCount',v_delivery_count,
    'version',v_announcement.version+1
  );
  update private.idempotency_records r
  set state='completed',response_status=200,response_body=v_response,
      resource_type='announcement',resource_id=p_announcement_id,
      completed_at=now()
  where r.organization_id=v_announcement.organization_id
    and r.actor_scope=v_actor_scope
    and r.route='PublishAnnouncement'
    and r.idempotency_key=trim(p_idempotency_key);
  return v_response;
end;
$$;
revoke all on function public.publish_announcement(
  uuid,uuid[],integer,text
) from public,anon,authenticated,service_role;
grant execute on function public.publish_announcement(
  uuid,uuid[],integer,text
) to authenticated;

create or replace function public.cancel_announcement(
  p_announcement_id uuid,
  p_expected_version integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_scope text;
  v_announcement public.announcements%rowtype;
  v_request_hash text;
  v_previous private.idempotency_records%rowtype;
  v_correlation_id uuid := gen_random_uuid();
  v_response jsonb;
begin
  if v_actor_id is null then
    raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key))<8 then
    raise exception using errcode='22023',message='IDEMPOTENCY_KEY_REQUIRED';
  end if;
  select * into v_announcement
  from public.announcements a
  where a.id=p_announcement_id
    and private.can_manage_announcement(a.id);
  if not found then
    raise exception using errcode='P0002',message='ANNOUNCEMENT_NOT_FOUND';
  end if;
  v_actor_scope := 'user:'||v_actor_id::text;
  v_request_hash := encode(sha256(convert_to(concat_ws(
    '|',p_announcement_id,p_expected_version
  ),'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(
    '|',v_announcement.organization_id,v_actor_scope,
    'CancelAnnouncement',trim(p_idempotency_key)
  ),0));
  select * into v_previous
  from private.idempotency_records r
  where r.organization_id=v_announcement.organization_id
    and r.actor_scope=v_actor_scope
    and r.route='CancelAnnouncement'
    and r.idempotency_key=trim(p_idempotency_key);
  if found then
    if v_previous.request_hash<>v_request_hash then
      raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT';
    end if;
    if v_previous.state='completed' then
      return v_previous.response_body;
    end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;

  select * into v_announcement
  from public.announcements a
  where a.id=p_announcement_id
  for update;
  if v_announcement.status not in ('draft','scheduled') then
    raise exception using errcode='23514',message='ANNOUNCEMENT_NOT_CANCELABLE';
  end if;
  if v_announcement.version<>p_expected_version then
    raise exception using errcode='40001',message='ANNOUNCEMENT_VERSION_CONFLICT';
  end if;
  insert into private.idempotency_records(
    organization_id,actor_user_id,actor_scope,route,idempotency_key,
    request_hash,expires_at
  ) values (
    v_announcement.organization_id,v_actor_id,v_actor_scope,
    'CancelAnnouncement',trim(p_idempotency_key),v_request_hash,
    now()+interval '24 hours'
  );
  update public.announcements a
  set status='canceled',version=a.version+1
  where a.id=p_announcement_id;
  insert into audit.audit_events(
    organization_id,actor_user_id,actor_type,action_code,resource_type,
    resource_id,correlation_id,after_data
  ) values (
    v_announcement.organization_id,v_actor_id,'user',
    'announcement.canceled','announcement',p_announcement_id,
    v_correlation_id,jsonb_build_object(
      'propertyId',v_announcement.property_id,
      'audienceType',v_announcement.audience_type,
      'version',v_announcement.version+1
    )
  );
  v_response := jsonb_build_object(
    'announcementId',p_announcement_id,
    'status','canceled',
    'version',v_announcement.version+1
  );
  update private.idempotency_records r
  set state='completed',response_status=200,response_body=v_response,
      resource_type='announcement',resource_id=p_announcement_id,
      completed_at=now()
  where r.organization_id=v_announcement.organization_id
    and r.actor_scope=v_actor_scope
    and r.route='CancelAnnouncement'
    and r.idempotency_key=trim(p_idempotency_key);
  return v_response;
end;
$$;
revoke all on function public.cancel_announcement(uuid,integer,text)
  from public,anon,authenticated,service_role;
grant execute on function public.cancel_announcement(uuid,integer,text)
  to authenticated;

create or replace function public.get_operator_announcement_workspace()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'items',coalesce((
      select jsonb_agg(jsonb_build_object(
        'announcementId',a.id,
        'organizationId',a.organization_id,
        'propertyId',a.property_id,
        'propertyName',p.name,
        'title',a.title,
        'bodyText',a.body_text,
        'locale',a.locale,
        'audienceType',a.audience_type,
        'status',a.status,
        'deliveryCount',(
          select count(*)::integer
          from public.announcement_deliveries d
          where d.announcement_id=a.id
        ),
        'publishedAt',a.published_at,
        'createdAt',a.created_at,
        'updatedAt',a.updated_at,
        'version',a.version
      ) order by a.updated_at desc,a.id)
      from public.announcements a
      left join public.properties p
        on p.organization_id=a.organization_id
       and p.id=a.property_id
      where private.can_manage_announcement(a.id)
    ),'[]'::jsonb),
    'properties',coalesce((
      select jsonb_agg(jsonb_build_object(
        'organizationId',p.organization_id,
        'propertyId',p.id,
        'propertyName',p.name
      ) order by p.name,p.id)
      from public.properties p
      where private.has_property_access(p.id,'resident.manage')
    ),'[]'::jsonb),
    'tenancies',coalesce((
      select jsonb_agg(jsonb_build_object(
        'organizationId',t.organization_id,
        'propertyId',t.property_id,
        'tenancyId',t.id,
        'propertyName',p.name,
        'unitCode',u.unit_code,
        'householdName',h.display_name
      ) order by p.name,u.unit_code,t.id)
      from public.tenancies t
      join public.properties p
        on p.organization_id=t.organization_id
       and p.id=t.property_id
      join public.units u
        on u.organization_id=t.organization_id
       and u.id=t.unit_id
      join public.households h
        on h.organization_id=t.organization_id
       and h.id=t.household_id
      where t.status in (
        'scheduled','active','notice_given','move_out_in_progress'
      )
        and private.has_property_access(t.property_id,'resident.manage')
    ),'[]'::jsonb)
  );
$$;
revoke all on function public.get_operator_announcement_workspace()
  from public,anon,authenticated,service_role;
grant execute on function public.get_operator_announcement_workspace()
  to authenticated;

create or replace function public.get_recipient_announcement_workspace()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'items',coalesce(jsonb_agg(jsonb_build_object(
      'announcementId',a.id,
      'deliveryId',d.id,
      'propertyId',a.property_id,
      'propertyName',p.name,
      'title',a.title,
      'bodyText',a.body_text,
      'locale',a.locale,
      'audienceType',a.audience_type,
      'deliveryStatus',d.delivery_status,
      'deliveredAt',d.delivered_at,
      'publishedAt',a.published_at
    ) order by a.published_at desc,a.id),'[]'::jsonb)
  )
  from public.announcement_deliveries d
  join public.announcements a
    on a.organization_id=d.organization_id
   and a.id=d.announcement_id
   and a.status='published'
  left join public.properties p
    on p.organization_id=a.organization_id
   and p.id=a.property_id
  where (select auth.uid()) is not null
    and d.recipient_user_id=(select auth.uid());
$$;
revoke all on function public.get_recipient_announcement_workspace()
  from public,anon,authenticated,service_role;
grant execute on function public.get_recipient_announcement_workspace()
  to authenticated;

commit;
