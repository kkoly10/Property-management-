begin;

create table private.rental_prospect_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  case_kind text not null check (case_kind in ('inquiry','tour')),
  case_id uuid not null,
  inquiry_id uuid generated always as (case when case_kind='inquiry' then case_id end) stored,
  tour_id uuid generated always as (case when case_kind='tour' then case_id end) stored,
  author_key text not null,
  body text not null check (length(btrim(body)) between 1 and 2000),
  operation_id uuid not null,
  created_at timestamptz not null default now(),
  unique (organization_id,case_kind,case_id,author_key,operation_id),
  foreign key (organization_id,inquiry_id) references public.rental_inquiries(organization_id,id) on delete cascade,
  foreign key (organization_id,tour_id) references public.rental_tour_requests(organization_id,id) on delete cascade
);
create index rental_prospect_messages_case_idx on private.rental_prospect_messages(organization_id,case_kind,case_id,created_at,id);

create table private.rental_prospect_access (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  case_kind text not null check (case_kind in ('inquiry','tour')),
  case_id uuid not null,
  inquiry_id uuid generated always as (case when case_kind='inquiry' then case_id end) stored,
  tour_id uuid generated always as (case when case_kind='tour' then case_id end) stored,
  challenge_hash text not null unique check (challenge_hash ~ '^[0-9a-f]{64}$'),
  challenge_expires_at timestamptz not null,
  session_hash text unique check (session_hash ~ '^[0-9a-f]{64}$'),
  session_expires_at timestamptz,
  recovery_network_hash text,
  created_at timestamptz not null default now(),
  check ((session_hash is null)=(session_expires_at is null)),
  foreign key (organization_id,inquiry_id) references public.rental_inquiries(organization_id,id) on delete cascade,
  foreign key (organization_id,tour_id) references public.rental_tour_requests(organization_id,id) on delete cascade
);
create index rental_prospect_access_case_idx on private.rental_prospect_access(organization_id,case_kind,case_id,created_at);
create index rental_prospect_access_network_idx on private.rental_prospect_access(recovery_network_hash,created_at)
where recovery_network_hash is not null;
alter table private.rental_prospect_messages enable row level security;
alter table private.rental_prospect_access enable row level security;
revoke all on private.rental_prospect_messages,private.rental_prospect_access from public,anon,authenticated,service_role;

create function private.rental_prospect_case(p_kind text,p_id uuid)
returns table(organization_id uuid,property_id uuid,unit_id uuid,listing_id uuid,reference text,email text,can_reply boolean,original_question text)
language sql stable set search_path=''
as $$
  select i.organization_id,i.property_id,i.unit_id,i.listing_id,i.public_reference,i.email::text,i.status='open',i.question
  from public.rental_inquiries i where p_kind='inquiry' and i.id=p_id and i.verified_at is not null
  union all
  select t.organization_id,t.property_id,t.unit_id,t.listing_id,t.public_reference,t.email::text,t.cancelled_at is null,null::text
  from public.rental_tour_requests t where p_kind='tour' and t.id=p_id and t.verified_at is not null
$$;
revoke all on function private.rental_prospect_case(text,uuid) from public,anon,authenticated,service_role;

create function private.rental_prospect_message_list(p_org uuid,p_kind text,p_id uuid)
returns jsonb language sql stable set search_path=''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',m.id,'author',case when m.author_key='renter' then 'renter' else 'landlord' end,'body',m.body,'createdAt',m.created_at
  ) order by m.created_at,m.id),'[]'::jsonb)
  from (
    select * from private.rental_prospect_messages
    where organization_id=p_org and case_kind=p_kind and case_id=p_id
    order by created_at desc,id desc limit 100
  ) m
$$;
revoke all on function private.rental_prospect_message_list(uuid,text,uuid) from public,anon,authenticated,service_role;

create function private.append_rental_prospect_message(p_org uuid,p_kind text,p_id uuid,p_author text,p_body text,p_operation uuid)
returns jsonb language plpgsql set search_path=''
as $$
declare
  v_message private.rental_prospect_messages%rowtype;
  v_body text:=btrim(coalesce(p_body,''));
  v_inserted boolean;
begin
  if p_operation is null or length(v_body) not between 1 and 2000 then
    raise exception using errcode='22023',message='INVALID_RENTAL_REPLY';
  end if;
  insert into private.rental_prospect_messages(organization_id,case_kind,case_id,author_key,body,operation_id)
  values(p_org,p_kind,p_id,p_author,v_body,p_operation)
  on conflict(organization_id,case_kind,case_id,author_key,operation_id) do nothing returning * into v_message;
  v_inserted:=found;
  if not v_inserted then
    select * into strict v_message from private.rental_prospect_messages m
    where m.organization_id=p_org and m.case_kind=p_kind and m.case_id=p_id
      and m.author_key=p_author and m.operation_id=p_operation;
    if v_message.body<>v_body then raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT'; end if;
  end if;
  return jsonb_build_object('id',v_message.id,'created',v_inserted);
end;
$$;
revoke all on function private.append_rental_prospect_message(uuid,text,uuid,text,text,uuid) from public,anon,authenticated,service_role;

create function private.queue_rental_conversation_access(p_org uuid,p_kind text,p_id uuid,p_reference text,p_email text,p_template text,p_key text,p_network text)
returns uuid language plpgsql set search_path=''
as $$
declare
  v_token text:=encode(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')),'hex');
  v_expires timestamptz:=now()+interval '60 minutes';
  v_job uuid;
begin
  insert into private.rental_prospect_access(organization_id,case_kind,case_id,challenge_hash,challenge_expires_at,recovery_network_hash)
  values(p_org,p_kind,p_id,encode(sha256(convert_to(v_token,'UTF8')),'hex'),v_expires,p_network);
  insert into private.notification_jobs(organization_id,template_code,locale,channel,recipient_address,payload,idempotency_key)
  values(p_org,p_template,'en-US','email',p_email,jsonb_build_object(
    case when p_kind='tour' then 'tourReference' else 'inquiryReference' end,p_reference,
    'conversationToken',v_token,'expiresAt',v_expires
  ),p_key) returning id into v_job;
  return v_job;
end;
$$;
revoke all on function private.queue_rental_conversation_access(uuid,text,uuid,text,text,text,text,text) from public,anon,authenticated,service_role;

create function public.manage_rental_conversation(p_org uuid,p_kind text,p_id uuid,p_body text default null,p_operation uuid default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_case record;
  v_message jsonb;
  v_job uuid;
begin
  perform private.enter_organization_context(p_org);
  select * into v_case from private.rental_prospect_case(p_kind,p_id) c where c.organization_id=p_org;
  if not found or not (private.has_property_access(v_case.property_id,'lease.manage')
    or private.has_property_access(v_case.property_id,'property.manage')) then
    raise exception using errcode='42501',message='RENTAL_CONVERSATION_DENIED';
  end if;
  if p_body is not null then
    perform pg_advisory_xact_lock(hashtextextended('rental-prospect-chat:'||p_kind||':'||p_id::text,0));
    if p_kind='inquiry' then perform 1 from public.rental_inquiries where id=p_id and organization_id=p_org for update;
    else perform 1 from public.rental_tour_requests where id=p_id and organization_id=p_org for update; end if;
    select * into strict v_case from private.rental_prospect_case(p_kind,p_id) c where c.organization_id=p_org;
    if not v_case.can_reply then raise exception using errcode='23514',message='RENTAL_CONVERSATION_CLOSED'; end if;
    v_message:=private.append_rental_prospect_message(p_org,p_kind,p_id,auth.uid()::text,p_body,p_operation);
    if (v_message->>'created')::boolean then
      v_job:=private.queue_rental_conversation_access(p_org,p_kind,p_id,v_case.reference,v_case.email,
        case when p_kind='tour' then 'rental_tour_reply' else 'rental_inquiry_reply' end,
        'rental-prospect-message:'||(v_message->>'id'),null);
    end if;
  end if;
  return jsonb_build_object('reference',v_case.reference,'canReply',v_case.can_reply,'originalQuestion',v_case.original_question,
    'messages',private.rental_prospect_message_list(p_org,p_kind,p_id),'notificationJobId',v_job);
end;
$$;
revoke all on function public.manage_rental_conversation(uuid,text,uuid,text,uuid) from public,anon;
grant execute on function public.manage_rental_conversation(uuid,text,uuid,text,uuid) to authenticated;

create function public.redeem_rental_conversation(p_token text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_row private.rental_prospect_access%rowtype;
  v_session text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into v_row from private.rental_prospect_access a
  where a.challenge_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex')
    and a.challenge_expires_at>now() and a.session_hash is null for update;
  if not found or not exists(select 1 from private.rental_prospect_case(v_row.case_kind,v_row.case_id) c
    where c.organization_id=v_row.organization_id) then return null; end if;
  v_session:=encode(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')),'hex');
  update private.rental_prospect_access set session_hash=encode(sha256(convert_to(v_session,'UTF8')),'hex'),
    session_expires_at=now()+interval '24 hours' where id=v_row.id;
  return jsonb_build_object(
    'session',v_session,
    'reference',(select c.reference from private.rental_prospect_case(v_row.case_kind,v_row.case_id) c)
  );
end;
$$;
revoke all on function public.redeem_rental_conversation(text) from public,anon,authenticated;
grant execute on function public.redeem_rental_conversation(text) to service_role;

create function public.access_rental_conversation(
  p_session text,p_body text default null,p_operation uuid default null,p_expected_reference text default null
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_row private.rental_prospect_access%rowtype;
  v_case record;
  v_message jsonb;
begin
  if p_session is null or p_session !~ '^[a-f0-9]{64}$' then return null; end if;
  select * into v_row from private.rental_prospect_access a
  where a.session_hash=encode(sha256(convert_to(p_session,'UTF8')),'hex') and a.session_expires_at>now();
  if not found then return null; end if;
  if p_body is not null then
    perform pg_advisory_xact_lock(hashtextextended('rental-prospect-chat:'||v_row.case_kind||':'||v_row.case_id::text,0));
    if v_row.case_kind='inquiry' then
      perform 1 from public.rental_inquiries where id=v_row.case_id and organization_id=v_row.organization_id for update;
    else
      perform 1 from public.rental_tour_requests where id=v_row.case_id and organization_id=v_row.organization_id for update;
    end if;
  end if;
  select * into v_case from private.rental_prospect_case(v_row.case_kind,v_row.case_id) c where c.organization_id=v_row.organization_id;
  if not found then return null; end if;
  if p_expected_reference is not null and v_case.reference<>p_expected_reference then return null; end if;
  if p_body is not null then
    if p_expected_reference is null then
      raise exception using errcode='23514',message='RENTAL_CONVERSATION_REFERENCE_REQUIRED';
    end if;
    if not v_case.can_reply then raise exception using errcode='23514',message='RENTAL_CONVERSATION_CLOSED'; end if;
    v_message:=private.append_rental_prospect_message(v_row.organization_id,v_row.case_kind,v_row.case_id,'renter',p_body,p_operation);
    if (v_message->>'created')::boolean then
      insert into private.notification_jobs(organization_id,template_code,locale,channel,recipient_user_id,payload,idempotency_key)
      select v_row.organization_id,case when v_row.case_kind='tour' then 'message_rental_tour_reply' else 'message_rental_inquiry_reply' end,
        o.locale,'email',o.user_id,jsonb_build_object('unitId',v_case.unit_id,
          case when v_row.case_kind='tour' then 'tourReference' else 'inquiryReference' end,v_case.reference),
        'rental-prospect-message:'||(v_message->>'id')
      from private.rental_notification_operator(v_row.organization_id,v_case.property_id,v_case.listing_id) o
      on conflict(channel,idempotency_key) do nothing;
    end if;
  end if;
  return jsonb_build_object('reference',v_case.reference,'canReply',v_case.can_reply,'originalQuestion',v_case.original_question,
    'messages',private.rental_prospect_message_list(v_row.organization_id,v_row.case_kind,v_row.case_id));
end;
$$;
revoke all on function public.access_rental_conversation(text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.access_rental_conversation(text,text,uuid,text) to service_role;

create function public.recover_rental_conversation(p_reference text,p_email text,p_network_hash text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare
  v_kind text;
  v_id uuid;
  v_case record;
begin
  if p_reference is null or p_reference !~ '^(INQ|TOUR)-[A-F0-9]{12}$' or p_email is null
    or p_network_hash is null or p_network_hash !~ '^[a-f0-9]{64}$' then return null; end if;
  if p_reference like 'INQ-%' then
    v_kind:='inquiry';
    select i.id into v_id from public.rental_inquiries i where i.public_reference=p_reference;
  else
    v_kind:='tour';
    select t.id into v_id from public.rental_tour_requests t where t.public_reference=p_reference;
  end if;
  select * into v_case from private.rental_prospect_case(v_kind,v_id);
  if not found or lower(v_case.email)<>lower(btrim(p_email)) then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended('rental-prospect-recover-ip:'||p_network_hash,0));
  perform pg_advisory_xact_lock(hashtextextended('rental-prospect-recover-case:'||v_kind||':'||v_id::text,0));
  if (select count(*) from private.rental_prospect_access a where a.organization_id=v_case.organization_id
      and a.case_kind=v_kind and a.case_id=v_id and a.recovery_network_hash is not null
      and a.created_at>now()-interval '24 hours')>=5
    or exists(select 1 from private.rental_prospect_access a where a.organization_id=v_case.organization_id
      and a.case_kind=v_kind and a.case_id=v_id and a.created_at>now()-interval '3 minutes')
    or (select count(*) from private.rental_prospect_access a where a.recovery_network_hash=p_network_hash
      and a.created_at>now()-interval '1 hour')>=20 then return null; end if;
  return private.queue_rental_conversation_access(v_case.organization_id,v_kind,v_id,p_reference,v_case.email,
    'rental_conversation_access','rental-conversation-recovery:'||gen_random_uuid()::text,p_network_hash);
end;
$$;
revoke all on function public.recover_rental_conversation(text,text,text) from public,anon,authenticated;
grant execute on function public.recover_rental_conversation(text,text,text) to service_role;

create function private.scrub_rental_conversation_challenge()
returns trigger language plpgsql set search_path=''
as $$
begin
  if new.template_code in ('rental_inquiry_reply','rental_tour_reply','rental_conversation_access')
    and new.status in ('sent','dead_letter','canceled') then new.payload:=new.payload-'conversationToken'; end if;
  return new;
end;
$$;
revoke all on function private.scrub_rental_conversation_challenge() from public,anon,authenticated,service_role;
create trigger scrub_rental_conversation_challenge before insert or update of status on private.notification_jobs
for each row execute function private.scrub_rental_conversation_challenge();

commit;
