begin;

alter table public.profiles
  add column reduce_motion boolean not null default false,
  add column high_contrast boolean not null default false,
  add column text_scale text not null default 'standard'
    check (text_scale in ('standard','large')),
  add column preferences_version integer not null default 1
    check (preferences_version > 0);

create table public.notification_preferences (
  user_id uuid not null references auth.users(id) on delete restrict,
  category text not null
    check (category in ('payments','maintenance','messages','documents','announcements')),
  channel text not null
    check (channel in ('email','sms','whatsapp','push')),
  enabled boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id,category,channel)
);

create table private.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_job_id uuid not null references private.notification_jobs(id) on delete cascade,
  provider_code text,
  provider_message_id text,
  status text not null
    check (status in ('accepted','delivered','bounced','failed','complained','suppressed')),
  provider_payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index notification_deliveries_job_time_idx
  on private.notification_deliveries(notification_job_id,occurred_at desc,id desc);

alter table public.notification_preferences enable row level security;

create policy notification_preferences_self_read
on public.notification_preferences
for select
to authenticated
using (user_id=(select auth.uid()));

revoke all on public.notification_preferences from public,anon,authenticated,service_role;
grant select on public.notification_preferences to authenticated;

create or replace function public.update_notification_preferences(
  p_locale text,
  p_reduce_motion boolean,
  p_high_contrast boolean,
  p_text_scale text,
  p_channels jsonb,
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
  v_profile public.profiles%rowtype;
  v_request_hash text;
  v_previous private.idempotency_records%rowtype;
  v_correlation_id uuid := gen_random_uuid();
  v_before jsonb;
  v_channel text;
  v_category text;
  v_response jsonb;
begin
  if v_actor_id is null then
    raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 200 then
    raise exception using errcode='23514',message='INVALID_IDEMPOTENCY_KEY';
  end if;
  if p_locale not in ('en-US','es-MX','en-CA','fr-CA') then
    raise exception using errcode='23514',message='INVALID_LOCALE';
  end if;
  if p_text_scale not in ('standard','large') then
    raise exception using errcode='23514',message='INVALID_TEXT_SCALE';
  end if;
  if p_expected_version is null or p_expected_version < 1 then
    raise exception using errcode='23514',message='INVALID_EXPECTED_VERSION';
  end if;
  if jsonb_typeof(p_channels) is distinct from 'object'
     or (select count(*) from jsonb_object_keys(p_channels)) <> 4 then
    raise exception using errcode='23514',message='INVALID_CHANNEL_PREFERENCES';
  end if;

  for v_channel in select jsonb_object_keys(p_channels)
  loop
    if v_channel not in ('email','sms','whatsapp','push')
       or jsonb_typeof(p_channels->v_channel) is distinct from 'object'
       or (select count(*) from jsonb_object_keys(p_channels->v_channel)) <> 5 then
      raise exception using errcode='23514',message='INVALID_CHANNEL_PREFERENCES';
    end if;
    for v_category in select jsonb_object_keys(p_channels->v_channel)
    loop
      if v_category not in ('payments','maintenance','messages','documents','announcements')
         or jsonb_typeof(p_channels->v_channel->v_category) is distinct from 'boolean' then
        raise exception using errcode='23514',message='INVALID_CHANNEL_PREFERENCES';
      end if;
    end loop;
  end loop;

  v_request_hash := encode(sha256(convert_to(jsonb_build_object(
    'locale',p_locale,
    'reduceMotion',p_reduce_motion,
    'highContrast',p_high_contrast,
    'textScale',p_text_scale,
    'channels',p_channels,
    'expectedVersion',p_expected_version
  )::text,'utf8')),'hex');

  select r.* into v_previous
  from private.idempotency_records r
  where r.organization_id is null
    and r.actor_scope='user:'||v_actor_id::text
    and r.route='UpdateNotificationPreferences'
    and r.idempotency_key=trim(p_idempotency_key);

  if found then
    if v_previous.request_hash<>v_request_hash then
      raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT';
    end if;
    if v_previous.state='completed' then
      return v_previous.response_body||jsonb_build_object('idempotentReplay',true);
    end if;
    raise exception using errcode='55P03',message='IDEMPOTENCY_IN_PROGRESS';
  end if;

  select p.* into v_profile
  from public.profiles p
  where p.user_id=v_actor_id
  for update;
  if not found then
    raise exception using errcode='P0002',message='PROFILE_NOT_FOUND';
  end if;
  if v_profile.preferences_version<>p_expected_version then
    raise exception using
      errcode='40001',
      message='PREFERENCES_VERSION_CONFLICT',
      detail=jsonb_build_object('currentVersion',v_profile.preferences_version)::text;
  end if;
  v_before := jsonb_build_object(
    'locale',v_profile.locale,
    'reduceMotion',v_profile.reduce_motion,
    'highContrast',v_profile.high_contrast,
    'textScale',v_profile.text_scale,
    'version',v_profile.preferences_version
  );
  if v_profile.primary_phone_e164 is null and (
    exists (
      select 1
      from jsonb_each(p_channels->'sms') item
      where item.value='true'::jsonb
    )
    or exists (
      select 1
      from jsonb_each(p_channels->'whatsapp') item
      where item.value='true'::jsonb
    )
  ) then
    raise exception using errcode='23514',message='PHONE_REQUIRED';
  end if;

  insert into private.idempotency_records(
    organization_id,actor_user_id,actor_scope,route,idempotency_key,request_hash,expires_at
  )
  values (
    null,v_actor_id,'user:'||v_actor_id::text,'UpdateNotificationPreferences',
    trim(p_idempotency_key),v_request_hash,now()+interval '24 hours'
  );

  for v_channel in select unnest(array['email','sms','whatsapp','push'])
  loop
    for v_category in select unnest(array['payments','maintenance','messages','documents','announcements'])
    loop
      insert into public.notification_preferences(user_id,category,channel,enabled)
      values (
        v_actor_id,
        v_category,
        v_channel,
        (p_channels->v_channel->>v_category)::boolean
      )
      on conflict (user_id,category,channel)
      do update set enabled=excluded.enabled,updated_at=now();
    end loop;
  end loop;

  update public.profiles
  set locale=p_locale,
      reduce_motion=p_reduce_motion,
      high_contrast=p_high_contrast,
      text_scale=p_text_scale,
      preferences_version=preferences_version+1,
      updated_at=now()
  where user_id=v_actor_id
  returning * into v_profile;

  insert into audit.audit_events(
    organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,
    correlation_id,before_data,after_data
  )
  values (
    null,v_actor_id,'user','notification_preferences.updated','profile',v_actor_id,
    v_correlation_id,
    v_before,
    jsonb_build_object(
      'locale',p_locale,
      'reduceMotion',p_reduce_motion,
      'highContrast',p_high_contrast,
      'textScale',p_text_scale,
      'version',v_profile.preferences_version,
      'enabledPreferenceCount',(
        select count(*)::integer
        from public.notification_preferences np
        where np.user_id=v_actor_id and np.enabled
      )
    )
  );

  insert into private.outbox_events(
    organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload
  )
  values (
    null,'notification_preferences.updated','profile',v_actor_id,v_correlation_id,
    jsonb_build_object(
      'userId',v_actor_id,
      'locale',p_locale,
      'preferencesVersion',v_profile.preferences_version
    )
  );

  v_response := jsonb_build_object(
    'userId',v_actor_id,
    'locale',v_profile.locale,
    'reduceMotion',v_profile.reduce_motion,
    'highContrast',v_profile.high_contrast,
    'textScale',v_profile.text_scale,
    'version',v_profile.preferences_version,
    'correlationId',v_correlation_id,
    'idempotentReplay',false
  );

  update private.idempotency_records r
  set state='completed',
      response_status=200,
      response_body=v_response,
      resource_type='profile',
      resource_id=v_actor_id,
      completed_at=now()
  where r.organization_id is null
    and r.actor_scope='user:'||v_actor_id::text
    and r.route='UpdateNotificationPreferences'
    and r.idempotency_key=trim(p_idempotency_key);

  return v_response;
end;
$$;

create or replace function public.get_notification_preferences_workspace()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then jsonb_build_object(
      'profile',null,
      'channels','{}'::jsonb,
      'marketing',jsonb_build_object('email',false,'sms',false),
      'deliverySummary',jsonb_build_object(
        'queued',0,'processing',0,'sent',0,'failed',0,'canceled',0,'deadLetter',0
      ),
      'recentDeliveries','[]'::jsonb
    )
    else jsonb_build_object(
      'profile',(
        select jsonb_build_object(
          'locale',p.locale,
          'reduceMotion',p.reduce_motion,
          'highContrast',p.high_contrast,
          'textScale',p.text_scale,
          'version',p.preferences_version,
          'hasEmail',exists(
            select 1 from auth.users u
            where u.id=p.user_id and nullif(trim(u.email),'') is not null
          ),
          'hasPhone',nullif(trim(p.primary_phone_e164),'') is not null
        )
        from public.profiles p
        where p.user_id=(select auth.uid())
      ),
      'channels',coalesce((
        select jsonb_object_agg(channel_data.channel,channel_data.categories order by channel_data.channel)
        from (
          select source.channel,jsonb_object_agg(
            source.category,
            coalesce(np.enabled,source.channel='email')
            order by source.category
          ) as categories
          from (
            select channel,category
            from unnest(array['email','sms','whatsapp','push']) channel
            cross join unnest(array['payments','maintenance','messages','documents','announcements']) category
          ) source
          left join public.notification_preferences np
            on np.user_id=(select auth.uid())
           and np.channel=source.channel
           and np.category=source.category
          group by source.channel
        ) channel_data
      ),'{}'::jsonb),
      'marketing',jsonb_build_object('email',false,'sms',false),
      'deliverySummary',(
        select jsonb_build_object(
          'queued',count(*) filter (where j.status='queued'),
          'processing',count(*) filter (where j.status='processing'),
          'sent',count(*) filter (where j.status='sent'),
          'failed',count(*) filter (where j.status='failed'),
          'canceled',count(*) filter (where j.status='canceled'),
          'deadLetter',count(*) filter (where j.status='dead_letter')
        )
        from private.notification_jobs j
        where j.recipient_user_id=(select auth.uid())
          and j.created_at>=now()-interval '30 days'
      ),
      'recentDeliveries',coalesce((
        select jsonb_agg(jsonb_build_object(
          'notificationJobId',recent.id,
          'templateCode',recent.template_code,
          'channel',recent.channel,
          'status',recent.status,
          'attempts',recent.attempts,
          'createdAt',recent.created_at,
          'latestDeliveryStatus',recent.latest_delivery_status,
          'latestDeliveryAt',recent.latest_delivery_at
        ) order by recent.created_at desc,recent.id desc)
        from (
          select
            j.id,j.template_code,j.channel,j.status,j.attempts,j.created_at,
            delivery.status as latest_delivery_status,
            delivery.occurred_at as latest_delivery_at
          from private.notification_jobs j
          left join lateral (
            select d.status,d.occurred_at
            from private.notification_deliveries d
            where d.notification_job_id=j.id
            order by d.occurred_at desc,d.id desc
            limit 1
          ) delivery on true
          where j.recipient_user_id=(select auth.uid())
          order by j.created_at desc,j.id desc
          limit 20
        ) recent
      ),'[]'::jsonb)
    )
  end;
$$;

revoke all on function public.update_notification_preferences(text,boolean,boolean,text,jsonb,integer,text)
  from public,anon,authenticated,service_role;
revoke all on function public.get_notification_preferences_workspace()
  from public,anon,authenticated,service_role;

grant execute on function public.update_notification_preferences(text,boolean,boolean,text,jsonb,integer,text)
  to authenticated;
grant execute on function public.get_notification_preferences_workspace()
  to authenticated;

commit;
