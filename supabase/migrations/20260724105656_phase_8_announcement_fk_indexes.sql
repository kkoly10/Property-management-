begin;

create index announcements_organization_property_fk_idx
  on public.announcements(organization_id,property_id)
  where property_id is not null;

create index announcement_deliveries_organization_announcement_fk_idx
  on public.announcement_deliveries(organization_id,announcement_id);

commit;
