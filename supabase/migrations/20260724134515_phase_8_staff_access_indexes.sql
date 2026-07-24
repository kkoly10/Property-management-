-- Advisor follow-up indexes for staff invitation foreign keys.
begin;

create index invitations_org_membership_idx
  on public.invitations(organization_id,membership_id)
  where membership_id is not null;
create index invitations_invited_by_idx
  on public.invitations(invited_by)
  where invited_by is not null;

commit;
