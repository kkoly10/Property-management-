begin;

create function private.pause_listing_for_executed_application_agreement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  paused public.rental_listings%rowtype;
  signer uuid;
begin
  -- Use the exact verified application's listing. An executed renewal or an unrelated
  -- agreement on the same unit must not touch its current listing.
  select agreement.closed_by into signer
  from private.rental_agreements agreement
  where agreement.id=new.aggregate_id and agreement.organization_id=new.organization_id
    and agreement.status='executed';
  if not found then return new; end if;

  update public.rental_listings listing
  set status='paused',version=listing.version+1,updated_at=now(),updated_by=signer
  from private.rental_agreement_application_links link
  join private.rental_agreements agreement on agreement.id=link.agreement_id
    and agreement.organization_id=link.organization_id
  join public.rental_applications application on application.id=link.application_id
    and application.organization_id=link.organization_id and application.unit_id=agreement.unit_id
  where link.agreement_id=new.aggregate_id and link.organization_id=new.organization_id
    and listing.id=application.listing_id and listing.organization_id=application.organization_id
    and listing.unit_id=application.unit_id and listing.property_id=application.property_id
    and application.verified_at is not null and listing.status='published'
  returning listing.* into paused;

  if found then
    insert into audit.audit_events(
      organization_id,actor_type,action_code,resource_type,resource_id,correlation_id,after_data
    ) values (
      paused.organization_id,'system','rental_listing.status_changed','rental_listing',paused.id,
      new.correlation_id,jsonb_build_object('status','paused','visibility',paused.visibility,
        'version',paused.version,'reason','application_lease_executed','agreementId',new.aggregate_id)
    );
    insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
    values (
      paused.organization_id,'rental_listing.status_changed','rental_listing',paused.id,new.correlation_id,
      jsonb_build_object('listingId',paused.id,'status','paused','version',paused.version)
    );
  end if;
  return new;
end;
$$;
revoke all on function private.pause_listing_for_executed_application_agreement() from public,anon,authenticated,service_role;

create trigger pause_listing_for_executed_application_agreement
after insert on private.outbox_events
for each row when (new.event_type='rental_agreement.executed' and new.aggregate_type='rental_agreement')
execute function private.pause_listing_for_executed_application_agreement();

commit;
