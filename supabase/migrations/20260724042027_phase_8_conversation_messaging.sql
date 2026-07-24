begin;

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  property_id uuid,
  tenancy_id uuid,
  owner_entity_id uuid,
  subject text check (subject is null or length(trim(subject)) between 1 and 200),
  conversation_type text not null check (
    conversation_type in ('operator_resident','operator_owner','internal_support')
  ),
  status text not null default 'open' check (status in ('open','closed','archived')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  unique (organization_id,id),
  foreign key (organization_id) references public.organizations(id) on delete restrict,
  foreign key (organization_id,property_id)
    references public.properties(organization_id,id) on delete restrict,
  foreign key (organization_id,tenancy_id)
    references public.tenancies(organization_id,id) on delete restrict,
  foreign key (organization_id,owner_entity_id)
    references public.owner_entities(organization_id,id) on delete restrict,
  check (
    (
      conversation_type='operator_resident'
      and property_id is not null
      and tenancy_id is not null
      and owner_entity_id is null
    )
    or (
      conversation_type='operator_owner'
      and property_id is not null
      and tenancy_id is null
      and owner_entity_id is not null
    )
    or (
      conversation_type='internal_support'
      and tenancy_id is null
      and owner_entity_id is null
    )
  )
);
create unique index conversations_resident_tenancy_unique
  on public.conversations(organization_id,tenancy_id,conversation_type)
  where conversation_type='operator_resident';
create unique index conversations_owner_property_unique
  on public.conversations(organization_id,owner_entity_id,property_id,conversation_type)
  where conversation_type='operator_owner';
create index conversations_property_updated_idx
  on public.conversations(organization_id,property_id,updated_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  conversation_id uuid not null,
  sender_user_id uuid references auth.users(id) on delete restrict,
  sender_type text not null check (sender_type in ('member','resident','owner','system')),
  body_text text not null check (length(body_text) between 1 and 10000),
  status text not null default 'sent' check (
    status in ('sent','redacted','deleted_by_policy')
  ),
  sent_at timestamptz not null default now(),
  edited_at timestamptz,
  correlation_id uuid not null default gen_random_uuid(),
  unique (organization_id,id),
  unique (organization_id,conversation_id,id),
  foreign key (organization_id)
    references public.organizations(id) on delete restrict,
  foreign key (organization_id,conversation_id)
    references public.conversations(organization_id,id) on delete cascade,
  check (
    (sender_type='system' and sender_user_id is null)
    or (sender_type<>'system' and sender_user_id is not null)
  )
);
create index messages_conversation_sent_idx
  on public.messages(organization_id,conversation_id,sent_at,id);
create index messages_sender_idx
  on public.messages(sender_user_id)
  where sender_user_id is not null;

create table public.conversation_participants (
  conversation_id uuid not null,
  organization_id uuid not null,
  participant_type text not null check (
    participant_type in ('organization_member','resident_person','owner_entity','system')
  ),
  participant_id uuid not null,
  user_id uuid not null references auth.users(id) on delete restrict,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  last_read_message_id uuid,
  primary key (conversation_id,participant_type,participant_id),
  unique (conversation_id,user_id),
  foreign key (organization_id)
    references public.organizations(id) on delete restrict,
  foreign key (organization_id,conversation_id)
    references public.conversations(organization_id,id) on delete cascade,
  foreign key (last_read_message_id)
    references public.messages(id) on delete set null,
  check (left_at is null or left_at>=joined_at)
);
create index conversation_participants_user_idx
  on public.conversation_participants(user_id,left_at,conversation_id);
create index conversation_participants_org_conversation_idx
  on public.conversation_participants(organization_id,conversation_id);
create index conversation_participants_last_read_idx
  on public.conversation_participants(organization_id,conversation_id,last_read_message_id)
  where last_read_message_id is not null;

create table private.notification_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete restrict,
  template_code text not null,
  locale text not null,
  channel text not null check (channel in ('in_app','email','sms','whatsapp','push')),
  recipient_user_id uuid references auth.users(id) on delete restrict,
  recipient_address text,
  payload jsonb not null,
  status text not null default 'queued' check (
    status in ('queued','processing','sent','failed','canceled','dead_letter')
  ),
  available_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts>=0),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (channel,idempotency_key),
  check (recipient_user_id is not null or recipient_address is not null)
);
create index notification_jobs_queue_idx
  on private.notification_jobs(status,available_at,created_at)
  where status in ('queued','failed');
create index notification_jobs_recipient_idx
  on private.notification_jobs(recipient_user_id,created_at desc)
  where recipient_user_id is not null;
create index notification_jobs_organization_idx
  on private.notification_jobs(organization_id,created_at desc)
  where organization_id is not null;

create or replace function private.prevent_message_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode='55000',message='MESSAGE_APPEND_ONLY';
end;
$$;
revoke all on function private.prevent_message_mutation()
  from public,anon,authenticated,service_role;
create trigger messages_append_only
before update or delete on public.messages
for each row execute function private.prevent_message_mutation();

create or replace function private.validate_conversation_participant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation public.conversations%rowtype;
begin
  select * into v_conversation
  from public.conversations c
  where c.id=new.conversation_id
    and c.organization_id=new.organization_id;
  if not found then
    raise exception using errcode='23503',message='CONVERSATION_PARTICIPANT_CONTEXT_NOT_FOUND';
  end if;

  if new.participant_type='organization_member' and not exists (
    select 1
    from public.organization_memberships m
    where m.id=new.participant_id
      and m.organization_id=new.organization_id
      and m.user_id=new.user_id
  ) then
    raise exception using errcode='23514',message='INVALID_ORGANIZATION_PARTICIPANT';
  elsif new.participant_type='resident_person' and (
    v_conversation.conversation_type<>'operator_resident'
    or not exists (
      select 1
      from public.user_relationships ur
      join public.tenancies t
        on t.id=v_conversation.tenancy_id
       and t.organization_id=ur.organization_id
      join public.household_members hm
        on hm.organization_id=t.organization_id
       and hm.household_id=t.household_id
       and hm.person_id=ur.relationship_id
      where ur.user_id=new.user_id
        and ur.organization_id=new.organization_id
        and ur.relationship_type='resident_person'
        and ur.relationship_id=new.participant_id
        and ur.status='active'
        and hm.starts_on<=current_date
        and (hm.ends_on is null or hm.ends_on>=current_date)
    )
  ) then
    raise exception using errcode='23514',message='INVALID_RESIDENT_PARTICIPANT';
  elsif new.participant_type='owner_entity' and (
    v_conversation.conversation_type<>'operator_owner'
    or v_conversation.owner_entity_id<>new.participant_id
    or not exists (
      select 1
      from public.user_relationships ur
      where ur.user_id=new.user_id
        and ur.organization_id=new.organization_id
        and ur.relationship_type='owner_entity'
        and ur.relationship_id=new.participant_id
        and ur.status='active'
    )
  ) then
    raise exception using errcode='23514',message='INVALID_OWNER_PARTICIPANT';
  elsif new.participant_type='system' then
    raise exception using errcode='23514',message='SYSTEM_PARTICIPANT_UNSUPPORTED';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_conversation_participant()
  from public,anon,authenticated,service_role;
create trigger conversation_participant_validate
before insert or update of conversation_id,organization_id,participant_type,participant_id,user_id
on public.conversation_participants
for each row execute function private.validate_conversation_participant();

create or replace function private.sync_relationship_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_context record;
  v_conversation_id uuid;
begin
  if new.relationship_type='resident_person' then
    if new.status='active' then
      for v_context in
        select t.organization_id,t.id as tenancy_id,t.property_id
        from public.tenancies t
        join public.household_members hm
          on hm.organization_id=t.organization_id
         and hm.household_id=t.household_id
        where t.organization_id=new.organization_id
          and hm.person_id=new.relationship_id
          and hm.starts_on<=current_date
          and (hm.ends_on is null or hm.ends_on>=current_date)
          and t.status in ('scheduled','active','notice_given','move_out_in_progress')
      loop
        insert into public.conversations(
          organization_id,property_id,tenancy_id,subject,conversation_type
        ) values (
          v_context.organization_id,v_context.property_id,v_context.tenancy_id,
          'Resident support','operator_resident'
        )
        on conflict (
          organization_id,tenancy_id,conversation_type
        ) where conversation_type='operator_resident'
        do nothing;
        select c.id into v_conversation_id
        from public.conversations c
        where c.organization_id=v_context.organization_id
          and c.tenancy_id=v_context.tenancy_id
          and c.conversation_type='operator_resident';
        insert into public.conversation_participants(
          conversation_id,organization_id,participant_type,participant_id,user_id
        ) values (
          v_conversation_id,new.organization_id,'resident_person',
          new.relationship_id,new.user_id
        )
        on conflict (conversation_id,user_id)
        do update set left_at=null;
      end loop;
    else
      update public.conversation_participants cp
      set left_at=coalesce(cp.left_at,now())
      where cp.organization_id=new.organization_id
        and cp.participant_type='resident_person'
        and cp.participant_id=new.relationship_id
        and cp.user_id=new.user_id;
    end if;
  elsif new.relationship_type='owner_entity' then
    if new.status='active' then
      for v_context in
        select oi.organization_id,oi.owner_entity_id,oi.property_id
        from public.ownership_interests oi
        where oi.organization_id=new.organization_id
          and oi.owner_entity_id=new.relationship_id
          and oi.effective_from<=current_date
          and (oi.effective_to is null or oi.effective_to>=current_date)
      loop
        insert into public.conversations(
          organization_id,property_id,owner_entity_id,subject,conversation_type
        ) values (
          v_context.organization_id,v_context.property_id,v_context.owner_entity_id,
          'Owner support','operator_owner'
        )
        on conflict (
          organization_id,owner_entity_id,property_id,conversation_type
        ) where conversation_type='operator_owner'
        do nothing;
        select c.id into v_conversation_id
        from public.conversations c
        where c.organization_id=v_context.organization_id
          and c.owner_entity_id=v_context.owner_entity_id
          and c.property_id=v_context.property_id
          and c.conversation_type='operator_owner';
        insert into public.conversation_participants(
          conversation_id,organization_id,participant_type,participant_id,user_id
        ) values (
          v_conversation_id,new.organization_id,'owner_entity',
          new.relationship_id,new.user_id
        )
        on conflict (conversation_id,user_id)
        do update set left_at=null;
      end loop;
    else
      update public.conversation_participants cp
      set left_at=coalesce(cp.left_at,now())
      where cp.organization_id=new.organization_id
        and cp.participant_type='owner_entity'
        and cp.participant_id=new.relationship_id
        and cp.user_id=new.user_id;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.sync_relationship_conversation()
  from public,anon,authenticated,service_role;
create trigger user_relationship_conversation_sync
after insert or update of status on public.user_relationships
for each row execute function private.sync_relationship_conversation();

create or replace function private.is_conversation_participant(
  p_conversation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.conversation_participants cp
    where cp.conversation_id=p_conversation_id
      and cp.user_id=(select auth.uid())
      and cp.left_at is null
  );
$$;
revoke all on function private.is_conversation_participant(uuid)
  from public,anon,authenticated,service_role;

create or replace function private.is_conversation_operator(
  p_conversation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.conversations c
    where c.id=p_conversation_id
      and c.property_id is not null
      and (
        (
          c.conversation_type='operator_resident'
          and private.has_property_access(c.property_id,'resident.manage')
        )
        or (
          c.conversation_type='operator_owner'
          and private.has_property_access(c.property_id,'owner.manage')
        )
      )
  );
$$;
revoke all on function private.is_conversation_operator(uuid)
  from public,anon,authenticated,service_role;

create or replace function private.can_access_conversation(
  p_conversation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_conversation_participant(p_conversation_id)
    or private.is_conversation_operator(p_conversation_id);
$$;
revoke all on function private.can_access_conversation(uuid)
  from public,anon,authenticated,service_role;

alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;
create policy conversations_authorized_read
on public.conversations for select to authenticated
using ((select private.can_access_conversation(id)));
create policy conversation_participants_authorized_read
on public.conversation_participants for select to authenticated
using ((select private.can_access_conversation(conversation_id)));
create policy messages_authorized_read
on public.messages for select to authenticated
using ((select private.can_access_conversation(conversation_id)));
revoke all on table public.conversations
  from public,anon,authenticated,service_role;
revoke all on table public.conversation_participants
  from public,anon,authenticated,service_role;
revoke all on table public.messages
  from public,anon,authenticated,service_role;

create or replace function public.send_conversation_message(
  p_conversation_id uuid,
  p_body_text text,
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
  v_conversation public.conversations%rowtype;
  v_participant_type text;
  v_sender_type text;
  v_body_text text := trim(p_body_text);
  v_request_hash text;
  v_previous private.idempotency_records%rowtype;
  v_message_id uuid := gen_random_uuid();
  v_correlation_id uuid := gen_random_uuid();
  v_sent_at timestamptz := now();
  v_response jsonb;
  v_notification_count integer := 0;
begin
  if v_actor_id is null then
    raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key))<8 then
    raise exception using errcode='22023',message='IDEMPOTENCY_KEY_REQUIRED';
  end if;
  if v_body_text is null or length(v_body_text) not between 1 and 10000 then
    raise exception using errcode='22023',message='INVALID_MESSAGE_BODY';
  end if;

  select * into v_conversation
  from public.conversations c
  where c.id=p_conversation_id;
  if not found or not private.can_access_conversation(p_conversation_id) then
    raise exception using errcode='P0002',message='CONVERSATION_NOT_FOUND';
  end if;

  select cp.participant_type into v_participant_type
  from public.conversation_participants cp
  where cp.conversation_id=p_conversation_id
    and cp.user_id=v_actor_id
    and cp.left_at is null;
  if found then
    v_sender_type := case v_participant_type
      when 'resident_person' then 'resident'
      when 'owner_entity' then 'owner'
      when 'organization_member' then 'member'
      else 'system'
    end;
  elsif private.is_conversation_operator(p_conversation_id) then
    v_sender_type := 'member';
  else
    raise exception using errcode='42501',message='CONVERSATION_SCOPE_DENIED';
  end if;

  v_actor_scope := 'user:'||v_actor_id::text;
  v_request_hash := encode(sha256(convert_to(concat_ws(
    '|',p_conversation_id,v_body_text
  ),'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(
    '|',v_conversation.organization_id,v_actor_scope,
    'SendConversationMessage',trim(p_idempotency_key)
  ),0));
  select * into v_previous
  from private.idempotency_records r
  where r.organization_id=v_conversation.organization_id
    and r.actor_scope=v_actor_scope
    and r.route='SendConversationMessage'
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

  if v_conversation.status<>'open' then
    raise exception using errcode='23514',message='CONVERSATION_NOT_OPEN';
  end if;

  insert into private.idempotency_records(
    organization_id,actor_user_id,actor_scope,route,idempotency_key,
    request_hash,expires_at
  ) values (
    v_conversation.organization_id,v_actor_id,v_actor_scope,
    'SendConversationMessage',trim(p_idempotency_key),
    v_request_hash,now()+interval '24 hours'
  );
  insert into public.messages(
    id,organization_id,conversation_id,sender_user_id,sender_type,
    body_text,sent_at,correlation_id
  ) values (
    v_message_id,v_conversation.organization_id,p_conversation_id,
    v_actor_id,v_sender_type,v_body_text,v_sent_at,v_correlation_id
  );
  update public.conversations c
  set updated_at=v_sent_at,version=c.version+1
  where c.id=p_conversation_id;

  with recipient_users as (
    select cp.user_id
    from public.conversation_participants cp
    where cp.conversation_id=p_conversation_id
      and cp.left_at is null
      and cp.user_id<>v_actor_id
    union
    select m.user_id
    from public.organization_memberships m
    join public.role_permissions rp on rp.role_code=m.role_code
    join public.role_definitions rd on rd.code=m.role_code
    where m.organization_id=v_conversation.organization_id
      and m.user_id<>v_actor_id
      and m.status='active'
      and m.starts_at<=now()
      and (m.ends_at is null or m.ends_at>now())
      and (
        rp.permission_code='*'
        or (
          v_conversation.conversation_type='operator_resident'
          and rp.permission_code='resident.manage'
        )
        or (
          v_conversation.conversation_type='operator_owner'
          and rp.permission_code='owner.manage'
        )
      )
      and v_conversation.property_id is not null
      and (
        exists (
          select 1
          from public.membership_property_scopes s
          where s.membership_id=m.id
            and s.property_id=v_conversation.property_id
        )
        or (
          rd.organization_wide_allowed
          and not exists (
            select 1
            from public.membership_property_scopes s2
            where s2.membership_id=m.id
          )
        )
      )
  )
  insert into private.notification_jobs(
    organization_id,template_code,locale,channel,recipient_user_id,
    payload,idempotency_key
  )
  select
    v_conversation.organization_id,
    'conversation_message_received',
    coalesce(p.locale,o.default_locale),
    'in_app',
    recipients.user_id,
    jsonb_build_object(
      'conversationId',p_conversation_id,
      'messageId',v_message_id,
      'senderType',v_sender_type,
      'subject',v_conversation.subject
    ),
    'conversation-message:'||v_message_id::text||':'||recipients.user_id::text
  from recipient_users recipients
  join public.organizations o on o.id=v_conversation.organization_id
  left join public.profiles p on p.user_id=recipients.user_id
  on conflict (channel,idempotency_key) do nothing;
  get diagnostics v_notification_count = row_count;

  insert into audit.audit_events(
    organization_id,actor_user_id,actor_type,action_code,resource_type,
    resource_id,correlation_id,after_data
  ) values (
    v_conversation.organization_id,v_actor_id,'user','message.sent',
    'message',v_message_id,v_correlation_id,jsonb_build_object(
      'conversationId',p_conversation_id,
      'senderType',v_sender_type,
      'bodyLength',length(v_body_text),
      'notificationCount',v_notification_count
    )
  );
  insert into private.outbox_events(
    organization_id,event_type,aggregate_type,aggregate_id,
    correlation_id,payload
  ) values (
    v_conversation.organization_id,'message.sent','conversation',
    p_conversation_id,v_correlation_id,jsonb_build_object(
      'conversationId',p_conversation_id,
      'messageId',v_message_id,
      'senderType',v_sender_type
    )
  );

  v_response := jsonb_build_object(
    'conversationId',p_conversation_id,
    'messageId',v_message_id,
    'senderType',v_sender_type,
    'bodyText',v_body_text,
    'sentAt',v_sent_at,
    'conversationVersion',v_conversation.version+1
  );
  update private.idempotency_records r
  set state='completed',response_status=201,response_body=v_response,
      resource_type='message',resource_id=v_message_id,completed_at=now()
  where r.organization_id=v_conversation.organization_id
    and r.actor_scope=v_actor_scope
    and r.route='SendConversationMessage'
    and r.idempotency_key=trim(p_idempotency_key);
  return v_response;
end;
$$;
revoke all on function public.send_conversation_message(uuid,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.send_conversation_message(uuid,text,text)
  to authenticated;

create or replace function public.get_conversation_workspace()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'items',coalesce(jsonb_agg(jsonb_build_object(
      'conversationId',c.id,
      'conversationType',c.conversation_type,
      'subject',coalesce(c.subject,'Conversation'),
      'status',c.status,
      'version',c.version,
      'propertyId',c.property_id,
      'propertyName',p.name,
      'tenancyId',c.tenancy_id,
      'ownerEntityId',c.owner_entity_id,
      'audienceLabel',case
        when private.is_conversation_operator(c.id) then
          case
            when c.conversation_type='operator_resident' then coalesce(h.display_name,'Resident household')
            when c.conversation_type='operator_owner' then coalesce(oe.display_name,'Owner')
            else 'Support participant'
          end
        else 'Property management'
      end,
      'latestMessage',case when latest.id is null then null else jsonb_build_object(
        'messageId',latest.id,
        'senderType',latest.sender_type,
        'bodyText',latest.body_text,
        'sentAt',latest.sent_at,
        'isMine',latest.sender_user_id=(select auth.uid())
      ) end,
      'updatedAt',c.updated_at
    ) order by c.updated_at desc,c.id),'[]'::jsonb)
  )
  from public.conversations c
  left join public.properties p
    on p.organization_id=c.organization_id
   and p.id=c.property_id
  left join public.tenancies t
    on t.organization_id=c.organization_id
   and t.id=c.tenancy_id
  left join public.households h
    on h.organization_id=t.organization_id
   and h.id=t.household_id
  left join public.owner_entities oe
    on oe.organization_id=c.organization_id
   and oe.id=c.owner_entity_id
  left join lateral (
    select m.id,m.sender_user_id,m.sender_type,m.body_text,m.sent_at
    from public.messages m
    where m.organization_id=c.organization_id
      and m.conversation_id=c.id
      and m.status='sent'
    order by m.sent_at desc,m.id desc
    limit 1
  ) latest on true
  where (select auth.uid()) is not null
    and private.can_access_conversation(c.id)
    and c.status<>'archived';
$$;
revoke all on function public.get_conversation_workspace()
  from public,anon,authenticated,service_role;
grant execute on function public.get_conversation_workspace() to authenticated;

create or replace function public.get_conversation_detail(
  p_conversation_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_conversation public.conversations%rowtype;
  v_property_name text;
  v_audience_label text;
  v_messages jsonb;
begin
  if (select auth.uid()) is null then
    raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED';
  end if;
  select * into v_conversation
  from public.conversations c
  where c.id=p_conversation_id
    and private.can_access_conversation(c.id)
    and c.status<>'archived';
  if not found then
    raise exception using errcode='P0002',message='CONVERSATION_NOT_FOUND';
  end if;
  select p.name into v_property_name
  from public.properties p
  where p.id=v_conversation.property_id
    and p.organization_id=v_conversation.organization_id;
  if private.is_conversation_operator(v_conversation.id) then
    if v_conversation.conversation_type='operator_resident' then
      select h.display_name into v_audience_label
      from public.tenancies t
      join public.households h
        on h.organization_id=t.organization_id
       and h.id=t.household_id
      where t.id=v_conversation.tenancy_id
        and t.organization_id=v_conversation.organization_id;
    elsif v_conversation.conversation_type='operator_owner' then
      select oe.display_name into v_audience_label
      from public.owner_entities oe
      where oe.id=v_conversation.owner_entity_id
        and oe.organization_id=v_conversation.organization_id;
    else
      v_audience_label := 'Support participant';
    end if;
  else
    v_audience_label := 'Property management';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'messageId',m.id,
    'senderType',m.sender_type,
    'senderLabel',case
      when m.sender_user_id=(select auth.uid()) then 'You'
      when m.sender_type='member' then 'Property management'
      when m.sender_type='resident' then 'Resident'
      when m.sender_type='owner' then 'Owner'
      else 'System'
    end,
    'bodyText',case when m.status='sent' then m.body_text else 'Message unavailable' end,
    'status',m.status,
    'sentAt',m.sent_at,
    'isMine',m.sender_user_id=(select auth.uid())
  ) order by m.sent_at,m.id),'[]'::jsonb)
  into v_messages
  from public.messages m
  where m.organization_id=v_conversation.organization_id
    and m.conversation_id=v_conversation.id;

  return jsonb_build_object(
    'conversationId',v_conversation.id,
    'conversationType',v_conversation.conversation_type,
    'subject',coalesce(v_conversation.subject,'Conversation'),
    'status',v_conversation.status,
    'version',v_conversation.version,
    'propertyId',v_conversation.property_id,
    'propertyName',v_property_name,
    'tenancyId',v_conversation.tenancy_id,
    'ownerEntityId',v_conversation.owner_entity_id,
    'audienceLabel',coalesce(v_audience_label,'Conversation participant'),
    'messages',v_messages,
    'updatedAt',v_conversation.updated_at
  );
end;
$$;
revoke all on function public.get_conversation_detail(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.get_conversation_detail(uuid) to authenticated;

commit;
