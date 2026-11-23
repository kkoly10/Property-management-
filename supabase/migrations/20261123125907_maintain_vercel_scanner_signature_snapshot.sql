begin;

create table private.vercel_scanner_snapshot (
  singleton boolean primary key default true check (singleton),
  snapshot_id text check (snapshot_id ~ '^snap_[A-Za-z0-9_-]{1,180}$'),
  signatures_published_at timestamptz,
  expires_at timestamptz,
  refresh_claim_id uuid,
  refresh_claim_until timestamptz,
  refresh_available_at timestamptz not null default '-infinity',
  check ((snapshot_id is null) = (signatures_published_at is null)),
  check ((snapshot_id is null) = (expires_at is null)),
  check ((refresh_claim_id is null) = (refresh_claim_until is null))
);
alter table private.vercel_scanner_snapshot enable row level security;
revoke all on table private.vercel_scanner_snapshot from public,anon,authenticated,service_role;

create function public.get_current_vercel_scanner_snapshot()
returns text language sql stable security definer set search_path=''
as $$
  select s.snapshot_id from private.vercel_scanner_snapshot s
  where s.singleton and s.expires_at>now()+interval '2 minutes'
    and s.signatures_published_at between now()-interval '3 days' and now()+interval '5 minutes';
$$;

create function public.claim_vercel_scanner_snapshot_refresh(p_claim_id uuid,p_seed_snapshot_id text)
returns text language plpgsql security definer set search_path=''
as $$
declare v_source text;
begin
  if p_claim_id is null or p_seed_snapshot_id is null or p_seed_snapshot_id !~ '^snap_[A-Za-z0-9_-]{1,180}$' then
    raise exception using errcode='22023',message='INVALID_SCANNER_REFRESH_REQUEST';
  end if;
  insert into private.vercel_scanner_snapshot(singleton) values(true) on conflict do nothing;
  update private.vercel_scanner_snapshot s set refresh_claim_id=p_claim_id,
    refresh_claim_until=now()+interval '10 minutes',refresh_available_at=now()+interval '6 hours'
  where s.singleton and s.refresh_available_at<=now()
    and (s.refresh_claim_until is null or s.refresh_claim_until<=now())
    and (s.snapshot_id is null or s.signatures_published_at<now()-interval '36 hours'
      or s.expires_at<now()+interval '36 hours')
  returning case when s.expires_at>now()+interval '2 minutes' then s.snapshot_id else p_seed_snapshot_id end
  into v_source;
  return v_source;
end;
$$;

create function public.complete_vercel_scanner_snapshot_refresh(
  p_claim_id uuid,p_snapshot_id text,p_signatures_published_at timestamptz,p_expires_at timestamptz
) returns boolean language plpgsql security definer set search_path=''
as $$
begin
  if p_claim_id is null or p_snapshot_id is null or p_snapshot_id !~ '^snap_[A-Za-z0-9_-]{1,180}$'
    or p_signatures_published_at is null or p_signatures_published_at not between now()-interval '48 hours' and now()+interval '5 minutes'
    or p_expires_at is null or p_expires_at not between now()+interval '2 days' and now()+interval '8 days' then
    return false;
  end if;
  update private.vercel_scanner_snapshot s set snapshot_id=p_snapshot_id,
    signatures_published_at=p_signatures_published_at,expires_at=p_expires_at,
    refresh_claim_id=null,refresh_claim_until=null
  where s.singleton and s.refresh_claim_id=p_claim_id and s.refresh_claim_until>now()
    and (s.signatures_published_at is null or s.signatures_published_at<=p_signatures_published_at);
  return found;
end;
$$;

revoke all on function public.get_current_vercel_scanner_snapshot(),
  public.claim_vercel_scanner_snapshot_refresh(uuid,text),
  public.complete_vercel_scanner_snapshot_refresh(uuid,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.get_current_vercel_scanner_snapshot(),
  public.claim_vercel_scanner_snapshot_refresh(uuid,text),
  public.complete_vercel_scanner_snapshot_refresh(uuid,text,timestamptz,timestamptz) to service_role;

commit;
