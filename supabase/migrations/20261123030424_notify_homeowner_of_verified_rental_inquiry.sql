-- Deploy the message_rental_inquiry_received worker template before applying this expansion.
begin;

create function private.enqueue_verified_rental_inquiry_notification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into private.notification_jobs (
    organization_id,template_code,locale,channel,recipient_user_id,payload,idempotency_key
  )
  select new.organization_id,'message_rental_inquiry_received',
    case when p.locale in ('en-US','en-CA','es-MX','fr-CA') then p.locale else 'en-US' end,'email',m.user_id,
    jsonb_build_object('unitId',new.unit_id,'inquiryReference',new.public_reference),
    'rental-inquiry-landlord:'||new.id::text||':'||m.user_id::text
  from public.rental_listings l
  join public.organizations o on o.id=l.organization_id
  join public.organization_memberships m on m.organization_id=o.id and m.role_code='org_owner'
  join public.role_definitions rd on rd.code=m.role_code
  join public.profiles p on p.user_id=m.user_id and p.status='active'
  join auth.users u on u.id=m.user_id
  where l.id=new.listing_id and l.organization_id=new.organization_id
    and l.property_id=new.property_id and l.unit_id=new.unit_id
    and o.customer_path='self_managing' and o.status in ('trial','active')
    and m.status='active' and m.starts_at<=now() and (m.ends_at is null or m.ends_at>now())
    and u.email_confirmed_at is not null and nullif(btrim(u.email),'') is not null
    and exists (
      select 1 from public.role_permissions rp where rp.role_code=m.role_code
        and rp.permission_code in ('*','lease.manage','property.manage')
    )
    and (
      exists (
        select 1 from public.membership_property_scopes s
        where s.organization_id=m.organization_id and s.membership_id=m.id and s.property_id=new.property_id
      )
      or (
        rd.organization_wide_allowed and not exists (
          select 1 from public.membership_property_scopes s where s.membership_id=m.id
        )
      )
    )
  -- Prefer the listing's owner-publisher. Otherwise choose the earliest effective eligible owner.
  order by (m.user_id=l.created_by) desc nulls last,m.starts_at,m.created_at,m.id
  limit 1
  on conflict (channel,idempotency_key) do nothing;

  return new;
end;
$$;
revoke all on function private.enqueue_verified_rental_inquiry_notification() from public,anon,authenticated,service_role;

create trigger rental_inquiry_verified_notification
after update of status on public.rental_inquiries
for each row when (old.status='pending_verification' and new.status='open')
execute function private.enqueue_verified_rental_inquiry_notification();

commit;
