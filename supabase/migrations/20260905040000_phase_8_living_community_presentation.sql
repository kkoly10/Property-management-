-- Crecy Living community presentation.
--
-- Public community identity is intentionally separated from resident/tenancy data.
-- A community subdomain may reveal only the fields in the public profile RPC; it
-- is never an authorization grant and never exposes residents, leases, balances,
-- private documents, vendor data, owner data, or internal operator notes.
begin;

create table public.living_community_profiles (
  property_id uuid primary key,
  organization_id uuid not null,
  subdomain citext not null,
  display_name text not null check (length(trim(display_name)) between 1 and 160),
  public_address_text text check (public_address_text is null or length(trim(public_address_text)) between 1 and 300),
  headline text check (headline is null or length(trim(headline)) between 1 and 160),
  leasing_email citext check (leasing_email is null or length(trim(leasing_email::text)) between 3 and 254),
  leasing_phone_e164 text check (leasing_phone_e164 is null or leasing_phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  office_hours_text text[] not null default '{}',
  amenities text[] not null default '{}',
  hero_image_url text,
  lobby_image_url text,
  courtyard_image_url text,
  model_home_image_url text,
  public_notice_title text check (public_notice_title is null or length(trim(public_notice_title)) between 1 and 160),
  public_notice_body text check (public_notice_body is null or length(trim(public_notice_body)) between 1 and 2000),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete restrict,
  version integer not null default 1 check (version > 0),
  unique (organization_id,property_id),
  unique (subdomain),
  foreign key (organization_id,property_id)
    references public.properties(organization_id,id) on delete restrict,
  check (subdomain::text = lower(subdomain::text)),
  check (subdomain::text ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$'),
  check (subdomain::text not in (
    'www','app','owner','vendor','admin','api','platform','mail','auth','static','assets','cdn','internal'
  )),
  check ((status='published') = (published_at is not null)),
  check (cardinality(office_hours_text) <= 14),
  check (cardinality(amenities) <= 24),
  check (hero_image_url is null or (
    length(hero_image_url) between 1 and 2048
    and (hero_image_url like '/media/%' or hero_image_url ~ '^https://')
  )),
  check (lobby_image_url is null or (
    length(lobby_image_url) between 1 and 2048
    and (lobby_image_url like '/media/%' or lobby_image_url ~ '^https://')
  )),
  check (courtyard_image_url is null or (
    length(courtyard_image_url) between 1 and 2048
    and (courtyard_image_url like '/media/%' or courtyard_image_url ~ '^https://')
  )),
  check (model_home_image_url is null or (
    length(model_home_image_url) between 1 and 2048
    and (model_home_image_url like '/media/%' or model_home_image_url ~ '^https://')
  ))
);

create index living_community_profiles_org_status_idx
  on public.living_community_profiles(organization_id,status);
create index living_community_profiles_property_status_idx
  on public.living_community_profiles(property_id,status);

create trigger living_community_profiles_touch
before update on public.living_community_profiles
for each row execute function private.touch_updated_at();

alter table public.living_community_profiles enable row level security;

create policy living_community_profiles_operator_read
on public.living_community_profiles
for select to authenticated
using (
  (select private.has_property_access(property_id,'property.read'))
  or (select private.has_property_access(property_id,'property.manage'))
);

revoke all on public.living_community_profiles from public,anon,authenticated;
grant select on public.living_community_profiles to authenticated;

-- The only anonymous contract. It returns public presentation fields and no
-- internal identifiers other than propertyId, which is already a public
-- presentation referent and confers no authorization.
create or replace function public.get_public_living_community_profile(p_subdomain text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p.id is null then null
    else jsonb_build_object(
      'propertyId',p.property_id,
      'subdomain',p.subdomain::text,
      'displayName',p.display_name,
      'publicAddressText',p.public_address_text,
      'headline',p.headline,
      'leasingEmail',p.leasing_email::text,
      'leasingPhoneE164',p.leasing_phone_e164,
      'officeHours',to_jsonb(p.office_hours_text),
      'amenities',to_jsonb(p.amenities),
      'heroImageUrl',p.hero_image_url,
      'lobbyImageUrl',p.lobby_image_url,
      'courtyardImageUrl',p.courtyard_image_url,
      'modelHomeImageUrl',p.model_home_image_url,
      'publicNoticeTitle',p.public_notice_title,
      'publicNoticeBody',p.public_notice_body
    )
  end
  from (select 1) seed
  left join public.living_community_profiles p
    on p.subdomain=lower(trim(p_subdomain))::citext
   and p.status='published'
  limit 1;
$$;

revoke all on function public.get_public_living_community_profile(text) from public;
grant execute on function public.get_public_living_community_profile(text) to anon,authenticated;

-- Authenticated residents receive the same public-safe projection, plus the
-- tenancy id needed to match a presentation to one of their own active homes.
create or replace function public.get_resident_living_community_profiles()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with scoped as (
    select distinct
      t.id as tenancy_id,
      cp.property_id,
      cp.subdomain,
      cp.display_name,
      cp.public_address_text,
      cp.headline,
      cp.leasing_email,
      cp.leasing_phone_e164,
      cp.office_hours_text,
      cp.amenities,
      cp.hero_image_url,
      cp.lobby_image_url,
      cp.courtyard_image_url,
      cp.model_home_image_url,
      cp.public_notice_title,
      cp.public_notice_body
    from public.user_relationships ur
    join public.household_members hm
      on hm.organization_id=ur.organization_id
     and hm.person_id=ur.relationship_id
     and hm.starts_on<=current_date
     and (hm.ends_on is null or hm.ends_on>=current_date)
    join public.tenancies t
      on t.organization_id=hm.organization_id
     and t.household_id=hm.household_id
     and t.status in ('scheduled','active','notice_given','move_out_in_progress')
    join public.living_community_profiles cp
      on cp.organization_id=t.organization_id
     and cp.property_id=t.property_id
     and cp.status='published'
    where ur.user_id=(select auth.uid())
      and ur.relationship_type='resident_person'
      and ur.status='active'
  )
  select jsonb_build_object(
    'items',
    coalesce(jsonb_agg(jsonb_build_object(
      'tenancyId',tenancy_id,
      'propertyId',property_id,
      'subdomain',subdomain::text,
      'displayName',display_name,
      'publicAddressText',public_address_text,
      'headline',headline,
      'leasingEmail',leasing_email::text,
      'leasingPhoneE164',leasing_phone_e164,
      'officeHours',to_jsonb(office_hours_text),
      'amenities',to_jsonb(amenities),
      'heroImageUrl',hero_image_url,
      'lobbyImageUrl',lobby_image_url,
      'courtyardImageUrl',courtyard_image_url,
      'modelHomeImageUrl',model_home_image_url,
      'publicNoticeTitle',public_notice_title,
      'publicNoticeBody',public_notice_body
    ) order by display_name,tenancy_id),'[]'::jsonb)
  )
  from scoped;
$$;

revoke all on function public.get_resident_living_community_profiles() from public,anon;
grant execute on function public.get_resident_living_community_profiles() to authenticated;

commit;
