begin;

create or replace function private.capture_rental_application_requirements()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_requirements jsonb:=private.get_rental_listing_application_requirements(new.listing_id);
  v_policy private.rental_application_evidence_policies%rowtype;
begin
  if v_requirements is null or v_requirements='null'::jsonb then return new; end if;
  if v_requirements->>'requirementsVersion' is distinct from nullif(current_setting('crecy.application_requirements_version',true),'') then
    raise exception using errcode='40001',message='APPLICATION_REQUIREMENTS_CHANGED';
  end if;
  insert into private.rental_application_requirement_snapshots(application_id,organization_id,requirements_version,requirements)
    values(new.id,new.organization_id,(v_requirements->>'requirementsVersion')::uuid,v_requirements);

  -- Older application servers and paused intake keep capturing the published criteria without
  -- creating a new sensitive packet. Existing packets have their own access and policy checks.
  if current_setting('crecy.application_document_intake',true) is distinct from 'on' then return new; end if;
  select p.* into v_policy from private.rental_application_evidence_policies p
    join public.organizations o on o.id=p.organization_id and o.status in ('trial','active')
    where p.organization_id=new.organization_id and p.property_id=new.property_id and p.enabled
      and p.approved_at<=now()
      and array(select jsonb_array_elements_text(v_requirements->'requiredDocumentTypes')) <@ p.allowed_document_types;
  if found then
    insert into private.rental_application_evidence_packets(application_id,organization_id,property_id,policy_id,reviewer_user_id,requirements)
      values(new.id,new.organization_id,new.property_id,v_policy.id,v_policy.reviewer_user_id,v_requirements);
  end if;
  return new;
end; $$;

create function public.submit_rental_application_with_document_intake(
  p_public_id uuid,p_first_name text,p_last_name text,p_email text,p_desired_move_in_on date,
  p_lease_term_text text,p_applicant_note text,p_network_hash text,p_locale text,p_idempotency_key text,p_requirements_version uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_previous text:=coalesce(current_setting('crecy.application_document_intake',true),'');
  v_result jsonb;
begin
  perform set_config('crecy.application_document_intake','on',true);
  v_result:=public.submit_rental_application_with_requirements(p_public_id,p_first_name,p_last_name,p_email,
    p_desired_move_in_on,p_lease_term_text,p_applicant_note,p_network_hash,p_locale,p_idempotency_key,p_requirements_version);
  perform set_config('crecy.application_document_intake',v_previous,true);
  return v_result;
end; $$;
revoke all on function public.submit_rental_application_with_document_intake(uuid,text,text,text,date,text,text,text,text,text,uuid)
  from public,anon,authenticated;
grant execute on function public.submit_rental_application_with_document_intake(uuid,text,text,text,date,text,text,text,text,text,uuid)
  to service_role;

create function public.get_rental_application_intake_status(p_organization_id uuid,p_unit_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare
  v_property_id uuid;
  v_types text[];
  v_requirements jsonb;
begin
  perform private.enter_organization_context(p_organization_id);
  select u.property_id into v_property_id from public.units u
    join public.organizations o on o.id=u.organization_id and o.status in ('trial','active')
    where u.id=p_unit_id and u.organization_id=p_organization_id
      and (private.has_property_access(u.property_id,'property.manage') or private.has_property_access(u.property_id,'lease.manage'));
  if not found then return null; end if;

  select p.allowed_document_types into v_types from private.rental_application_evidence_policies p
    where p.organization_id=p_organization_id and p.property_id=v_property_id and p.enabled and p.approved_at<=now();
  if not found then return 'no_policy'; end if;

  select private.get_rental_listing_application_requirements(l.id) into v_requirements
    from public.rental_listings l where l.organization_id=p_organization_id and l.unit_id=p_unit_id
      and l.property_id=v_property_id and l.status in ('draft','published','paused');
  if v_requirements is null or v_requirements='null'::jsonb then return 'needs_requirements'; end if;
  if not array(select jsonb_array_elements_text(v_requirements->'requiredDocumentTypes')) <@ v_types then return 'outside_policy'; end if;
  return 'policy_ready';
end; $$;
revoke all on function public.get_rental_application_intake_status(uuid,uuid) from public,anon,service_role;
grant execute on function public.get_rental_application_intake_status(uuid,uuid) to authenticated;

commit;
