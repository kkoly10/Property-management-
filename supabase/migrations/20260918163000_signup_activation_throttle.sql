begin;

-- Public signup now uses Supabase's admin generateLink + Crecy/Resend so customer-facing confirmation
-- mail is not constrained by Supabase's development-only built-in mailer. Because admin endpoints do
-- not inherit the public /auth/v1/signup rate-limit boundary, preserve that abuse control here.
--
-- Only digests are stored: no raw email address or IP. This is throttling state, not customer data.
create table if not exists private.signup_rate_limits (
  scope text not null check (scope in ('email','ip')),
  key_hash text not null check (key_hash ~ '^[a-f0-9]{64}$'),
  window_start timestamptz not null,
  attempt_count integer not null default 1 check (attempt_count > 0),
  expires_at timestamptz not null,
  primary key (scope, key_hash, window_start)
);

create index if not exists signup_rate_limits_expiry_idx
  on private.signup_rate_limits (expires_at);

revoke all on table private.signup_rate_limits from public, anon, authenticated, service_role;

create or replace function public.claim_public_signup_attempt(
  p_email_hash text,
  p_ip_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_email_window timestamptz;
  v_ip_window timestamptz;
  v_email_count integer;
  v_ip_count integer := 0;
begin
  if p_email_hash is null or p_email_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'INVALID_SIGNUP_RATE_KEY';
  end if;
  if p_ip_hash is not null and p_ip_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'INVALID_SIGNUP_RATE_KEY';
  end if;

  -- Three attempts per normalized email per ten-minute window. This limits harassment of one address
  -- without making a legitimate typo/retry impossible.
  v_email_window := date_trunc('hour', v_now)
    + floor(extract(minute from v_now) / 10) * interval '10 minutes';

  insert into private.signup_rate_limits(scope,key_hash,window_start,attempt_count,expires_at)
  values ('email',p_email_hash,v_email_window,1,v_email_window + interval '20 minutes')
  on conflict (scope,key_hash,window_start)
  do update set attempt_count = private.signup_rate_limits.attempt_count + 1
  returning attempt_count into v_email_count;

  -- Thirty attempts per observed source per hour. If the deployment cannot provide a trustworthy
  -- source address, email throttling still applies and this dimension is deliberately skipped.
  if p_ip_hash is not null then
    v_ip_window := date_trunc('hour', v_now);
    insert into private.signup_rate_limits(scope,key_hash,window_start,attempt_count,expires_at)
    values ('ip',p_ip_hash,v_ip_window,1,v_ip_window + interval '2 hours')
    on conflict (scope,key_hash,window_start)
    do update set attempt_count = private.signup_rate_limits.attempt_count + 1
    returning attempt_count into v_ip_count;
  end if;

  -- Opportunistic bounded cleanup. Old rows are not security evidence and need no retention.
  delete from private.signup_rate_limits
  where expires_at < v_now
    and ctid in (
      select ctid from private.signup_rate_limits
      where expires_at < v_now
      order by expires_at
      limit 200
    );

  return jsonb_build_object(
    'allowed', v_email_count <= 3 and (p_ip_hash is null or v_ip_count <= 30)
  );
end;
$$;

revoke all on function public.claim_public_signup_attempt(text,text)
  from public, anon, authenticated;
grant execute on function public.claim_public_signup_attempt(text,text)
  to service_role;

commit;
