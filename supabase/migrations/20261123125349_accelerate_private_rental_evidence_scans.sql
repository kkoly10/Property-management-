begin;

create index rental_evidence_scan_live_leases_idx
  on private.rental_application_evidence_files(claim_until)
  where status='scanning';

-- Exact upload workers and the scheduled drain share the same admission limit. The
-- advisory lock serializes the short claim transactions, never the external scans.
create function public.claim_rental_evidence_scan_batch(p_claim_id uuid,p_limit integer,p_file_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_remaining integer;
  v_jobs jsonb;
begin
  if p_claim_id is null or p_limit is null or p_limit not between 1 and 3
    or (p_file_id is not null and p_limit<>1) then
    raise exception using errcode='22023',message='EVIDENCE_SCAN_CLAIM_INVALID';
  end if;
  if not pg_try_advisory_xact_lock(hashtextextended('crecy-rental-evidence-scan-admission',0)) then
    return '[]'::jsonb;
  end if;

  select least(p_limit,3-count(*)::integer) into v_remaining
  from private.rental_application_evidence_files f
  where f.status='scanning' and f.claim_until>now();
  if v_remaining<1 then return '[]'::jsonb; end if;

  with exhausted as (
    select f.id from private.rental_application_evidence_files f
    join private.rental_application_evidence_packets e
      on e.application_id=f.application_id and e.organization_id=f.organization_id
    join private.rental_application_evidence_policies p on p.id=e.policy_id and p.enabled
    join public.organizations o on o.id=e.organization_id and o.status in ('trial','active')
    where (p_file_id is null or f.id=p_file_id)
      and e.status in ('draft','changes_requested') and f.attempts>=4
      and ((f.status='quarantined' and f.next_scan_at<=now())
        or (f.status='scanning' and f.claim_until<=now()))
    order by f.next_scan_at,f.id limit p_limit for update of f skip locked
  )
  update private.rental_application_evidence_files f
  set status='rejected',claim_id=null,claim_until=null
  from exhausted x where f.id=x.id;

  with due as (
    select f.id from private.rental_application_evidence_files f
    join private.rental_application_evidence_packets e
      on e.application_id=f.application_id and e.organization_id=f.organization_id
    join private.rental_application_evidence_policies p on p.id=e.policy_id and p.enabled
    join public.organizations o on o.id=e.organization_id and o.status in ('trial','active')
    where (p_file_id is null or f.id=p_file_id)
      and e.status in ('draft','changes_requested') and f.attempts<4
      and ((f.status='quarantined' and f.next_scan_at<=now())
        or (f.status='scanning' and f.claim_until<=now()))
    order by f.next_scan_at,f.id limit v_remaining for update of f skip locked
  ), claimed as (
    update private.rental_application_evidence_files f
    set status='scanning',claim_id=p_claim_id,claim_until=now()+interval '3 minutes',attempts=f.attempts+1
    from due d where d.id=f.id returning f.id,f.object_key,f.sha256,f.size_bytes
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'objectKey',object_key,'sha256',sha256,'sizeBytes',size_bytes)),'[]'::jsonb)
  into v_jobs from claimed;
  return v_jobs;
end; $$;
revoke all on function public.claim_rental_evidence_scan_batch(uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.claim_rental_evidence_scan_batch(uuid,integer,uuid) to service_role;

-- An older deployment retains its original single descriptor or null and shares the new cap.
create or replace function public.claim_rental_evidence_scan(p_claim_id uuid) returns jsonb
language sql security definer set search_path='' as $$
  select public.claim_rental_evidence_scan_batch(p_claim_id,1)->0;
$$;

commit;
