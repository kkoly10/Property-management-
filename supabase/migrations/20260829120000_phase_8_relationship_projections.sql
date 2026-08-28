-- v4.2 Batch A.1 — separate the relationship projection from the operator projection.
--
-- A3 left two collection RPCs executable by `authenticated` because residents and owners share them:
-- get_conversation_workspace() and get_privacy_request_workspace(). That was the right call for the
-- portals and the wrong outcome for operators, because both functions answer BOTH questions at once:
--
--   * get_conversation_workspace filters on private.can_access_conversation, which is
--     `is_conversation_participant OR is_conversation_operator`. The operator half is
--     organization-wide, so an operator calling the zero-argument form directly gets conversations
--     from EVERY organization they manage — exactly the union A3 exists to prevent, reachable by
--     invoking the older RPC instead of the scoped one.
--   * get_privacy_request_workspace scopes its organization picker on
--     `is_active_org_member(o.id) OR has an active relationship`. Same shape, same union.
--
-- Where one RPC answers two fundamentally different questions, the fix is two contracts, not a
-- narrower filter that has to be right for both. So:
--
--   * public.get_relationship_conversation_workspace()      — participant only. What a resident,
--     owner or vendor actually needs, and structurally incapable of unioning operator organizations.
--   * public.get_relationship_privacy_request_workspace()   — relationship organizations only.
--   * The organization-scoped operator forms already exist (added by A3).
--
-- The zero-argument originals are then revoked from `authenticated` by the CONTRACT release, once the
-- build that calls the split contracts is deployed.
--
-- Both bodies are the shipped definitions with exactly one predicate changed each; the diffs are in
-- the commit that introduced this file.
--
-- Authority: no table, no policy. Counts unchanged.
begin;

create or replace function public.get_relationship_conversation_workspace()
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
    and private.is_conversation_participant(c.id)
    and c.status<>'archived';
$$;
revoke all on function public.get_relationship_conversation_workspace() from public,anon;
grant execute on function public.get_relationship_conversation_workspace() to authenticated;

create or replace function public.get_relationship_privacy_request_workspace()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then jsonb_build_object(
      'authenticatorLevel','aal1',
      'organizations','[]'::jsonb,
      'items','[]'::jsonb
    )
    else jsonb_build_object(
      'authenticatorLevel',coalesce(auth.jwt()->>'aal','aal1'),
      'organizations',coalesce((
        select jsonb_agg(jsonb_build_object(
          'organizationId',scope.organization_id,
          'organizationName',scope.organization_name,
          'countryCode',scope.country_code
        ) order by scope.organization_name,scope.organization_id)
        from (
          select distinct o.id as organization_id,o.display_name as organization_name,
                 o.headquarters_country_code as country_code
          from public.organizations o
          where o.status not in ('closing','closed')
            and exists (
              select 1
              from public.user_relationships ur
              where ur.organization_id=o.id
                and ur.user_id=(select auth.uid())
                and ur.status='active'
            )
        ) scope
      ),'[]'::jsonb),
      'items',coalesce((
        select jsonb_agg(jsonb_build_object(
          'privacyRequestId',pr.id,
          'organizationId',pr.organization_id,
          'organizationName',o.display_name,
          'requestType',pr.request_type,
          'jurisdictionCode',pr.jurisdiction_code,
          'controllerRole',pr.controller_role,
          'status',pr.status,
          'identityVerificationStatus',pr.identity_verification_status,
          'submittedAt',pr.submitted_at,
          'dueAt',pr.due_at,
          'completedAt',pr.completed_at,
          'version',pr.version,
          'jobCount',(select count(*)::integer from private.privacy_request_jobs j where j.privacy_request_id=pr.id),
          'queuedJobCount',(select count(*)::integer from private.privacy_request_jobs j where j.privacy_request_id=pr.id and j.status='queued'),
          'blockedByHold',exists(
            select 1 from private.privacy_request_jobs j
            where j.privacy_request_id=pr.id and j.status='blocked_by_hold'
          ),
          'canVerify',pr.requester_user_id=(select auth.uid())
            and pr.identity_verification_status='pending'
            and pr.status='identity_verification',
          'canCancel',pr.status not in ('fulfilled','partially_fulfilled','denied','canceled')
        ) order by pr.created_at desc,pr.id desc)
        from (
          select visible.*
          from public.privacy_requests visible
          where visible.requester_user_id=(select auth.uid())
            or (
              visible.organization_id is not null
              and private.has_org_permission(visible.organization_id,'organization.manage')
            )
          order by visible.created_at desc,visible.id desc
          limit 100
        ) pr
        left join public.organizations o on o.id=pr.organization_id
      ),'[]'::jsonb)
    )
  end;
$$;
revoke all on function public.get_relationship_privacy_request_workspace() from public,anon;
grant execute on function public.get_relationship_privacy_request_workspace() to authenticated;

commit;
