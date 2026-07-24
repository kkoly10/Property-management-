begin;

-- The organization-qualified foreign keys below remain authoritative. These
-- single-column constraints are redundant and force duplicate covering indexes.
alter table public.owner_remittance_records
  drop constraint owner_remittance_records_accounting_book_id_fkey,
  drop constraint owner_remittance_records_owner_entity_id_fkey,
  drop constraint owner_remittance_records_property_id_fkey,
  drop constraint owner_remittance_records_statement_snapshot_id_fkey,
  drop constraint owner_remittance_records_journal_transaction_id_fkey,
  drop constraint owner_remittance_records_evidence_document_id_fkey;

commit;
