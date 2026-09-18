begin;

/*
 * Vendor management.
 *
 * `create_vendor` shipped in phase 6, but nothing could change a vendor afterwards. A wrong phone
 * number, a contractor who stops working with the organization, a duplicate added in a hurry — every
 * one of those needed database access to correct, which is the same gap that made the first vendor
 * uncreatable before the directory existed.
 *
 * Two things are added here and nothing existing is altered:
 *
 *   * `public.update_vendor` — the one mutation command, mirroring `create_vendor` step for step.
 *   * `public.get_operator_vendor_management_workspace` — a read that returns vendors in EVERY
 *     status. The assignment path deliberately keeps using `get_operator_vendor_directory`, which
 *     filters to `status='active'`, so making a vendor inactive removes it from new work orders
 *     without hiding it from the people who have to manage it.
 *
 * Historical references are preserved by construction rather than by care: status is a column on the
 * vendor, work orders reference the vendor by id, and `work_orders.vendor_id` is `on delete restrict`.
 * Nothing here deletes a vendor, and the work-order projection joins `display_name` without filtering
 * on status, so a completed work order keeps naming its vendor after that vendor is archived.
 */

create or replace function public.update_vendor(
  p_organization_id uuid,
  p_vendor_id uuid,
  p_display_name text,
  p_email text,
  p_phone_e164 text,
  p_status text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_vendor public.vendors%rowtype;
  v_request_hash text;
  v_previous private.idempotency_records%rowtype;
  v_correlation_id uuid := gen_random_uuid();
  v_response jsonb;
begin
  if v_actor_id is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 8 and 200 then
    raise exception using errcode='23514',message='INVALID_IDEMPOTENCY_KEY';
  end if;
  if not private.has_unscoped_org_permission(p_organization_id,'maintenance.manage') then
    raise exception using errcode='42501',message='ORGANIZATION_SCOPE_DENIED';
  end if;
  if length(trim(coalesce(p_display_name,''))) not between 1 and 160 then
    raise exception using errcode='23514',message='INVALID_VENDOR_NAME';
  end if;
  if p_email is not null and p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception using errcode='23514',message='INVALID_VENDOR_EMAIL';
  end if;
  if p_phone_e164 is not null and p_phone_e164 !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception using errcode='23514',message='INVALID_VENDOR_PHONE';
  end if;
  if p_status is null or p_status not in ('active','inactive','archived') then
    raise exception using errcode='23514',message='INVALID_VENDOR_STATUS';
  end if;

  -- Scoped by organization as well as id. A vendor id from another organization is simply not found
  -- here, so a cross-organization write cannot be distinguished from a typo — which is the point.
  select * into v_vendor from public.vendors v
  where v.id=p_vendor_id and v.organization_id=p_organization_id;
  if not found then raise exception using errcode='P0002',message='VENDOR_NOT_FOUND'; end if;

  v_request_hash := encode(sha256(convert_to(concat_ws('|',p_organization_id,p_vendor_id,trim(p_display_name),coalesce(p_email,''),coalesce(p_phone_e164,''),p_status),'UTF8')),'hex');
  select * into v_previous from private.idempotency_records r
  where r.organization_id=p_organization_id and r.actor_user_id=v_actor_id
    and r.route='UpdateVendor' and r.idempotency_key=p_idempotency_key;
  if found then
    if v_previous.request_hash<>v_request_hash then raise exception using errcode='23505',message='IDEMPOTENCY_CONFLICT'; end if;
    if v_previous.state='completed' then return v_previous.response_body; end if;
    raise exception using errcode='40001',message='COMMAND_IN_PROGRESS';
  end if;

  insert into private.idempotency_records(organization_id,actor_user_id,route,idempotency_key,request_hash,expires_at)
  values (p_organization_id,v_actor_id,'UpdateVendor',p_idempotency_key,v_request_hash,now()+interval '24 hours');

  -- A full replacement of the mutable fields rather than a partial merge: with a merge, a null email
  -- means both "leave it alone" and "clear it", and the caller cannot say which it meant.
  update public.vendors
  set display_name=trim(p_display_name), email=p_email, phone_e164=p_phone_e164, status=p_status
  where id=p_vendor_id and organization_id=p_organization_id;

  insert into audit.audit_events(organization_id,actor_user_id,actor_type,action_code,resource_type,resource_id,correlation_id,before_data,after_data)
  values (p_organization_id,v_actor_id,'user','vendor.updated','vendor',p_vendor_id,v_correlation_id,
    jsonb_build_object('displayName',v_vendor.display_name,'email',v_vendor.email,'phoneE164',v_vendor.phone_e164,'status',v_vendor.status),
    jsonb_build_object('displayName',trim(p_display_name),'email',p_email,'phoneE164',p_phone_e164,'status',p_status));
  insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
  values (p_organization_id,'vendor.updated','vendor',p_vendor_id,v_correlation_id,
    jsonb_build_object('vendorId',p_vendor_id,'status',p_status));

  v_response := jsonb_build_object(
    'vendorId',p_vendor_id,'displayName',trim(p_display_name),'email',p_email,'phoneE164',p_phone_e164,'status',p_status
  );
  update private.idempotency_records r
  set state='completed',response_status=200,response_body=v_response,resource_type='vendor',resource_id=p_vendor_id,completed_at=now()
  where r.organization_id=p_organization_id and r.actor_user_id=v_actor_id
    and r.route='UpdateVendor' and r.idempotency_key=p_idempotency_key;
  return v_response;
end;
$$;
revoke all on function public.update_vendor(uuid,uuid,text,text,text,text,text) from public,anon;
grant execute on function public.update_vendor(uuid,uuid,text,text,text,text,text) to authenticated;

create or replace function public.get_operator_vendor_management_workspace()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'vendorId',v.id,
    'displayName',v.display_name,
    'email',v.email,
    'phoneE164',v.phone_e164,
    'status',v.status,
    'createdAt',v.created_at,
    -- Usage context, so the operator can see what archiving would leave behind before they do it.
    'workOrderCount',(select count(*) from public.work_orders w where w.vendor_id=v.id),
    'openWorkOrderCount',(select count(*) from public.work_orders w where w.vendor_id=v.id and w.status not in ('closed','canceled')),
    'lastAssignedAt',(select max(w.created_at) from public.work_orders w where w.vendor_id=v.id),
    -- Read access reaches further than write access, so the surface is told which one it has rather
    -- than inferring it from the fact that the list rendered.
    'canManage',private.has_unscoped_org_permission(v.organization_id,'maintenance.manage')
  ) order by v.display_name),'[]'::jsonb)
  from public.vendors v
  where private.has_unscoped_org_permission(v.organization_id,'maintenance.read')
     or private.has_unscoped_org_permission(v.organization_id,'maintenance.manage')
$$;
-- Never granted to `authenticated`, unlike its organization-scoped wrapper below. This is a
-- COLLECTION surface: it takes no organization and so returns every vendor the caller can see across
-- every organization they belong to. That union is the defect the phase-8 contract release
-- (`migrations-contract/20260828130000`) closed on the other operator collection surfaces, and the
-- reason it needed a separate release was a compatibility window — the deployed fetchers still called
-- them with no arguments. This function is new, nothing calls it unscoped, and so it can simply be born
-- closed. The wrapper is `security definer` and therefore still reaches it.
revoke all on function public.get_operator_vendor_management_workspace() from public,anon,authenticated;

create or replace function public.get_operator_vendor_management_workspace(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.enter_organization_context(p_organization_id);
  return public.get_operator_vendor_management_workspace();
end;
$$;
revoke all on function public.get_operator_vendor_management_workspace(uuid) from public,anon;
grant execute on function public.get_operator_vendor_management_workspace(uuid) to authenticated;

commit;
