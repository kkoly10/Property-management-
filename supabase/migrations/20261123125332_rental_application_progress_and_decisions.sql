begin;

-- Keep the same verified, exact-case capability. Terminal receipts omit contact and document fields.
-- Recovery and document access continue to use their separate, active-only RPCs.
create function public.get_rental_application_progress(p_access_token text,p_reference text)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('applicationReference',a.public_reference,'listingTitle',a.listing_title_snapshot,
    'status',case
      when e.status='declined' then 'declined'
      when a.status='closed' or e.status='closed' then 'closed'
      when a.status='lease_preparation' then 'lease_preparation'
      when e.status='draft' then 'evidence_pending'
      when e.status='changes_requested' then 'changes_requested'
      when e.status='selected' then 'selected'
      else 'submitted'
    end)
    || case when a.status='closed' or e.status in ('declined','closed') then '{}'::jsonb
      else jsonb_build_object('firstName',a.first_name,'lastName',a.last_name,'email',a.email,
        'desiredMoveInOn',a.desired_move_in_on,'leaseTermText',a.lease_term_text,
        'applicantNote',a.applicant_note,'rentAmountMinor',a.listing_rent_amount_minor,
        'currencyCode',a.currency_code,'version',a.version,
        'evidenceAvailable',coalesce(p.enabled and p.approved_at<=now() and o.status in ('trial','active'),false))
      end
  from private.rental_application_access x
  join public.rental_applications a on a.id=x.application_id and a.organization_id=x.organization_id
  join public.organizations o on o.id=a.organization_id
  left join private.rental_application_evidence_packets e on e.application_id=a.id and e.organization_id=a.organization_id
  left join private.rental_application_evidence_policies p on p.id=e.policy_id and p.organization_id=e.organization_id
  where p_reference ~ '^APP-[0-9A-F]{12}$' and a.public_reference=p_reference
    and p_access_token ~ '^[0-9a-f]{64}$' and x.token_hash=encode(sha256(convert_to(p_access_token,'UTF8')),'hex')
    and x.expires_at>now() and a.verified_at is not null and a.status in ('submitted','lease_preparation','closed')
$$;
revoke all on function public.get_rental_application_progress(text,text) from public,anon,authenticated;
grant execute on function public.get_rental_application_progress(text,text) to service_role;

-- Previously available credit material still counts after replacement or purging.
create function private.rental_evidence_requires_decision_notice(p_packet private.rental_application_evidence_packets)
returns boolean language sql stable set search_path='' as $$
  select p_packet.self_reported_credit_score is not null
    or (p_packet.requirements->'requiredDocumentTypes') ? 'credit_evidence'
    or exists(select 1 from private.rental_application_evidence_files f
      where f.organization_id=p_packet.organization_id and f.application_id=p_packet.application_id
        and f.document_type='credit_evidence' and f.status in ('clean','removed','purged'))
$$;
revoke all on function private.rental_evidence_requires_decision_notice(private.rental_application_evidence_packets)
  from public,anon,authenticated,service_role;

create or replace function private.guard_rental_application_evidence_transition()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='lease_preparation' then
    perform private.assert_rental_application_evidence_ready(new.organization_id,new.id);
  elsif new.status in ('withdrawn','closed','expired','converted') then
    if new.status='closed' and exists(select 1 from private.rental_application_evidence_packets e
      where e.application_id=new.id and e.organization_id=new.organization_id
        and e.status in ('submitted','changes_requested','selected')
        and private.rental_evidence_requires_decision_notice(e)) then
      raise exception using errcode='23514',message='EVIDENCE_CREDIT_DECISION_REQUIRES_APPROVED_NOTICE_WORKFLOW';
    end if;
    update private.rental_application_evidence_packets e set
      status=case when new.status='closed' and e.status='declined' then 'declined' else 'closed' end,
      updated_at=now(),
      version=case when new.status='closed' and e.status='declined' then e.version else e.version+1 end,
      purge_after=least(e.purge_after,now()+make_interval(days=>p.terminal_retention_days))
    from private.rental_application_evidence_policies p
    where e.application_id=new.id and e.organization_id=new.organization_id and p.id=e.policy_id;
  end if;
  return new;
end; $$;

create or replace function private.lock_reviewed_rental_evidence(p_organization_id uuid,p_application_id uuid,p_unit_id uuid)
returns private.rental_application_evidence_packets
language plpgsql security definer set search_path='' as $$
declare v_packet private.rental_application_evidence_packets%rowtype; v_actor uuid:=private.require_recent_rental_evidence_mfa();
begin
  perform private.enter_organization_context(p_organization_id);
  perform 1 from public.rental_applications a where a.id=p_application_id and a.organization_id=p_organization_id
    and a.unit_id=p_unit_id and a.status in ('submitted','lease_preparation','closed') for update;
  if not found then raise exception using errcode='42501',message='EVIDENCE_UNAVAILABLE'; end if;
  select e.* into v_packet from private.rental_application_evidence_packets e
    join public.rental_applications a on a.id=e.application_id and a.organization_id=e.organization_id
    join public.organizations o on o.id=e.organization_id and o.status in ('trial','active')
    join private.rental_application_evidence_policies p on p.id=e.policy_id and p.enabled and p.approved_at<=now()
    where e.application_id=p_application_id and e.organization_id=p_organization_id and a.unit_id=p_unit_id
      and (a.status in ('submitted','lease_preparation') or (a.status='closed' and e.status='declined'))
      and a.verified_at is not null
      and e.reviewer_user_id=v_actor and e.applicant_user_id is distinct from v_actor
      and private.has_property_access(e.property_id,'lease.manage') and e.status in ('submitted','changes_requested','selected','declined')
    for update of e;
  if not found then raise exception using errcode='42501',message='EVIDENCE_UNAVAILABLE'; end if;
  return v_packet;
end; $$;

create or replace function public.get_rental_application_evidence_review(p_organization_id uuid,p_application_id uuid,p_unit_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_packet private.rental_application_evidence_packets%rowtype; v_app public.rental_applications%rowtype;
begin
  v_packet:=private.lock_reviewed_rental_evidence(p_organization_id,p_application_id,p_unit_id);
  select * into strict v_app from public.rental_applications where id=v_packet.application_id;
  if v_packet.status in ('declined','changes_requested') then
    return jsonb_build_object('status',v_packet.status,'version',v_packet.version);
  end if;
  perform private.record_rental_evidence_event(v_packet,'rental_application.evidence_review_opened',false);
  return private.rental_evidence_packet_dto(v_packet)||jsonb_build_object('reference',v_app.public_reference,
    'creditDecisionRestricted',private.rental_evidence_requires_decision_notice(v_packet));
end; $$;

create or replace function public.get_rental_application_evidence_worklist(p_organization_id uuid,p_unit_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform private.enter_organization_context(p_organization_id);
  return (select coalesce(jsonb_agg(jsonb_build_object('applicationId',e.application_id,'status',e.status,
        'reviewer',e.reviewer_user_id=(select auth.uid()) and p.enabled and p.approved_at<=now()
          and private.has_property_access(e.property_id,'lease.manage'))), '[]'::jsonb)
    from private.rental_application_evidence_packets e
    join public.rental_applications a on a.id=e.application_id and a.organization_id=e.organization_id
    join private.rental_application_evidence_policies p on p.id=e.policy_id and p.organization_id=e.organization_id
    where a.organization_id=p_organization_id and a.unit_id=p_unit_id and a.verified_at is not null
      and (a.status in ('submitted','lease_preparation') or (a.status='closed' and e.status='declined'))
      and (private.has_property_access(e.property_id,'lease.manage')
        or private.has_property_access(e.property_id,'property.manage')));
end; $$;

create or replace function public.review_rental_application_evidence(p_organization_id uuid,p_application_id uuid,p_unit_id uuid,
  p_version integer,p_action text,p_document_types text[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_packet private.rental_application_evidence_packets%rowtype; v_policy private.rental_application_evidence_policies%rowtype;
  v_required_types text[]; v_event text; v_next text; v_app_version integer;
begin
  if p_action='decline' then
    -- Canonical lifecycle commands take the unit lock before the application and packet locks.
    perform private.require_recent_rental_evidence_mfa();
    perform private.enter_organization_context(p_organization_id);
    perform 1 from public.units u where u.organization_id=p_organization_id and u.id=p_unit_id
      and private.has_property_access(u.property_id,'lease.manage') for update;
    if not found then raise exception using errcode='42501',message='EVIDENCE_UNAVAILABLE'; end if;
  end if;
  v_packet:=private.lock_reviewed_rental_evidence(p_organization_id,p_application_id,p_unit_id);
  v_next:=case p_action when 'request_changes' then 'changes_requested' when 'select' then 'selected' when 'decline' then 'declined' end;
  if v_next is null or p_document_types is null or cardinality(p_document_types)>3 then
    raise exception using errcode='22023',message='EVIDENCE_REVIEW_INVALID';
  end if;
  if v_packet.status=v_next and v_packet.version=p_version+1 then
    if (v_next='changes_requested' and not (p_document_types <@ v_packet.requested_document_types and v_packet.requested_document_types <@ p_document_types))
      or (v_next='selected' and not (p_document_types <@ v_packet.reviewed_document_types and v_packet.reviewed_document_types <@ p_document_types)) then
      raise exception using errcode='40001',message='EVIDENCE_PACKET_CHANGED';
    end if;
    return jsonb_build_object('status',v_packet.status,'version',v_packet.version);
  end if;
  if v_packet.status<>'submitted' or v_packet.version is distinct from p_version then
    raise exception using errcode='40001',message='EVIDENCE_PACKET_CHANGED';
  end if;
  select * into strict v_policy from private.rental_application_evidence_policies where id=v_packet.policy_id;
  if not p_document_types <@ v_policy.allowed_document_types then
    raise exception using errcode='22023',message='EVIDENCE_REVIEW_INVALID';
  end if;
  v_required_types:=array(select jsonb_array_elements_text(v_packet.requirements->'requiredDocumentTypes'));
  if (p_action='select' and not v_required_types <@ p_document_types)
    or (p_action='request_changes' and cardinality(p_document_types)=0) then
    raise exception using errcode='23514',message='EVIDENCE_REVIEW_CHECKLIST_INCOMPLETE';
  end if;
  if p_action='decline' and private.rental_evidence_requires_decision_notice(v_packet) then
    raise exception using errcode='23514',message='EVIDENCE_CREDIT_DECISION_REQUIRES_APPROVED_NOTICE_WORKFLOW';
  end if;
  if v_next='changes_requested' then
    update private.rental_application_evidence_files f
    set status='removed',remove_after=now(),claim_id=null,claim_until=null
    where f.organization_id=v_packet.organization_id and f.application_id=v_packet.application_id
      and f.document_type=any(p_document_types) and f.status not in ('removed','purged');
  end if;
  update private.rental_application_evidence_packets e set status=v_next,version=e.version+1,updated_at=now(),
    reviewed_version=case when v_next='selected' then e.version+1 end,
    reviewed_document_types=case when v_next='selected' then p_document_types else '{}'::text[] end,
    requested_document_types=case when v_next='changes_requested' then p_document_types else '{}'::text[] end,
    alternative_document_types=case when v_next='changes_requested'
      then array(select unnest(e.alternative_document_types) except select unnest(p_document_types))
      else e.alternative_document_types end,
    purge_after=case when v_next='declined' then now()+make_interval(days=>v_policy.terminal_retention_days) else e.purge_after end
  where e.application_id=v_packet.application_id returning * into v_packet;
  v_event:=case when v_next='changes_requested' then 'rental_application.evidence_changes_requested'
    else 'rental_application.evidence_review_completed' end;
  perform private.record_rental_evidence_event(v_packet,v_event,true);
  if v_next='declined' then
    select a.version into strict v_app_version from public.rental_applications a
    where a.id=v_packet.application_id and a.organization_id=v_packet.organization_id;
    perform public.close_rental_application(p_organization_id,p_application_id,v_app_version,
      'EvidenceDecline:'||p_application_id::text||':'||p_version::text);
  end if;
  return jsonb_build_object('status',v_packet.status,'version',v_packet.version);
end; $$;

-- Earlier releases could record the review decision without closing its application.
-- Align those existing outcomes without replaying notices for historical decisions.
with reconciled as (
  update public.rental_applications a set status='closed',closed_at=e.updated_at,updated_at=now(),version=a.version+1
  from private.rental_application_evidence_packets e
  where e.application_id=a.id and e.organization_id=a.organization_id
    and a.status='submitted' and a.verified_at is not null and e.status='declined'
  returning a.organization_id,a.public_reference
)
update private.notification_jobs j set status='canceled',last_error='APPLICATION_ENDED'
from reconciled a
where j.organization_id=a.organization_id and j.status='queued'
  and j.template_code in ('message_rental_application_received','message_rental_application_updated',
    'rental_application_received','rental_application_changes_requested','rental_application_lease_preparing')
  and j.payload->>'applicationReference'=a.public_reference;

commit;
