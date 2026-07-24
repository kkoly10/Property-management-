begin;

-- Owners and operators consume bounded RPC DTOs. RLS remains as defense in
-- depth, but the exposed roles cannot select the base financial record.
revoke all on table public.owner_remittance_records
  from public,anon,authenticated,service_role;

commit;
