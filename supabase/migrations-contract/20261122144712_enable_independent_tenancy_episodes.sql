-- Apply only after the episode-aware app is verified. Old writes identify a unit
-- rather than its specific draft or receipt and cannot safely address history.
begin;

revoke execute on function public.save_homeowner_lease_setup(uuid,uuid,integer,jsonb,uuid)
  from public,anon,authenticated,service_role;
revoke execute on function public.activate_homeowner_lease_setup(uuid,uuid,integer,boolean,boolean)
  from public,anon,authenticated,service_role;

do $$
declare v_legacy_constraint name;
begin
  select conname into strict v_legacy_constraint from pg_constraint
    where conrelid='private.homeowner_lease_setups'::regclass and contype='u'
      and pg_get_constraintdef(oid)='UNIQUE (organization_id, actor_user_id, unit_id)';
  execute format('alter table private.homeowner_lease_setups drop constraint %I',v_legacy_constraint);
end;
$$;

drop index public.tenancies_unit_active_unique;

commit;
