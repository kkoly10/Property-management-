-- Resend event echoes may precede the worker's acceptance row and arrive out of order.
-- Keep only their reference IDs, status, occurrence time and local receipt time.
begin;

create table private.resend_notification_events (
  event_id text primary key check (event_id ~ '^[A-Za-z0-9_-]{1,160}$'),
  provider_message_id uuid not null,
  status text not null check (status in ('delivered','delayed','bounced')),
  occurred_at timestamptz not null check (isfinite(occurred_at)),
  received_at timestamptz not null default clock_timestamp()
);
alter table private.resend_notification_events enable row level security;
revoke all on private.resend_notification_events from public,anon,authenticated,service_role;
create index resend_notification_events_message_idx
  on private.resend_notification_events(provider_message_id,occurred_at desc);
create index resend_notification_events_received_idx on private.resend_notification_events(received_at,event_id);
create index notification_deliveries_resend_correlation_idx
  on private.notification_deliveries(lower(provider_message_id),notification_job_id)
  where status='accepted' and provider_code in ('relay','resend') and provider_message_id is not null;

create function public.record_resend_notification_event(
  p_event_id text,
  p_provider_message_id uuid,
  p_status text,
  p_occurred_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(p_event_id,'') !~ '^[A-Za-z0-9_-]{1,160}$'
    or p_provider_message_id is null or p_status is null or p_status not in ('delivered','delayed','bounced')
    or p_occurred_at is null or not isfinite(p_occurred_at)
  then
    raise exception using errcode='22023',message='INVALID_RESEND_DELIVERY_EVENT';
  end if;

  insert into private.resend_notification_events(event_id,provider_message_id,status,occurred_at)
    values (p_event_id,p_provider_message_id,p_status,p_occurred_at)
  on conflict (event_id) do nothing;
  return found;
end;
$$;
revoke all on function public.record_resend_notification_event(text,uuid,text,timestamptz)
  from public,anon,authenticated,service_role;
grant execute on function public.record_resend_notification_event(text,uuid,text,timestamptz) to service_role;

create function private.get_notification_delivery_state(p_notification_job_id uuid)
returns table (status text, occurred_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select coalesce(receipt.status,attempt.status),coalesce(receipt.occurred_at,attempt.occurred_at)
  from (
    select d.status,d.occurred_at,d.provider_code,d.provider_message_id,j.channel
    from private.notification_deliveries d
    join private.notification_jobs j on j.id=d.notification_job_id
    where d.notification_job_id=p_notification_job_id
    order by d.occurred_at desc,d.id desc
    limit 1
  ) attempt
  left join lateral (
    select e.status,e.occurred_at
    from private.resend_notification_events e
    where attempt.status='accepted' and attempt.channel='email' and attempt.provider_code in ('relay','resend')
      and e.provider_message_id=case
        when attempt.provider_message_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then attempt.provider_message_id::uuid else null end
      and not exists (
        select 1 from private.notification_deliveries d
        join private.notification_jobs j on j.id=d.notification_job_id and j.channel='email'
        where lower(d.provider_message_id)=e.provider_message_id::text and d.notification_job_id<>p_notification_job_id
          and d.status='accepted' and d.provider_code in ('relay','resend')
      )
    order by (e.status='delayed'),e.occurred_at desc,(e.status='bounced') desc,e.event_id desc
    limit 1
  ) receipt on true;
$$;
revoke all on function private.get_notification_delivery_state(uuid) from public,anon,authenticated,service_role;

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
          left join lateral private.get_notification_delivery_state(j.id) delivery on true
          where j.recipient_user_id=(select auth.uid())
          order by j.created_at desc,j.id desc
          limit 20
        ) recent
      ),'[]'::jsonb)
    )
  end;
$$;
revoke all on function public.get_notification_preferences_workspace() from public,anon,authenticated,service_role;
grant execute on function public.get_notification_preferences_workspace() to authenticated;

create or replace function public.sweep_expired_operational_records(p_limit integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grants integer := 0;
  v_records integer := 0;
  v_receipts integer := 0;
begin
  if p_limit is null or p_limit not between 1 and 5000 then
    raise exception using errcode='23514',message='INVALID_SWEEP_LIMIT';
  end if;

  with due as (
    select g.id from private.upload_grants g
    where g.status = 'issued' and g.expires_at <= now()
    order by g.expires_at
    limit p_limit
    for update skip locked
  )
  update private.upload_grants g set status = 'expired'
  from due d where g.id = d.id;
  get diagnostics v_grants = row_count;

  with due as (
    select r.id from private.idempotency_records r
    where r.expires_at <= now()
    order by r.expires_at
    limit p_limit
    for update skip locked
  )
  delete from private.idempotency_records r using due d where r.id = d.id;
  get diagnostics v_records = row_count;

  -- A receipt may arrive before the notification worker records acceptance.
  -- Keep newly unlinked IDs for two days and preserve receipts with a live accepted email.
  with due as (
    select e.event_id from private.resend_notification_events e
    where e.received_at<=now()-interval '2 days'
      and not exists (
        select 1 from private.notification_deliveries d
        join private.notification_jobs j on j.id=d.notification_job_id and j.channel='email'
        where lower(d.provider_message_id)=e.provider_message_id::text
          and d.status='accepted' and d.provider_code in ('relay','resend')
      )
    order by e.received_at,e.event_id
    limit p_limit
    for update skip locked
  )
  delete from private.resend_notification_events e using due d where e.event_id=d.event_id;
  get diagnostics v_receipts = row_count;

  return jsonb_build_object('expiredUploadGrants',v_grants,'purgedIdempotencyRecords',v_records,
    'purgedUnmatchedResendReceipts',v_receipts);
end;
$$;
revoke all on function public.sweep_expired_operational_records(integer) from public,anon,authenticated;
grant execute on function public.sweep_expired_operational_records(integer) to service_role;

commit;
