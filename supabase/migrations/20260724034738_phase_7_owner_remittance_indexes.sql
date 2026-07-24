begin;

drop index public.owner_remittances_owner_paid_idx;
drop index public.owner_remittances_property_paid_idx;
drop index public.owner_remittances_statement_idx;
drop index public.owner_remittances_book_idx;
drop index public.owner_remittances_evidence_idx;

create index owner_remittances_org_owner_paid_idx
  on public.owner_remittance_records(
    organization_id,owner_entity_id,property_id,paid_on desc,recorded_at desc
  );
create index owner_remittances_org_property_paid_idx
  on public.owner_remittance_records(
    organization_id,property_id,paid_on desc,recorded_at desc
  );
create index owner_remittances_org_statement_idx
  on public.owner_remittance_records(organization_id,statement_snapshot_id);
create index owner_remittances_org_book_idx
  on public.owner_remittance_records(organization_id,accounting_book_id);
create index owner_remittances_org_evidence_idx
  on public.owner_remittance_records(organization_id,evidence_document_id);
create index owner_remittances_org_journal_idx
  on public.owner_remittance_records(organization_id,journal_transaction_id);
create index owner_remittances_recorded_by_idx
  on public.owner_remittance_records(recorded_by);

commit;
