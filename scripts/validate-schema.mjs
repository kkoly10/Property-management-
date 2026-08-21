import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const root = resolve(import.meta.dirname, "..");
const foundationSql = await readFile(resolve(root, "supabase/migrations/20260720095008_phase_1_foundation.sql"), "utf8");
const portfolioSql = await readFile(resolve(root, "supabase/migrations/20260720104921_phase_2_portfolio_foundation.sql"), "utf8");
const documentsSql = await readFile(resolve(root, "supabase/migrations/20260720113426_phase_2_document_ingestion.sql"), "utf8");
const importsSql = await readFile(resolve(root, "supabase/migrations/20260720121643_phase_2_portfolio_imports.sql"), "utf8");
const leasingSql = await readFile(resolve(root, "supabase/migrations/20260720130951_phase_3_existing_lease.sql"), "utf8");
const financeSql = await readFile(resolve(root, "supabase/migrations/20260720144109_phase_4_recurring_charges.sql"), "utf8");
const manualPaymentsSql = await readFile(resolve(root, "supabase/migrations/20260720150956_phase_4_manual_payments.sql"), "utf8");
const contractCorrectionsSql = await readFile(resolve(root, "supabase/migrations/20260722095618_v4_1_1_contract_corrections.sql"), "utf8");
const paymentCorrectionsSql = await readFile(resolve(root, "supabase/migrations/20260722125015_phase_4_payment_corrections.sql"), "utf8");
const stripeOnboardingSql = await readFile(resolve(root, "supabase/migrations/20260722133026_phase_5_stripe_onboarding.sql"), "utf8");
const residentPaymentSessionSql = await readFile(resolve(root, "supabase/migrations/20260722135623_phase_5_resident_payment_session.sql"), "utf8");
const stripeWebhookSql = await readFile(resolve(root, "supabase/migrations/20260722150749_phase_5_stripe_webhook.sql"), "utf8");
const providerRefundsSql = await readFile(resolve(root, "supabase/migrations/20260722154358_phase_5_provider_refunds.sql"), "utf8");
const paymentDisputesSql = await readFile(resolve(root, "supabase/migrations/20260722161627_phase_5_payment_disputes.sql"), "utf8");
const settlementReconciliationSql = await readFile(resolve(root, "supabase/migrations/20260722182753_phase_5_settlement_reconciliation.sql"), "utf8");
const paymentFailureRetrySql = await readFile(resolve(root, "supabase/migrations/20260722193025_phase_5_payment_failure_retry.sql"), "utf8");
const maintenanceIntakeSql = await readFile(resolve(root, "supabase/migrations/20260722201220_phase_6_maintenance_intake.sql"), "utf8");
const workOrdersSql = await readFile(resolve(root, "supabase/migrations/20260723090000_phase_6_work_orders.sql"), "utf8");
const ownerApprovalsSql = await readFile(resolve(root, "supabase/migrations/20260724005718_phase_7_owner_approvals.sql"), "utf8");
const ownerStatementsSql = await readFile(resolve(root, "supabase/migrations/20260724022357_phase_7_owner_statements.sql"), "utf8");
const ownerRemittancesSql = await readFile(resolve(root, "supabase/migrations/20260724032417_phase_7_owner_remittances.sql"), "utf8");
const ownerRemittanceIndexesSql = await readFile(resolve(root, "supabase/migrations/20260724034738_phase_7_owner_remittance_indexes.sql"), "utf8");
const ownerRemittanceConstraintsSql = await readFile(resolve(root, "supabase/migrations/20260724034902_phase_7_owner_remittance_constraints.sql"), "utf8");
const ownerRemittanceProjectionSql = await readFile(resolve(root, "supabase/migrations/20260724035033_phase_7_owner_remittance_projection_only.sql"), "utf8");
const conversationMessagingSql = await readFile(resolve(root, "supabase/migrations/20260724042027_phase_8_conversation_messaging.sql"), "utf8");
const conversationMessagingIndexesSql = await readFile(resolve(root, "supabase/migrations/20260724042144_phase_8_messaging_fk_indexes.sql"), "utf8");
const announcementsSql = await readFile(resolve(root, "supabase/migrations/20260724105606_phase_8_announcements.sql"), "utf8");
const announcementIndexesSql = await readFile(resolve(root, "supabase/migrations/20260724105656_phase_8_announcement_fk_indexes.sql"), "utf8");
const privacyRequestsSql = await readFile(resolve(root, "supabase/migrations/20260724123342_phase_8_privacy_requests.sql"), "utf8");
const staffAccessSql = await readFile(resolve(root, "supabase/migrations/20260724134409_phase_8_staff_access.sql"), "utf8");
const staffAccessIndexesSql = await readFile(resolve(root, "supabase/migrations/20260724134515_phase_8_staff_access_indexes.sql"), "utf8");
const notificationPreferencesSql = await readFile(resolve(root, "supabase/migrations/20260724141225_phase_8_notification_preferences.sql"), "utf8");
const operatorCommandCenterSql = await readFile(resolve(root, "supabase/migrations/20260724145515_phase_8_operator_command_center.sql"), "utf8");
const operatorGlobalSearchSql = await readFile(resolve(root, "supabase/migrations/20260724235523_phase_8_operator_global_search.sql"), "utf8");
const relationshipInvitationsSql = await readFile(resolve(root, "supabase/migrations/20260725090000_phase_8_relationship_invitations.sql"), "utf8");
const maintenanceCostSql = await readFile(resolve(root, "supabase/migrations/20260725100000_phase_6_maintenance_cost.sql"), "utf8");
const reconciliationResolutionSql = await readFile(resolve(root, "supabase/migrations/20260725110000_phase_5_reconciliation_resolution.sql"), "utf8");
const receivableWriteOffSql = await readFile(resolve(root, "supabase/migrations/20260725120000_phase_4_receivable_write_off.sql"), "utf8");
const ownerPortalInviteStateSql = await readFile(resolve(root, "supabase/migrations/20260725130000_phase_8_owner_portal_invite_state.sql"), "utf8");
const journalIdempotencyActorScopeSql = await readFile(resolve(root, "supabase/migrations/20260726090000_phase_4_journal_idempotency_actor_scope.sql"), "utf8");
const platformControlPlaneSql = await readFile(resolve(root, "supabase/migrations/20260726100000_phase_8_platform_control_plane_foundation.sql"), "utf8");
const documentDeliverySql = await readFile(resolve(root, "supabase/migrations/20260726110000_phase_2_document_delivery.sql"), "utf8");
const documentDeliveryRecipientReadSql = await readFile(resolve(root, "supabase/migrations/20260726120000_phase_2_document_delivery_recipient_read.sql"), "utf8");
const platformSupportQueriesSql = await readFile(resolve(root, "supabase/migrations/20260727100000_phase_8_platform_support_queries.sql"), "utf8");
const platformControlPlaneHardeningSql = await readFile(resolve(root, "supabase/migrations/20260727110000_phase_8_platform_control_plane_hardening.sql"), "utf8");
const occupiedLeaseImportSql = await readFile(resolve(root, "supabase/migrations/20260727120000_phase_3_occupied_lease_import.sql"), "utf8");
const notificationWorkerSql = await readFile(resolve(root, "supabase/migrations/20260728100000_phase_4_notification_worker.sql"), "utf8");
const documentDeliveryChannelsSql = await readFile(resolve(root, "supabase/migrations/20260728110000_phase_4_document_delivery_channels.sql"), "utf8");
const combinedImportSql = await readFile(resolve(root, "supabase/migrations/20260729100000_phase_3_combined_import.sql"), "utf8");
const residentBalanceImportSql = await readFile(resolve(root, "supabase/migrations/20260729110000_phase_3_resident_and_balance_imports.sql"), "utf8");
const xlsxSourceDocumentsSql = await readFile(resolve(root, "supabase/migrations/20260729120000_phase_3_xlsx_source_documents.sql"), "utf8");
const secureLinkRawTokenSql = await readFile(resolve(root, "supabase/migrations/20260729130000_phase_4_secure_link_raw_token.sql"), "utf8");
const authoritySql = await readFile(resolve(root, "docs/crecy-v4/12_P0_EXECUTABLE_SCHEMA.sql"), "utf8");
const rlsMarkdown = await readFile(resolve(root, "docs/crecy-v4/13_P0_RLS_POLICIES_AND_TEST_MATRIX.md"), "utf8");
const rlsSql = rlsMarkdown.match(/```sql\s*([\s\S]*?)```/)?.[1];

if (!rlsSql) throw new Error("The authoritative RLS SQL fence is missing.");

function createDatabase() {
  return new PGlite({ extensions: { citext, pgcrypto } });
}

async function prepareSupabasePrelude(db) {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    create schema auth;
    create table auth.users (
      id uuid primary key,
      email text,
      email_confirmed_at timestamptz,
      created_at timestamptz not null default now(),
      raw_user_meta_data jsonb not null default '{}'::jsonb
    );
    create or replace function auth.uid()
    returns uuid
    language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create or replace function auth.jwt()
    returns jsonb
    language sql stable
    as $$ select jsonb_build_object(
      'sub',nullif(current_setting('request.jwt.claim.sub', true), ''),
      'aal',coalesce(nullif(current_setting('request.jwt.claim.aal', true), ''),'aal1')
    ) $$;
    create schema storage;
    create table storage.buckets (
      id text primary key,
      name text not null,
      public boolean not null default false,
      file_size_limit bigint,
      allowed_mime_types text[]
    );
    create table storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text not null references storage.buckets(id),
      name text not null,
      owner_id text,
      created_at timestamptz not null default now(),
      unique(bucket_id,name)
    );
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated;
    grant select,insert,update,delete on storage.objects to authenticated;
  `);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function expectDatabaseError(action, expectedMessage) {
  try {
    await action();
  } catch (error) {
    if (error.message.includes(expectedMessage)) return;
    throw error;
  }
  throw new Error(`Expected database error: ${expectedMessage}`);
}

async function validateAuthority() {
  assert(!/grant[^;]+reporting\.(owner_lease_summaries|owner_maintenance_summaries|vendor_work_order_assignments|resident_work_order_statuses)/i.test(authoritySql), "File 12 grants a view that is created only by file 13.");
  assert(rlsMarkdown.includes("| RLS-031 |"), "The mandatory v4.1.1 RLS matrix does not reach RLS-031.");
  const db = createDatabase();
  await prepareSupabasePrelude(db);
  await db.exec(authoritySql);
  await db.exec(rlsSql);
  const tableResult = await db.query(`select count(*)::integer as count from information_schema.tables where table_schema in ('public','private','audit','reporting')`);
  const policyResult = await db.query(`select count(*)::integer as count from pg_policies where schemaname in ('public','reporting')`);
  assert(tableResult.rows[0].count === 76, "Authority schema table count changed unexpectedly.");
  assert(policyResult.rows[0].count === 59, "Authority RLS policy count changed unexpectedly.");

  const admin = "d0000000-0000-4000-8000-000000000001";
  const ownerA = "d0000000-0000-4000-8000-000000000002";
  const ownerB = "d0000000-0000-4000-8000-000000000003";
  const resident = "d0000000-0000-4000-8000-000000000004";
  const scopedManager = "d0000000-0000-4000-8000-000000000005";
  const org = "d1000000-0000-4000-8000-000000000001";
  const entity = "d2000000-0000-4000-8000-000000000001";
  const book = "d3000000-0000-4000-8000-000000000001";
  const propertyA = "d4000000-0000-4000-8000-000000000001";
  const propertyB = "d4000000-0000-4000-8000-000000000002";
  const unitA = "d5000000-0000-4000-8000-000000000001";
  const ownerEntityA = "d6000000-0000-4000-8000-000000000001";
  const ownerEntityB = "d6000000-0000-4000-8000-000000000002";
  const tenancy = "dd000000-0000-4000-8000-000000000001";
  const announcementA = "e0000000-0000-4000-8000-000000000001";
  const announcementB = "e0000000-0000-4000-8000-000000000002";
  await db.exec(`
    insert into auth.users(id) values ('${admin}'),('${ownerA}'),('${ownerB}'),('${resident}'),('${scopedManager}');
    insert into public.organizations(id,display_name,slug,headquarters_country_code,default_time_zone,customer_path,status,created_by)
    values ('${org}','Authority Atlas','authority-atlas','US','America/New_York','property_manager','active','${admin}');
    insert into public.operating_entities(id,organization_id,legal_name,display_name,country_code,entity_type,status,created_by)
    values ('${entity}','${org}','Authority Atlas LLC','Authority Atlas','US','company','active','${admin}');
    insert into public.accounting_books(id,organization_id,operating_entity_id,name,functional_currency_code,status,created_by)
    values ('${book}','${org}','${entity}','Operating book','USD','open','${admin}');
    insert into public.properties(id,organization_id,operating_entity_id,accounting_book_id,country_profile_id,name,property_type,country_code,locality,postal_code,address_line1,time_zone,status,created_by)
    values
      ('${propertyA}','${org}','${entity}','${book}',(select id from public.country_profiles where code='US_NATIONAL'),'Maple Court','multifamily','US','Richmond','23220','100 Main Street','America/New_York','active','${admin}'),
      ('${propertyB}','${org}','${entity}','${book}',(select id from public.country_profiles where code='US_NATIONAL'),'Oak Court','multifamily','US','Richmond','23221','200 Main Street','America/New_York','active','${admin}');
    insert into public.units(id,organization_id,property_id,unit_code,unit_type) values ('${unitA}','${org}','${propertyA}','101','Apartment');
    insert into public.organization_memberships(id,organization_id,user_id,role_code,status)
    values ('e4000000-0000-4000-8000-000000000001','${org}','${scopedManager}','property_manager','active');
    insert into public.membership_property_scopes(organization_id,membership_id,property_id)
    values ('${org}','e4000000-0000-4000-8000-000000000001','${propertyA}');

    insert into public.owner_entities(id,organization_id,display_name,entity_type) values
      ('${ownerEntityA}','${org}','Owner A LLC','company'),('${ownerEntityB}','${org}','Owner B LLC','company');
    insert into public.ownership_interests(id,organization_id,property_id,owner_entity_id,ownership_fraction,effective_from) values
      ('d7000000-0000-4000-8000-000000000001','${org}','${propertyA}','${ownerEntityA}',0.5,'2026-01-01'),
      ('d7000000-0000-4000-8000-000000000002','${org}','${propertyA}','${ownerEntityB}',0.5,'2026-01-01');
    insert into public.user_relationships(user_id,organization_id,relationship_type,relationship_id,status) values
      ('${ownerA}','${org}','owner_entity','${ownerEntityA}','active'),('${ownerB}','${org}','owner_entity','${ownerEntityB}','active');
    insert into reporting.owner_statement_snapshots(id,organization_id,accounting_book_id,owner_entity_id,property_id,period_start,period_end,currency_code,income_minor,expense_minor,net_owner_position_minor,snapshot_data,finalized_at,finalized_by,sha256_hex) values
      ('d8000000-0000-4000-8000-000000000001','${org}','${book}','${ownerEntityA}','${propertyA}','2026-06-01','2026-06-30','USD',100000,10000,90000,'{}',now(),'${admin}','${"c".repeat(64)}'),
      ('d8000000-0000-4000-8000-000000000002','${org}','${book}','${ownerEntityB}','${propertyA}','2026-06-01','2026-06-30','USD',100000,10000,90000,'{}',now(),'${admin}','${"d".repeat(64)}');
    insert into public.owner_remittance_records(id,organization_id,owner_entity_id,property_id,amount_minor,currency_code,recorded_at,recorded_by) values
      ('d8100000-0000-4000-8000-000000000001','${org}','${ownerEntityA}','${propertyA}',90000,'USD',now(),'${admin}'),
      ('d8100000-0000-4000-8000-000000000002','${org}','${ownerEntityB}','${propertyA}',90000,'USD',now(),'${admin}');

    insert into public.people(id,organization_id,first_name,last_name,email) values ('d9000000-0000-4000-8000-000000000001','${org}','Avery','Morgan','avery@example.com');
    insert into public.households(id,organization_id,display_name,status) values ('da000000-0000-4000-8000-000000000001','${org}','Morgan household','resident');
    insert into public.household_members(organization_id,household_id,person_id,is_primary_contact,is_financially_responsible) values ('${org}','da000000-0000-4000-8000-000000000001','d9000000-0000-4000-8000-000000000001',true,true);
    insert into public.leases(id,organization_id,property_id,unit_id,household_id,country_profile_id,start_date,end_date,rent_amount_minor,currency_code,rent_frequency,status,created_by)
    values ('db000000-0000-4000-8000-000000000001','${org}','${propertyA}','${unitA}','da000000-0000-4000-8000-000000000001',(select id from public.country_profiles where code='US_NATIONAL'),'2026-01-01','2027-12-31',185000,'USD','monthly','active','${admin}');
    insert into public.receivable_accounts(id,organization_id,accounting_book_id,public_reference,currency_code) values ('dc000000-0000-4000-8000-000000000001','${org}','${book}','TEN-AUTH-001','USD');
    insert into public.tenancies(id,organization_id,property_id,unit_id,household_id,lease_id,receivable_account_id,possession_start,status)
    values ('${tenancy}','${org}','${propertyA}','${unitA}','da000000-0000-4000-8000-000000000001','db000000-0000-4000-8000-000000000001','dc000000-0000-4000-8000-000000000001','2026-01-01','active');
    insert into public.user_relationships(user_id,organization_id,relationship_type,relationship_id,status)
    values ('${resident}','${org}','resident_person','d9000000-0000-4000-8000-000000000001','active');
    insert into public.maintenance_requests(id,organization_id,property_id,unit_id,tenancy_id,reported_by_user_id,public_reference,category,title,description)
    values ('de000000-0000-4000-8000-000000000001','${org}','${propertyA}','${unitA}','${tenancy}','${resident}','MR-AUTH-001','plumbing','Leaking sink','Kitchen sink is leaking');
    insert into public.work_orders(id,organization_id,maintenance_request_id,property_id,unit_id,status,scope,estimated_cost_minor,actual_cost_minor,currency_code,owner_approval_required,owner_approval_status,created_by)
    values ('df000000-0000-4000-8000-000000000001','${org}','de000000-0000-4000-8000-000000000001','${propertyA}','${unitA}','assigned','Repair sink',25000,20000,'USD',true,'approved','${admin}');

    insert into public.announcements(id,organization_id,property_id,title,body_text,locale,audience_type,status,published_at,created_by) values
      ('${announcementA}','${org}','${propertyA}','Delivered notice','Water will be off','en-US','selected_tenancies','published',now(),'${admin}'),
      ('${announcementB}','${org}','${propertyA}','Undelivered notice','Private selected notice','en-US','selected_tenancies','published',now(),'${admin}');
    insert into public.announcement_deliveries(id,organization_id,announcement_id,recipient_user_id,recipient_relationship_type,recipient_relationship_id,delivery_status,delivered_at)
    values ('e1000000-0000-4000-8000-000000000001','${org}','${announcementA}','${resident}','resident_person','d9000000-0000-4000-8000-000000000001','delivered',now());

    insert into public.documents(id,organization_id,property_id,document_type,title,source,status,created_by) values
      ('e2000000-0000-4000-8000-000000000001','${org}','${propertyA}','import_source','Property A import','operator_supplied','active','${admin}'),
      ('e2000000-0000-4000-8000-000000000002','${org}','${propertyB}','import_source','Property B import','operator_supplied','active','${admin}');
    insert into public.import_jobs(id,organization_id,property_id,import_type,status,source_document_id,created_by) values
      ('e3000000-0000-4000-8000-000000000001','${org}','${propertyA}','documents','ready','e2000000-0000-4000-8000-000000000001','${admin}'),
      ('e3000000-0000-4000-8000-000000000002','${org}','${propertyB}','documents','ready','e2000000-0000-4000-8000-000000000002','${admin}');
    insert into public.organizations(id,display_name,slug,status,created_by) values ('d1000000-0000-4000-8000-000000000002','Other Authority Org','other-authority-org','active','${admin}');
    insert into public.owner_entities(id,organization_id,display_name,entity_type) values ('d6000000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000002','Cross-org owner','company');
  `);
  await expectDatabaseError(() => db.query(`insert into public.owner_remittance_records(organization_id,owner_entity_id,property_id,amount_minor,currency_code,recorded_at,recorded_by) values ('${org}','d6000000-0000-4000-8000-000000000003','${propertyA}',1,'USD',now(),'${admin}')`), "foreign key constraint");

  await db.exec(`set role authenticated; set request.jwt.claim.sub='${ownerA}'`);
  const ownerStatementRows = (await db.query("select count(*)::integer as count from reporting.owner_statement_snapshots")).rows[0].count;
  assert(ownerStatementRows === 1, "RLS-027 failed: a co-owner crossed the exact owner-entity statement boundary.");
  await expectDatabaseError(() => db.query("select count(*) from public.owner_remittance_records"), "permission denied");

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${resident}'`);
  const residentRows = await db.query(`select
    (select count(*)::integer from public.work_orders) as base_work_orders,
    (select count(*)::integer from reporting.resident_work_order_statuses) as projected_work_orders,
    (select count(*)::integer from public.announcements) as announcements`);
  assert(residentRows.rows[0].base_work_orders === 0 && residentRows.rows[0].projected_work_orders === 1, "RLS-028 failed: resident work-order data is not projection-only.");
  assert(residentRows.rows[0].announcements === 1, "RLS-029 failed: announcement access was not limited to explicit deliveries.");
  const residentProjectionColumns = await db.query(`select count(*)::integer as count from information_schema.columns where table_schema='reporting' and table_name='resident_work_order_statuses' and column_name in ('estimated_cost_minor','actual_cost_minor','completion_summary','owner_approval_status')`);
  assert(residentProjectionColumns.rows[0].count === 0, "Resident work-order projection exposes sensitive operational fields.");

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${scopedManager}'`);
  const scopedRows = await db.query(`select
    (select count(*)::integer from public.documents) as documents,
    (select count(*)::integer from public.import_jobs) as imports,
    (select count(*)::integer from public.properties) as properties`);
  assert(scopedRows.rows[0].documents === 1 && scopedRows.rows[0].imports === 1 && scopedRows.rows[0].properties === 1, "RLS-030 failed: property-scoped import or document data leaked.");

  await db.close();
  return { tables: tableResult.rows[0].count, policies: policyResult.rows[0].count, coOwnerRows: ownerStatementRows, residentWorkOrders: residentRows.rows[0].projected_work_orders, deliveredAnnouncements: residentRows.rows[0].announcements, scopedImports: scopedRows.rows[0].imports };
}

async function validateFoundation() {
  const db = createDatabase();
  await prepareSupabasePrelude(db);
  await db.exec(foundationSql);

  const userA = "00000000-0000-4000-8000-000000000001";
  const userB = "00000000-0000-4000-8000-000000000002";
  const userExpired = "00000000-0000-4000-8000-000000000003";
  await db.exec(`insert into auth.users(id) values ('${userA}'),('${userB}'),('${userExpired}')`);

  await db.exec(`set role authenticated; set request.jwt.claim.sub='${userA}'`);
  const createA = await db.query(`
    select public.create_organization(
      'Northstar','northstar','property_manager','US','en-US','America/New_York','2026-07-20','10000000-0000-4000-8000-000000000001'
    ) as result
  `);
  const organizationA = createA.rows[0].result.organizationId;

  const replayA = await db.query(`
    select public.create_organization(
      'Northstar','northstar','property_manager','US','en-US','America/New_York','2026-07-20','10000000-0000-4000-8000-000000000001'
    ) as result
  `);
  assert(replayA.rows[0].result.organizationId === organizationA, "Idempotent organization replay returned another resource.");

  await expectDatabaseError(
    () => db.query(`select public.create_organization('Changed','changed','property_manager','US','en-US','America/New_York','2026-07-20','10000000-0000-4000-8000-000000000001')`),
    "IDEMPOTENCY_CONFLICT",
  );

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${userB}'`);
  const createB = await db.query(`
    select public.create_organization(
      'Harbor','harbor','self_managing','CA','en-CA','America/Toronto','2026-07-20','20000000-0000-4000-8000-000000000002'
    ) as result
  `);
  const organizationB = createB.rows[0].result.organizationId;

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${userA}'`);
  const visibleOrganizations = await db.query(`select id from public.organizations order by id`);
  assert(visibleOrganizations.rows.length === 1 && visibleOrganizations.rows[0].id === organizationA, "RLS exposed another organization.");

  await expectDatabaseError(
    () => db.query(`select public.create_operating_entity_and_book('${organizationB}','Intruder LLC','Intruder','CA','company','CAD','Book','30000000-0000-4000-8000-000000000003')`),
    "PERMISSION_DENIED",
  );

  const entityResult = await db.query(`
    select public.create_operating_entity_and_book(
      '${organizationA}','Northstar Property Management LLC','Northstar PM','US','company','USD','Virginia operating book','40000000-0000-4000-8000-000000000004'
    ) as result
  `);
  assert(entityResult.rows[0].result.currencyCode === "USD", "Entity/book command returned the wrong currency.");

  await expectDatabaseError(
    () => db.query(`select public.create_operating_entity_and_book('${organizationA}','Wrong Currency LLC','Wrong Currency','US','company','CAD','Wrong','50000000-0000-4000-8000-000000000005')`),
    "CURRENCY_MISMATCH",
  );

  await db.exec(`
    reset role;
    insert into public.organization_memberships(organization_id,user_id,role_code,status,starts_at,ends_at)
    values ('${organizationB}','${userExpired}','read_only_auditor','active',now()-interval '2 days',now()-interval '1 day');
    set role authenticated;
    set request.jwt.claim.sub='${userExpired}';
  `);
  const expiredVisibility = await db.query(`select count(*)::integer as count from public.organizations where id='${organizationB}'`);
  assert(expiredVisibility.rows[0].count === 0, "Expired membership retained organization access.");

  await db.exec("reset role");
  const traces = await db.query(`
    select
      (select count(*)::integer from audit.audit_events) as audit_count,
      (select count(*)::integer from private.outbox_events) as outbox_count,
      (select count(*)::integer from private.idempotency_records where state='completed') as idempotency_count
  `);
  assert(traces.rows[0].audit_count === 3, "Expected one audit event per successful command.");
  assert(traces.rows[0].outbox_count === 3, "Expected one outbox event per successful command.");
  assert(traces.rows[0].idempotency_count === 3, "Expected completed idempotency records.");

  await db.close();
  return { organizations: 2, auditEvents: traces.rows[0].audit_count, outboxEvents: traces.rows[0].outbox_count };
}

async function validatePortfolio() {
  const db = createDatabase();
  await prepareSupabasePrelude(db);
  await db.exec(foundationSql);
  await db.exec(portfolioSql);

  const ownerA = "00000000-0000-4000-8000-000000000011";
  const ownerB = "00000000-0000-4000-8000-000000000012";
  const manager = "00000000-0000-4000-8000-000000000013";
  await db.exec(`insert into auth.users(id) values ('${ownerA}'),('${ownerB}'),('${manager}')`);

  await db.exec(`set role authenticated; set request.jwt.claim.sub='${ownerA}'`);
  const organizationAResult = await db.query(`select public.create_organization('Atlas','atlas','property_manager','US','en-US','America/New_York','2026-07-20','61000000-0000-4000-8000-000000000001') as result`);
  const organizationA = organizationAResult.rows[0].result.organizationId;
  const entityAResult = await db.query(`select public.create_operating_entity_and_book('${organizationA}','Atlas LLC','Atlas','US','company','USD','Operating book','62000000-0000-4000-8000-000000000002') as result`);
  const entityA = entityAResult.rows[0].result.operatingEntityId;
  const bookA = entityAResult.rows[0].result.accountingBookId;

  const propertyA1Result = await db.query(`
    select public.create_property('${organizationA}','${entityA}','${bookA}','US_NATIONAL','Maple Court','multifamily','100 Maple Street',null,'Richmond','VA','23220','US','America/New_York','63000000-0000-4000-8000-000000000003') as result
  `);
  const propertyA1 = propertyA1Result.rows[0].result.propertyId;
  const propertyA1Replay = await db.query(`
    select public.create_property('${organizationA}','${entityA}','${bookA}','US_NATIONAL','Maple Court','multifamily','100 Maple Street',null,'Richmond','VA','23220','US','America/New_York','63000000-0000-4000-8000-000000000003') as result
  `);
  assert(propertyA1Replay.rows[0].result.propertyId === propertyA1, "Property idempotency replay returned another resource.");

  const propertyA2Result = await db.query(`
    select public.create_property('${organizationA}','${entityA}','${bookA}','US_NATIONAL','Oak House','single_family','42 Oak Avenue',null,'Richmond','VA','23221','US','America/New_York','64000000-0000-4000-8000-000000000004') as result
  `);
  const propertyA2 = propertyA2Result.rows[0].result.propertyId;
  const firstUnit = await db.query(`select public.create_unit('${organizationA}','${propertyA1}',null,'101','Apartment',2,1,850,'65000000-0000-4000-8000-000000000005') as result`);
  assert(firstUnit.rows[0].result.activeUnitUsage === 1, "The first active unit did not meter as one.");

  await db.exec(`
    reset role;
    insert into public.organization_memberships(organization_id,user_id,role_code,status,starts_at)
    values ('${organizationA}','${manager}','property_manager','active',now()-interval '1 day');
    insert into public.membership_property_scopes(organization_id,membership_id,property_id)
    select '${organizationA}',id,'${propertyA1}' from public.organization_memberships where organization_id='${organizationA}' and user_id='${manager}';
    set role authenticated;
    set request.jwt.claim.sub='${manager}';
  `);
  const scopedProperties = await db.query(`select id from public.properties order by id`);
  assert(scopedProperties.rows.length === 1 && scopedProperties.rows[0].id === propertyA1, "Property-scoped manager saw an unassigned property.");
  await expectDatabaseError(
    () => db.query(`select public.create_unit('${organizationA}','${propertyA2}',null,'A','House',3,2,1400,'66000000-0000-4000-8000-000000000006')`),
    "PROPERTY_SCOPE_DENIED",
  );
  const scopedUnit = await db.query(`select public.create_unit('${organizationA}','${propertyA1}',null,'102','Apartment',1,1,650,'67000000-0000-4000-8000-000000000007') as result`);
  assert(scopedUnit.rows[0].result.activeUnitUsage === 2, "Scoped unit command returned the wrong active-unit usage.");

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${ownerB}'`);
  const organizationBResult = await db.query(`select public.create_organization('Beacon','beacon','self_managing','CA','en-CA','America/Toronto','2026-07-20','68000000-0000-4000-8000-000000000008') as result`);
  const organizationB = organizationBResult.rows[0].result.organizationId;
  const entityBResult = await db.query(`select public.create_operating_entity_and_book('${organizationB}','Beacon Inc','Beacon','CA','company','CAD','Operating book','69000000-0000-4000-8000-000000000009') as result`);
  const entityB = entityBResult.rows[0].result.operatingEntityId;
  const bookB = entityBResult.rows[0].result.accountingBookId;
  const propertyBResult = await db.query(`select public.create_property('${organizationB}','${entityB}','${bookB}','CA_NATIONAL','Harbour Home','single_family','10 King Street',null,'Toronto','ON','M5H 1A1','CA','America/Toronto','70000000-0000-4000-8000-000000000010') as result`);
  const propertyB = propertyBResult.rows[0].result.propertyId;

  await db.exec(`reset role; update public.organization_subscriptions set plan_code='free' where organization_id='${organizationB}'`);
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${ownerB}'`);
  await db.query(`select public.create_unit('${organizationB}','${propertyB}',null,'Main','House',3,2,1600,'71000000-0000-4000-8000-000000000011')`);
  await expectDatabaseError(
    () => db.query(`select public.create_unit('${organizationB}','${propertyB}',null,'Second','House',1,1,500,'72000000-0000-4000-8000-000000000012')`),
    "PLAN_LIMIT_EXCEEDED",
  );

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${ownerA}'`);
  const visibleToOwnerA = await db.query(`select id from public.properties order by id`);
  assert(visibleToOwnerA.rows.length === 2 && visibleToOwnerA.rows.every((row) => row.id !== propertyB), "RLS exposed another organization's property.");
  await expectDatabaseError(
    () => db.query(`select public.create_property('${organizationA}','${entityA}','${bookA}','CA_NATIONAL','Wrong Country','single_family','1 Error Road',null,'Richmond','VA','23220','US','America/New_York','73000000-0000-4000-8000-000000000013')`),
    "COUNTRY_PROFILE_MISMATCH",
  );

  await db.exec("reset role");
  await expectDatabaseError(
    () => db.exec(`insert into public.units(organization_id,property_id,unit_code) values ('${organizationB}','${propertyA1}','cross-org')`),
    "violates foreign key constraint",
  );
  const traces = await db.query(`
    select
      (select count(*)::integer from audit.audit_events where action_code='property.created') as property_audits,
      (select count(*)::integer from private.outbox_events where event_type='unit.created') as unit_events,
      (select count(*)::integer from public.usage_records where meter_code='active_units') as usage_records
  `);
  assert(traces.rows[0].property_audits === 3, "Expected one property audit per successful property command.");
  assert(traces.rows[0].unit_events === 3, "Expected one unit event per successful unit command.");
  assert(traces.rows[0].usage_records === 3, "Expected one usage record per successful unit command.");

  await db.close();
  return { properties: 3, units: 3, scopedManagerVisibleProperties: 1, enforcedFreeUnitLimit: 1 };
}

async function validateDocuments() {
  const db = createDatabase();
  await prepareSupabasePrelude(db);
  await db.exec(foundationSql);
  await db.exec(portfolioSql);
  await db.exec(documentsSql);

  const adminA = "00000000-0000-4000-8000-000000000021";
  const adminB = "00000000-0000-4000-8000-000000000022";
  const manager = "00000000-0000-4000-8000-000000000023";
  await db.exec(`insert into auth.users(id) values ('${adminA}'),('${adminB}'),('${manager}')`);

  await db.exec(`set role authenticated; set request.jwt.claim.sub='${adminA}'`);
  const orgAResult = await db.query(`select public.create_organization('Document A','document-a','property_manager','US','en-US','America/New_York','2026-07-20','81000000-0000-4000-8000-000000000001') as result`);
  const orgA = orgAResult.rows[0].result.organizationId;
  const entityAResult = await db.query(`select public.create_operating_entity_and_book('${orgA}','Document A LLC','Document A','US','company','USD','Operating book','82000000-0000-4000-8000-000000000002') as result`);
  const propertyAResult = await db.query(`select public.create_property('${orgA}','${entityAResult.rows[0].result.operatingEntityId}','${entityAResult.rows[0].result.accountingBookId}','US_NATIONAL','Secure House','single_family','1 Private Way',null,'Richmond','VA','23220','US','America/New_York','83000000-0000-4000-8000-000000000003') as result`);
  const propertyA = propertyAResult.rows[0].result.propertyId;

  const grantResult = await db.query(`select public.create_document_upload_grant(
    '${orgA}','property','${propertyA}','signed_lease','Secure House lease','lease.pdf','application/pdf',1024,
    '84000000-0000-4000-8000-000000000004'
  ) as result`);
  const grant = grantResult.rows[0].result;
  assert(grant.storagePath.startsWith(`organizations/${orgA}/property/${propertyA}/`), "Upload path did not use the scoped private layout.");
  const grantReplay = await db.query(`select public.create_document_upload_grant(
    '${orgA}','property','${propertyA}','signed_lease','Secure House lease','lease.pdf','application/pdf',1024,
    '84000000-0000-4000-8000-000000000004'
  ) as result`);
  assert(grantReplay.rows[0].result.grantId === grant.grantId, "Upload-grant idempotency replay returned another grant.");
  await expectDatabaseError(
    () => db.query(`select public.create_document_upload_grant('${orgA}','property','${propertyA}','bad','Bad','bad.html','text/html',100,'85000000-0000-4000-8000-000000000005')`),
    "MIME_TYPE_NOT_ALLOWED",
  );

  await db.exec(`insert into storage.objects(bucket_id,name,owner_id) values ('private-documents','${grant.storagePath}','${adminA}')`);
  const checksum = "a".repeat(64);
  await expectDatabaseError(
    () => db.query(`select public.finalize_document('${adminA}','${grant.grantId}','${checksum}','86000000-0000-4000-8000-000000000006')`),
    "permission denied for function finalize_document",
  );
  await db.exec("reset role; set role service_role");
  const finalized = await db.query(`select public.finalize_document('${adminA}','${grant.grantId}','${checksum}','86000000-0000-4000-8000-000000000006') as result`);
  assert(finalized.rows[0].result.scanStatus === "pending", "Finalized upload did not remain in scan quarantine.");
  const finalizedReplay = await db.query(`select public.finalize_document('${adminA}','${grant.grantId}','${checksum}','86000000-0000-4000-8000-000000000006') as result`);
  assert(finalizedReplay.rows[0].result.documentId === finalized.rows[0].result.documentId, "Finalize idempotency replay returned another document.");

  await db.exec(`
    reset role;
    insert into public.organization_memberships(organization_id,user_id,role_code,status,starts_at)
    values ('${orgA}','${manager}','property_manager','active',now()-interval '1 day');
    insert into public.membership_property_scopes(organization_id,membership_id,property_id)
    select '${orgA}',id,'${propertyA}' from public.organization_memberships where organization_id='${orgA}' and user_id='${manager}';
    set role authenticated; set request.jwt.claim.sub='${manager}';
  `);
  const scopedGrant = await db.query(`select public.create_document_upload_grant(
    '${orgA}','property','${propertyA}','property_record','Inspection','inspection.jpg','image/jpeg',2048,
    '87000000-0000-4000-8000-000000000007'
  ) as result`);
  assert(Boolean(scopedGrant.rows[0].result.grantId), "Property-scoped manager could not create a property upload grant.");
  await expectDatabaseError(
    () => db.query(`select public.create_document_upload_grant('${orgA}','organization','${orgA}','portfolio_import','Source','source.csv','text/csv',50,'88000000-0000-4000-8000-000000000008')`),
    "PARENT_SCOPE_DENIED",
  );

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${adminB}'`);
  const orgBResult = await db.query(`select public.create_organization('Document B','document-b','self_managing','CA','en-CA','America/Toronto','2026-07-20','89000000-0000-4000-8000-000000000009') as result`);
  const orgB = orgBResult.rows[0].result.organizationId;
  const invisibleDocuments = await db.query(`select count(*)::integer as count from public.documents where organization_id='${orgA}'`);
  assert(invisibleDocuments.rows[0].count === 0, "Document RLS exposed another organization's register.");
  await expectDatabaseError(
    () => db.exec(`insert into storage.objects(bucket_id,name,owner_id) values ('private-documents','${scopedGrant.rows[0].result.storagePath}','${adminB}')`),
    "violates row-level security policy",
  );
  await expectDatabaseError(
    () => db.query(`select public.create_document_upload_grant('${orgA}','property','${propertyA}','other','Intrusion','x.pdf','application/pdf',10,'90000000-0000-4000-8000-000000000010')`),
    "PARENT_SCOPE_DENIED",
  );

  await db.exec("reset role");
  const traces = await db.query(`select
    (select count(*)::integer from audit.audit_events where action_code='document.uploaded') as audits,
    (select count(*)::integer from private.outbox_events where event_type='document.uploaded') as events,
    (select count(*)::integer from public.document_versions where upload_status='quarantined') as quarantined
  `);
  assert(traces.rows[0].audits === 1 && traces.rows[0].events === 1, "Document finalization did not write audit and outbox traces.");
  assert(traces.rows[0].quarantined === 1, "Finalized document skipped quarantine.");

  await db.close();
  return { organizations: 2, verifiedUploads: 1, propertyScopedGrant: 1, quarantined: traces.rows[0].quarantined, isolatedOrganization: orgB };
}

async function validateImports() {
  const db = createDatabase();
  await prepareSupabasePrelude(db);
  await db.exec(foundationSql);
  await db.exec(portfolioSql);
  await db.exec(documentsSql);
  await db.exec(importsSql);

  const adminA = "00000000-0000-4000-8000-000000000031";
  const adminB = "00000000-0000-4000-8000-000000000032";
  const manager = "00000000-0000-4000-8000-000000000033";
  const sourceDocument = "91000000-0000-4000-8000-000000000001";
  const sourceVersion = "92000000-0000-4000-8000-000000000002";
  await db.exec(`insert into auth.users(id) values ('${adminA}'),('${adminB}'),('${manager}')`);

  await db.exec(`set role authenticated; set request.jwt.claim.sub='${adminA}'`);
  const orgResult = await db.query(`select public.create_organization('Import Atlas','import-atlas','property_manager','US','en-US','America/New_York','2026-07-20','93000000-0000-4000-8000-000000000003') as result`);
  const orgA = orgResult.rows[0].result.organizationId;
  await db.query(`select public.create_operating_entity_and_book('${orgA}','Import Atlas LLC','Import Atlas','US','company','USD','Operating book','94000000-0000-4000-8000-000000000004') as result`);

  await db.exec(`
    reset role;
    insert into public.documents(id,organization_id,document_type,title,source,status,operator_supplied_unverified,created_by)
    values ('${sourceDocument}','${orgA}','portfolio_import','Portfolio source','operator_supplied','active',true,'${adminA}');
    insert into public.document_versions(id,organization_id,document_id,version_number,storage_bucket,storage_path,mime_type,size_bytes,sha256_hex,original_filename,uploaded_by,upload_status)
    values ('${sourceVersion}','${orgA}','${sourceDocument}',1,'private-documents','organizations/${orgA}/organization/${orgA}/${sourceVersion}/portfolio.csv','text/csv',512,'${"b".repeat(64)}','portfolio.csv','${adminA}','clean');
    set role authenticated; set request.jwt.claim.sub='${adminA}';
  `);

  const headers = ["Property Name","Property Type","Address","City","State","Postal","Country","Time Zone","Unit","Unit Type","Beds","Baths","Sq Ft"];
  const rows = [
    { "Property Name":"Maple Court","Property Type":"multifamily","Address":"100 Maple Street","City":"Richmond","State":"VA","Postal":"23220","Country":"US","Time Zone":"America/New_York","Unit":"101","Unit Type":"Apartment","Beds":"2","Baths":"1","Sq Ft":"850" },
    { "Property Name":"Maple Court","Property Type":"multifamily","Address":"100 Maple Street","City":"Richmond","State":"VA","Postal":"23220","Country":"US","Time Zone":"America/New_York","Unit":"102","Unit Type":"Apartment","Beds":"1","Baths":"1","Sq Ft":"650" },
    { "Property Name":"Oak House","Property Type":"single_family","Address":"42 Oak Avenue","City":"Richmond","State":"VA","Postal":"23221","Country":"US","Time Zone":"America/New_York","Unit":"","Unit Type":"","Beds":"","Baths":"","Sq Ft":"" },
  ];
  const mapping = {
    propertyName:"Property Name",propertyType:"Property Type",addressLine1:"Address",locality:"City",
    subdivisionCode:"State",postalCode:"Postal",countryCode:"Country",timeZone:"Time Zone",
    unitCode:"Unit",unitType:"Unit Type",bedrooms:"Beds",bathrooms:"Baths",squareFeet:"Sq Ft",
  };
  const options = { dedupeMode:"strict",dateLocale:"en-US" };
  const createResult = await db.query(`select public.create_import_job('${orgA}','portfolio','${sourceDocument}','${sourceVersion}','${JSON.stringify(headers)}'::jsonb,'${JSON.stringify(rows)}'::jsonb,'95000000-0000-4000-8000-000000000005') as result`);
  const importJob = createResult.rows[0].result.importJobId;
  const createReplay = await db.query(`select public.create_import_job('${orgA}','portfolio','${sourceDocument}','${sourceVersion}','${JSON.stringify(headers)}'::jsonb,'${JSON.stringify(rows)}'::jsonb,'95000000-0000-4000-8000-000000000005') as result`);
  assert(createReplay.rows[0].result.importJobId === importJob, "Import creation replay returned another job.");

  const validation = await db.query(`select public.validate_portfolio_import('${importJob}','${JSON.stringify(mapping)}'::jsonb,'${JSON.stringify(options)}'::jsonb) as result`);
  assert(validation.rows[0].result.status === "ready", "Valid portfolio rows did not reach ready status.");
  assert(validation.rows[0].result.totals.creates === 4, "Validation did not deduplicate the repeated property resource.");
  const validationHash = validation.rows[0].result.validationHash;
  const committed = await db.query(`select public.commit_portfolio_import('${importJob}','${validationHash}') as result`);
  assert(committed.rows[0].result.committed.properties === 2 && committed.rows[0].result.committed.units === 2, "Atomic import committed the wrong resource counts.");
  const commitReplay = await db.query(`select public.commit_portfolio_import('${importJob}','${validationHash}') as result`);
  assert(commitReplay.rows[0].result.reportDocumentId === committed.rows[0].result.reportDocumentId, "Commit replay returned another report document.");
  await expectDatabaseError(() => db.query(`select public.commit_portfolio_import('${importJob}','${"c".repeat(64)}')`), "VALIDATION_HASH_CONFLICT");

  await db.exec(`
    reset role;
    insert into public.organization_memberships(organization_id,user_id,role_code,status,starts_at)
    values ('${orgA}','${manager}','property_manager','active',now()-interval '1 day');
    insert into public.membership_property_scopes(organization_id,membership_id,property_id)
    select '${orgA}',m.id,p.id from public.organization_memberships m cross join lateral (select id from public.properties where organization_id='${orgA}' order by created_at limit 1) p
    where m.organization_id='${orgA}' and m.user_id='${manager}';
    set role authenticated; set request.jwt.claim.sub='${manager}';
  `);
  await expectDatabaseError(
    () => db.query(`select public.create_import_job('${orgA}','portfolio','${sourceDocument}','${sourceVersion}','${JSON.stringify(headers)}'::jsonb,'${JSON.stringify(rows)}'::jsonb,'96000000-0000-4000-8000-000000000006')`),
    "PROPERTY_SCOPE_DENIED",
  );

  await db.exec(`reset role; update public.organization_subscriptions set plan_code='starter' where organization_id='${orgA}'; set role authenticated; set request.jwt.claim.sub='${adminA}'`);
  const tooManyRows = Array.from({ length: 9 }, (_, index) => ({ ...rows[0], Unit: String(201 + index) }));
  const limitedCreate = await db.query(`select public.create_import_job('${orgA}','portfolio','${sourceDocument}','${sourceVersion}','${JSON.stringify(headers)}'::jsonb,'${JSON.stringify(tooManyRows)}'::jsonb,'97000000-0000-4000-8000-000000000007') as result`);
  const limitedJob = limitedCreate.rows[0].result.importJobId;
  const limitedValidation = await db.query(`select public.validate_portfolio_import('${limitedJob}','${JSON.stringify(mapping)}'::jsonb,'${JSON.stringify(options)}'::jsonb) as result`);
  assert(limitedValidation.rows[0].result.status === "ready", "Limit test import did not validate.");
  const unitsBeforeFailure = await db.query(`select count(*)::integer as count from public.units where organization_id='${orgA}'`);
  const limitedCommit = await db.query(`select public.commit_portfolio_import('${limitedJob}','${limitedValidation.rows[0].result.validationHash}') as result`);
  const unitsAfterFailure = await db.query(`select count(*)::integer as count from public.units where organization_id='${orgA}'`);
  assert(limitedCommit.rows[0].result.status === "failed", "Plan-limit commit did not fail safely.");
  assert(unitsBeforeFailure.rows[0].count === unitsAfterFailure.rows[0].count, "Failed import left partially committed units.");

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${adminB}'`);
  const orgBResult = await db.query(`select public.create_organization('Import Beacon','import-beacon','self_managing','CA','en-CA','America/Toronto','2026-07-20','98000000-0000-4000-8000-000000000008') as result`);
  const orgB = orgBResult.rows[0].result.organizationId;
  const invisibleJobs = await db.query(`select count(*)::integer as count from public.import_jobs where organization_id='${orgA}'`);
  assert(invisibleJobs.rows[0].count === 0, "Import-job RLS exposed another organization's jobs.");
  await expectDatabaseError(() => db.query(`select public.get_import_job_detail('${importJob}')`), "IMPORT_NOT_FOUND");

  await db.exec("reset role");
  const traces = await db.query(`select
    (select count(*)::integer from audit.audit_events where action_code='import.created') as created_audits,
    (select count(*)::integer from private.outbox_events where event_type='import.validated') as validated_events,
    (select count(*)::integer from private.outbox_events where event_type='import.committed') as committed_events,
    (select count(*)::integer from private.outbox_events where event_type='import.failed') as failed_events
  `);
  assert(traces.rows[0].created_audits === 2 && traces.rows[0].validated_events === 2, "Import creation or validation traces are incomplete.");
  assert(traces.rows[0].committed_events === 1 && traces.rows[0].failed_events === 1, "Import completion/failure events are incomplete.");
  await db.close();
  return { organizations: 2, importedProperties: 2, importedUnits: 2, atomicLimitFailure: true, isolatedOrganization: orgB };
}

async function validateLeasing() {
  const db = createDatabase();
  await prepareSupabasePrelude(db);
  await db.exec(foundationSql);
  await db.exec(portfolioSql);
  await db.exec(documentsSql);
  await db.exec(leasingSql);

  const admin = "00000000-0000-4000-8000-000000000041";
  const scopedLeasingAgent = "00000000-0000-4000-8000-000000000042";
  const residentA = "00000000-0000-4000-8000-000000000043";
  const residentB = "00000000-0000-4000-8000-000000000044";
  const outsider = "00000000-0000-4000-8000-000000000045";
  await db.exec(`insert into auth.users(id) values ('${admin}'),('${scopedLeasingAgent}'),('${residentA}'),('${residentB}'),('${outsider}')`);

  await db.exec(`set role authenticated; set request.jwt.claim.sub='${admin}'`);
  const organizationResult = await db.query(`select public.create_organization('Lease Atlas','lease-atlas','property_manager','US','en-US','America/New_York','2026-07-20','a1000000-0000-4000-8000-000000000001') as result`);
  const organizationId = organizationResult.rows[0].result.organizationId;
  const entityResult = await db.query(`select public.create_operating_entity_and_book('${organizationId}','Lease Atlas LLC','Lease Atlas','US','company','USD','Virginia book','a2000000-0000-4000-8000-000000000002') as result`);
  const operatingEntityId = entityResult.rows[0].result.operatingEntityId;
  const accountingBookId = entityResult.rows[0].result.accountingBookId;
  const propertyResult = await db.query(`select public.create_property('${organizationId}','${operatingEntityId}','${accountingBookId}','US_NATIONAL','River House','multifamily','10 River Road',null,'Richmond','VA','23220','US','America/New_York','a3000000-0000-4000-8000-000000000003') as result`);
  const propertyId = propertyResult.rows[0].result.propertyId;
  const unitAResult = await db.query(`select public.create_unit('${organizationId}','${propertyId}',null,'101','Apartment',2,1,850,'a4000000-0000-4000-8000-000000000004') as result`);
  const unitA = unitAResult.rows[0].result.unitId;
  const unitBResult = await db.query(`select public.create_unit('${organizationId}','${propertyId}',null,'102','Apartment',1,1,650,'a5000000-0000-4000-8000-000000000005') as result`);
  const unitB = unitBResult.rows[0].result.unitId;

  const signedDocumentA = "a6000000-0000-4000-8000-000000000006";
  const signedVersionA = "a7000000-0000-4000-8000-000000000007";
  const signedDocumentB = "a8000000-0000-4000-8000-000000000008";
  const signedVersionB = "a9000000-0000-4000-8000-000000000009";
  const pendingDocument = "aa000000-0000-4000-8000-000000000010";
  const pendingVersion = "ab000000-0000-4000-8000-000000000011";
  const overlapDocument = "ac100000-0000-4000-8000-000000000011";
  const overlapVersion = "ac200000-0000-4000-8000-000000000011";
  await db.exec(`
    reset role;
    insert into public.documents(id,organization_id,property_id,unit_id,document_type,title,source,status,operator_supplied_unverified,created_by) values
      ('${signedDocumentA}','${organizationId}','${propertyId}','${unitA}','signed_lease','Unit 101 signed lease','operator_supplied','active',true,'${admin}'),
      ('${signedDocumentB}','${organizationId}','${propertyId}','${unitB}','signed_lease','Unit 102 signed lease','operator_supplied','active',true,'${admin}'),
      ('${pendingDocument}','${organizationId}','${propertyId}','${unitB}','signed_lease','Pending lease','operator_supplied','active',true,'${admin}'),
      ('${overlapDocument}','${organizationId}','${propertyId}','${unitA}','signed_lease','Overlapping lease','operator_supplied','active',true,'${admin}');
    insert into public.document_versions(id,organization_id,document_id,version_number,storage_bucket,storage_path,mime_type,size_bytes,sha256_hex,original_filename,uploaded_by,upload_status) values
      ('${signedVersionA}','${organizationId}','${signedDocumentA}',1,'private-documents','lease-a.pdf','application/pdf',100,'${"d".repeat(64)}','lease-a.pdf','${admin}','clean'),
      ('${signedVersionB}','${organizationId}','${signedDocumentB}',1,'private-documents','lease-b.pdf','application/pdf',100,'${"e".repeat(64)}','lease-b.pdf','${admin}','clean'),
      ('${pendingVersion}','${organizationId}','${pendingDocument}',1,'private-documents','pending.pdf','application/pdf',100,'${"f".repeat(64)}','pending.pdf','${admin}','quarantined'),
      ('${overlapVersion}','${organizationId}','${overlapDocument}',1,'private-documents','overlap.pdf','application/pdf',100,'${"1".repeat(64)}','overlap.pdf','${admin}','clean');
    set role authenticated; set request.jwt.claim.sub='${admin}';
  `);

  const householdA = { displayName: "Jordan Rivera household", members: [{ firstName: "Jordan", lastName: "Rivera", email: "jordan@example.com", phoneE164: "+12025550110", primaryContact: true, financiallyResponsible: true }] };
  const leaseA = { source: "operator_supplied", externalReference: "LEGACY-101", startDate: "2026-01-01", endDate: "2026-12-31", rentAmountMinor: 185000, currencyCode: "USD", rentFrequency: "monthly", signedDocumentId: signedDocumentA };
  const readyDocuments = await db.query(`select d.id from public.documents d where d.id='${signedDocumentA}' and d.organization_id='${organizationId}' and d.property_id='${propertyId}' and d.unit_id='${unitA}' and d.status='active' and d.tenancy_id is null and d.document_type in ('signed_lease','lease') and exists(select 1 from public.document_versions dv where dv.document_id=d.id and dv.organization_id=d.organization_id and dv.upload_status='clean')`);
  assert(readyDocuments.rows.length === 1, "The clean signed lease fixture is not visible to the activating operator.");
  const activation = await db.query(`select public.activate_existing_lease('${organizationId}','${propertyId}','${unitA}','${JSON.stringify(householdA)}'::jsonb,'${JSON.stringify(leaseA)}'::jsonb,42500,'2026-08-01','ac000000-0000-4000-8000-000000000012') as result`);
  const tenancyA = activation.rows[0].result.tenancyId;
  const replay = await db.query(`select public.activate_existing_lease('${organizationId}','${propertyId}','${unitA}','${JSON.stringify(householdA)}'::jsonb,'${JSON.stringify(leaseA)}'::jsonb,42500,'2026-08-01','ac000000-0000-4000-8000-000000000012') as result`);
  assert(replay.rows[0].result.tenancyId === tenancyA, "Lease activation replay returned another tenancy.");
  await expectDatabaseError(
    () => db.query(`select public.activate_existing_lease('${organizationId}','${propertyId}','${unitA}','${JSON.stringify({ ...householdA, displayName: "Changed" })}'::jsonb,'${JSON.stringify(leaseA)}'::jsonb,42500,'2026-08-01','ac000000-0000-4000-8000-000000000012')`),
    "IDEMPOTENCY_CONFLICT",
  );
  const balance = await db.query(`select sum(debit_minor)::integer as debits,sum(credit_minor)::integer as credits from public.journal_entries where tenancy_id='${tenancyA}'`);
  assert(balance.rows[0].debits === 42500 && balance.rows[0].credits === 42500, "Opening balance journal was not balanced.");
  const attached = await db.query(`select tenancy_id,operator_supplied_unverified from public.documents where id='${signedDocumentA}'`);
  assert(attached.rows[0].tenancy_id === tenancyA && attached.rows[0].operator_supplied_unverified, "Signed lease disclaimer or tenancy link was not retained.");

  const rowsBeforeOverlap = await db.query(`select count(*)::integer as people from public.people`);
  await expectDatabaseError(
    () => db.query(`select public.activate_existing_lease('${organizationId}','${propertyId}','${unitA}','${JSON.stringify({ displayName: "Overlap", members: [{ firstName: "Casey", lastName: "Lee", primaryContact: true, financiallyResponsible: true }] })}'::jsonb,'${JSON.stringify({ ...leaseA, signedDocumentId: overlapDocument })}'::jsonb,0,null,'ad000000-0000-4000-8000-000000000013')`),
    "TENANCY_OVERLAP",
  );
  const rowsAfterOverlap = await db.query(`select count(*)::integer as people from public.people`);
  assert(rowsAfterOverlap.rows[0].people === rowsBeforeOverlap.rows[0].people, "Rejected overlap left partial household rows.");
  await expectDatabaseError(
    () => db.query(`select public.activate_existing_lease('${organizationId}','${propertyId}','${unitB}','${JSON.stringify({ displayName: "No primary", members: [{ firstName: "A", lastName: "B", primaryContact: false, financiallyResponsible: true }] })}'::jsonb,'${JSON.stringify({ ...leaseA, signedDocumentId: signedDocumentB })}'::jsonb,0,null,'ae000000-0000-4000-8000-000000000014')`),
    "PRIMARY_CONTACT_REQUIRED",
  );
  await expectDatabaseError(
    () => db.query(`select public.activate_existing_lease('${organizationId}','${propertyId}','${unitB}','${JSON.stringify(householdA)}'::jsonb,'${JSON.stringify({ ...leaseA, currencyCode: "CAD", signedDocumentId: signedDocumentB })}'::jsonb,0,null,'af000000-0000-4000-8000-000000000015')`),
    "CURRENCY_MISMATCH",
  );
  await expectDatabaseError(
    () => db.query(`select public.activate_existing_lease('${organizationId}','${propertyId}','${unitB}','${JSON.stringify(householdA)}'::jsonb,'${JSON.stringify({ ...leaseA, signedDocumentId: pendingDocument })}'::jsonb,0,null,'b0000000-0000-4000-8000-000000000016')`),
    "SIGNED_DOCUMENT_NOT_READY",
  );

  await db.exec(`
    reset role;
    insert into public.organization_memberships(organization_id,user_id,role_code,status,starts_at)
    values ('${organizationId}','${scopedLeasingAgent}','leasing_agent','active',now()-interval '1 day');
    insert into public.membership_property_scopes(organization_id,membership_id,property_id)
    select '${organizationId}',id,'${propertyId}' from public.organization_memberships where organization_id='${organizationId}' and user_id='${scopedLeasingAgent}';
    set role authenticated; set request.jwt.claim.sub='${scopedLeasingAgent}';
  `);
  const householdB = { displayName: "Morgan Chen household", members: [{ firstName: "Morgan", lastName: "Chen", email: "morgan@example.com", primaryContact: true, financiallyResponsible: true }] };
  const leaseB = { ...leaseA, externalReference: "LEGACY-102", signedDocumentId: signedDocumentB };
  await expectDatabaseError(
    () => db.query(`select public.activate_existing_lease('${organizationId}','${propertyId}','${unitB}','${JSON.stringify(householdB)}'::jsonb,'${JSON.stringify(leaseB)}'::jsonb,1000,'2026-08-01','b1000000-0000-4000-8000-000000000017')`),
    "FINANCE_PERMISSION_REQUIRED",
  );
  const scopedActivation = await db.query(`select public.activate_existing_lease('${organizationId}','${propertyId}','${unitB}','${JSON.stringify(householdB)}'::jsonb,'${JSON.stringify(leaseB)}'::jsonb,0,'2026-08-01','b2000000-0000-4000-8000-000000000018') as result`);
  const tenancyB = scopedActivation.rows[0].result.tenancyId;

  await db.exec("reset role");
  const personAResult = await db.query(`select hm.person_id from public.household_members hm where hm.household_id='${activation.rows[0].result.householdId}' and hm.is_primary_contact`);
  const personBResult = await db.query(`select hm.person_id from public.household_members hm where hm.household_id='${scopedActivation.rows[0].result.householdId}' and hm.is_primary_contact`);
  await db.exec(`insert into public.user_relationships(user_id,organization_id,relationship_type,relationship_id,status) values
    ('${residentA}','${organizationId}','resident_person','${personAResult.rows[0].person_id}','active'),
    ('${residentB}','${organizationId}','resident_person','${personBResult.rows[0].person_id}','active')`);
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${residentA}'`);
  const residentVisibility = await db.query(`select
    (select count(*)::integer from public.tenancies) as tenancies,
    (select count(*)::integer from public.people) as people,
    (select count(*)::integer from public.leases) as leases,
    (select count(*)::integer from public.documents where document_type='signed_lease') as documents`);
  assert(residentVisibility.rows[0].tenancies === 1 && residentVisibility.rows[0].people === 1 && residentVisibility.rows[0].leases === 1 && residentVisibility.rows[0].documents === 1, `Resident RLS exposed another household or hid the resident's lease: ${JSON.stringify(residentVisibility.rows[0])}`);

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${outsider}'`);
  const outsiderVisibility = await db.query(`select count(*)::integer as count from public.tenancies`);
  assert(outsiderVisibility.rows[0].count === 0, "Unrelated user could read a tenancy.");
  await expectDatabaseError(
    () => db.query(`select public.activate_existing_lease('${organizationId}','${propertyId}','${unitB}','${JSON.stringify(householdB)}'::jsonb,'${JSON.stringify(leaseB)}'::jsonb,0,null,'b3000000-0000-4000-8000-000000000019')`),
    "PROPERTY_SCOPE_DENIED",
  );

  await db.exec("reset role");
  const traces = await db.query(`select
    (select count(*)::integer from private.outbox_events where event_type='lease.recorded') as leases,
    (select count(*)::integer from private.outbox_events where event_type='tenancy.activated') as tenancies,
    (select count(*)::integer from private.outbox_events where event_type='charge_schedule.created') as schedules,
    (select count(*)::integer from private.outbox_events where event_type='opening_balance.posted') as opening_balances
  `);
  assert(traces.rows[0].leases === 2 && traces.rows[0].tenancies === 2 && traces.rows[0].schedules === 2 && traces.rows[0].opening_balances === 1, "Lease activation audit/outbox traces are incomplete.");
  await db.close();
  return { activatedTenancies: 2, balancedOpeningBalance: true, residentVisibleTenancies: residentVisibility.rows[0].tenancies, isolatedTenancy: tenancyB };
}

async function validateRecurringCharges() {
  const db = createDatabase();
  await prepareSupabasePrelude(db);
  await db.exec(foundationSql);
  await db.exec(portfolioSql);
  await db.exec(documentsSql);
  await db.exec(importsSql);
  await db.exec(leasingSql);
  await db.exec(financeSql);
  await db.exec(manualPaymentsSql);
  await db.exec(contractCorrectionsSql);
  await db.exec(paymentCorrectionsSql);
  await db.exec(stripeOnboardingSql);
  await db.exec(residentPaymentSessionSql);
  await db.exec(stripeWebhookSql);
  await db.exec(providerRefundsSql);
  await db.exec(paymentDisputesSql);
  await db.exec(settlementReconciliationSql);
  await db.exec(paymentFailureRetrySql);
  await db.exec(maintenanceIntakeSql);
  await db.exec(workOrdersSql);
  await db.exec(ownerApprovalsSql);
  await db.exec(ownerStatementsSql);
  await db.exec(ownerRemittancesSql);
  await db.exec(ownerRemittanceIndexesSql);
  await db.exec(ownerRemittanceConstraintsSql);
  await db.exec(ownerRemittanceProjectionSql);
  await db.exec(conversationMessagingSql);
  await db.exec(conversationMessagingIndexesSql);
  await db.exec(announcementsSql);
  await db.exec(announcementIndexesSql);
  await db.exec(privacyRequestsSql);
  await db.exec(staffAccessSql);
  await db.exec(staffAccessIndexesSql);
  await db.exec(notificationPreferencesSql);
  await db.exec(operatorCommandCenterSql);
  await db.exec(operatorGlobalSearchSql);
  await db.exec(relationshipInvitationsSql);
  await db.exec(maintenanceCostSql);
  await db.exec(reconciliationResolutionSql);
  await db.exec(receivableWriteOffSql);
  await db.exec(ownerPortalInviteStateSql);
  await db.exec(journalIdempotencyActorScopeSql);
  await db.exec(platformControlPlaneSql);
  await db.exec(documentDeliverySql);
  await db.exec(documentDeliveryRecipientReadSql);
  await db.exec(platformSupportQueriesSql);
  await db.exec(platformControlPlaneHardeningSql);
  await db.exec(occupiedLeaseImportSql);
  await db.exec(notificationWorkerSql);
  await db.exec(documentDeliveryChannelsSql);
  await db.exec(combinedImportSql);
  await db.exec(residentBalanceImportSql);
  await db.exec(xlsxSourceDocumentsSql);
  await db.exec(secureLinkRawTokenSql);

  const admin = "c1000000-0000-4000-8000-000000000001";
  const resident = "c2000000-0000-4000-8000-000000000002";
  const outsider = "c3000000-0000-4000-8000-000000000003";
  const ownerA = "c4000000-0000-4000-8000-000000000004";
  const ownerB = "c5000000-0000-4000-8000-000000000005";
  await db.exec(`insert into auth.users(id) values ('${admin}'),('${resident}'),('${outsider}'),('${ownerA}'),('${ownerB}')`);
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${admin}'`);
  const organization = (await db.query(`select public.create_organization('Finance Atlas','finance-atlas','property_manager','US','en-US','America/New_York','2026-07-20','finance-org-0001') as result`)).rows[0].result;
  const entity = (await db.query(`select public.create_operating_entity_and_book('${organization.organizationId}','Finance Atlas LLC','Finance Atlas','US','company','USD','Operating book','finance-book-0001') as result`)).rows[0].result;
  const returnUrl = "https://app.crecy.example/settings/payments?stripe=return";
  const refreshUrl = "https://app.crecy.example/settings/payments?stripe=refresh";
  await expectDatabaseError(() => db.query(`select public.prepare_stripe_onboarding_link(
    '${organization.organizationId}','${entity.operatingEntityId}','${returnUrl}','${refreshUrl}','stripe-onboarding-0001'
  )`), "MFA_REQUIRED");
  await db.exec("set request.jwt.claim.aal='aal2'");
  const onboardingContext = (await db.query(`select public.prepare_stripe_onboarding_link(
    '${organization.organizationId}','${entity.operatingEntityId}','${returnUrl}','${refreshUrl}','stripe-onboarding-0001'
  ) as result`)).rows[0].result;
  assert(onboardingContext.countryCode === "US" && onboardingContext.providerAccountId === null, "Stripe onboarding preparation did not return the authorized entity context.");
  await db.exec("reset role; set role service_role");
  const stripeLinkUrl = "https://connect.stripe.com/setup/s/acct_testFinance/abc123";
  const providerConnection = (await db.query(`select public.complete_stripe_onboarding_link(
    '${admin}','aal2','${organization.organizationId}','${entity.operatingEntityId}','acct_testFinance',
    '{"card_payments":"inactive","transfers":"inactive"}'::jsonb,
    '{"currentlyDue":["business_profile.url"],"eventuallyDue":[],"pastDue":[],"pendingVerification":[],"disabledReason":null}'::jsonb,
    false,false,'${stripeLinkUrl}',now()+interval '30 minutes','${returnUrl}','${refreshUrl}','stripe-onboarding-0001'
  ) as result`)).rows[0].result;
  assert(providerConnection.providerConnectionId && providerConnection.url === stripeLinkUrl, "Stripe onboarding completion did not persist the provider connection.");
  const providerReplay = (await db.query(`select public.complete_stripe_onboarding_link(
    '${admin}','aal2','${organization.organizationId}','${entity.operatingEntityId}','acct_testFinance',
    '{}'::jsonb,'{"currentlyDue":[]}'::jsonb,true,true,
    'https://connect.stripe.com/setup/s/acct_testFinance/replay',now()+interval '30 minutes',
    '${returnUrl}','${refreshUrl}','stripe-onboarding-0001'
  ) as result`)).rows[0].result;
  assert(providerReplay.providerConnectionId === providerConnection.providerConnectionId && providerReplay.url === stripeLinkUrl, "Stripe onboarding replay did not return the canonical response.");
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${admin}'; set request.jwt.claim.aal='aal2'`);
  const paymentSettings = (await db.query("select public.get_payment_connection_settings() as result")).rows[0].result;
  assert(paymentSettings.authenticatorLevel === "aal2" && paymentSettings.items.length === 1 && paymentSettings.items[0].status === "requirements_due", "Payment settings did not expose the MFA-gated provider state.");
  await expectDatabaseError(() => db.query(`insert into public.provider_connections(
    organization_id,operating_entity_id,provider_code,provider_account_id,account_configuration,dashboard_access,fees_payer,losses_collector,status
  ) values ('${organization.organizationId}','${entity.operatingEntityId}','stripe','acct_forged','standard','full','connected_account','stripe','pending')`), "permission denied");
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${outsider}'; set request.jwt.claim.aal='aal2'`);
  await expectDatabaseError(() => db.query(`select public.prepare_stripe_onboarding_link(
    '${organization.organizationId}','${entity.operatingEntityId}','${returnUrl}','${refreshUrl}','stripe-outsider-0001'
  )`), "ORGANIZATION_SCOPE_DENIED");
  const outsiderPaymentSettings = (await db.query("select public.get_payment_connection_settings() as result")).rows[0].result;
  assert(outsiderPaymentSettings.items.length === 0, "Provider connection settings leaked to an unrelated user.");
  await db.exec("reset role");
  const providerTraces = (await db.query(`select
    (select count(*)::integer from public.provider_connections where id='${providerConnection.providerConnectionId}') as connections,
    (select count(*)::integer from audit.audit_events where resource_id='${providerConnection.providerConnectionId}') as audits,
    (select count(*)::integer from private.outbox_events where aggregate_id='${providerConnection.providerConnectionId}') as events
  `)).rows[0];
  assert(providerTraces.connections === 1 && providerTraces.audits === 2 && providerTraces.events === 2, "Provider connection audit/outbox trace is incomplete or duplicated.");
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${admin}'; set request.jwt.claim.aal='aal2'`);
  const property = (await db.query(`select public.create_property('${organization.organizationId}','${entity.operatingEntityId}','${entity.accountingBookId}','US_NATIONAL','Maple Court','multifamily','100 Main Street',null,'Richmond','VA','23220','US','America/New_York','finance-property-0001') as result`)).rows[0].result;
  const unit = (await db.query(`select public.create_unit('${organization.organizationId}','${property.propertyId}',null,'101','Apartment',2,1,850,'finance-unit-0001') as result`)).rows[0].result;
  const documentId = "c4000000-0000-4000-8000-000000000004";
  const versionId = "c5000000-0000-4000-8000-000000000005";
  await db.exec(`
    reset role;
    insert into public.documents(id,organization_id,property_id,unit_id,document_type,title,source,status,operator_supplied_unverified,created_by)
    values ('${documentId}','${organization.organizationId}','${property.propertyId}','${unit.unitId}','signed_lease','Unit 101 lease','operator_supplied','active',true,'${admin}');
    insert into public.document_versions(id,organization_id,document_id,version_number,storage_bucket,storage_path,mime_type,size_bytes,sha256_hex,original_filename,uploaded_by,upload_status)
    values ('${versionId}','${organization.organizationId}','${documentId}',1,'private-documents','finance-lease.pdf','application/pdf',100,'${"a".repeat(64)}','finance-lease.pdf','${admin}','clean');
    set role authenticated; set request.jwt.claim.sub='${admin}';
  `);
  const household = { displayName: "Avery Morgan household", members: [{ firstName: "Avery", lastName: "Morgan", email: "avery@example.com", primaryContact: true, financiallyResponsible: true }] };
  const lease = { source: "operator_supplied", externalReference: "FIN-101", startDate: "2026-01-01", endDate: "2027-12-31", rentAmountMinor: 185000, currencyCode: "USD", rentFrequency: "monthly", signedDocumentId: documentId };
  const activation = (await db.query(`select public.activate_existing_lease('${organization.organizationId}','${property.propertyId}','${unit.unitId}','${JSON.stringify(household)}'::jsonb,'${JSON.stringify(lease)}'::jsonb,42500,'2026-08-31','finance-lease-0001') as result`)).rows[0].result;
  await db.exec("reset role; set role service_role");
  const generated = (await db.query(`select public.generate_recurring_charges('2026-08-31',array['${activation.chargeScheduleId}'::uuid],'finance-worker-2026-08-31') as result`)).rows[0].result;
  assert(generated.generatedCount === 1 && generated.chargeIds.length === 1 && !generated.replayed, "Due rent charge was not generated exactly once.");
  const replay = (await db.query(`select public.generate_recurring_charges('2026-08-31',array['${activation.chargeScheduleId}'::uuid],'finance-worker-2026-08-31') as result`)).rows[0].result;
  assert(replay.replayed && replay.chargeIds[0] === generated.chargeIds[0], "Worker replay did not return the canonical charge.");
  const duplicateDateRun = (await db.query(`select public.generate_recurring_charges('2026-08-31',array['${activation.chargeScheduleId}'::uuid],'finance-worker-2026-08-31-retry') as result`)).rows[0].result;
  assert(duplicateDateRun.generatedCount === 0, "A second worker run duplicated the scheduled charge.");

  await db.exec("reset role");
  const posting = (await db.query(`select
    c.amount_minor,c.due_date,c.currency_code,c.journal_transaction_id,
    sum(e.debit_minor)::integer as debits,sum(e.credit_minor)::integer as credits,
    s.next_run_on,
    (select count(*)::integer from private.outbox_events where event_type='charge.posted' and aggregate_id=c.id) as events
    from public.charges c
    join public.journal_entries e on e.journal_transaction_id=c.journal_transaction_id
    join public.charge_schedules s on s.id=c.charge_schedule_id
    where c.id='${generated.chargeIds[0]}'
    group by c.id,s.next_run_on`)).rows[0];
  assert(posting.amount_minor === 185000 && posting.debits === 185000 && posting.credits === 185000, "Rent posting did not create a balanced journal.");
  assert(new Date(posting.next_run_on).toISOString().slice(0,10)==="2026-09-30", "Month-end schedule advancement did not clamp the due day correctly.");
  assert(posting.events === 1, "Charge posting emitted the wrong number of outbox events.");
  await expectDatabaseError(() => db.query(`update public.accounting_books set functional_currency_code='CAD' where id='${entity.accountingBookId}'`), "ACCOUNTING_BOOK_CURRENCY_IMMUTABLE");
  await expectDatabaseError(() => db.query(`update public.journal_transactions set metadata='{}'::jsonb where id='${posting.journal_transaction_id}'`), "APPEND_ONLY_RECORD");
  await expectDatabaseError(() => db.query(`delete from public.journal_entries where journal_transaction_id='${posting.journal_transaction_id}'`), "APPEND_ONLY_RECORD");

  const evidenceDocumentId = "c6000000-0000-4000-8000-000000000006";
  await db.exec(`
    insert into public.documents(id,organization_id,property_id,unit_id,tenancy_id,document_type,title,source,status,operator_supplied_unverified,created_by)
    values ('${evidenceDocumentId}','${organization.organizationId}','${property.propertyId}','${unit.unitId}','${activation.tenancyId}','payment_evidence','Check 1042 scan','operator_supplied','active',true,'${admin}');
    insert into public.document_versions(organization_id,document_id,version_number,storage_bucket,storage_path,mime_type,size_bytes,sha256_hex,original_filename,uploaded_by,upload_status)
    values ('${organization.organizationId}','${evidenceDocumentId}',1,'private-documents','payment-evidence.pdf','application/pdf',100,'${"b".repeat(64)}','check-1042.pdf','${admin}','clean');
    set role authenticated; set request.jwt.claim.sub='${admin}';
  `);
  const receivedAt = (await db.query("select now()::text as received_at")).rows[0].received_at;
  const allocations = JSON.stringify([{ chargeId: generated.chargeIds[0], amountMinor: 85000 }]);
  const payment = (await db.query(`select public.record_manual_payment('${organization.organizationId}','${activation.tenancyId}','check',85000,'USD','${receivedAt}','Check received at the office','${evidenceDocumentId}','${allocations}'::jsonb,'CHECK-1042','manual-payment-0001') as result`)).rows[0].result;
  assert(payment.paymentId && payment.receiptDocumentId && payment.reconciliationStatus === "unreconciled", "Manual payment did not return its canonical receipt and reconciliation state.");
  const paymentReplay = (await db.query(`select public.record_manual_payment('${organization.organizationId}','${activation.tenancyId}','check',85000,'USD','${receivedAt}','Check received at the office','${evidenceDocumentId}','${allocations}'::jsonb,'CHECK-1042','manual-payment-0001') as result`)).rows[0].result;
  assert(paymentReplay.paymentId === payment.paymentId, "Manual payment replay did not return the canonical payment.");
  await expectDatabaseError(() => db.query(`select public.record_manual_payment('${organization.organizationId}','${activation.tenancyId}','check',85000,'USD','${receivedAt}','Changed reason','${evidenceDocumentId}','${allocations}'::jsonb,'CHECK-1042','manual-payment-0001')`), "IDEMPOTENCY_CONFLICT");
  await expectDatabaseError(() => db.query(`select public.record_manual_payment('${organization.organizationId}','${activation.tenancyId}','cash',1000,'USD','${receivedAt}','Cash received',null,'[{"chargeId":"${generated.chargeIds[0]}","amountMinor":1000}]'::jsonb,null,'manual-payment-no-evidence')`), "PAYMENT_EVIDENCE_REQUIRED");
  await expectDatabaseError(() => db.query(`select public.record_manual_payment('${organization.organizationId}','${activation.tenancyId}','check',100001,'USD','${receivedAt}','Over allocation check','${evidenceDocumentId}','[{"chargeId":"${generated.chargeIds[0]}","amountMinor":100001}]'::jsonb,'CHECK-1043','manual-payment-overalloc')`), "CHARGE_OVERALLOCATED");
  await expectDatabaseError(() => db.query(`select public.record_manual_payment('${organization.organizationId}','${activation.tenancyId}','check',1000,'USD','${receivedAt}','Duplicate reference','${evidenceDocumentId}','[{"chargeId":"${generated.chargeIds[0]}","amountMinor":1000}]'::jsonb,'CHECK-1042','manual-payment-duplicate')`), "DUPLICATE_EXTERNAL_REFERENCE");
  await expectDatabaseError(() => db.query(`insert into public.payments(organization_id,operating_entity_id,accounting_book_id,receivable_account_id,tenancy_id,public_reference,payment_source,amount_minor,currency_code) values ('${organization.organizationId}','${entity.operatingEntityId}','${entity.accountingBookId}','${activation.receivableAccountId}','${activation.tenancyId}','FORGED','cash',1,'USD')`), "permission denied");
  await db.exec("reset role");
  const paymentPosting = (await db.query(`select p.status,p.reconciliation_status,c.status as charge_status,d.source,d.operator_supplied_unverified,
    sum(e.debit_minor)::integer as debits,sum(e.credit_minor)::integer as credits,
    (select count(*)::integer from public.payment_allocations pa where pa.payment_id=p.id) as allocations,
    (select count(*)::integer from private.outbox_events oe where oe.aggregate_id=p.id and oe.event_type in ('manual_payment.recorded','payment.allocated','reconciliation_exception.created')) as payment_events,
    (select count(*)::integer from private.outbox_events oe where oe.aggregate_id=p.receipt_document_id and oe.event_type='receipt.generated') as receipt_events
    from public.payments p join public.documents d on d.id=p.receipt_document_id join public.charges c on c.id='${generated.chargeIds[0]}'
    join public.journal_entries e on e.journal_transaction_id=p.journal_transaction_id where p.id='${payment.paymentId}' group by p.id,c.status,d.source,d.operator_supplied_unverified`)).rows[0];
  assert(paymentPosting.debits === 85000 && paymentPosting.credits === 85000 && paymentPosting.allocations === 1, "Manual payment journal or allocation is incomplete.");
  assert(paymentPosting.status === "succeeded" && paymentPosting.charge_status === "partially_paid" && paymentPosting.payment_events === 3 && paymentPosting.receipt_events === 1, "Manual payment state or event trace is incomplete.");
  assert(paymentPosting.source === "system_generated" && !paymentPosting.operator_supplied_unverified, "Receipt document provenance is incorrect.");
  await expectDatabaseError(() => db.query(`update public.documents set title='Changed' where id='${payment.receiptDocumentId}'`), "APPEND_ONLY_RECORD");

  await db.exec(`set role authenticated; set request.jwt.claim.sub='${admin}'`);
  const metadataCorrection = (await db.query(`select public.reverse_or_correct_payment(
    '${payment.paymentId}','metadata_correction','Correct the check reference','succeeded',1,null,
    '{"manualReason":"Check received by the front office","externalReference":"CHECK-1042-CORRECTED"}'::jsonb,'payment-correction-meta-0001'
  ) as result`)).rows[0].result;
  assert(metadataCorrection.version === 2 && metadataCorrection.paymentStatus === "succeeded" && metadataCorrection.correctiveJournalTransactionId === null, "Metadata correction changed economic state or failed optimistic versioning.");
  const metadataReplay = (await db.query(`select public.reverse_or_correct_payment(
    '${payment.paymentId}','metadata_correction','Correct the check reference','succeeded',1,null,
    '{"manualReason":"Check received by the front office","externalReference":"CHECK-1042-CORRECTED"}'::jsonb,'payment-correction-meta-0001'
  ) as result`)).rows[0].result;
  assert(metadataReplay.version === metadataCorrection.version, "Payment correction replay did not return the canonical result.");

  const replacementAllocations = JSON.stringify([{ chargeId: generated.chargeIds[0], amountMinor: 85000 }]);
  const allocationCorrection = (await db.query(`select public.reverse_or_correct_payment(
    '${payment.paymentId}','allocation_correction','Reconfirm the intended rent allocation','succeeded',2,
    '${replacementAllocations}'::jsonb,null,'payment-correction-allocation-0001'
  ) as result`)).rows[0].result;
  assert(allocationCorrection.version === 3 && allocationCorrection.correctiveJournalTransactionId, "Allocation correction did not create its corrective journal.");
  await expectDatabaseError(() => db.query(`select public.reverse_or_correct_payment(
    '${payment.paymentId}','allocation_correction','Stale correction attempt','succeeded',2,
    '${replacementAllocations}'::jsonb,null,'payment-correction-stale-0001'
  )`), "PAYMENT_VERSION_CONFLICT");
  await expectDatabaseError(() => db.query(`update public.payment_allocations set amount_minor=1 where payment_id='${payment.paymentId}' and reversed_at is null`), "permission denied");

  const reversal = (await db.query(`select public.reverse_or_correct_payment(
    '${payment.paymentId}','reversal','Check was entered against the wrong resident','succeeded',3,null,null,
    'payment-correction-reversal-0001'
  ) as result`)).rows[0].result;
  assert(reversal.version === 4 && reversal.paymentStatus === "reversed" && reversal.correctiveJournalTransactionId, "Payment reversal did not return its terminal state and corrective journal.");
  const reversalReplay = (await db.query(`select public.reverse_or_correct_payment(
    '${payment.paymentId}','reversal','Check was entered against the wrong resident','succeeded',3,null,null,
    'payment-correction-reversal-0001'
  ) as result`)).rows[0].result;
  assert(reversalReplay.correctiveJournalTransactionId === reversal.correctiveJournalTransactionId, "Payment reversal replay created a second correction.");
  await db.exec("reset role");
  const correctionPosting = (await db.query(`select p.status,p.version,c.status as charge_status,p.manual_external_reference,
    (select count(*)::integer from public.payment_allocations pa where pa.payment_id=p.id) as allocation_rows,
    (select count(*)::integer from public.payment_allocations pa where pa.payment_id=p.id and pa.reversed_at is not null) as reversed_allocations,
    (select count(*)::integer from public.payment_allocations pa where pa.payment_id=p.id and pa.reversed_at is null) as active_allocations,
    (select count(*)::integer from audit.audit_events a where a.resource_id=p.id and a.action_code='payment.corrected') as correction_audits,
    (select count(*)::integer from private.outbox_events o where o.aggregate_id=p.id and o.event_type='payment.corrected') as correction_events,
    (select sum(e.debit_minor)::integer from public.journal_entries e where e.journal_transaction_id='${allocationCorrection.correctiveJournalTransactionId}') as allocation_debits,
    (select sum(e.credit_minor)::integer from public.journal_entries e where e.journal_transaction_id='${allocationCorrection.correctiveJournalTransactionId}') as allocation_credits,
    (select sum(e.debit_minor)::integer from public.journal_entries e where e.journal_transaction_id='${reversal.correctiveJournalTransactionId}') as reversal_debits,
    (select sum(e.credit_minor)::integer from public.journal_entries e where e.journal_transaction_id='${reversal.correctiveJournalTransactionId}') as reversal_credits
    from public.payments p join public.charges c on c.id='${generated.chargeIds[0]}' where p.id='${payment.paymentId}'`)).rows[0];
  assert(correctionPosting.status === "reversed" && correctionPosting.version === 4 && correctionPosting.charge_status === "open", "Reversal did not reopen the charge or advance payment state.");
  assert(correctionPosting.allocation_rows === 2 && correctionPosting.reversed_allocations === 2 && correctionPosting.active_allocations === 0, "Correction did not retain and reverse allocation history.");
  assert(correctionPosting.correction_audits === 3 && correctionPosting.correction_events === 3, "Correction audit/outbox trace is incomplete.");
  assert(correctionPosting.allocation_debits === 85000 && correctionPosting.allocation_credits === 85000 && correctionPosting.reversal_debits === 85000 && correctionPosting.reversal_credits === 85000, "Corrective journals are not balanced.");
  assert(correctionPosting.manual_external_reference === "CHECK-1042-CORRECTED", "Audited metadata correction was not applied.");
  await expectDatabaseError(() => db.query(`update public.payment_allocations set amount_minor=1 where payment_id='${payment.paymentId}'`), "PAYMENT_ALLOCATION_APPEND_ONLY");
  await expectDatabaseError(() => db.query(`update public.payments set amount_minor=1 where id='${payment.paymentId}'`), "PAYMENT_FINANCIAL_FIELDS_IMMUTABLE");

  const actorScopes = await db.query(`select count(*)::integer as total,count(actor_scope)::integer as scoped,
    count(*) filter (where actor_scope='user:'||actor_user_id::text)::integer as user_scoped
    from private.idempotency_records where actor_user_id is not null`);
  assert(actorScopes.rows[0].total === actorScopes.rows[0].scoped && actorScopes.rows[0].total === actorScopes.rows[0].user_scoped, "Idempotency actor scopes were not server-derived for existing and new commands.");
  await db.exec(`insert into private.idempotency_records(organization_id,actor_user_id,route,idempotency_key,request_hash,expires_at) values (null,null,'SystemCorrectionTest','system-correction-key','hash-a',now()+interval '1 hour')`);
  await expectDatabaseError(() => db.query(`insert into private.idempotency_records(organization_id,actor_user_id,route,idempotency_key,request_hash,expires_at) values (null,null,'SystemCorrectionTest','system-correction-key','hash-b',now()+interval '1 hour')`), "duplicate key");

  const refundId = "c7000000-0000-4000-8000-000000000007";
  await db.exec(`insert into public.payment_refunds(id,organization_id,payment_id,amount_minor,currency_code,reason,status,created_by)
    values ('${refundId}','${organization.organizationId}','${payment.paymentId}',50000,'USD','Resident refund requested','requested','${admin}')`);
  await expectDatabaseError(() => db.query(`insert into public.payment_refunds(organization_id,payment_id,amount_minor,currency_code,reason,status,created_by)
    values ('${organization.organizationId}','${payment.paymentId}',40000,'USD','Would exceed payment','pending','${admin}')`), "PAYMENT_OVERREFUNDED");
  await expectDatabaseError(() => db.query(`insert into public.payment_refunds(organization_id,payment_id,amount_minor,currency_code,reason,status,failure_code,created_by)
    values ('${organization.organizationId}','${payment.paymentId}',1000,'CAD','Wrong currency','failed','provider_declined','${admin}')`), "REFUND_CURRENCY_MISMATCH");
  await db.exec(`insert into public.payment_refunds(organization_id,payment_id,amount_minor,currency_code,reason,status,failure_code,created_by)
    values ('${organization.organizationId}','${payment.paymentId}',90000,'USD','Failed attempt does not consume refundable amount','failed','provider_declined','${admin}')`);
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${admin}'`);
  const operatorRefunds = (await db.query(`select count(*)::integer as count from public.payment_refunds where payment_id='${payment.paymentId}'`)).rows[0].count;
  assert(operatorRefunds === 2, "Authorized finance operator cannot read persisted refunds.");
  await expectDatabaseError(() => db.query(`insert into public.payment_refunds(organization_id,payment_id,amount_minor,currency_code,reason) values ('${organization.organizationId}','${payment.paymentId}',1,'USD','Forged refund')`), "permission denied");
  await db.exec("reset role");

  const person = (await db.query(`select hm.person_id from public.household_members hm where hm.household_id='${activation.householdId}' and hm.is_primary_contact`)).rows[0].person_id;
  await db.exec(`insert into public.user_relationships(user_id,organization_id,relationship_type,relationship_id,status) values ('${resident}','${organization.organizationId}','resident_person','${person}','active')`);
  const maintenanceEvidenceId = "ca000000-0000-4000-8000-000000000010";
  await db.exec(`
    insert into public.documents(id,organization_id,property_id,unit_id,tenancy_id,document_type,title,source,status,operator_supplied_unverified,created_by)
    values ('${maintenanceEvidenceId}','${organization.organizationId}','${property.propertyId}','${unit.unitId}','${activation.tenancyId}','maintenance_evidence','Leaking sink','operator_supplied','active',true,'${resident}');
    insert into public.document_versions(organization_id,document_id,version_number,storage_bucket,storage_path,mime_type,size_bytes,sha256_hex,original_filename,uploaded_by,upload_status)
    values ('${organization.organizationId}','${maintenanceEvidenceId}',1,'private-documents','maintenance/sink.jpg','image/jpeg',100,'${"e".repeat(64)}','sink.jpg','${resident}','quarantined');
    set role authenticated; set request.jwt.claim.sub='${resident}';
  `);
  const residentUploadGrant = (await db.query(`select public.create_document_upload_grant(
    '${organization.organizationId}','tenancy','${activation.tenancyId}','maintenance_evidence','Bathroom leak','leak.jpg','image/jpeg',100,'maintenance-upload-grant-0001'
  ) as result`)).rows[0].result;
  assert(residentUploadGrant.grantId && residentUploadGrant.storagePath.includes(`/tenancy/${activation.tenancyId}/`), "Resident maintenance evidence did not receive a tenancy-scoped upload grant.");
  await expectDatabaseError(() => db.query(`select public.create_document_upload_grant(
    '${organization.organizationId}','tenancy','${activation.tenancyId}','signed_lease','Forged lease','lease.pdf','application/pdf',100,'maintenance-upload-grant-forged'
  )`), "upload_grants_tenancy_evidence_only");
  const preferredWindow = JSON.stringify([{ start: "2026-07-24T13:00:00-04:00", end: "2026-07-24T16:00:00-04:00" }]);
  const maintenance = (await db.query(`select public.submit_maintenance_request(
    '${activation.tenancyId}','plumbing','Kitchen sink is leaking','Water is dripping from the pipe beneath the kitchen sink.','high',
    'Call before entering.','${preferredWindow}'::jsonb,array['${maintenanceEvidenceId}'::uuid],'maintenance-request-0001'
  ) as result`)).rows[0].result;
  assert(maintenance.status === "new" && maintenance.publicReference.startsWith("MR-"), "Resident maintenance intake did not return its canonical reference.");
  const maintenanceReplay = (await db.query(`select public.submit_maintenance_request(
    '${activation.tenancyId}','plumbing','Kitchen sink is leaking','Water is dripping from the pipe beneath the kitchen sink.','high',
    'Call before entering.','${preferredWindow}'::jsonb,array['${maintenanceEvidenceId}'::uuid],'maintenance-request-0001'
  ) as result`)).rows[0].result;
  assert(maintenanceReplay.maintenanceRequestId === maintenance.maintenanceRequestId, "Maintenance request replay did not return the canonical request.");
  const residentMaintenance = (await db.query("select public.get_resident_maintenance_workspace() as result")).rows[0].result;
  const residentMaintenanceRow = (await db.query(`select priority,priority_requested from public.maintenance_requests where id='${maintenance.maintenanceRequestId}'`)).rows[0];
  assert(residentMaintenance.items.length === 1 && residentMaintenance.items[0].residentVisibleStatus === "submitted" && residentMaintenance.items[0].evidenceCount === 1, "Resident maintenance projection is incomplete.");
  assert(residentMaintenanceRow.priority === "medium" && residentMaintenanceRow.priority_requested === "high", "Requested urgency incorrectly became official priority.");
  await expectDatabaseError(() => db.query(`insert into public.maintenance_requests(organization_id,property_id,unit_id,tenancy_id,public_reference,category,title,description) values ('${organization.organizationId}','${property.propertyId}','${unit.unitId}','${activation.tenancyId}','FORGED','other','Forged row','This write must be denied.')`), "permission denied");
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${outsider}'`);
  await expectDatabaseError(() => db.query(`select public.submit_maintenance_request(
    '${activation.tenancyId}','plumbing','Unauthorized request','This request crosses the tenancy boundary.',null,null,'[]'::jsonb,array[]::uuid[],'outsider-maintenance-0001'
  )`), "TENANCY_SCOPE_DENIED");
  const outsiderMaintenance = (await db.query("select public.get_resident_maintenance_workspace() as result")).rows[0].result;
  assert(outsiderMaintenance.items.length === 0 && outsiderMaintenance.tenancies.length === 0, "Maintenance data leaked to an unrelated user.");
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${admin}'`);
  const operatorMaintenance = (await db.query("select public.get_operator_maintenance_workspace() as result")).rows[0].result;
  assert(operatorMaintenance.summary.open === 1 && operatorMaintenance.summary.untriaged === 1 && operatorMaintenance.items[0].officialPriority === "medium", "Operator maintenance intake queue is incomplete.");

  const ownerEntityA = "cb000000-0000-4000-8000-000000000011";
  const ownerEntityB = "cc000000-0000-4000-8000-000000000012";
  await db.exec(`reset role;
    update public.organizations set settings=settings || '{"work_order_owner_approval_threshold_minor":"100000"}'::jsonb where id='${organization.organizationId}';
    insert into public.owner_entities(id,organization_id,display_name,entity_type) values
      ('${ownerEntityA}','${organization.organizationId}','Finance Atlas Owner A','company'),
      ('${ownerEntityB}','${organization.organizationId}','Finance Atlas Owner B','company');
    insert into public.ownership_interests(id,organization_id,property_id,owner_entity_id,ownership_fraction,effective_from) values
      ('cd000000-0000-4000-8000-000000000013','${organization.organizationId}','${property.propertyId}','${ownerEntityA}',0.5,'2026-01-01'),
      ('ce000000-0000-4000-8000-000000000014','${organization.organizationId}','${property.propertyId}','${ownerEntityB}',0.5,'2026-01-01');
    insert into public.user_relationships(user_id,organization_id,relationship_type,relationship_id,status) values
      ('${ownerA}','${organization.organizationId}','owner_entity','${ownerEntityA}','active'),
      ('${ownerB}','${organization.organizationId}','owner_entity','${ownerEntityB}','active');
    set role authenticated; set request.jwt.claim.sub='${admin}';
  `);
  const operatorConversations = (await db.query("select public.get_conversation_workspace() as result")).rows[0].result;
  assert(operatorConversations.items.length === 3, "The operator messaging workspace did not provision the resident and exact owner conversations.");
  const residentConversation = operatorConversations.items.find((item) => item.conversationType === "operator_resident");
  const ownerAConversation = operatorConversations.items.find((item) => item.ownerEntityId === ownerEntityA);
  const ownerBConversation = operatorConversations.items.find((item) => item.ownerEntityId === ownerEntityB);
  assert(residentConversation && ownerAConversation && ownerBConversation, "A required relationship conversation was not provisioned.");
  await expectDatabaseError(() => db.query("select count(*) from public.conversations"), "permission denied");
  await expectDatabaseError(() => db.query("select count(*) from public.conversation_participants"), "permission denied");
  await expectDatabaseError(() => db.query("select count(*) from public.messages"), "permission denied");

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${resident}'`);
  const residentConversations = (await db.query("select public.get_conversation_workspace() as result")).rows[0].result;
  assert(
    residentConversations.items.length === 1
      && residentConversations.items[0].conversationId === residentConversation.conversationId
      && residentConversations.items[0].audienceLabel === "Property management",
    "The resident messaging workspace crossed its exact tenancy boundary.",
  );
  const residentMessage = (await db.query(`select public.send_conversation_message(
    '${residentConversation.conversationId}','The kitchen repair is complete. Thank you.','resident-message-0001'
  ) as result`)).rows[0].result;
  const residentMessageReplay = (await db.query(`select public.send_conversation_message(
    '${residentConversation.conversationId}','The kitchen repair is complete. Thank you.','resident-message-0001'
  ) as result`)).rows[0].result;
  assert(residentMessageReplay.messageId === residentMessage.messageId, "Message replay created a duplicate message.");
  await expectDatabaseError(() => db.query(`select public.send_conversation_message(
    '${residentConversation.conversationId}','A conflicting body.','resident-message-0001'
  )`), "IDEMPOTENCY_CONFLICT");
  await expectDatabaseError(
    () => db.query(`select public.get_conversation_detail('${ownerAConversation.conversationId}')`),
    "CONVERSATION_NOT_FOUND",
  );

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${ownerA}'`);
  const ownerAConversations = (await db.query("select public.get_conversation_workspace() as result")).rows[0].result;
  assert(
    ownerAConversations.items.length === 1
      && ownerAConversations.items[0].conversationId === ownerAConversation.conversationId
      && !JSON.stringify(ownerAConversations).includes(ownerEntityB),
    "Co-owner A crossed the exact owner-entity messaging boundary.",
  );
  const ownerMessage = (await db.query(`select public.send_conversation_message(
    '${ownerAConversation.conversationId}','Please include the final invoice in my statement.','owner-message-0001'
  ) as result`)).rows[0].result;
  assert(ownerMessage.senderType === "owner", "An owner message was not attributed to its relationship type.");

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${ownerB}'`);
  const ownerBConversations = (await db.query("select public.get_conversation_workspace() as result")).rows[0].result;
  assert(
    ownerBConversations.items.length === 1
      && ownerBConversations.items[0].conversationId === ownerBConversation.conversationId
      && !JSON.stringify(ownerBConversations).includes(ownerEntityA),
    "Co-owner B crossed the exact owner-entity messaging boundary.",
  );
  await expectDatabaseError(
    () => db.query(`select public.send_conversation_message(
      '${ownerAConversation.conversationId}','Cross-owner message.','owner-cross-message-0001'
    )`),
    "CONVERSATION_NOT_FOUND",
  );

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${outsider}'`);
  const outsiderConversations = (await db.query("select public.get_conversation_workspace() as result")).rows[0].result;
  assert(outsiderConversations.items.length === 0, "Conversation metadata leaked to an unrelated user.");
  await expectDatabaseError(
    () => db.query(`select public.get_conversation_detail('${residentConversation.conversationId}')`),
    "CONVERSATION_NOT_FOUND",
  );
  await expectDatabaseError(
    () => db.query(`select public.send_conversation_message(
      '${residentConversation.conversationId}','Unauthorized message.','outsider-message-0001'
    )`),
    "CONVERSATION_NOT_FOUND",
  );

  const scopedMessenger = "cf000000-0000-4000-8000-000000000015";
  const scopedMessengerMembership = "cf000000-0000-4000-8000-000000000016";
  await db.exec(`reset role;
    insert into auth.users(id) values ('${scopedMessenger}');
    insert into public.organization_memberships(id,organization_id,user_id,role_code,status,starts_at)
    values (
      '${scopedMessengerMembership}','${organization.organizationId}','${scopedMessenger}',
      'leasing_agent','active',now()-interval '1 day'
    );
    insert into public.membership_property_scopes(organization_id,membership_id,property_id)
    values ('${organization.organizationId}','${scopedMessengerMembership}','${property.propertyId}');
    set role authenticated; set request.jwt.claim.sub='${scopedMessenger}';
  `);
  const scopedConversations = (await db.query("select public.get_conversation_workspace() as result")).rows[0].result;
  assert(
    scopedConversations.items.length === 1
      && scopedConversations.items[0].conversationId === residentConversation.conversationId,
    "A property-scoped operator did not receive only the in-scope resident conversation.",
  );
  await db.exec(`reset role;
    update public.organization_memberships
    set ends_at=now()-interval '1 hour'
    where id='${scopedMessengerMembership}';
    set role authenticated; set request.jwt.claim.sub='${scopedMessenger}';
  `);
  const expiredScopedConversations = (await db.query("select public.get_conversation_workspace() as result")).rows[0].result;
  assert(expiredScopedConversations.items.length === 0, "An expired property membership retained messaging access.");
  await expectDatabaseError(
    () => db.query(`select public.send_conversation_message(
      '${residentConversation.conversationId}','Expired operator message.','expired-message-0001'
    )`),
    "CONVERSATION_NOT_FOUND",
  );

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${admin}'`);
  const operatorReply = (await db.query(`select public.send_conversation_message(
    '${residentConversation.conversationId}','Glad to hear it. We have closed the repair.','operator-message-0001'
  ) as result`)).rows[0].result;
  assert(operatorReply.senderType === "member", "An authorized operator message was not attributed as a member message.");
  const operatorConversationDetail = (await db.query(
    `select public.get_conversation_detail('${residentConversation.conversationId}') as result`,
  )).rows[0].result;
  assert(
    operatorConversationDetail.messages.length === 2
      && operatorConversationDetail.messages[0].bodyText === "The kitchen repair is complete. Thank you."
      && operatorConversationDetail.messages[1].bodyText === "Glad to hear it. We have closed the repair.",
    "The sanitized conversation detail did not preserve the canonical message timeline.",
  );

  await db.exec(`reset role;
    update public.conversations set status='closed' where id='${residentConversation.conversationId}';
  `);
  await expectDatabaseError(
    () => db.query(`update public.messages set body_text='Mutated' where id='${residentMessage.messageId}'`),
    "MESSAGE_APPEND_ONLY",
  );
  await expectDatabaseError(
    () => db.query(`delete from public.messages where id='${residentMessage.messageId}'`),
    "MESSAGE_APPEND_ONLY",
  );
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${resident}'`);
  const closedReplay = (await db.query(`select public.send_conversation_message(
    '${residentConversation.conversationId}','The kitchen repair is complete. Thank you.','resident-message-0001'
  ) as result`)).rows[0].result;
  assert(closedReplay.messageId === residentMessage.messageId, "A closed conversation did not replay its prior canonical response.");
  await expectDatabaseError(
    () => db.query(`select public.send_conversation_message(
      '${residentConversation.conversationId}','A new message after closing.','resident-message-0002'
    )`),
    "CONVERSATION_NOT_OPEN",
  );

  await db.exec("reset role");
  const messageTraces = (await db.query(`select
    (select count(*)::integer from public.messages) as messages,
    (select count(*)::integer from audit.audit_events where action_code='message.sent') as audits,
    (select count(*)::integer from private.outbox_events where event_type='message.sent') as events,
    (select count(*)::integer from private.notification_jobs where template_code='conversation_message_received') as notifications,
    (select coalesce(string_agg(after_data::text,' '),'') from audit.audit_events where action_code='message.sent') as audit_payloads,
    (select coalesce(string_agg(payload::text,' '),'') from private.outbox_events where event_type='message.sent') as event_payloads,
    (select coalesce(string_agg(payload::text,' '),'') from private.notification_jobs where template_code='conversation_message_received') as notification_payloads
  `)).rows[0];
  assert(messageTraces.messages === 3 && messageTraces.audits === 3 && messageTraces.events === 3 && messageTraces.notifications === 3, "Message persistence, audit, outbox, or notification traces are incomplete.");
  assert(
    !messageTraces.audit_payloads.includes("kitchen repair")
      && !messageTraces.event_payloads.includes("kitchen repair")
      && !messageTraces.notification_payloads.includes("kitchen repair"),
    "A message body leaked into audit, event, or notification metadata.",
  );

  await db.exec(`set role authenticated; set request.jwt.claim.sub='${admin}'`);
  const selectedAnnouncement = (await db.query(`select public.create_announcement(
    '${organization.organizationId}','${property.propertyId}',
    'Water service notice',
    'Water service will be paused Tuesday from 10 AM until noon.',
    'en-US','selected_tenancies','announcement-create-selected-0001'
  ) as result`)).rows[0].result;
  const selectedAnnouncementReplay = (await db.query(`select public.create_announcement(
    '${organization.organizationId}','${property.propertyId}',
    'Water service notice',
    'Water service will be paused Tuesday from 10 AM until noon.',
    'en-US','selected_tenancies','announcement-create-selected-0001'
  ) as result`)).rows[0].result;
  assert(selectedAnnouncementReplay.announcementId === selectedAnnouncement.announcementId, "Announcement creation replay produced a duplicate draft.");
  await expectDatabaseError(() => db.query(`select public.create_announcement(
    '${organization.organizationId}','${property.propertyId}',
    'Conflicting title',
    'Water service will be paused Tuesday from 10 AM until noon.',
    'en-US','selected_tenancies','announcement-create-selected-0001'
  )`), "IDEMPOTENCY_CONFLICT");
  await expectDatabaseError(() => db.query(`select public.publish_announcement(
    '${selectedAnnouncement.announcementId}',
    array['cf000000-0000-4000-8000-000000000099'::uuid],
    1,'announcement-publish-invalid-0001'
  )`), "TENANCY_AUDIENCE_SCOPE_DENIED");
  const selectedPublished = (await db.query(`select public.publish_announcement(
    '${selectedAnnouncement.announcementId}',
    array['${activation.tenancyId}'::uuid],
    1,'announcement-publish-selected-0001'
  ) as result`)).rows[0].result;
  const selectedPublishedReplay = (await db.query(`select public.publish_announcement(
    '${selectedAnnouncement.announcementId}',
    array['${activation.tenancyId}'::uuid],
    1,'announcement-publish-selected-0001'
  ) as result`)).rows[0].result;
  assert(selectedPublished.deliveryCount === 1 && selectedPublishedReplay.version === selectedPublished.version, "Selected-tenancy publication was not delivery-row backed and idempotent.");
  await expectDatabaseError(() => db.query(`select public.publish_announcement(
    '${selectedAnnouncement.announcementId}',array[]::uuid[],
    1,'announcement-publish-selected-0001'
  )`), "IDEMPOTENCY_CONFLICT");
  await expectDatabaseError(() => db.query("select count(*) from public.announcements"), "permission denied");
  await expectDatabaseError(() => db.query("select count(*) from public.announcement_deliveries"), "permission denied");

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${resident}'`);
  const residentAnnouncements = (await db.query("select public.get_recipient_announcement_workspace() as result")).rows[0].result;
  assert(
    residentAnnouncements.items.length === 1
      && residentAnnouncements.items[0].announcementId === selectedAnnouncement.announcementId
      && residentAnnouncements.items[0].title === "Water service notice",
    "The selected resident did not receive the sanitized announcement delivery.",
  );

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${ownerA}'`);
  const ownerBeforeAnnouncement = (await db.query("select public.get_recipient_announcement_workspace() as result")).rows[0].result;
  assert(ownerBeforeAnnouncement.items.length === 0, "A same-property owner read a resident announcement without an explicit delivery.");

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${admin}'`);
  const ownerAnnouncement = (await db.query(`select public.create_announcement(
    '${organization.organizationId}','${property.propertyId}',
    'Quarterly owner update',
    'The finalized property statement is now available for review.',
    'en-US','owners','announcement-create-owners-0001'
  ) as result`)).rows[0].result;
  const ownersPublished = (await db.query(`select public.publish_announcement(
    '${ownerAnnouncement.announcementId}',array[]::uuid[],
    1,'announcement-publish-owners-0001'
  ) as result`)).rows[0].result;
  assert(ownersPublished.deliveryCount === 2, "The owner announcement did not expand to both exact active owner relationships.");

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${ownerA}'`);
  const ownerAAnnouncements = (await db.query("select public.get_recipient_announcement_workspace() as result")).rows[0].result;
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${ownerB}'`);
  const ownerBAnnouncements = (await db.query("select public.get_recipient_announcement_workspace() as result")).rows[0].result;
  assert(
    ownerAAnnouncements.items.length === 1
      && ownerBAnnouncements.items.length === 1
      && ownerAAnnouncements.items[0].announcementId === ownerAnnouncement.announcementId
      && ownerBAnnouncements.items[0].announcementId === ownerAnnouncement.announcementId,
    "An exact owner relationship did not receive its persisted delivery.",
  );

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${resident}'`);
  const residentAfterOwnerAnnouncement = (await db.query("select public.get_recipient_announcement_workspace() as result")).rows[0].result;
  assert(
    residentAfterOwnerAnnouncement.items.length === 1
      && !JSON.stringify(residentAfterOwnerAnnouncement).includes("Quarterly owner update"),
    "A same-property resident read an owner announcement without an explicit delivery.",
  );
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${outsider}'`);
  const outsiderAnnouncements = (await db.query("select public.get_recipient_announcement_workspace() as result")).rows[0].result;
  assert(outsiderAnnouncements.items.length === 0, "Announcement content leaked to an unrelated user.");

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${scopedMessenger}'`);
  await expectDatabaseError(() => db.query(`select public.create_announcement(
    '${organization.organizationId}','${property.propertyId}',
    'Expired staff notice','This must not be persisted.',
    'en-US','property_residents','announcement-expired-staff-0001'
  )`), "PROPERTY_SCOPE_DENIED");

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${admin}'`);
  const canceledAnnouncement = (await db.query(`select public.create_announcement(
    '${organization.organizationId}','${property.propertyId}',
    'Draft notice','This draft should be canceled before delivery.',
    'en-US','property_residents','announcement-create-cancel-0001'
  ) as result`)).rows[0].result;
  await expectDatabaseError(() => db.query(`select public.cancel_announcement(
    '${canceledAnnouncement.announcementId}',2,'announcement-cancel-stale-0001'
  )`), "ANNOUNCEMENT_VERSION_CONFLICT");
  const canceledResult = (await db.query(`select public.cancel_announcement(
    '${canceledAnnouncement.announcementId}',1,'announcement-cancel-0001'
  ) as result`)).rows[0].result;
  const canceledReplay = (await db.query(`select public.cancel_announcement(
    '${canceledAnnouncement.announcementId}',1,'announcement-cancel-0001'
  ) as result`)).rows[0].result;
  assert(canceledResult.status === "canceled" && canceledReplay.version === canceledResult.version, "Draft cancellation was not state-checked and idempotent.");
  const operatorAnnouncements = (await db.query("select public.get_operator_announcement_workspace() as result")).rows[0].result;
  assert(
    operatorAnnouncements.items.length === 3
      && operatorAnnouncements.properties.length === 1
      && operatorAnnouncements.tenancies.length === 1,
    `The property-scoped operator announcement workspace is incomplete: ${JSON.stringify({
      items: operatorAnnouncements.items.length,
      properties: operatorAnnouncements.properties.length,
      tenancies: operatorAnnouncements.tenancies.length,
    })}`,
  );

  await db.exec("reset role");
  const announcementTraces = (await db.query(`select
    (select count(*)::integer from public.announcements) as announcements,
    (select count(*)::integer from public.announcement_deliveries) as deliveries,
    (select count(*)::integer from audit.audit_events where action_code='announcement.created') as created_audits,
    (select count(*)::integer from audit.audit_events where action_code='announcement.published') as published_audits,
    (select count(*)::integer from audit.audit_events where action_code='announcement.canceled') as canceled_audits,
    (select count(*)::integer from private.outbox_events where event_type='announcement.published') as events,
    (select count(*)::integer from private.notification_jobs where template_code='announcement_published') as notifications,
    (select coalesce(string_agg(after_data::text,' '),'') from audit.audit_events where action_code like 'announcement.%') as audit_payloads,
    (select coalesce(string_agg(payload::text,' '),'') from private.outbox_events where event_type='announcement.published') as event_payloads,
    (select coalesce(string_agg(payload::text,' '),'') from private.notification_jobs where template_code='announcement_published') as notification_payloads
  `)).rows[0];
  assert(
    announcementTraces.announcements === 3
      && announcementTraces.deliveries === 3
      && announcementTraces.created_audits === 3
      && announcementTraces.published_audits === 2
      && announcementTraces.canceled_audits === 1
      && announcementTraces.events === 2
      && announcementTraces.notifications === 3,
    "Announcement persistence, delivery, audit, outbox, or notification traces are incomplete.",
  );
  assert(
    !announcementTraces.audit_payloads.includes("Water service will")
      && !announcementTraces.event_payloads.includes("Water service will")
      && !announcementTraces.notification_payloads.includes("Water service will")
      && !announcementTraces.audit_payloads.includes("finalized property statement"),
    "Announcement content leaked into audit, event, or notification metadata.",
  );

  await db.exec(`set role authenticated; set request.jwt.claim.sub='${resident}'; set request.jwt.claim.aal='aal1'`);
  const residentPrivacyRequest = (await db.query(`select public.submit_privacy_request(
    '${organization.organizationId}','deletion',null,'privacy-resident-delete-0001'
  ) as result`)).rows[0].result;
  const residentPrivacyReplay = (await db.query(`select public.submit_privacy_request(
    '${organization.organizationId}','deletion',null,'privacy-resident-delete-0001'
  ) as result`)).rows[0].result;
  assert(
    residentPrivacyRequest.status === "identity_verification"
      && residentPrivacyRequest.identityVerificationStatus === "pending"
      && residentPrivacyRequest.controllerRole === "operator"
      && residentPrivacyRequest.jurisdictionCode === "US"
      && residentPrivacyReplay.privacyRequestId === residentPrivacyRequest.privacyRequestId,
    "The resident privacy request was not routed, identity-gated, and replay-safe.",
  );
  await expectDatabaseError(() => db.query(`select public.submit_privacy_request(
    '${organization.organizationId}','access',null,'privacy-resident-delete-0001'
  )`), "IDEMPOTENCY_CONFLICT");
  await expectDatabaseError(() => db.query("select count(*) from public.privacy_requests"), "permission denied");
  await expectDatabaseError(() => db.query("select count(*) from private.privacy_request_jobs"), "permission denied");
  await expectDatabaseError(() => db.query(`select public.verify_privacy_request(
    '${residentPrivacyRequest.privacyRequestId}',1,'privacy-resident-verify-0001'
  )`), "MFA_STEP_UP_REQUIRED");

  await db.exec("set request.jwt.claim.aal='aal2'");
  const residentPrivacyVerified = (await db.query(`select public.verify_privacy_request(
    '${residentPrivacyRequest.privacyRequestId}',1,'privacy-resident-verify-0001'
  ) as result`)).rows[0].result;
  const residentPrivacyVerifiedReplay = (await db.query(`select public.verify_privacy_request(
    '${residentPrivacyRequest.privacyRequestId}',1,'privacy-resident-verify-0001'
  ) as result`)).rows[0].result;
  assert(
    residentPrivacyVerified.status === "operator_action_required"
      && residentPrivacyVerified.identityVerificationStatus === "verified"
      && residentPrivacyVerified.version === 2
      && residentPrivacyVerifiedReplay.version === 2,
    "Privacy identity verification did not unblock the operator-routed workflow idempotently.",
  );
  await expectDatabaseError(() => db.query(`select public.verify_privacy_request(
    '${residentPrivacyRequest.privacyRequestId}',2,'privacy-resident-verify-again-0001'
  )`), "PRIVACY_REQUEST_NOT_VERIFIABLE");
  const residentPrivacyWorkspace = (await db.query("select public.get_privacy_request_workspace() as result")).rows[0].result;
  assert(
    residentPrivacyWorkspace.items.length === 1
      && residentPrivacyWorkspace.organizations.length === 1
      && residentPrivacyWorkspace.items[0].jobCount === 4
      && residentPrivacyWorkspace.items[0].queuedJobCount === 4
      && !residentPrivacyWorkspace.items[0].canVerify,
    "The requester privacy workspace did not expose the sanitized verified request and job status.",
  );

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${ownerA}'; set request.jwt.claim.aal='aal2'`);
  const ownerPrivacyWorkspace = (await db.query("select public.get_privacy_request_workspace() as result")).rows[0].result;
  assert(
    ownerPrivacyWorkspace.organizations.length === 1
      && ownerPrivacyWorkspace.items.length === 0,
    "A same-organization owner read another relationship user's privacy request.",
  );

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${outsider}'; set request.jwt.claim.aal='aal1'`);
  await expectDatabaseError(() => db.query(`select public.submit_privacy_request(
    '${organization.organizationId}','access','US','privacy-outsider-org-0001'
  )`), "ORGANIZATION_SCOPE_DENIED");
  const platformPrivacyRequest = (await db.query(`select public.submit_privacy_request(
    null,'export','CA-ON','privacy-platform-export-0001'
  ) as result`)).rows[0].result;
  assert(
    platformPrivacyRequest.controllerRole === "platform"
      && platformPrivacyRequest.status === "identity_verification"
      && platformPrivacyRequest.jurisdictionCode === "CA-ON",
    "The platform privacy request was not jurisdiction-routed or identity-gated.",
  );
  await db.exec("set request.jwt.claim.aal='aal2'");
  const platformPrivacyVerified = (await db.query(`select public.verify_privacy_request(
    '${platformPrivacyRequest.privacyRequestId}',1,'privacy-platform-verify-0001'
  ) as result`)).rows[0].result;
  assert(
    platformPrivacyVerified.status === "processing" && platformPrivacyVerified.version === 2,
    "The verified platform privacy request did not enter processing.",
  );
  await expectDatabaseError(() => db.query(`select public.cancel_privacy_request(
    '${platformPrivacyRequest.privacyRequestId}',1,null,'privacy-platform-cancel-stale-0001'
  )`), "VERSION_CONFLICT");
  const platformPrivacyCanceled = (await db.query(`select public.cancel_privacy_request(
    '${platformPrivacyRequest.privacyRequestId}',2,null,'privacy-platform-cancel-0001'
  ) as result`)).rows[0].result;
  const platformPrivacyCanceledReplay = (await db.query(`select public.cancel_privacy_request(
    '${platformPrivacyRequest.privacyRequestId}',2,null,'privacy-platform-cancel-0001'
  ) as result`)).rows[0].result;
  assert(
    platformPrivacyCanceled.status === "canceled"
      && platformPrivacyCanceled.version === 3
      && platformPrivacyCanceledReplay.version === 3,
    "Platform privacy cancellation was not versioned and idempotent.",
  );
  const outsiderPrivacyWorkspace = (await db.query("select public.get_privacy_request_workspace() as result")).rows[0].result;
  assert(
    outsiderPrivacyWorkspace.organizations.length === 0
      && outsiderPrivacyWorkspace.items.length === 1
      && outsiderPrivacyWorkspace.items[0].status === "canceled",
    "The platform requester did not receive only their own sanitized request.",
  );

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${admin}'; set request.jwt.claim.aal='aal2'`);
  const adminPrivacyWorkspace = (await db.query("select public.get_privacy_request_workspace() as result")).rows[0].result;
  assert(
    adminPrivacyWorkspace.items.length === 1
      && adminPrivacyWorkspace.items[0].privacyRequestId === residentPrivacyRequest.privacyRequestId,
    "The organization administrator could not see the routed organization privacy request.",
  );
  const residentPrivacyCanceled = (await db.query(`select public.cancel_privacy_request(
    '${residentPrivacyRequest.privacyRequestId}',2,'Requester confirmed cancellation.','privacy-admin-cancel-0001'
  ) as result`)).rows[0].result;
  assert(residentPrivacyCanceled.status === "canceled" && residentPrivacyCanceled.version === 3, "The routed privacy request was not safely cancelable by its organization administrator.");

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${scopedMessenger}'; set request.jwt.claim.aal='aal2'`);
  await expectDatabaseError(() => db.query(`select public.submit_privacy_request(
    '${organization.organizationId}','correction','US','privacy-expired-member-0001'
  )`), "ORGANIZATION_SCOPE_DENIED");

  await db.exec("reset role");
  const privacyTraces = (await db.query(`select
    (select count(*)::integer from public.privacy_requests) as requests,
    (select count(*)::integer from private.privacy_request_jobs) as jobs,
    (select count(*)::integer from private.privacy_request_jobs where status='canceled') as canceled_jobs,
    (select count(*)::integer from private.privacy_request_jobs where blocked_until_verified) as blocked_jobs,
    (select count(*)::integer from audit.audit_events where action_code='privacy_request.submitted') as submitted_audits,
    (select count(*)::integer from audit.audit_events where action_code='privacy_request.identity_verified') as verified_audits,
    (select count(*)::integer from audit.audit_events where action_code='privacy_request.canceled') as canceled_audits,
    (select count(*)::integer from private.outbox_events where event_type='privacy_request.submitted') as submitted_events,
    (select count(*)::integer from private.outbox_events where event_type='privacy_request.verified') as verified_events,
    (select count(*)::integer from private.outbox_events where event_type='privacy_request.canceled') as canceled_events
  `)).rows[0];
  assert(
    privacyTraces.requests === 2
      && privacyTraces.jobs === 6
      && privacyTraces.canceled_jobs === 6
      && privacyTraces.blocked_jobs === 0
      && privacyTraces.submitted_audits === 2
      && privacyTraces.verified_audits === 2
      && privacyTraces.canceled_audits === 2
      && privacyTraces.submitted_events === 2
      && privacyTraces.verified_events === 2
      && privacyTraces.canceled_events === 2,
    "Privacy request persistence, jobs, audit, or event traces are incomplete.",
  );

  const invitedLeasingAgent = "ca000000-0000-4000-8000-000000000001";
  const invitedAdmin = "ca000000-0000-4000-8000-000000000002";
  const invitedAuditorA = "ca000000-0000-4000-8000-000000000003";
  const invitedAuditorB = "ca000000-0000-4000-8000-000000000004";
  const invitedAuditorC = "ca000000-0000-4000-8000-000000000005";
  const invitedOverLimit = "ca000000-0000-4000-8000-000000000006";
  await db.exec(`reset role;
    update auth.users set email='admin@finance-atlas.example' where id='${admin}';
    insert into auth.users(id,email) values
      ('${invitedLeasingAgent}','leasing@finance-atlas.example'),
      ('${invitedAdmin}','ops-admin@finance-atlas.example'),
      ('${invitedAuditorA}','audit-a@finance-atlas.example'),
      ('${invitedAuditorB}','audit-b@finance-atlas.example'),
      ('${invitedAuditorC}','audit-c@finance-atlas.example'),
      ('${invitedOverLimit}','audit-over-limit@finance-atlas.example');
    set role authenticated; set request.jwt.claim.sub='${admin}'; set request.jwt.claim.aal='aal1';
  `);
  await expectDatabaseError(() => db.query(`select public.invite_staff_member(
    '${organization.organizationId}','${invitedAdmin}','ops-admin@finance-atlas.example','org_admin',
    '{}'::uuid[],'2026-07-24T12:00:00Z',null,true,'en-US','${"b".repeat(64)}','bbbbbbbbbb',
    'Operational administrator access.','staff-invite-admin-aal1-0001'
  )`), "MFA_STEP_UP_REQUIRED");
  const workspaceBeforeStaff = (await db.query(`select public.get_staff_management_workspace(
    '${organization.organizationId}'
  ) as result`)).rows[0].result;
  assert(
    workspaceBeforeStaff.organization.organizationId === organization.organizationId
      && workspaceBeforeStaff.staffSeatCount === 1
      && workspaceBeforeStaff.staffSeatLimit === 5
      && workspaceBeforeStaff.members.length === 2,
    "The staff workspace did not exclude an expired membership from seat usage or return its sanitized roster.",
  );

  await db.exec("set request.jwt.claim.aal='aal2'");
  const leasingInvite = (await db.query(`select public.invite_staff_member(
    '${organization.organizationId}','${invitedLeasingAgent}','leasing@finance-atlas.example','leasing_agent',
    array['${property.propertyId}'::uuid],'2026-07-24T12:00:00Z',null,false,'en-US','${"a".repeat(64)}','aaaaaaaaaa',
    null,'staff-invite-leasing-0001'
  ) as result`)).rows[0].result;
  const leasingInviteReplay = (await db.query(`select public.invite_staff_member(
    '${organization.organizationId}','${invitedLeasingAgent}','leasing@finance-atlas.example','leasing_agent',
    array['${property.propertyId}'::uuid],'2026-07-24T12:00:00Z',null,false,'en-US','${"a".repeat(64)}','aaaaaaaaaa',
    null,'staff-invite-leasing-0001'
  ) as result`)).rows[0].result;
  assert(
    leasingInvite.membershipId === leasingInviteReplay.membershipId
      && leasingInvite.status === "invited"
      && leasingInviteReplay.idempotentReplay
      && leasingInvite.propertyIds.length === 1,
    "Staff invitation was not property-scoped and idempotent.",
  );
  await expectDatabaseError(() => db.query(`select public.invite_staff_member(
    '${organization.organizationId}','${invitedLeasingAgent}','leasing@finance-atlas.example','leasing_agent',
    '{}'::uuid[],'2026-07-24T12:00:00Z',null,false,'en-US','${"a".repeat(64)}','aaaaaaaaaa',
    null,'staff-invite-leasing-conflict-0001'
  )`), "PROPERTY_SCOPE_REQUIRED");

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${invitedLeasingAgent}'; set request.jwt.claim.aal='aal1'`);
  const acceptedStaff = (await db.query(`select public.accept_staff_invitation(
    '${"a".repeat(64)}'
  ) as result`)).rows[0].result;
  const acceptedStaffReplay = (await db.query(`select public.accept_staff_invitation(
    '${"a".repeat(64)}'
  ) as result`)).rows[0].result;
  const staffRecipientWorkspace = (await db.query("select public.get_staff_management_workspace() as result")).rows[0].result;
  assert(
    acceptedStaff.status === "active"
      && acceptedStaff.version === 2
      && acceptedStaffReplay.version === 2
      && staffRecipientWorkspace.organization === null,
    "Staff acceptance was not recipient-bound and idempotent, or exposed the admin workspace.",
  );
  await expectDatabaseError(() => db.query("select count(*) from public.invitations"), "permission denied");

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${outsider}'; set request.jwt.claim.aal='aal2'`);
  await expectDatabaseError(() => db.query(`select public.accept_staff_invitation('${"a".repeat(64)}')`), "INVITATION_RECIPIENT_MISMATCH");
  await expectDatabaseError(() => db.query(`select public.invite_staff_member(
    '${organization.organizationId}','${invitedAdmin}','ops-admin@finance-atlas.example','org_admin',
    '{}'::uuid[],'2026-07-24T12:00:00Z',null,true,'en-US','${"b".repeat(64)}','bbbbbbbbbb',
    'Forged access.','staff-invite-outsider-0001'
  )`), "ORGANIZATION_SCOPE_DENIED");

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${admin}'; set request.jwt.claim.aal='aal1'`);
  await expectDatabaseError(() => db.query(`select public.update_staff_membership(
    '${leasingInvite.membershipId}','property_manager','suspended',now(),null,false,2,
    'Temporary access review.','staff-update-leasing-aal1-0001'
  )`), "MFA_STEP_UP_REQUIRED");
  await db.exec("set request.jwt.claim.aal='aal2'");
  const changedStaff = (await db.query(`select public.update_staff_membership(
    '${leasingInvite.membershipId}','property_manager','active',now(),null,false,2,
    'Expanded operating responsibility.','staff-update-leasing-0001'
  ) as result`)).rows[0].result;
  await expectDatabaseError(() => db.query(`select public.update_staff_membership(
    '${leasingInvite.membershipId}','property_manager','active',now(),null,false,2,
    'Stale update.','staff-update-leasing-stale-0001'
  )`), "MEMBERSHIP_VERSION_CONFLICT");
  const unscopedStaff = (await db.query(`select public.replace_staff_property_scopes(
    '${leasingInvite.membershipId}','{}'::uuid[],3,
    'Portfolio-wide property management.','staff-scope-leasing-0001'
  ) as result`)).rows[0].result;
  const revokedStaff = (await db.query(`select public.revoke_staff_membership(
    '${leasingInvite.membershipId}',4,'Employment access ended.','staff-revoke-leasing-0001'
  ) as result`)).rows[0].result;
  const revokedStaffReplay = (await db.query(`select public.revoke_staff_membership(
    '${leasingInvite.membershipId}',4,'Employment access ended.','staff-revoke-leasing-0001'
  ) as result`)).rows[0].result;
  assert(
    changedStaff.version === 3
      && unscopedStaff.propertyIds.length === 0
      && unscopedStaff.version === 4
      && revokedStaff.status === "revoked"
      && revokedStaff.version === 5
      && revokedStaffReplay.version === 5,
    "Staff role, scope, revocation, versioning, or replay behavior is incomplete.",
  );
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${invitedLeasingAgent}'; set request.jwt.claim.aal='aal2'`);
  const revokedPropertyVisibility = (await db.query("select count(*)::integer as count from public.properties")).rows[0].count;
  assert(revokedPropertyVisibility === 0, "Revoked staff access was not removed immediately.");

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${admin}'; set request.jwt.claim.aal='aal2'`);
  const inviteSeat = async (userId, email, tokenCharacter, idempotencyKey) =>
    (await db.query(`select public.invite_staff_member(
      '${organization.organizationId}','${userId}','${email}','read_only_auditor',
      '{}'::uuid[],'2026-07-24T12:00:00Z',null,false,'en-US','${tokenCharacter.repeat(64)}','${tokenCharacter.repeat(10)}',
      null,'${idempotencyKey}'
    ) as result`)).rows[0].result;
  const invitedSeats = [
    await inviteSeat(invitedAdmin, "ops-admin@finance-atlas.example", "b", "staff-seat-00000001"),
    await inviteSeat(invitedAuditorA, "audit-a@finance-atlas.example", "c", "staff-seat-00000002"),
    await inviteSeat(invitedAuditorB, "audit-b@finance-atlas.example", "d", "staff-seat-00000003"),
    await inviteSeat(invitedAuditorC, "audit-c@finance-atlas.example", "e", "staff-seat-00000004"),
  ];
  await expectDatabaseError(() => inviteSeat(
    invitedOverLimit,
    "audit-over-limit@finance-atlas.example",
    "f",
    "staff-seat-over-limit-0001",
  ), "PLAN_LIMIT_EXCEEDED");
  const staffWorkspace = (await db.query(`select public.get_staff_management_workspace(
    '${organization.organizationId}'
  ) as result`)).rows[0].result;
  assert(
    invitedSeats.length === 4
      && staffWorkspace.staffSeatCount === 5
      && staffWorkspace.members.length === 7
      && staffWorkspace.invitations.length === 5
      && staffWorkspace.roles.length === 7
      && staffWorkspace.properties.length === 1,
    "Staff seat enforcement or the sanitized team workspace is incomplete.",
  );

  await db.exec("reset role; set role service_role");
  const resolvedStaffUser = (await db.query(`select public.resolve_auth_user_by_email(
    'OPS-ADMIN@finance-atlas.example'
  ) as user_id`)).rows[0].user_id;
  const queuedStaffInvitation = (await db.query(`select public.get_staff_invitation_delivery_status(
    '${leasingInvite.invitationId}'
  ) as status`)).rows[0].status;
  const markedStaffInvitation = (await db.query(`select public.mark_staff_invitation_email_sent(
    '${leasingInvite.invitationId}'
  ) as marked`)).rows[0].marked;
  const sentStaffInvitation = (await db.query(`select public.get_staff_invitation_delivery_status(
    '${leasingInvite.invitationId}'
  ) as status`)).rows[0].status;
  assert(
    resolvedStaffUser === invitedAdmin
      && queuedStaffInvitation === "queued"
      && markedStaffInvitation
      && sentStaffInvitation === "sent",
    "The service-only staff identity or invitation-delivery helpers are incomplete.",
  );
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${admin}'; set request.jwt.claim.aal='aal2'`);
  await expectDatabaseError(() => db.query(`select public.resolve_auth_user_by_email(
    'ops-admin@finance-atlas.example'
  )`), "permission denied");
  await expectDatabaseError(() => db.query(`select public.get_staff_invitation_delivery_status(
    '${leasingInvite.invitationId}'
  )`), "permission denied");
  await db.exec("reset role");
  const staffTraces = (await db.query(`select
    (select count(*)::integer from public.invitations where invitation_type='organization_member') as invitations,
    (select count(*)::integer from private.notification_jobs where template_code='staff_invitation') as notification_jobs,
    (select count(*)::integer from audit.audit_events where action_code='membership.invited') as invited_audits,
    (select count(*)::integer from audit.audit_events where action_code='membership.activated') as activated_audits,
    (select count(*)::integer from audit.audit_events where action_code='membership.changed') as changed_audits,
    (select count(*)::integer from audit.audit_events where action_code='membership.scopes_changed') as scope_audits,
    (select count(*)::integer from audit.audit_events where action_code='membership.revoked') as revoked_audits,
    (select count(*)::integer from private.outbox_events where event_type='membership.invited') as invited_events,
    (select count(*)::integer from private.outbox_events where event_type='membership.activated') as activated_events,
    (select count(*)::integer from private.outbox_events where event_type='membership.revoked') as revoked_events
  `)).rows[0];
  assert(
    staffTraces.invitations === 5
      && staffTraces.notification_jobs === 5
      && staffTraces.invited_audits === 5
      && staffTraces.activated_audits === 1
      && staffTraces.changed_audits === 1
      && staffTraces.scope_audits === 1
      && staffTraces.revoked_audits === 1
      && staffTraces.invited_events === 5
      && staffTraces.activated_events === 1
      && staffTraces.revoked_events === 1,
    "Staff invitation, access change, notification, audit, or event traces are incomplete.",
  );

  const defaultPreferenceChannels = {
    email: { payments: true, maintenance: true, messages: true, documents: true, announcements: true },
    sms: { payments: false, maintenance: false, messages: false, documents: false, announcements: false },
    whatsapp: { payments: false, maintenance: false, messages: false, documents: false, announcements: false },
    push: { payments: false, maintenance: false, messages: false, documents: false, announcements: false },
  };
  const phonePreferenceChannels = structuredClone(defaultPreferenceChannels);
  phonePreferenceChannels.sms.maintenance = true;
  phonePreferenceChannels.whatsapp.messages = true;
  phonePreferenceChannels.push.announcements = true;
  const diagnosticNotificationJob = "cb000000-0000-4000-8000-000000000001";
  await db.exec(`reset role;
    insert into private.notification_jobs(
      id,organization_id,template_code,locale,channel,recipient_user_id,recipient_address,
      payload,status,attempts,idempotency_key,created_at
    ) values (
      '${diagnosticNotificationJob}','${organization.organizationId}','payment_receipt_ready','en-US','email','${admin}',
      'admin-secret@finance-atlas.example','{"paymentId":"secret-payment-id"}'::jsonb,'sent',1,
      'diagnostic-notification-0001',now()
    );
    insert into private.notification_deliveries(
      notification_job_id,provider_code,provider_message_id,status,provider_payload
    ) values (
      '${diagnosticNotificationJob}','mail-provider','provider-secret-123','delivered',
      '{"raw":"provider-secret-payload"}'::jsonb
    );
    set role authenticated; set request.jwt.claim.sub='${admin}'; set request.jwt.claim.aal='aal2';
  `);
  const defaultPreferences = (await db.query("select public.get_notification_preferences_workspace() as result")).rows[0].result;
  assert(
    defaultPreferences.profile.version === 1
      && defaultPreferences.channels.email.payments
      && !defaultPreferences.channels.sms.payments
      && !defaultPreferences.marketing.email
      && !defaultPreferences.marketing.sms,
    "Notification preference defaults or the marketing-off invariant are incorrect.",
  );
  await expectDatabaseError(() => db.query(`insert into public.notification_preferences(
    user_id,category,channel,enabled
  ) values ('${admin}','payments','sms',true)`), "permission denied");
  await expectDatabaseError(() => db.query(`select public.update_notification_preferences(
    'en-US',false,false,'standard','${JSON.stringify(phonePreferenceChannels)}'::jsonb,1,
    'preferences-phone-required-0001'
  )`), "PHONE_REQUIRED");
  await expectDatabaseError(() => db.query(`select public.update_notification_preferences(
    'en-US',false,false,'standard','{"email":{"payments":true}}'::jsonb,1,
    'preferences-invalid-matrix-0001'
  )`), "INVALID_CHANNEL_PREFERENCES");

  const updatedPreferences = (await db.query(`select public.update_notification_preferences(
    'es-MX',true,true,'large','${JSON.stringify(defaultPreferenceChannels)}'::jsonb,1,
    'preferences-update-00000001'
  ) as result`)).rows[0].result;
  const replayedPreferences = (await db.query(`select public.update_notification_preferences(
    'es-MX',true,true,'large','${JSON.stringify(defaultPreferenceChannels)}'::jsonb,1,
    'preferences-update-00000001'
  ) as result`)).rows[0].result;
  assert(
    updatedPreferences.version === 2
      && !updatedPreferences.idempotentReplay
      && replayedPreferences.version === 2
      && replayedPreferences.idempotentReplay,
    "Notification preference update replay did not return the canonical response.",
  );
  await expectDatabaseError(() => db.query(`select public.update_notification_preferences(
    'fr-CA',true,true,'large','${JSON.stringify(defaultPreferenceChannels)}'::jsonb,1,
    'preferences-update-00000001'
  )`), "IDEMPOTENCY_CONFLICT");
  await expectDatabaseError(() => db.query(`select public.update_notification_preferences(
    'fr-CA',true,true,'large','${JSON.stringify(defaultPreferenceChannels)}'::jsonb,1,
    'preferences-stale-version-0001'
  )`), "PREFERENCES_VERSION_CONFLICT");
  const ownPreferenceRows = (await db.query("select count(*)::integer as count from public.notification_preferences")).rows[0].count;
  assert(ownPreferenceRows === 20, "The complete notification preference matrix was not persisted.");

  await db.exec(`reset role;
    update public.profiles set primary_phone_e164='+18045550199' where user_id='${admin}';
    set role authenticated; set request.jwt.claim.sub='${admin}'; set request.jwt.claim.aal='aal2';
  `);
  const phonePreferences = (await db.query(`select public.update_notification_preferences(
    'fr-CA',true,false,'large','${JSON.stringify(phonePreferenceChannels)}'::jsonb,2,
    'preferences-update-00000002'
  ) as result`)).rows[0].result;
  const preferenceWorkspace = (await db.query("select public.get_notification_preferences_workspace() as result")).rows[0].result;
  const diagnosticItem = preferenceWorkspace.recentDeliveries.find((item) => item.notificationJobId === diagnosticNotificationJob);
  const serializedPreferenceWorkspace = JSON.stringify(preferenceWorkspace);
  assert(
    phonePreferences.version === 3
      && preferenceWorkspace.profile.hasPhone
      && preferenceWorkspace.profile.locale === "fr-CA"
      && preferenceWorkspace.channels.sms.maintenance
      && preferenceWorkspace.channels.whatsapp.messages
      && diagnosticItem?.latestDeliveryStatus === "delivered"
      && !serializedPreferenceWorkspace.includes("admin-secret@finance-atlas.example")
      && !serializedPreferenceWorkspace.includes("provider-secret-123")
      && !serializedPreferenceWorkspace.includes("secret-payment-id")
      && !serializedPreferenceWorkspace.includes("provider-secret-payload"),
    "Notification preferences, phone-gated channels, or masked delivery diagnostics are incomplete.",
  );

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${outsider}'; set request.jwt.claim.aal='aal2'`);
  const outsiderPreferenceRows = (await db.query("select count(*)::integer as count from public.notification_preferences")).rows[0].count;
  const outsiderPreferenceWorkspace = (await db.query("select public.get_notification_preferences_workspace() as result")).rows[0].result;
  assert(
    outsiderPreferenceRows === 0
      && outsiderPreferenceWorkspace.profile.version === 1
      && outsiderPreferenceWorkspace.recentDeliveries.length === 0,
    "Another user's preference rows or delivery diagnostics leaked through RLS.",
  );
  await expectDatabaseError(() => db.query(`update public.notification_preferences
    set enabled=true where user_id='${admin}'`), "permission denied");
  await db.exec("reset role");
  const preferenceTraces = (await db.query(`select
    (select count(*)::integer from audit.audit_events
      where actor_user_id='${admin}' and action_code='notification_preferences.updated') as audits,
    (select count(*)::integer from private.outbox_events
      where aggregate_id='${admin}' and event_type='notification_preferences.updated') as events,
    (select count(*)::integer from private.idempotency_records
      where actor_scope='user:${admin}' and route='UpdateNotificationPreferences' and state='completed') as idempotency_records
  `)).rows[0];
  assert(
    preferenceTraces.audits === 2
      && preferenceTraces.events === 2
      && preferenceTraces.idempotency_records === 2,
    "Notification preference audit, outbox, or idempotency traces were duplicated or omitted.",
  );

  await db.exec(`set role authenticated; set request.jwt.claim.sub='${admin}'`);
  const vendor = (await db.query(`select public.create_vendor(
    '${organization.organizationId}','Ready Fix Plumbing','dispatch@readyfix.example','+14045551234','vendor-create-0001'
  ) as result`)).rows[0].result;
  assert(vendor.vendorId && vendor.status === "active", "Vendor creation did not return a canonical active vendor.");
  const vendorReplay = (await db.query(`select public.create_vendor(
    '${organization.organizationId}','Ready Fix Plumbing','dispatch@readyfix.example','+14045551234','vendor-create-0001'
  ) as result`)).rows[0].result;
  assert(vendorReplay.vendorId === vendor.vendorId, "Vendor creation replay did not return the canonical vendor.");

  const scopedCoordinator = "c7000000-0000-4000-8000-000000000007";
  await db.exec(`reset role;
    insert into auth.users(id) values ('${scopedCoordinator}');
    insert into public.organization_memberships(id,organization_id,user_id,role_code,status)
    values ('c8000000-0000-4000-8000-000000000008','${organization.organizationId}','${scopedCoordinator}','maintenance_coordinator','active');
    insert into public.membership_property_scopes(organization_id,membership_id,property_id)
    values ('${organization.organizationId}','c8000000-0000-4000-8000-000000000008','${property.propertyId}');
    set role authenticated; set request.jwt.claim.sub='${scopedCoordinator}';
  `);
  await expectDatabaseError(() => db.query(`select public.create_vendor('${organization.organizationId}','Rogue Vendor',null,null,'vendor-scoped-0001')`), "ORGANIZATION_SCOPE_DENIED");
  const scopedDirectory = (await db.query("select public.get_operator_vendor_directory() as result")).rows[0].result;
  assert(scopedDirectory.length === 0, "A property-scoped coordinator unexpectedly saw the unscoped vendor directory.");

  const workOrder = (await db.query(`select public.create_and_assign_work_order(
    '${organization.organizationId}','${maintenance.maintenanceRequestId}','${vendor.vendorId}','Diagnose and repair the kitchen sink leak.',
    null,null,45000,'USD',false,'high','work-order-create-0001'
  ) as result`)).rows[0].result;
  assert(workOrder.workOrderId && workOrder.status === "assigned" && workOrder.ownerApprovalStatus === null, "Property-scoped coordinator could not create and assign a work order within scope.");
  const workOrderReplay = (await db.query(`select public.create_and_assign_work_order(
    '${organization.organizationId}','${maintenance.maintenanceRequestId}','${vendor.vendorId}','Diagnose and repair the kitchen sink leak.',
    null,null,45000,'USD',false,'high','work-order-create-0001'
  ) as result`)).rows[0].result;
  assert(workOrderReplay.workOrderId === workOrder.workOrderId, "Work order creation replay did not return the canonical work order.");
  await expectDatabaseError(() => db.query(`select public.create_and_assign_work_order(
    '${organization.organizationId}','${maintenance.maintenanceRequestId}',null,'Duplicate attempt.',null,null,null,null,false,null,'work-order-duplicate-0001'
  )`), "WORK_ORDER_ALREADY_EXISTS");
  const operatorAfterTriage = (await db.query("select public.get_operator_maintenance_workspace() as result")).rows[0].result;
  assert(operatorAfterTriage.items[0].officialPriority === "high" && operatorAfterTriage.items[0].workOrder.workOrderId === workOrder.workOrderId && operatorAfterTriage.items[0].workOrder.vendorName === "Ready Fix Plumbing", "Operator workspace did not project the assigned work order.");
  const scopedVendorRead = (await db.query("select count(*)::integer as count from public.vendors")).rows[0].count;
  assert(scopedVendorRead === 1, "Property-scoped coordinator could not read the vendor already tied to their own work order.");

  const accepted = (await db.query(`select public.transition_work_order('${workOrder.workOrderId}',1,'accept',null,null,null,null,null,null,'work-order-accept-0001') as result`)).rows[0].result;
  assert(accepted.status === "accepted" && accepted.version === 2, "Accept transition did not advance the work order.");
  await expectDatabaseError(() => db.query(`select public.transition_work_order('${workOrder.workOrderId}',1,'accept',null,null,null,null,null,null,'work-order-accept-stale-0001')`), "WORK_ORDER_VERSION_CONFLICT");
  await expectDatabaseError(() => db.query(`select public.transition_work_order('${workOrder.workOrderId}',2,'start',null,null,null,null,null,null,'work-order-skip-0001')`), "INVALID_TRANSITION");
  const scheduledStart = "2026-07-27T13:00:00-04:00";
  const scheduledEnd = "2026-07-27T15:00:00-04:00";
  const scheduled = (await db.query(`select public.transition_work_order('${workOrder.workOrderId}',2,'schedule',null,'${scheduledStart}','${scheduledEnd}',null,null,null,'work-order-schedule-0001') as result`)).rows[0].result;
  assert(scheduled.status === "scheduled" && scheduled.version === 3, "Schedule transition did not advance the work order.");
  const started = (await db.query(`select public.transition_work_order('${workOrder.workOrderId}',3,'start',null,null,null,null,null,null,'work-order-start-0001') as result`)).rows[0].result;
  assert(started.status === "in_progress" && started.version === 4, "Start transition did not advance the work order.");

  await expectDatabaseError(() => db.query(`select public.transition_work_order('${workOrder.workOrderId}',4,'complete',null,null,null,42500,'Replaced the trap and tightened the supply line.',array[]::uuid[],'work-order-complete-no-evidence-0001')`), "COMPLETION_EVIDENCE_REQUIRED");
  const evidenceGrant = (await db.query(`select public.create_document_upload_grant(
    '${organization.organizationId}','work_order','${workOrder.workOrderId}','work_order_evidence','Completed repair','after.jpg','image/jpeg',100,'work-order-evidence-grant-0001'
  ) as result`)).rows[0].result;
  assert(evidenceGrant.storagePath.includes(`/work_order/${workOrder.workOrderId}/`), "Work order evidence did not receive a work-order-scoped upload grant.");
  await db.exec("reset role; set role service_role");
  const evidenceDocument = (await db.query(`select public.finalize_document('${scopedCoordinator}','${evidenceGrant.grantId}','${"e".repeat(64)}','work-order-evidence-finalize-0001') as result`)).rows[0].result;
  await db.exec(`reset role; update public.document_versions set upload_status='clean' where document_id='${evidenceDocument.documentId}'`);
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${scopedCoordinator}'`);
  const completed = (await db.query(`select public.transition_work_order('${workOrder.workOrderId}',4,'complete',null,null,null,42500,'Replaced the trap and tightened the supply line.',array['${evidenceDocument.documentId}'::uuid],'work-order-complete-0001') as result`)).rows[0].result;
  assert(completed.status === "completed" && completed.version === 5, "Complete transition did not finalize the work order.");
  const closed = (await db.query(`select public.transition_work_order('${workOrder.workOrderId}',5,'close',null,null,null,null,null,null,'work-order-close-0001') as result`)).rows[0].result;
  assert(closed.status === "closed" && closed.version === 6, "Close transition did not finalize the work order.");
  const closedRequest = (await db.query(`select status,closed_at from public.maintenance_requests where id='${maintenance.maintenanceRequestId}'`)).rows[0];
  assert(closedRequest.status === "closed" && closedRequest.closed_at !== null, "Closing the work order did not sync the parent maintenance request.");

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${resident}'`);
  const secondMaintenance = (await db.query(`select public.submit_maintenance_request(
    '${activation.tenancyId}','hvac','Furnace is not heating','The furnace stopped producing heat overnight.',null,null,'[]'::jsonb,array[]::uuid[],'maintenance-request-0002'
  ) as result`)).rows[0].result;
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${scopedCoordinator}'`);
  const highCostWorkOrder = (await db.query(`select public.create_and_assign_work_order(
    '${organization.organizationId}','${secondMaintenance.maintenanceRequestId}','${vendor.vendorId}','Diagnose and repair the furnace.',
    null,null,150000,'USD',false,null,'work-order-highcost-0001'
  ) as result`)).rows[0].result;
  assert(highCostWorkOrder.status === "assigned" && highCostWorkOrder.ownerApprovalStatus === "pending", "A high-estimate work order did not require owner approval by default.");
  await db.query(`select public.transition_work_order('${highCostWorkOrder.workOrderId}',1,'accept',null,null,null,null,null,null,'work-order-highcost-accept-0001')`);
  await db.query(`select public.transition_work_order('${highCostWorkOrder.workOrderId}',2,'schedule',null,'${scheduledStart}','${scheduledEnd}',null,null,null,'work-order-highcost-schedule-0001')`);
  await db.query(`select public.transition_work_order('${highCostWorkOrder.workOrderId}',3,'start',null,null,null,null,null,null,'work-order-highcost-start-0001')`);
  const pendingApproval = (await db.query(`select public.transition_work_order('${highCostWorkOrder.workOrderId}',4,'complete',null,null,null,150000,'Replaced the igniter; awaiting owner sign-off on cost.',array['${evidenceDocument.documentId}'::uuid],'work-order-highcost-complete-0001') as result`)).rows[0].result;
  assert(pendingApproval.status === "awaiting_approval" && pendingApproval.version === 5, "A high-cost work order bypassed the owner-approval gate.");
  await expectDatabaseError(() => db.query(`select public.transition_work_order('${highCostWorkOrder.workOrderId}',5,'close',null,null,null,null,null,null,'work-order-highcost-close-0001')`), "INVALID_TRANSITION");

  await db.exec("reset role");
  const approvalRows = (await db.query(`select id,owner_entity_id from public.owner_approval_requests where work_order_id='${highCostWorkOrder.workOrderId}' order by owner_entity_id`)).rows;
  assert(approvalRows.length === 2, "The work order did not create one approval request for each active owner interest.");
  const approvalA = approvalRows.find((row) => row.owner_entity_id === ownerEntityA);
  const approvalB = approvalRows.find((row) => row.owner_entity_id === ownerEntityB);
  assert(approvalA && approvalB, "Owner approval requests were not tied to the expected owner entities.");

  await db.exec(`set role authenticated; set request.jwt.claim.sub='${ownerA}'; set request.jwt.claim.aal='aal1'`);
  const ownerAWorkspace = (await db.query("select public.get_owner_approval_workspace() as result")).rows[0].result;
  assert(ownerAWorkspace.items.length === 1 && ownerAWorkspace.items[0].approvalRequestId === approvalA.id && ownerAWorkspace.items[0].ownerEntityId === ownerEntityA, "Co-owner A could not read their exact sanitized approval projection.");
  await expectDatabaseError(() => db.query(`select public.respond_to_owner_approval('${approvalA.id}','approved',null,1,'owner-a-approval-0001')`), "MFA_STEP_UP_REQUIRED");
  await db.exec("set request.jwt.claim.aal='aal2'");
  const ownerADecision = (await db.query(`select public.respond_to_owner_approval('${approvalA.id}','approved',null,1,'owner-a-approval-0001') as result`)).rows[0].result;
  assert(ownerADecision.approvalRequestStatus === "approved" && ownerADecision.workOrderApprovalStatus === "pending" && ownerADecision.workOrderStatus === "awaiting_approval", "The first co-owner decision incorrectly completed the work order.");
  const ownerAReplay = (await db.query(`select public.respond_to_owner_approval('${approvalA.id}','approved',null,1,'owner-a-approval-0001') as result`)).rows[0].result;
  assert(ownerAReplay.approvalRequestVersion === ownerADecision.approvalRequestVersion, "Owner approval replay did not return the canonical result.");
  await expectDatabaseError(() => db.query(`select public.respond_to_owner_approval('${approvalA.id}','rejected','Changed decision.',1,'owner-a-approval-0001')`), "IDEMPOTENCY_CONFLICT");
  await expectDatabaseError(() => db.query(`select public.respond_to_owner_approval('${approvalA.id}','approved',null,1,'owner-a-stale-0002')`), "VERSION_CONFLICT");

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${ownerB}'; set request.jwt.claim.aal='aal2'`);
  const ownerBWorkspace = (await db.query("select public.get_owner_approval_workspace() as result")).rows[0].result;
  assert(ownerBWorkspace.items.length === 1 && ownerBWorkspace.items[0].approvalRequestId === approvalB.id && ownerBWorkspace.items[0].ownerEntityId === ownerEntityB, "Co-owner B crossed the exact owner-entity projection boundary.");
  await expectDatabaseError(() => db.query(`select public.respond_to_owner_approval('${approvalA.id}','approved',null,2,'owner-b-cross-owner-0001')`), "OWNER_APPROVAL_SCOPE_DENIED");
  const ownerBDecision = (await db.query(`select public.respond_to_owner_approval('${approvalB.id}','approved','Estimate and completion evidence reviewed.',1,'owner-b-approval-0001') as result`)).rows[0].result;
  assert(ownerBDecision.workOrderApprovalStatus === "approved" && ownerBDecision.workOrderStatus === "completed" && ownerBDecision.workOrderVersion === 6, "Final co-owner approval did not release the awaiting work order.");

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${scopedCoordinator}'`);
  const approvedClosed = (await db.query(`select public.transition_work_order('${highCostWorkOrder.workOrderId}',6,'close',null,null,null,null,null,null,'work-order-highcost-close-approved-0001') as result`)).rows[0].result;
  assert(approvedClosed.status === "closed" && approvedClosed.version === 7, "The fully approved work order could not be closed.");

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${admin}'`);
  const adminVendorDirectory = (await db.query("select public.get_operator_vendor_directory() as result")).rows[0].result;
  assert(adminVendorDirectory.length === 1 && adminVendorDirectory[0].vendorId === vendor.vendorId, "Org-wide admin did not see the vendor directory.");
  const operatorApprovals = (await db.query("select public.get_operator_owner_approval_workspace() as result")).rows[0].result;
  assert(operatorApprovals.items.length === 2 && operatorApprovals.items.every((item) => item.status === "approved"), "The operator approval projection omitted an owner decision.");

  await db.exec(`reset role;
    insert into public.ledger_accounts(organization_id,accounting_book_id,account_code,account_name,account_class,normal_balance) values
      ('${organization.organizationId}','${entity.accountingBookId}','1000','Operating cash clearing','asset','debit'),
      ('${organization.organizationId}','${entity.accountingBookId}','4100','Management fee income','revenue','credit'),
      ('${organization.organizationId}','${entity.accountingBookId}','5000','Maintenance expense','expense','debit')
    on conflict (accounting_book_id,account_code) do nothing;

    with accounts as (
      select
        (array_agg(id) filter (where account_code='1000'))[1] as cash_id,
        (array_agg(id) filter (where account_code='4100'))[1] as management_fee_id,
        (array_agg(id) filter (where account_code='5000'))[1] as maintenance_id
      from public.ledger_accounts
      where accounting_book_id='${entity.accountingBookId}'
    ), expense_transaction as (
      insert into public.journal_transactions(
        organization_id,operating_entity_id,accounting_book_id,transaction_type,effective_date,
        source_type,idempotency_key,currency_code,created_by
      ) values (
        '${organization.organizationId}','${entity.operatingEntityId}','${entity.accountingBookId}',
        'maintenance_cost','2026-08-15','work_order','statement-expense-0001','USD','${admin}'
      ) returning id
    )
    insert into public.journal_entries(
      journal_transaction_id,organization_id,accounting_book_id,ledger_account_id,
      debit_minor,credit_minor,property_id,memo
    )
    select et.id,'${organization.organizationId}'::uuid,'${entity.accountingBookId}'::uuid,a.maintenance_id,2501,0,'${property.propertyId}'::uuid,'Maintenance expense'
    from expense_transaction et cross join accounts a
    union all
    select et.id,'${organization.organizationId}'::uuid,'${entity.accountingBookId}'::uuid,a.cash_id,0,2501,'${property.propertyId}'::uuid,'Maintenance payment'
    from expense_transaction et cross join accounts a;

    with accounts as (
      select
        (array_agg(id) filter (where account_code='1000'))[1] as cash_id,
        (array_agg(id) filter (where account_code='4100'))[1] as management_fee_id
      from public.ledger_accounts
      where accounting_book_id='${entity.accountingBookId}'
    ), fee_transaction as (
      insert into public.journal_transactions(
        organization_id,operating_entity_id,accounting_book_id,transaction_type,effective_date,
        source_type,idempotency_key,currency_code,created_by
      ) values (
        '${organization.organizationId}','${entity.operatingEntityId}','${entity.accountingBookId}',
        'management_fee','2026-08-31','management_agreement','statement-fee-0001','USD','${admin}'
      ) returning id
    )
    insert into public.journal_entries(
      journal_transaction_id,organization_id,accounting_book_id,ledger_account_id,
      debit_minor,credit_minor,property_id,memo
    )
    select ft.id,'${organization.organizationId}'::uuid,'${entity.accountingBookId}'::uuid,a.cash_id,1001,0,'${property.propertyId}'::uuid,'Management fee receivable'
    from fee_transaction ft cross join accounts a
    union all
    select ft.id,'${organization.organizationId}'::uuid,'${entity.accountingBookId}'::uuid,a.management_fee_id,0,1001,'${property.propertyId}'::uuid,'Management fee income'
    from fee_transaction ft cross join accounts a;
    set role authenticated; set request.jwt.claim.sub='${admin}';
  `);
  await db.exec(`reset role;
    update public.ownership_interests set ownership_fraction=0.4 where owner_entity_id='${ownerEntityB}';
    set role authenticated; set request.jwt.claim.sub='${admin}';
  `);
  await expectDatabaseError(() => db.query(`select public.get_owner_statement_draft(
    '${organization.organizationId}','${entity.accountingBookId}','${ownerEntityA}','${property.propertyId}',
    '2026-08-01','2026-08-31'
  )`), "OWNERSHIP_ALLOCATION_INCOMPLETE");
  await db.exec(`reset role;
    update public.ownership_interests set ownership_fraction=0.5 where owner_entity_id='${ownerEntityB}';
    set role authenticated; set request.jwt.claim.sub='${admin}';
  `);
  const ownerADraft = (await db.query(`select public.get_owner_statement_draft(
    '${organization.organizationId}','${entity.accountingBookId}','${ownerEntityA}','${property.propertyId}',
    '2026-08-01','2026-08-31'
  ) as result`)).rows[0].result;
  const ownerBDraft = (await db.query(`select public.get_owner_statement_draft(
    '${organization.organizationId}','${entity.accountingBookId}','${ownerEntityB}','${property.propertyId}',
    '2026-08-01','2026-08-31'
  ) as result`)).rows[0].result;
  assert(ownerADraft.incomeMinor === 92500 && ownerADraft.expenseMinor === 1251 && ownerADraft.managementFeeMinor === 501 && ownerADraft.netOwnerPositionMinor === 90748, "Owner A statement allocation did not use deterministic largest-remainder rounding.");
  assert(ownerBDraft.incomeMinor === 92500 && ownerBDraft.expenseMinor === 1250 && ownerBDraft.managementFeeMinor === 500 && ownerBDraft.netOwnerPositionMinor === 90750, "Owner B statement allocation did not reconcile to the property ledger.");
  assert(ownerADraft.sourceEntryCount === 3 && ownerADraft.sourceTransactionCount === 3 && ownerADraft.lines.length === 3, "The statement draft did not use only posted revenue and expense ledger lines.");

  await expectDatabaseError(() => db.query(`select public.finalize_owner_statement(
    '${organization.organizationId}','${entity.accountingBookId}','${ownerEntityA}','${property.propertyId}',
    '2026-08-01','2026-08-31','${"0".repeat(64)}','owner-statement-a-stale-0001',null
  )`), "OWNER_STATEMENT_CALCULATION_CHANGED");
  const ownerAStatement = (await db.query(`select public.finalize_owner_statement(
    '${organization.organizationId}','${entity.accountingBookId}','${ownerEntityA}','${property.propertyId}',
    '2026-08-01','2026-08-31','${ownerADraft.sha256Hex}','owner-statement-a-0001',null
  ) as result`)).rows[0].result;
  const ownerAStatementReplay = (await db.query(`select public.finalize_owner_statement(
    '${organization.organizationId}','${entity.accountingBookId}','${ownerEntityA}','${property.propertyId}',
    '2026-08-01','2026-08-31','${ownerADraft.sha256Hex}','owner-statement-a-0001',null
  ) as result`)).rows[0].result;
  assert(ownerAStatement.versionNumber === 1 && ownerAStatement.netOwnerPositionMinor === 90748 && ownerAStatementReplay.statementSnapshotId === ownerAStatement.statementSnapshotId, "Owner statement finalization or idempotent replay failed.");
  await expectDatabaseError(() => db.query(`select public.finalize_owner_statement(
    '${organization.organizationId}','${entity.accountingBookId}','${ownerEntityA}','${property.propertyId}',
    '2026-08-01','2026-08-31','${ownerADraft.sha256Hex}','owner-statement-a-duplicate-0001',null
  )`), "OWNER_STATEMENT_ALREADY_FINALIZED");
  const ownerBStatement = (await db.query(`select public.finalize_owner_statement(
    '${organization.organizationId}','${entity.accountingBookId}','${ownerEntityB}','${property.propertyId}',
    '2026-08-01','2026-08-31','${ownerBDraft.sha256Hex}','owner-statement-b-0001',null
  ) as result`)).rows[0].result;
  assert(ownerAStatement.netOwnerPositionMinor+ownerBStatement.netOwnerPositionMinor === 181498, "Co-owner statements do not reconcile to property income less expenses and fees.");

  await db.exec(`reset role;
    with accounts as (
      select
        (array_agg(id) filter (where account_code='1000'))[1] as cash_id,
        (array_agg(id) filter (where account_code='5000'))[1] as maintenance_id
      from public.ledger_accounts
      where accounting_book_id='${entity.accountingBookId}'
    ), correction_transaction as (
      insert into public.journal_transactions(
        organization_id,operating_entity_id,accounting_book_id,transaction_type,effective_date,
        source_type,idempotency_key,currency_code,created_by
      ) values (
        '${organization.organizationId}','${entity.operatingEntityId}','${entity.accountingBookId}',
        'maintenance_cost_correction','2026-08-20','work_order','statement-expense-correction-0001','USD','${admin}'
      ) returning id
    )
    insert into public.journal_entries(
      journal_transaction_id,organization_id,accounting_book_id,ledger_account_id,
      debit_minor,credit_minor,property_id,memo
    )
    select ct.id,'${organization.organizationId}'::uuid,'${entity.accountingBookId}'::uuid,a.maintenance_id,99,0,'${property.propertyId}'::uuid,'Late maintenance expense'
    from correction_transaction ct cross join accounts a
    union all
    select ct.id,'${organization.organizationId}'::uuid,'${entity.accountingBookId}'::uuid,a.cash_id,0,99,'${property.propertyId}'::uuid,'Late maintenance payment'
    from correction_transaction ct cross join accounts a;
    set role authenticated; set request.jwt.claim.sub='${admin}';
  `);
  const correctedOwnerADraft = (await db.query(`select public.get_owner_statement_draft(
    '${organization.organizationId}','${entity.accountingBookId}','${ownerEntityA}','${property.propertyId}',
    '2026-08-01','2026-08-31'
  ) as result`)).rows[0].result;
  await expectDatabaseError(() => db.query(`select public.finalize_owner_statement(
    '${organization.organizationId}','${entity.accountingBookId}','${ownerEntityA}','${property.propertyId}',
    '2026-08-01','2026-08-31','${correctedOwnerADraft.sha256Hex}','owner-statement-a-correction-no-reason',null
  )`), "OWNER_STATEMENT_CORRECTION_REASON_REQUIRED");
  const correctedOwnerAStatement = (await db.query(`select public.finalize_owner_statement(
    '${organization.organizationId}','${entity.accountingBookId}','${ownerEntityA}','${property.propertyId}',
    '2026-08-01','2026-08-31','${correctedOwnerADraft.sha256Hex}','owner-statement-a-correction-0001','Late maintenance invoice posted'
  ) as result`)).rows[0].result;
  assert(correctedOwnerAStatement.versionNumber === 2 && correctedOwnerAStatement.statementSeriesId === ownerAStatement.statementSeriesId && correctedOwnerAStatement.netOwnerPositionMinor === 90698, "Owner statement correction did not create the next immutable version.");

  const remittanceEvidenceDocumentId = "fa000000-0000-4000-8000-000000000001";
  const remittanceEvidenceVersionId = "fa000000-0000-4000-8000-000000000002";
  await db.exec(`reset role;
    insert into public.documents(
      id,organization_id,property_id,document_type,title,source,status,
      operator_supplied_unverified,created_by
    ) values (
      '${remittanceEvidenceDocumentId}','${organization.organizationId}','${property.propertyId}',
      'owner_remittance_evidence','Owner A ACH confirmation','operator_supplied','active',false,'${admin}'
    );
    insert into public.document_versions(
      id,organization_id,document_id,version_number,storage_bucket,storage_path,
      mime_type,size_bytes,sha256_hex,original_filename,uploaded_by,upload_status
    ) values (
      '${remittanceEvidenceVersionId}','${organization.organizationId}','${remittanceEvidenceDocumentId}',1,
      'private-documents','${organization.organizationId}/${remittanceEvidenceDocumentId}/ach-confirmation.pdf',
      'application/pdf',1200,'${"e".repeat(64)}','ach-confirmation.pdf','${admin}','clean'
    );
    set role authenticated; set request.jwt.claim.sub='${admin}';
  `);
  const remittance = (await db.query(`select public.record_owner_remittance(
    '${organization.organizationId}','${ownerEntityA}','${property.propertyId}',
    '${correctedOwnerAStatement.statementSnapshotId}',50000,'USD',current_date,
    'ACH-OWNER-A-0001','${remittanceEvidenceDocumentId}','owner-remittance-a-0001'
  ) as result`)).rows[0].result;
  const remittanceReplay = (await db.query(`select public.record_owner_remittance(
    '${organization.organizationId}','${ownerEntityA}','${property.propertyId}',
    '${correctedOwnerAStatement.statementSnapshotId}',50000,'USD',current_date,
    'ACH-OWNER-A-0001','${remittanceEvidenceDocumentId}','owner-remittance-a-0001'
  ) as result`)).rows[0].result;
  assert(remittance.remittanceId === remittanceReplay.remittanceId && remittance.availableOwnerPayableMinor === 40698, "Owner remittance replay did not return the canonical result or payable balance.");
  await expectDatabaseError(() => db.query(`select public.record_owner_remittance(
    '${organization.organizationId}','${ownerEntityA}','${property.propertyId}',
    '${correctedOwnerAStatement.statementSnapshotId}',40000,'USD',current_date,
    'ACH-OWNER-A-0001','${remittanceEvidenceDocumentId}','owner-remittance-a-0001'
  )`), "IDEMPOTENCY_CONFLICT");
  await expectDatabaseError(() => db.query(`select public.record_owner_remittance(
    '${organization.organizationId}','${ownerEntityA}','${property.propertyId}',
    '${correctedOwnerAStatement.statementSnapshotId}',50000,'USD',current_date,
    'ACH-OWNER-A-0002','${remittanceEvidenceDocumentId}','owner-remittance-overpay-0001'
  )`), "STATEMENT_REMITTANCE_EXCEEDS_AVAILABLE");
  await expectDatabaseError(() => db.query(`select public.record_owner_remittance(
    '${organization.organizationId}','${ownerEntityA}','${property.propertyId}',
    '${correctedOwnerAStatement.statementSnapshotId}',1000,'CAD',current_date,
    'ACH-OWNER-A-CAD','${remittanceEvidenceDocumentId}','owner-remittance-currency-0001'
  )`), "CURRENCY_MISMATCH");
  await expectDatabaseError(() => db.query(`select public.record_owner_remittance(
    '${organization.organizationId}','${ownerEntityA}','${property.propertyId}',
    '${correctedOwnerAStatement.statementSnapshotId}',1000,'USD',current_date,
    'ACH-OWNER-A-0001','${remittanceEvidenceDocumentId}','owner-remittance-duplicate-ref-0001'
  )`), "DUPLICATE_EXTERNAL_REFERENCE");
  await expectDatabaseError(() => db.query(`select public.record_owner_remittance(
    '${organization.organizationId}','${ownerEntityA}','${property.propertyId}',
    '${correctedOwnerAStatement.statementSnapshotId}',1000,'USD',current_date,
    'ACH-OWNER-A-NO-EVIDENCE',null,'owner-remittance-no-evidence-0001'
  )`), "REMITTANCE_EVIDENCE_REQUIRED");

  await db.exec("reset role");
  const ownerAccounting = (await db.query(`select
    (select count(*)::integer from public.journal_transactions
      where source_type='owner_statement_snapshot') as accrual_transactions,
    (select count(*)::integer from public.journal_transactions
      where source_type='owner_remittance_record') as remittance_transactions,
    (select sum(je.credit_minor-je.debit_minor)::integer
      from public.journal_entries je
      join public.ledger_accounts la on la.id=je.ledger_account_id
      where la.accounting_book_id='${entity.accountingBookId}'
        and la.account_code='2100'
        and je.owner_entity_id='${ownerEntityA}'
        and je.property_id='${property.propertyId}') as owner_a_payable,
    (select sum(je.debit_minor)::integer from public.journal_entries je
      where je.journal_transaction_id='${remittance.journalTransactionId}') as remittance_debits,
    (select sum(je.credit_minor)::integer from public.journal_entries je
      where je.journal_transaction_id='${remittance.journalTransactionId}') as remittance_credits
  `)).rows[0];
  assert(ownerAccounting.accrual_transactions === 3 && ownerAccounting.remittance_transactions === 1, "Statement accrual or remittance journals were not posted exactly once.");
  assert(ownerAccounting.owner_a_payable === 40698 && ownerAccounting.remittance_debits === 50000 && ownerAccounting.remittance_credits === 50000, "Owner payable did not reconcile to the balanced remittance journal.");

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${ownerA}'`);
  const ownerAStatementRows = (await db.query("select count(*)::integer as count from reporting.owner_statement_snapshots")).rows[0].count;
  await expectDatabaseError(() => db.query("select count(*) from public.owner_remittance_records"), "permission denied");
  const ownerAStatements = (await db.query("select public.get_owner_statement_workspace() as result")).rows[0].result;
  const ownerAStatementDetail = (await db.query(`select public.get_owner_statement_detail('${correctedOwnerAStatement.statementSnapshotId}') as result`)).rows[0].result;
  assert(ownerAStatementRows === 2 && ownerAStatements.items.length === 2 && ownerAStatements.remittances.length === 1 && ownerAStatementDetail.versionNumber === 2 && ownerAStatementDetail.snapshot.lines.length === 3 && ownerAStatementDetail.remittances.length === 1 && ownerAStatementDetail.ownerPayableMinor === 40698, "Owner A could not read their exact sanitized statement and remittance history.");
  await expectDatabaseError(() => db.query(`select public.get_owner_statement_detail('${ownerBStatement.statementSnapshotId}')`), "OWNER_STATEMENT_NOT_FOUND");

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${ownerB}'`);
  const ownerBStatementRows = (await db.query("select count(*)::integer as count from reporting.owner_statement_snapshots")).rows[0].count;
  await expectDatabaseError(() => db.query("select count(*) from public.owner_remittance_records"), "permission denied");
  const ownerBStatementWorkspace = (await db.query("select public.get_owner_statement_workspace() as result")).rows[0].result;
  assert(ownerBStatementRows === 1 && ownerBStatementWorkspace.remittances.length === 0, "Co-owner B crossed the exact owner-entity statement or remittance DTO boundary.");

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${admin}'`);
  const operatorStatements = (await db.query("select public.get_operator_owner_statement_workspace() as result")).rows[0].result;
  const operatorOwnerA = operatorStatements.owners.find((item) => item.ownerEntityId === ownerEntityA);
  assert(operatorStatements.owners.length === 2 && operatorOwnerA?.latestStatement.versionNumber === 2 && operatorOwnerA.latestStatement.availableToRemitMinor === 40698 && operatorOwnerA.ownerPayableMinor === 40698 && operatorOwnerA.remittances.length === 1 && operatorOwnerA.evidenceDocuments.length === 1, "The operator statement workspace omitted the latest correction, payable, evidence, or remittance.");

  await db.exec(`reset role;
    update public.organization_subscriptions set plan_code='starter' where organization_id='${organization.organizationId}';
    set role authenticated; set request.jwt.claim.sub='${admin}';
  `);
  await expectDatabaseError(() => db.query(`select public.get_owner_statement_draft(
    '${organization.organizationId}','${entity.accountingBookId}','${ownerEntityA}','${property.propertyId}',
    '2026-08-01','2026-08-31'
  )`), "OWNER_STATEMENT_PLAN_UNAVAILABLE");
  await expectDatabaseError(() => db.query(`select public.record_owner_remittance(
    '${organization.organizationId}','${ownerEntityA}','${property.propertyId}',
    '${correctedOwnerAStatement.statementSnapshotId}',1000,'USD',current_date,
    'ACH-OWNER-A-PLAN','${remittanceEvidenceDocumentId}','owner-remittance-plan-0001'
  )`), "OWNER_REMITTANCE_PLAN_UNAVAILABLE");
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${ownerA}'`);
  const unentitledOwnerStatements = (await db.query("select count(*)::integer as count from reporting.owner_statement_snapshots")).rows[0].count;
  const unentitledOwnerWorkspace = (await db.query("select public.get_owner_statement_workspace() as result")).rows[0].result;
  assert(unentitledOwnerStatements === 0 && unentitledOwnerWorkspace.remittances.length === 0, "A plan without the owner portal entitlement exposed statement or remittance data.");
  await db.exec(`reset role;
    update public.organization_subscriptions set plan_code='growth' where organization_id='${organization.organizationId}';
  `);

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${outsider}'`);
  const outsiderWorkOrders = (await db.query("select count(*)::integer as count from public.work_orders")).rows[0].count;
  const outsiderVendors = (await db.query("select count(*)::integer as count from public.vendors")).rows[0].count;
  const outsiderStatements = (await db.query("select count(*)::integer as count from reporting.owner_statement_snapshots")).rows[0].count;
  const outsiderStatementWorkspace = (await db.query("select public.get_owner_statement_workspace() as result")).rows[0].result;
  assert(outsiderWorkOrders === 0 && outsiderVendors === 0 && outsiderStatements === 0 && outsiderStatementWorkspace.items.length === 0, "Work order, vendor, or owner statement data leaked to an unrelated user.");
  await expectDatabaseError(() => db.query(`select public.transition_work_order('${workOrder.workOrderId}',6,'cancel','Unauthorized cancel.',null,null,null,null,null,'outsider-work-order-cancel-0001')`), "PROPERTY_SCOPE_DENIED");
  await expectDatabaseError(() => db.query(`select public.record_owner_remittance(
    '${organization.organizationId}','${ownerEntityA}','${property.propertyId}',
    '${correctedOwnerAStatement.statementSnapshotId}',1000,'USD',current_date,
    'ACH-OWNER-A-OUTSIDER','${remittanceEvidenceDocumentId}','owner-remittance-outsider-0001'
  )`), "OWNER_REMITTANCE_SCOPE_DENIED");
  await expectDatabaseError(() => db.query(`insert into public.owner_remittance_records(
    organization_id,accounting_book_id,owner_entity_id,property_id,journal_transaction_id,
    evidence_document_id,public_reference,amount_minor,currency_code,paid_on,recorded_by
  ) values (
    '${organization.organizationId}','${entity.accountingBookId}','${ownerEntityA}','${property.propertyId}',
    '${remittance.journalTransactionId}','${remittanceEvidenceDocumentId}','REM-FORGED',1,'USD',current_date,'${outsider}'
  )`), "permission denied");

  await db.exec("reset role");
  const workOrderTraces = (await db.query(`select
    (select count(*)::integer from private.outbox_events where event_type='work_order.created') as created,
    (select count(*)::integer from private.outbox_events where event_type='work_order.assigned') as assigned,
    (select count(*)::integer from private.outbox_events where event_type='owner_approval.requested') as approvals,
    (select count(*)::integer from private.outbox_events where event_type='owner_approval.responded') as approvalresponses,
    (select count(*)::integer from private.outbox_events where event_type='work_order.status_changed') as statuschanges,
      (select count(*)::integer from private.outbox_events where event_type='work_order.completed') as completions,
      (select count(*)::integer from public.owner_approval_decisions) as approvaldecisions,
      (select count(*)::integer from private.outbox_events where event_type='owner_statement.finalized') as statementevents,
      (select count(*)::integer from private.outbox_events where event_type='notification.requested' and aggregate_type='owner_statement_snapshot') as statementnotifications,
      (select count(*)::integer from audit.audit_events where action_code='owner_statement.finalized') as statementaudits,
      (select count(*)::integer from private.outbox_events where event_type='owner_remittance.recorded') as remittanceevents,
      (select count(*)::integer from private.outbox_events where event_type='notification.requested' and aggregate_type='owner_remittance_record') as remittancenotifications,
      (select count(*)::integer from audit.audit_events where action_code='owner_remittance.recorded') as remittanceaudits
  `)).rows[0];
  assert(workOrderTraces.created === 2 && workOrderTraces.assigned === 2 && workOrderTraces.approvals === 1 && workOrderTraces.approvalresponses === 2 && workOrderTraces.statuschanges === 11 && workOrderTraces.completions === 2 && workOrderTraces.approvaldecisions === 2, "Work order audit/outbox trace is incomplete.");
  assert(workOrderTraces.statementevents === 3 && workOrderTraces.statementnotifications === 3 && workOrderTraces.statementaudits === 3, "Owner statement audit, domain-event, or notification trace is incomplete.");
  assert(workOrderTraces.remittanceevents === 1 && workOrderTraces.remittancenotifications === 1 && workOrderTraces.remittanceaudits === 1, "Owner remittance audit, domain-event, or notification trace is incomplete.");
  await expectDatabaseError(() => db.query(`update public.owner_approval_decisions set reason='Changed' where approval_request_id='${approvalA.id}'`), "OWNER_APPROVAL_DECISION_APPEND_ONLY");
  await expectDatabaseError(() => db.query(`update reporting.owner_statement_snapshots set income_minor=1 where id='${ownerAStatement.statementSnapshotId}'`), "OWNER_STATEMENT_APPEND_ONLY");
  await expectDatabaseError(() => db.query(`update public.owner_remittance_records set amount_minor=1 where id='${remittance.remittanceId}'`), "APPEND_ONLY_RECORD");
  await db.exec("reset role");
  await db.exec(`update public.provider_connections set
    status='enabled',capabilities='{"card_payments":"active","us_bank_account_ach_payments":"active"}'::jsonb,
    charges_enabled=true,payouts_enabled=true where id='${providerConnection.providerConnectionId}'`);
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${resident}'`);
  const residentSummary = (await db.query("select public.get_resident_balance_summary() as result")).rows[0].result;
  assert(residentSummary.items.length === 1 && residentSummary.items[0].balanceMinor === 227500 && residentSummary.items[0].nextDueAmountMinor === 185000, "Resident balance projection did not reflect the reopened receivable.");
  const residentCharges = (await db.query("select count(*)::integer as count from public.charges")).rows[0].count;
  assert(residentCharges === 1, "Resident could not read their own canonical charge.");
  const paymentOptions = (await db.query("select public.get_resident_payment_session_options() as result")).rows[0].result;
  assert(paymentOptions.tenancies.length === 1 && paymentOptions.tenancies[0].availableMethods.includes("card") && paymentOptions.tenancies[0].charges[0].remainingMinor === 185000, "Resident payment options did not expose the payable connected tenancy.");
  const paymentReturnUrl = "https://app.crecy.example/payments/new?payment=return";
  const sessionAllocations = JSON.stringify([{ chargeId: generated.chargeIds[0], amountMinor: 50000 }]);
  await expectDatabaseError(() => db.query(`select public.prepare_resident_payment_session(
    '${activation.tenancyId}',50000,'CAD','${sessionAllocations}'::jsonb,'card','${paymentReturnUrl}','resident-payment-currency-0001'
  )`), "CURRENCY_MISMATCH");
  await expectDatabaseError(() => db.query(`select public.prepare_resident_payment_session(
    '${activation.tenancyId}',50000,'USD','[{"chargeId":"${generated.chargeIds[0]}","amountMinor":25000},{"chargeId":"${generated.chargeIds[0]}","amountMinor":25000}]'::jsonb,'card','${paymentReturnUrl}','resident-payment-duplicate-0001'
  )`), "DUPLICATE_ALLOCATION_CHARGE");
  const paymentPreparation = (await db.query(`select public.prepare_resident_payment_session(
    '${activation.tenancyId}',50000,'USD','${sessionAllocations}'::jsonb,'card','${paymentReturnUrl}','resident-payment-session-0001'
  ) as result`)).rows[0].result;
  assert(paymentPreparation.paymentId && paymentPreparation.paymentAttemptId && paymentPreparation.providerAccountId === "acct_testFinance" && paymentPreparation.providerMethodCode === "card", "Payment session preparation did not return stable connected-account context.");
  const preparedResidentHistory = (await db.query("select public.get_resident_payment_history() as result")).rows[0].result;
  assert(preparedResidentHistory.items.length === 1 && preparedResidentHistory.items[0].paymentId === payment.paymentId, "An uninitiated provider preparation leaked into resident payment history.");
  await expectDatabaseError(() => db.query(`insert into public.payment_attempts(
    organization_id,payment_id,provider_connection_id,method_code,provider_event_account_id,provider_status,allocation_preference,idempotency_key,expires_at
  ) values ('${organization.organizationId}','${paymentPreparation.paymentId}','${providerConnection.providerConnectionId}','card','acct_forged','creating','[]'::jsonb,'forged-attempt',now()+interval '30 minutes')`), "permission denied");
  await db.exec("reset role; set role service_role");
  const paymentSession = (await db.query(`select public.complete_resident_payment_session(
    '${resident}','${organization.organizationId}','${paymentPreparation.paymentId}','${paymentPreparation.paymentAttemptId}',
    '${activation.tenancyId}',50000,'USD','${sessionAllocations}'::jsonb,'card','${paymentReturnUrl}',
    '${providerConnection.providerConnectionId}','acct_testFinance','cs_test_resident0001',null,'open',
    'https://checkout.stripe.com/c/pay/cs_test_resident0001',now()+interval '30 minutes','resident-payment-session-0001'
  ) as result`)).rows[0].result;
  assert(paymentSession.status === "pending" && paymentSession.checkoutUrl.includes("checkout.stripe.com") && paymentSession.paymentId === paymentPreparation.paymentId, "Provider Checkout completion did not persist the pending session.");
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${resident}'`);
  const paymentSessionReplay = (await db.query(`select public.prepare_resident_payment_session(
    '${activation.tenancyId}',50000,'USD','${sessionAllocations}'::jsonb,'card','${paymentReturnUrl}','resident-payment-session-0001'
  ) as result`)).rows[0].result;
  assert(paymentSessionReplay.replayResponse.paymentId === paymentSession.paymentId && paymentSessionReplay.replayResponse.status === "pending", "Payment session replay did not return the canonical response.");
  await expectDatabaseError(() => db.query(`select public.prepare_resident_payment_session(
    '${activation.tenancyId}',51000,'USD','[{"chargeId":"${generated.chargeIds[0]}","amountMinor":51000}]'::jsonb,'card','${paymentReturnUrl}','resident-payment-session-0001'
  )`), "IDEMPOTENCY_CONFLICT");
  await expectDatabaseError(() => db.query(`select public.prepare_resident_payment_session(
    '${activation.tenancyId}',185000,'USD','[{"chargeId":"${generated.chargeIds[0]}","amountMinor":185000}]'::jsonb,'card','${paymentReturnUrl}','resident-payment-session-0002'
  )`), "ALLOCATION_EXCEEDS_AVAILABLE");
  const residentAttempts = (await db.query("select count(*)::integer as count from public.payment_attempts")).rows[0].count;
  assert(residentAttempts === 1, "Resident could not read their own provider payment attempt.");

  const providerEventCreatedAt = (await db.query("select now()::text as created_at")).rows[0].created_at;
  const providerMetadata = JSON.stringify({
    organizationId: organization.organizationId,
    paymentId: paymentSession.paymentId,
    paymentAttemptId: paymentPreparation.paymentAttemptId,
    paymentIntentId: "pi_resident0001",
  });
  await db.exec("reset role; set role service_role");
  const processingEvent = (await db.query(`select public.process_stripe_webhook(
    'evt_Processing001','acct_testFinance','${"1".repeat(64)}','payment_intent.processing','${providerEventCreatedAt}',false,
    '${JSON.stringify({ ...JSON.parse(providerMetadata), providerStatus: "processing" })}'::jsonb
  ) as result`)).rows[0].result;
  assert(processingEvent.outcome === "processed" && processingEvent.paymentStatus === "pending", "A delayed Stripe payment did not remain pending while processing.");
  const processingReplay = (await db.query(`select public.process_stripe_webhook(
    'evt_Processing001','acct_testFinance','${"1".repeat(64)}','payment_intent.processing','${providerEventCreatedAt}',false,
    '${JSON.stringify({ ...JSON.parse(providerMetadata), providerStatus: "processing" })}'::jsonb
  ) as result`)).rows[0].result;
  assert(processingReplay.outcome === "duplicate", "A Stripe event replay was not deduplicated.");

  const retryableFailure = (await db.query(`select public.process_stripe_webhook(
    'evt_AttemptFailed001','acct_testFinance','${"2".repeat(64)}','payment_intent.payment_failed','${providerEventCreatedAt}',false,
    '${JSON.stringify({ ...JSON.parse(providerMetadata), providerStatus: "requires_payment_method", failureCode: "card_declined" })}'::jsonb
  ) as result`)).rows[0].result;
  assert(retryableFailure.paymentStatus === "pending" && retryableFailure.attemptStatus === "open", "A retryable Checkout failure closed the canonical payment or released its receivable reservation.");

  const successData = JSON.stringify({
    ...JSON.parse(providerMetadata),
    chargeId: "ch_resident0001",
    amountMinor: 50000,
    currencyCode: "USD",
    providerStatus: "succeeded",
  });
  const successEvent = (await db.query(`select public.process_stripe_webhook(
    'evt_Succeeded001','acct_testFinance','${"3".repeat(64)}','payment_intent.succeeded','${providerEventCreatedAt}',false,
    '${successData}'::jsonb
  ) as result`)).rows[0].result;
  assert(successEvent.outcome === "processed" && successEvent.paymentStatus === "succeeded" && successEvent.journalTransactionId && successEvent.receiptDocumentId, "Authoritative Stripe success did not post the payment atomically.");
  const successReplay = (await db.query(`select public.process_stripe_webhook(
    'evt_Succeeded001','acct_testFinance','${"3".repeat(64)}','payment_intent.succeeded','${providerEventCreatedAt}',false,
    '${successData}'::jsonb
  ) as result`)).rows[0].result;
  assert(successReplay.outcome === "duplicate", "A replayed Stripe success was not idempotent.");

  const lateProcessing = (await db.query(`select public.process_stripe_webhook(
    'evt_LateProcessing001','acct_testFinance','${"4".repeat(64)}','payment_intent.processing','${providerEventCreatedAt}',false,
    '${JSON.stringify({ ...JSON.parse(providerMetadata), providerStatus: "processing" })}'::jsonb
  ) as result`)).rows[0].result;
  const lateFailure = (await db.query(`select public.process_stripe_webhook(
    'evt_LateFailure001','acct_testFinance','${"5".repeat(64)}','payment_intent.payment_failed','${providerEventCreatedAt}',false,
    '${JSON.stringify({ ...JSON.parse(providerMetadata), providerStatus: "requires_payment_method", failureCode: "late_failure" })}'::jsonb
  ) as result`)).rows[0].result;
  assert(lateProcessing.outcome === "ignored" && lateFailure.outcome === "ignored", "Out-of-order Stripe events regressed a succeeded payment.");

  const spoofedAccount = (await db.query(`select public.process_stripe_webhook(
    'evt_SpoofedAccount001','acct_forged','${"6".repeat(64)}','payment_intent.succeeded','${providerEventCreatedAt}',false,
    '${successData}'::jsonb
  ) as result`)).rows[0].result;
  assert(spoofedAccount.errorCode === "PROVIDER_ACCOUNT_MISMATCH", "A signed event for an unknown connected account was not rejected.");

  await db.exec("reset role");
  const providerPosting = (await db.query(`select
    p.status,p.received_at,p.journal_transaction_id,p.receipt_document_id,p.version,
    a.provider_status,a.provider_payment_intent_id,a.provider_charge_id,
    c.status as charge_status,
    (select count(*)::integer from public.payment_allocations pa where pa.payment_id=p.id and pa.reversed_at is null) as allocations,
    (select sum(e.debit_minor)::integer from public.journal_entries e where e.journal_transaction_id=p.journal_transaction_id) as debits,
    (select sum(e.credit_minor)::integer from public.journal_entries e where e.journal_transaction_id=p.journal_transaction_id) as credits,
    (select count(*)::integer from private.provider_webhook_events e where e.provider_account_id='acct_testFinance' and e.provider_event_id in ('evt_Processing001','evt_AttemptFailed001','evt_Succeeded001','evt_LateProcessing001','evt_LateFailure001')) as webhook_events,
    (select count(*)::integer from audit.audit_events ae where ae.resource_id=p.id and ae.action_code='payment.succeeded') as success_audits,
    (select count(*)::integer from private.outbox_events oe where oe.aggregate_id=p.id and oe.event_type='payment.succeeded') as success_events
    from public.payments p
    join public.payment_attempts a on a.payment_id=p.id
    join public.charges c on c.id='${generated.chargeIds[0]}'
    where p.id='${paymentSession.paymentId}'`)).rows[0];
  assert(providerPosting.status === "succeeded" && providerPosting.provider_status === "succeeded" && providerPosting.provider_payment_intent_id === "pi_resident0001" && providerPosting.provider_charge_id === "ch_resident0001" && providerPosting.received_at && providerPosting.journal_transaction_id && providerPosting.receipt_document_id, "Provider success did not bind and finalize all canonical payment references.");
  assert(providerPosting.charge_status === "partially_paid" && providerPosting.allocations === 1, "Provider success did not allocate and update the receivable.");
  assert(providerPosting.debits === 50000 && providerPosting.credits === 50000, "Provider success journal is not balanced.");
  assert(providerPosting.webhook_events === 5 && providerPosting.success_audits === 1 && providerPosting.success_events === 1, "Provider webhook dedupe or success trace is incomplete.");

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${resident}'`);
  const failedSessionAllocations = JSON.stringify([{ chargeId: generated.chargeIds[0], amountMinor: 10000 }]);
  const failedPreparation = (await db.query(`select public.prepare_resident_payment_session(
    '${activation.tenancyId}',10000,'USD','${failedSessionAllocations}'::jsonb,'card','${paymentReturnUrl}','resident-payment-session-0002'
  ) as result`)).rows[0].result;
  await db.exec("reset role; set role service_role");
  await db.query(`select public.complete_resident_payment_session(
    '${resident}','${organization.organizationId}','${failedPreparation.paymentId}','${failedPreparation.paymentAttemptId}',
    '${activation.tenancyId}',10000,'USD','${failedSessionAllocations}'::jsonb,'card','${paymentReturnUrl}',
    '${providerConnection.providerConnectionId}','acct_testFinance','cs_test_resident0002','pi_resident0002','open',
    'https://checkout.stripe.com/c/pay/cs_test_resident0002',now()+interval '30 minutes','resident-payment-session-0002'
  )`);
  const expiredData = JSON.stringify({
    organizationId: organization.organizationId,
    paymentId: failedPreparation.paymentId,
    paymentAttemptId: failedPreparation.paymentAttemptId,
    paymentIntentId: "pi_resident0002",
    checkoutSessionId: "cs_test_resident0002",
    providerStatus: "expired",
  });
  const expiredEvent = (await db.query(`select public.process_stripe_webhook(
    'evt_CheckoutExpired001','acct_testFinance','${"7".repeat(64)}','checkout.session.expired','${providerEventCreatedAt}',false,
    '${expiredData}'::jsonb
  ) as result`)).rows[0].result;
  assert(expiredEvent.paymentStatus === "failed", "Checkout expiry did not terminally fail and release the pending payment.");
  const lateExpiredProcessing = (await db.query(`select public.process_stripe_webhook(
    'evt_ExpiredLateProcessing001','acct_testFinance','${"9".repeat(64)}','payment_intent.processing','${providerEventCreatedAt}',false,
    '${expiredData}'::jsonb
  ) as result`)).rows[0].result;
  assert(lateExpiredProcessing.outcome === "ignored" && lateExpiredProcessing.paymentStatus === "failed", "An out-of-order processing event resurrected an expired payment.");
  await db.exec("reset role");
  const expiredPosting = (await db.query(`select p.status,p.journal_transaction_id,p.receipt_document_id,a.provider_status,
    (select count(*)::integer from public.payment_allocations pa where pa.payment_id=p.id) as allocations
    from public.payments p join public.payment_attempts a on a.payment_id=p.id where p.id='${failedPreparation.paymentId}'`)).rows[0];
  assert(expiredPosting.status === "failed" && expiredPosting.provider_status === "expired" && !expiredPosting.journal_transaction_id && !expiredPosting.receipt_document_id && expiredPosting.allocations === 0, "A failed provider payment created financial records.");

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${resident}'`);
  await expectDatabaseError(() => db.query(`select public.process_stripe_webhook(
    'evt_Unauthorized001','acct_testFinance','${"8".repeat(64)}','payment_intent.processing','${providerEventCreatedAt}',false,'{}'::jsonb
  )`), "permission denied");
  await expectDatabaseError(() => db.query("select count(*) from private.provider_webhook_events"), "permission denied");
  await db.exec("reset role");
  const sessionTraces = (await db.query(`select
    (select status from public.payments where id='${paymentSession.paymentId}') as payment_status,
    (select provider_status from public.payment_attempts where id='${paymentPreparation.paymentAttemptId}') as attempt_status,
    (select count(*)::integer from audit.audit_events where resource_id in ('${paymentSession.paymentId}','${paymentPreparation.paymentAttemptId}')) as audits,
    (select count(*)::integer from private.outbox_events where aggregate_id in ('${paymentSession.paymentId}','${paymentPreparation.paymentAttemptId}')) as events
  `)).rows[0];
  assert(sessionTraces.payment_status === "succeeded" && sessionTraces.attempt_status === "succeeded" && sessionTraces.audits === 6 && sessionTraces.events === 7, "Payment session state or audit/outbox trace is incomplete.");

  await db.exec(`set role authenticated; set request.jwt.claim.sub='${admin}'`);
  const initialRefundEligibility = (await db.query(`select public.get_payment_refund_eligibility('${paymentSession.paymentId}') as result`)).rows[0].result;
  assert(initialRefundEligibility.canRefund && initialRefundEligibility.refundableMinor === 50000, "The confirmed provider payment did not expose its refundable balance to finance.");
  const refundRequest = (await db.query(`select public.request_provider_refund(
    '${paymentSession.paymentId}',20000,'Return the resident overpayment','succeeded',2,'provider-refund-request-0001'
  ) as result`)).rows[0].result;
  assert(refundRequest.refundStatus === "requested" && refundRequest.paymentStatus === "succeeded", "The provider refund was not durably reserved before execution.");
  const refundRequestReplay = (await db.query(`select public.request_provider_refund(
    '${paymentSession.paymentId}',20000,'Return the resident overpayment','succeeded',2,'provider-refund-request-0001'
  ) as result`)).rows[0].result;
  assert(refundRequestReplay.refundId === refundRequest.refundId, "Refund request replay created another refund row.");
  await expectDatabaseError(() => db.query(`select public.request_provider_refund(
    '${paymentSession.paymentId}',21000,'Changed retry amount','succeeded',2,'provider-refund-request-0001'
  )`), "IDEMPOTENCY_CONFLICT");
  await expectDatabaseError(() => db.query(`select public.request_provider_refund(
    '${paymentSession.paymentId}',31000,'Would exceed the refundable amount','succeeded',2,'provider-refund-over-0001'
  )`), "PAYMENT_OVERREFUNDED");
  await expectDatabaseError(() => db.query(`select public.request_provider_refund(
    '${payment.paymentId}',1000,'Manual payments use corrections','reversed',4,'manual-provider-refund-0001'
  )`), "MANUAL_PAYMENT_REQUIRES_CORRECTION");
  await expectDatabaseError(() => db.query(`select public.get_provider_refund_context('${refundRequest.refundId}','${admin}')`), "permission denied");

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${outsider}'`);
  await expectDatabaseError(() => db.query(`select public.request_provider_refund(
    '${paymentSession.paymentId}',1000,'Unauthorized refund attempt','succeeded',2,'outsider-provider-refund-0001'
  )`), "PROPERTY_SCOPE_DENIED");

  await db.exec("reset role; set role service_role");
  const refundContext = (await db.query(`select public.get_provider_refund_context('${refundRequest.refundId}','${admin}') as result`)).rows[0].result;
  assert(refundContext.providerAccountId === "acct_testFinance" && refundContext.providerChargeId === "ch_resident0001" && refundContext.amountMinor === 20000, "The service-only refund context lost its connected-account scope.");
  const refundProviderCreatedAt = (await db.query("select now()::text as created_at")).rows[0].created_at;
  const pendingRefund = (await db.query(`select public.complete_provider_refund(
    '${refundRequest.refundId}','re_RefundPending001','pending',null,null,'${refundProviderCreatedAt}'
  ) as result`)).rows[0].result;
  assert(pendingRefund.refundStatus === "pending" && pendingRefund.paymentStatus === "succeeded" && !pendingRefund.correctiveJournalTransactionId, "A pending Stripe refund changed financial state prematurely.");
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${admin}'`);
  const pendingEligibility = (await db.query(`select public.get_payment_refund_eligibility('${paymentSession.paymentId}') as result`)).rows[0].result;
  assert(pendingEligibility.refundableMinor === 30000, "A pending refund did not reserve its amount against concurrent refunds.");
  await db.exec("reset role; set role service_role");
  const pendingRefundDispute = (await db.query(`select public.process_stripe_dispute_webhook(
    'evt_PendingRefundDispute001','acct_testFinance','${"6".repeat(64)}','charge.dispute.created','${refundProviderCreatedAt}',false,
    '${JSON.stringify({ providerDisputeId: "du_PendingRefund001", paymentIntentId: "pi_resident0001", chargeId: "ch_resident0001", amountMinor: 10000, currencyCode: "USD", providerStatus: "needs_response", reasonCode: "fraudulent" })}'::jsonb
  ) as result`)).rows[0].result;
  assert(pendingRefundDispute.errorCode === "PAYMENT_REFUND_PENDING", "A dispute raced a non-definitive provider refund instead of remaining retryable.");

  const refundWebhookData = JSON.stringify({
    organizationId: organization.organizationId,
    paymentId: paymentSession.paymentId,
    refundId: refundRequest.refundId,
    providerRefundId: "re_RefundPending001",
    chargeId: "ch_resident0001",
    amountMinor: 20000,
    currencyCode: "USD",
    providerStatus: "succeeded",
  });
  await db.exec("reset role; set role service_role");
  const refundWebhook = (await db.query(`select public.process_stripe_refund_webhook(
    'evt_RefundSucceeded001','acct_testFinance','${"a".repeat(64)}','refund.updated','${refundProviderCreatedAt}',false,
    '${refundWebhookData}'::jsonb
  ) as result`)).rows[0].result;
  assert(refundWebhook.outcome === "processed" && refundWebhook.refundStatus === "succeeded" && refundWebhook.paymentStatus === "partially_refunded", "A signed refund webhook did not post the partial refund.");
  const refundWebhookReplay = (await db.query(`select public.process_stripe_refund_webhook(
    'evt_RefundSucceeded001','acct_testFinance','${"a".repeat(64)}','refund.updated','${refundProviderCreatedAt}',false,
    '${refundWebhookData}'::jsonb
  ) as result`)).rows[0].result;
  assert(refundWebhookReplay.outcome === "duplicate", "A replayed refund webhook was not deduplicated.");
  const lateRefundFailure = (await db.query(`select public.process_stripe_refund_webhook(
    'evt_RefundLateFailure001','acct_testFinance','${"b".repeat(64)}','refund.failed','${refundProviderCreatedAt}',false,
    '${JSON.stringify({ ...JSON.parse(refundWebhookData), providerStatus: "failed", failureCode: "late_failure" })}'::jsonb
  ) as result`)).rows[0].result;
  assert(lateRefundFailure.outcome === "ignored" && lateRefundFailure.refundStatus === "succeeded", "An out-of-order refund failure regressed a succeeded refund.");

  await db.exec("reset role");
  const partialRefundPosting = (await db.query(`select p.status,p.version,r.status as refund_status,r.corrective_journal_transaction_id,c.status as charge_status,
    (select coalesce(sum(pa.amount_minor),0)::integer from public.payment_allocations pa where pa.payment_id=p.id and pa.reversed_at is null) as active_allocations,
    (select count(*)::integer from public.payment_allocations pa where pa.payment_id=p.id and pa.reversed_at is not null) as reversed_allocations,
    (select sum(e.debit_minor)::integer from public.journal_entries e where e.journal_transaction_id=r.corrective_journal_transaction_id) as debits,
    (select sum(e.credit_minor)::integer from public.journal_entries e where e.journal_transaction_id=r.corrective_journal_transaction_id) as credits,
    (select count(*)::integer from private.outbox_events o where o.event_type='payment.refunded' and o.payload->>'refundId'=r.id::text) as refund_events
    from public.payments p join public.payment_refunds r on r.payment_id=p.id
    join public.charges c on c.id='${generated.chargeIds[0]}'
    where p.id='${paymentSession.paymentId}' and r.id='${refundRequest.refundId}'`)).rows[0];
  assert(partialRefundPosting.status === "partially_refunded" && partialRefundPosting.version === 3 && partialRefundPosting.refund_status === "succeeded", "Partial refund state did not advance monotonically.");
  assert(partialRefundPosting.active_allocations === 30000 && partialRefundPosting.reversed_allocations === 1 && partialRefundPosting.charge_status === "partially_paid", "Partial refund did not retain allocation history and reopen the correct receivable amount.");
  assert(partialRefundPosting.debits === 20000 && partialRefundPosting.credits === 20000 && partialRefundPosting.refund_events === 1, "Partial refund journal or outbox trace is incomplete.");

  await db.exec(`set role authenticated; set request.jwt.claim.sub='${admin}'`);
  const failedRefundRequest = (await db.query(`select public.request_provider_refund(
    '${paymentSession.paymentId}',5000,'Test a definitive provider decline','partially_refunded',3,'provider-refund-failed-0001'
  ) as result`)).rows[0].result;
  await db.exec("reset role; set role service_role");
  const failedRefund = (await db.query(`select public.complete_provider_refund(
    '${failedRefundRequest.refundId}',null,'failed','declined','Stripe declined the refund',now()
  ) as result`)).rows[0].result;
  assert(failedRefund.refundStatus === "failed" && failedRefund.paymentStatus === "partially_refunded", "A definitive provider failure changed payment financial state.");

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${admin}'`);
  const afterFailureEligibility = (await db.query(`select public.get_payment_refund_eligibility('${paymentSession.paymentId}') as result`)).rows[0].result;
  assert(afterFailureEligibility.refundableMinor === 30000, "A failed provider refund continued consuming refundable value.");
  const finalRefundRequest = (await db.query(`select public.request_provider_refund(
    '${paymentSession.paymentId}',30000,'Return the remaining provider payment','partially_refunded',3,'provider-refund-final-0001'
  ) as result`)).rows[0].result;
  await db.exec("reset role; set role service_role");
  const finalRefundCreatedAt = (await db.query("select now()::text as created_at")).rows[0].created_at;
  const finalRefund = (await db.query(`select public.complete_provider_refund(
    '${finalRefundRequest.refundId}','re_RefundFinal001','succeeded',null,null,'${finalRefundCreatedAt}'
  ) as result`)).rows[0].result;
  assert(finalRefund.refundStatus === "succeeded" && finalRefund.paymentStatus === "refunded" && finalRefund.correctiveJournalTransactionId, "The final provider refund did not close the payment.");
  const finalRefundReplay = (await db.query(`select public.complete_provider_refund(
    '${finalRefundRequest.refundId}','re_RefundFinal001','succeeded',null,null,'${finalRefundCreatedAt}'
  ) as result`)).rows[0].result;
  assert(finalRefundReplay.correctiveJournalTransactionId === finalRefund.correctiveJournalTransactionId, "Provider refund completion replay created another journal.");

  await db.exec("reset role");
  const finalRefundPosting = (await db.query(`select p.status,p.version,c.status as charge_status,
    (select coalesce(sum(pa.amount_minor),0)::integer from public.payment_allocations pa where pa.payment_id=p.id and pa.reversed_at is null) as active_allocations,
    (select count(*)::integer from public.payment_refunds r where r.payment_id=p.id and r.status='succeeded') as succeeded_refunds,
    (select count(*)::integer from public.payment_refunds r where r.payment_id=p.id and r.status='failed') as failed_refunds,
    (select sum(e.debit_minor)::integer from public.journal_entries e where e.journal_transaction_id='${finalRefund.correctiveJournalTransactionId}') as debits,
    (select sum(e.credit_minor)::integer from public.journal_entries e where e.journal_transaction_id='${finalRefund.correctiveJournalTransactionId}') as credits
    from public.payments p join public.charges c on c.id='${generated.chargeIds[0]}' where p.id='${paymentSession.paymentId}'`)).rows[0];
  assert(finalRefundPosting.status === "refunded" && finalRefundPosting.version === 4 && finalRefundPosting.charge_status === "open" && finalRefundPosting.active_allocations === 0, "Full refund did not reopen the full provider-funded receivable.");
  assert(finalRefundPosting.succeeded_refunds === 2 && finalRefundPosting.failed_refunds === 1 && finalRefundPosting.debits === 30000 && finalRefundPosting.credits === 30000, "Full refund history or corrective journal is incomplete.");

  await db.exec(`set role authenticated; set request.jwt.claim.sub='${resident}'`);
  const disputedAllocations = JSON.stringify([{ chargeId: generated.chargeIds[0], amountMinor: 50000 }]);
  const disputedPreparation = (await db.query(`select public.prepare_resident_payment_session(
    '${activation.tenancyId}',50000,'USD','${disputedAllocations}'::jsonb,'card','${paymentReturnUrl}','resident-dispute-session-0001'
  ) as result`)).rows[0].result;
  await db.exec("reset role; set role service_role");
  await db.query(`select public.complete_resident_payment_session(
    '${resident}','${organization.organizationId}','${disputedPreparation.paymentId}','${disputedPreparation.paymentAttemptId}',
    '${activation.tenancyId}',50000,'USD','${disputedAllocations}'::jsonb,'card','${paymentReturnUrl}',
    '${providerConnection.providerConnectionId}','acct_testFinance','cs_test_dispute0001','pi_dispute0001','open',
    'https://checkout.stripe.com/c/pay/cs_test_dispute0001',now()+interval '30 minutes','resident-dispute-session-0001'
  )`);
  const disputedPaymentCreatedAt = (await db.query("select now()::text as created_at")).rows[0].created_at;
  const disputedPaymentData = JSON.stringify({
    organizationId: organization.organizationId,
    paymentId: disputedPreparation.paymentId,
    paymentAttemptId: disputedPreparation.paymentAttemptId,
    paymentIntentId: "pi_dispute0001",
    chargeId: "ch_dispute0001",
    amountMinor: 50000,
    currencyCode: "USD",
    providerStatus: "succeeded",
  });
  const disputedPaymentSuccess = (await db.query(`select public.process_stripe_webhook(
    'evt_DisputePaymentSuccess001','acct_testFinance','${"c".repeat(64)}','payment_intent.succeeded','${disputedPaymentCreatedAt}',false,
    '${disputedPaymentData}'::jsonb
  ) as result`)).rows[0].result;
  assert(disputedPaymentSuccess.paymentStatus === "succeeded", "The dispute fixture payment was not authoritatively confirmed.");

  const disputeOpenedAt = (await db.query("select now()::text as created_at")).rows[0].created_at;
  const disputeCreatedData = JSON.stringify({
    providerDisputeId: "du_CardDispute001",
    paymentIntentId: "pi_dispute0001",
    chargeId: "ch_dispute0001",
    amountMinor: 20000,
    currencyCode: "USD",
    providerStatus: "needs_response",
    reasonCode: "fraudulent",
    evidenceDueAt: "2026-08-15T00:00:00.000Z",
  });
  const disputeCreated = (await db.query(`select public.process_stripe_dispute_webhook(
    'evt_DisputeCreated001','acct_testFinance','${"d".repeat(64)}','charge.dispute.created','${disputeOpenedAt}',false,
    '${disputeCreatedData}'::jsonb
  ) as result`)).rows[0].result;
  assert(disputeCreated.outcome === "processed" && disputeCreated.disputeKind === "dispute" && disputeCreated.paymentStatus === "disputed" && disputeCreated.reversalJournalTransactionId, "A card dispute did not reopen the receivable exactly once.");
  const disputeReplay = (await db.query(`select public.process_stripe_dispute_webhook(
    'evt_DisputeCreated001','acct_testFinance','${"d".repeat(64)}','charge.dispute.created','${disputeOpenedAt}',false,
    '${disputeCreatedData}'::jsonb
  ) as result`)).rows[0].result;
  assert(disputeReplay.outcome === "duplicate", "A replayed card dispute was not deduplicated.");
  const staleDisputeAt = (await db.query(`select ('${disputeOpenedAt}'::timestamptz-interval '1 second')::text as created_at`)).rows[0].created_at;
  const staleDispute = (await db.query(`select public.process_stripe_dispute_webhook(
    'evt_DisputeStale001','acct_testFinance','${"e".repeat(64)}','charge.dispute.updated','${staleDisputeAt}',false,
    '${JSON.stringify({ ...JSON.parse(disputeCreatedData), providerStatus: "under_review" })}'::jsonb
  ) as result`)).rows[0].result;
  assert(staleDispute.outcome === "ignored" && staleDispute.disputeStatus === "needs_response", "An out-of-order dispute update regressed canonical state.");
  const disputeReviewAt = (await db.query(`select ('${disputeOpenedAt}'::timestamptz+interval '1 second')::text as created_at`)).rows[0].created_at;
  const disputeReview = (await db.query(`select public.process_stripe_dispute_webhook(
    'evt_DisputeReview001','acct_testFinance','${"f".repeat(64)}','charge.dispute.updated','${disputeReviewAt}',false,
    '${JSON.stringify({ ...JSON.parse(disputeCreatedData), providerStatus: "under_review" })}'::jsonb
  ) as result`)).rows[0].result;
  assert(disputeReview.outcome === "processed" && disputeReview.paymentStatus === "disputed" && disputeReview.reversalJournalTransactionId === disputeCreated.reversalJournalTransactionId, "A dispute status update duplicated financial reversal.");
  const disputeWonAt = (await db.query(`select ('${disputeOpenedAt}'::timestamptz+interval '2 seconds')::text as created_at`)).rows[0].created_at;
  const disputeWon = (await db.query(`select public.process_stripe_dispute_webhook(
    'evt_DisputeWon001','acct_testFinance','${"0".repeat(64)}','charge.dispute.closed','${disputeWonAt}',false,
    '${JSON.stringify({ ...JSON.parse(disputeCreatedData), providerStatus: "won" })}'::jsonb
  ) as result`)).rows[0].result;
  assert(disputeWon.outcome === "processed" && disputeWon.paymentStatus === "succeeded" && disputeWon.recoveryJournalTransactionId, "A won dispute did not restore the payment and receivable allocation.");

  await db.exec("reset role");
  const wonDisputePosting = (await db.query(`select p.status,c.status as charge_status,
    (select coalesce(sum(pa.amount_minor),0)::integer from public.payment_allocations pa where pa.payment_id=p.id and pa.reversed_at is null) as active_allocations,
    (select sum(e.debit_minor)::integer from public.journal_entries e where e.journal_transaction_id='${disputeCreated.reversalJournalTransactionId}') as reversal_debits,
    (select sum(e.credit_minor)::integer from public.journal_entries e where e.journal_transaction_id='${disputeCreated.reversalJournalTransactionId}') as reversal_credits,
    (select sum(e.debit_minor)::integer from public.journal_entries e where e.journal_transaction_id='${disputeWon.recoveryJournalTransactionId}') as recovery_debits,
    (select sum(e.credit_minor)::integer from public.journal_entries e where e.journal_transaction_id='${disputeWon.recoveryJournalTransactionId}') as recovery_credits,
    (select sum(da.restored_amount_minor)::integer from public.payment_dispute_allocations da where da.payment_dispute_id='${disputeCreated.disputeId}') as restored_allocations
    from public.payments p join public.charges c on c.id='${generated.chargeIds[0]}' where p.id='${disputedPreparation.paymentId}'`)).rows[0];
  assert(wonDisputePosting.status === "succeeded" && wonDisputePosting.charge_status === "partially_paid" && wonDisputePosting.active_allocations === 50000 && wonDisputePosting.restored_allocations === 20000, "A dispute win did not restore the exact allocation slice.");
  assert(wonDisputePosting.reversal_debits === 20000 && wonDisputePosting.reversal_credits === 20000 && wonDisputePosting.recovery_debits === 20000 && wonDisputePosting.recovery_credits === 20000, "Dispute reversal or recovery journal is not balanced.");

  await db.exec("set role service_role");
  const secondDisputeAt = (await db.query("select now()::text as created_at")).rows[0].created_at;
  const secondDisputeData = JSON.stringify({
    providerDisputeId: "du_CardDispute002",
    paymentIntentId: "pi_dispute0001",
    chargeId: "ch_dispute0001",
    amountMinor: 10000,
    currencyCode: "USD",
    providerStatus: "needs_response",
    reasonCode: "unrecognized",
  });
  const secondDispute = (await db.query(`select public.process_stripe_dispute_webhook(
    'evt_DisputeCreated002','acct_testFinance','${"1".repeat(64)}','charge.dispute.created','${secondDisputeAt}',false,
    '${secondDisputeData}'::jsonb
  ) as result`)).rows[0].result;
  const secondDisputeLostAt = (await db.query(`select ('${secondDisputeAt}'::timestamptz+interval '1 second')::text as created_at`)).rows[0].created_at;
  const secondDisputeLost = (await db.query(`select public.process_stripe_dispute_webhook(
    'evt_DisputeLost002','acct_testFinance','${"2".repeat(64)}','charge.dispute.closed','${secondDisputeLostAt}',false,
    '${JSON.stringify({ ...JSON.parse(secondDisputeData), providerStatus: "lost" })}'::jsonb
  ) as result`)).rows[0].result;
  assert(secondDispute.paymentStatus === "disputed" && secondDisputeLost.paymentStatus === "reversed" && !secondDisputeLost.recoveryJournalTransactionId, "A lost card dispute did not retain its reversal as terminal history.");
  await db.exec("reset role");
  const lostDisputeEvents = (await db.query(`select count(*)::integer as count from private.outbox_events
    where event_type='payment.dispute_resolved' and payload->>'disputeId'='${secondDispute.disputeId}' and payload->>'resolution'='lost'`)).rows[0].count;
  assert(lostDisputeEvents === 1, "A lost dispute did not publish its terminal resolution.");

  await db.exec(`set role authenticated; set request.jwt.claim.sub='${resident}'`);
  const returnedAllocations = JSON.stringify([{ chargeId: generated.chargeIds[0], amountMinor: 25000 }]);
  const returnedPreparation = (await db.query(`select public.prepare_resident_payment_session(
    '${activation.tenancyId}',25000,'USD','${returnedAllocations}'::jsonb,'bank','${paymentReturnUrl}','resident-return-session-0001'
  ) as result`)).rows[0].result;
  assert(returnedPreparation.providerMethodCode === "us_bank_account", "The returned-payment fixture did not use the ACH method.");
  await db.exec("reset role; set role service_role");
  await db.query(`select public.complete_resident_payment_session(
    '${resident}','${organization.organizationId}','${returnedPreparation.paymentId}','${returnedPreparation.paymentAttemptId}',
    '${activation.tenancyId}',25000,'USD','${returnedAllocations}'::jsonb,'bank','${paymentReturnUrl}',
    '${providerConnection.providerConnectionId}','acct_testFinance','cs_test_return0001','pi_return0001','open',
    'https://checkout.stripe.com/c/pay/cs_test_return0001',now()+interval '30 minutes','resident-return-session-0001'
  )`);
  const returnedPaymentCreatedAt = (await db.query("select now()::text as created_at")).rows[0].created_at;
  const returnedPaymentData = JSON.stringify({
    organizationId: organization.organizationId,
    paymentId: returnedPreparation.paymentId,
    paymentAttemptId: returnedPreparation.paymentAttemptId,
    paymentIntentId: "pi_return0001",
    chargeId: "ch_return0001",
    amountMinor: 25000,
    currencyCode: "USD",
    providerStatus: "succeeded",
  });
  await db.query(`select public.process_stripe_webhook(
    'evt_ReturnPaymentSuccess001','acct_testFinance','${"3".repeat(64)}','payment_intent.succeeded','${returnedPaymentCreatedAt}',false,
    '${returnedPaymentData}'::jsonb
  )`);
  const returnEventAt = (await db.query("select now()::text as created_at")).rows[0].created_at;
  const returnData = JSON.stringify({
    providerDisputeId: "du_BankReturn001",
    paymentIntentId: "pi_return0001",
    chargeId: "ch_return0001",
    amountMinor: 25000,
    currencyCode: "USD",
    providerStatus: "lost",
    reasonCode: "insufficient_funds",
  });
  const returnedDebit = (await db.query(`select public.process_stripe_dispute_webhook(
    'evt_BankReturn001','acct_testFinance','${"4".repeat(64)}','charge.dispute.closed','${returnEventAt}',false,
    '${returnData}'::jsonb
  ) as result`)).rows[0].result;
  assert(returnedDebit.outcome === "processed" && returnedDebit.disputeKind === "return" && returnedDebit.paymentStatus === "returned" && returnedDebit.reversalJournalTransactionId, "A post-success ACH return was not classified and reversed as a returned payment.");
  await db.exec("reset role");
  const returnedDebitPosting = (await db.query(`select p.status,
    (select coalesce(sum(pa.amount_minor),0)::integer from public.payment_allocations pa where pa.payment_id=p.id and pa.reversed_at is null) as active_allocations,
    (select sum(e.debit_minor)::integer from public.journal_entries e where e.journal_transaction_id='${returnedDebit.reversalJournalTransactionId}') as debits,
    (select sum(e.credit_minor)::integer from public.journal_entries e where e.journal_transaction_id='${returnedDebit.reversalJournalTransactionId}') as credits,
    (select count(*)::integer from private.outbox_events o where o.event_type='payment.returned' and o.payload->>'disputeId'='${returnedDebit.disputeId}') as return_events
    from public.payments p where p.id='${returnedPreparation.paymentId}'`)).rows[0];
  assert(returnedDebitPosting.status === "returned" && returnedDebitPosting.active_allocations === 0 && returnedDebitPosting.debits === 25000 && returnedDebitPosting.credits === 25000 && returnedDebitPosting.return_events === 1, "Returned debit accounting or outbox trace is incomplete.");

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${resident}'`);
  const settlementAllocations = JSON.stringify([{ chargeId: generated.chargeIds[0], amountMinor: 5000 }]);
  const settlementPreparation = (await db.query(`select public.prepare_resident_payment_session(
    '${activation.tenancyId}',5000,'USD','${settlementAllocations}'::jsonb,'card','${paymentReturnUrl}','resident-settlement-session-0001'
  ) as result`)).rows[0].result;
  await db.exec("reset role; set role service_role");
  await db.query(`select public.complete_resident_payment_session(
    '${resident}','${organization.organizationId}','${settlementPreparation.paymentId}','${settlementPreparation.paymentAttemptId}',
    '${activation.tenancyId}',5000,'USD','${settlementAllocations}'::jsonb,'card','${paymentReturnUrl}',
    '${providerConnection.providerConnectionId}','acct_testFinance','cs_test_settlement0001','pi_settlement0001','open',
    'https://checkout.stripe.com/c/pay/cs_test_settlement0001',now()+interval '30 minutes','resident-settlement-session-0001'
  )`);
  const settlementPaymentCreatedAt = (await db.query("select now()::text as created_at")).rows[0].created_at;
  const settlementPaymentData = JSON.stringify({
    organizationId: organization.organizationId,
    paymentId: settlementPreparation.paymentId,
    paymentAttemptId: settlementPreparation.paymentAttemptId,
    paymentIntentId: "pi_settlement0001",
    chargeId: "ch_settlement0001",
    amountMinor: 5000,
    currencyCode: "USD",
    providerStatus: "succeeded",
  });
  const settlementPayment = (await db.query(`select public.process_stripe_webhook(
    'evt_SettlementPayment001','acct_testFinance','${"6".repeat(64)}','payment_intent.succeeded','${settlementPaymentCreatedAt}',false,
    '${settlementPaymentData}'::jsonb
  ) as result`)).rows[0].result;
  assert(settlementPayment.paymentStatus === "succeeded", "The settlement fixture payment was not authoritatively confirmed.");

  const settlementReceivedAt = (await db.query(`select ('${settlementPaymentCreatedAt}'::timestamptz+interval '1 second')::text as created_at`)).rows[0].created_at;
  const settlementData = JSON.stringify({
    providerSettlementId: "po_CrecySettlement001",
    providerStatus: "paid",
    amountMinor: 4825,
    currencyCode: "USD",
    automatic: true,
    expectedArrivalDate: "2026-08-04",
    items: [{
      providerBalanceTransactionId: "txn_CrecySettlement001",
      providerSourceId: "ch_settlement0001",
      transactionType: "charge",
      reportingCategory: "charge",
      grossMinor: 5000,
      feeMinor: 175,
      netMinor: 4825,
      currencyCode: "USD",
      providerStatus: "available",
      availableOn: "2026-08-03",
    }],
  });
  const settlement = (await db.query(`select public.process_stripe_settlement_webhook(
    'evt_SettlementPaid001','acct_testFinance','${"7".repeat(64)}','payout.paid','${settlementReceivedAt}',false,
    '${settlementData}'::jsonb
  ) as result`)).rows[0].result;
  assert(settlement.outcome === "processed" && settlement.reconciliationStatus === "reconciled" && settlement.itemCount === 1 && settlement.matchedCount === 1 && settlement.journalTransactionId, "A paid Stripe payout was not imported, matched, and posted exactly once.");
  const settlementReplay = (await db.query(`select public.process_stripe_settlement_webhook(
    'evt_SettlementPaid001','acct_testFinance','${"7".repeat(64)}','payout.paid','${settlementReceivedAt}',false,
    '${settlementData}'::jsonb
  ) as result`)).rows[0].result;
  assert(settlementReplay.outcome === "duplicate", "A replayed payout created another settlement.");

  const mismatchReceivedAt = (await db.query(`select ('${settlementReceivedAt}'::timestamptz+interval '1 second')::text as created_at`)).rows[0].created_at;
  const mismatchData = JSON.stringify({
    providerSettlementId: "po_CrecyMismatch001",
    providerStatus: "paid",
    amountMinor: 4000,
    currencyCode: "USD",
    automatic: true,
    expectedArrivalDate: "2026-08-05",
    items: [{
      providerBalanceTransactionId: "txn_CrecyMismatch001",
      providerSourceId: "ch_unknown0001",
      transactionType: "charge",
      reportingCategory: "charge",
      grossMinor: 5000,
      feeMinor: 500,
      netMinor: 4500,
      currencyCode: "USD",
      providerStatus: "available",
      availableOn: "2026-08-04",
    }],
  });
  const mismatch = (await db.query(`select public.process_stripe_settlement_webhook(
    'evt_SettlementMismatch001','acct_testFinance','${"8".repeat(64)}','payout.paid','${mismatchReceivedAt}',false,
    '${mismatchData}'::jsonb
  ) as result`)).rows[0].result;
  assert(mismatch.reconciliationStatus === "exception" && mismatch.exceptionCount === 2 && !mismatch.journalTransactionId, "A payout mismatch was silently posted or did not create its exception trail.");

  await db.exec("reset role");
  const settlementPosting = (await db.query(`select b.reconciliation_status,p.reconciliation_status as payment_reconciliation,
    (select sum(e.debit_minor)::integer from public.journal_entries e where e.journal_transaction_id=b.journal_transaction_id) as debits,
    (select sum(e.credit_minor)::integer from public.journal_entries e where e.journal_transaction_id=b.journal_transaction_id) as credits,
    (select count(*)::integer from public.reconciliation_matches m where m.settlement_batch_id=b.id) as matches,
    (select count(*)::integer from audit.audit_events a where a.resource_type='settlement_batch' and a.resource_id=b.id and a.action_code='settlement.received') as audits,
    (select count(*)::integer from private.outbox_events o where o.aggregate_type='settlement_batch' and o.aggregate_id=b.id and o.event_type='settlement.received') as events
    from public.settlement_batches b join public.settlement_items i on i.settlement_batch_id=b.id
    join public.payments p on p.id=i.payment_id where b.id='${settlement.settlementId}'`)).rows[0];
  assert(settlementPosting.reconciliation_status === "reconciled" && settlementPosting.payment_reconciliation === "reconciled" && settlementPosting.matches === 1, "Settlement reconciliation did not link the payout item to the payment.");
  assert(settlementPosting.debits === 5000 && settlementPosting.credits === 5000 && settlementPosting.audits === 1 && settlementPosting.events === 1, "Settlement accounting or durable trace is incomplete.");

  await db.exec(`set role authenticated; set request.jwt.claim.sub='${admin}'`);
  const settlementWorkspace = (await db.query("select public.get_settlement_reconciliation_workspace() as result")).rows[0].result;
  assert(settlementWorkspace.batches.length === 2 && settlementWorkspace.exceptions.length === 2 && settlementWorkspace.batches.find((batch) => batch.settlementId === settlement.settlementId)?.matchedCount === 1, "The operator reconciliation workspace is incomplete.");
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${resident}'`);
  const residentSettlementRows = (await db.query("select count(*)::integer as count from public.settlement_batches")).rows[0].count;
  const residentSettlementWorkspace = (await db.query("select public.get_settlement_reconciliation_workspace() as result")).rows[0].result;
  const residentSettlementHistory = (await db.query(`select public.get_payment_settlement_history('${settlementPreparation.paymentId}') as result`)).rows[0].result;
  assert(residentSettlementRows === 0 && residentSettlementWorkspace.batches.length === 0 && residentSettlementHistory.settlements.length === 1, "Settlement data leaked to a resident or their sanitized payment history is missing.");

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${resident}'`);
  const residentDisputeHistory = (await db.query(`select public.get_payment_dispute_history('${disputedPreparation.paymentId}') as result`)).rows[0].result;
  const residentReturnHistory = (await db.query(`select public.get_payment_dispute_history('${returnedPreparation.paymentId}') as result`)).rows[0].result;
  assert(residentDisputeHistory.disputes.length === 2 && residentReturnHistory.disputes.length === 1 && residentReturnHistory.disputes[0].kind === "return", "Sanitized resident return/dispute history is incomplete.");
  await expectDatabaseError(() => db.query("select count(*) from public.payment_disputes"), "permission denied");
  await expectDatabaseError(() => db.query(`select public.process_stripe_dispute_webhook(
    'evt_UnauthorizedDispute001','acct_testFinance','${"5".repeat(64)}','charge.dispute.created','${returnEventAt}',false,'{}'::jsonb
  )`), "permission denied");

  await db.exec(`set role authenticated; set request.jwt.claim.sub='${resident}'`);
  const residentPayments = (await db.query("select public.get_resident_payment_history() as result")).rows[0].result;
  const residentReceipt = (await db.query(`select public.get_payment_receipt('${payment.receiptDocumentId}') as result`)).rows[0].result;
  const residentPaymentDetail = (await db.query(`select public.get_payment_detail('${payment.paymentId}') as result`)).rows[0].result;
  const residentRefunds = (await db.query(`select count(*)::integer as count from public.payment_refunds where payment_id='${payment.paymentId}'`)).rows[0].count;
  const residentProviderRefunds = (await db.query(`select count(*)::integer as count from public.payment_refunds where payment_id='${paymentSession.paymentId}'`)).rows[0].count;
  assert(residentPayments.items.length === 6 && residentPayments.items.find((item) => item.paymentId === payment.paymentId)?.status === "reversed" && residentPayments.items.find((item) => item.paymentId === paymentSession.paymentId)?.status === "refunded" && residentPayments.items.find((item) => item.paymentId === failedPreparation.paymentId)?.status === "failed" && residentPayments.items.find((item) => item.paymentId === disputedPreparation.paymentId)?.status === "reversed" && residentPayments.items.find((item) => item.paymentId === returnedPreparation.paymentId)?.status === "returned" && residentPayments.items.find((item) => item.paymentId === settlementPreparation.paymentId)?.reconciliationStatus === "reconciled" && residentReceipt.paymentId === payment.paymentId && residentPaymentDetail.corrections.length === 3 && !residentPaymentDetail.canCorrect && residentRefunds === 2 && residentProviderRefunds === 3, "Resident payment session, correction history, refund, return, dispute, settlement, or corrected receipt state is unavailable.");
  const retryContext = (await db.query(`select public.get_resident_payment_retry_context('${failedPreparation.paymentId}') as result`)).rows[0].result;
  const failedAttemptHistory = (await db.query(`select public.get_payment_attempt_history('${failedPreparation.paymentId}') as result`)).rows[0].result;
  assert(retryContext.paymentId === failedPreparation.paymentId && retryContext.amountMinor === 10000 && retryContext.method === "card" && retryContext.failureCode === "checkout_session_expired" && retryContext.allocations.length === 1, "The resident retry context did not preserve the failed payment selection.");
  assert(failedAttemptHistory.attempts.length === 1 && failedAttemptHistory.attempts[0].providerStatus === "expired" && failedAttemptHistory.attempts[0].failureCode === "checkout_session_expired" && !JSON.stringify(failedAttemptHistory).includes("pi_resident") && !JSON.stringify(failedAttemptHistory).includes("cs_test"), "The sanitized attempt timeline is incomplete or exposes provider object IDs.");
  const retryPreparation = (await db.query(`select public.prepare_resident_payment_session(
    '${activation.tenancyId}',10000,'USD','${failedSessionAllocations}'::jsonb,'card','${paymentReturnUrl}','resident-payment-session-retry-0001'
  ) as result`)).rows[0].result;
  assert(retryPreparation.paymentId !== failedPreparation.paymentId && retryPreparation.paymentAttemptId !== failedPreparation.paymentAttemptId, "A terminal payment retry reused the failed canonical payment or attempt.");
  await db.exec("reset role");
  const retryTraces = (await db.query(`select
    (select count(*)::integer from audit.audit_events where resource_id='${retryPreparation.paymentId}' and action_code='payment.created') as audits,
    (select count(*)::integer from private.outbox_events where aggregate_id='${retryPreparation.paymentId}' and event_type='payment.created') as events
  `)).rows[0];
  assert(retryTraces.audits === 1 && retryTraces.events === 1, "The new retry attempt is missing its durable audit or outbox trace.");

  const cadEntityId = "f1000000-0000-4000-8000-000000000001";
  const cadBookId = "f2000000-0000-4000-8000-000000000002";
  const cadPropertyId = "f3000000-0000-4000-8000-000000000003";
  const cadUnitId = "f4000000-0000-4000-8000-000000000004";
  const cadMaintenanceId = "f5000000-0000-4000-8000-000000000005";
  const cadWorkOrderId = "f6000000-0000-4000-8000-000000000006";
  const expiredDashboardUser = "f7000000-0000-4000-8000-000000000007";
  await db.exec(`
    reset role;
    insert into auth.users(id) values ('${expiredDashboardUser}');
    insert into public.operating_entities(id,organization_id,legal_name,display_name,country_code,entity_type,status,created_by)
    values ('${cadEntityId}','${organization.organizationId}','Finance Atlas Canada Ltd.','Finance Atlas Canada','CA','company','active','${admin}');
    insert into public.accounting_books(id,organization_id,operating_entity_id,name,functional_currency_code,status,created_by)
    values ('${cadBookId}','${organization.organizationId}','${cadEntityId}','Canada operating book','CAD','open','${admin}');
    insert into public.properties(
      id,organization_id,operating_entity_id,accounting_book_id,country_profile_id,name,property_type,
      country_code,subdivision_code,locality,postal_code,address_line1,time_zone,status,created_by
    ) values (
      '${cadPropertyId}','${organization.organizationId}','${cadEntityId}','${cadBookId}',
      (select id from public.country_profiles where code='CA_NATIONAL'),
      'Harbour House','multifamily','CA','ON','Toronto','M5V 2T6','200 Harbour Street','America/Toronto','active','${admin}'
    );
    insert into public.units(id,organization_id,property_id,unit_code,unit_type)
    values ('${cadUnitId}','${organization.organizationId}','${cadPropertyId}','201','Apartment');
    insert into public.maintenance_requests(
      id,organization_id,property_id,unit_id,public_reference,category,title,description,priority,status
    ) values (
      '${cadMaintenanceId}','${organization.organizationId}','${cadPropertyId}','${cadUnitId}',
      'MR-DASH-CAD-001','electrical','Hallway light outage','The second-floor hallway light is out.','medium','triaged'
    );
    insert into public.work_orders(
      id,organization_id,maintenance_request_id,property_id,unit_id,public_reference,status,scope,created_by
    ) values (
      '${cadWorkOrderId}','${organization.organizationId}','${cadMaintenanceId}','${cadPropertyId}','${cadUnitId}',
      'WO-DASH-CAD-001','draft','Inspect and replace the hallway light fixture.','${admin}'
    );
    insert into public.organization_memberships(organization_id,user_id,role_code,status,starts_at,ends_at)
    values (
      '${organization.organizationId}','${expiredDashboardUser}','property_manager','active',
      now()-interval '2 days',now()-interval '1 day'
    );
    update public.leases
      set end_date=current_date+30
      where id='${activation.leaseId}';
    set role authenticated;
    set request.jwt.claim.sub='${admin}';
  `);

  const commandCenter = (await db.query(`
    select public.get_operator_command_center(
      '${organization.organizationId}',null,null,current_date-29,current_date
    ) as result
  `)).rows[0].result;
  const dashboardPayload = JSON.stringify(commandCenter);
  assert(
    commandCenter.scope.organizationId === organization.organizationId
      && commandCenter.scope.propertyCount === 2
      && commandCenter.filters.properties.length === 2
      && commandCenter.filters.books.length === 2
      && commandCenter.metrics.currency.map((item) => item.currencyCode).join(",") === "CAD,USD"
      && commandCenter.metrics.totalUnits === 2
      && commandCenter.metrics.occupiedUnits === 1
      && commandCenter.metrics.openWorkOrders >= 1
      && commandCenter.metrics.expiringLeases === 1
      && commandCenter.metrics.openReconciliationExceptions === 2
      && commandCenter.propertyPerformance.length === 2
      && commandCenter.attention.length <= 12
      && commandCenter.activity.length <= 20,
    "The operator command center omitted scoped metrics, filters, currency separation, or bounded queues.",
  );
  assert(
    !dashboardPayload.includes("avery@example.com")
      && !dashboardPayload.includes("Avery Morgan household")
      && !dashboardPayload.includes("Kitchen sink is leaking")
      && !dashboardPayload.includes("acct_testFinance")
      && !dashboardPayload.includes("Check received at the office"),
    "The operator command center exposed resident PII, maintenance detail, provider identifiers, or internal payment reasons.",
  );

  const cadCommandCenter = (await db.query(`
    select public.get_operator_command_center(
      '${organization.organizationId}','${cadPropertyId}','${cadBookId}',current_date-29,current_date
    ) as result
  `)).rows[0].result;
  assert(
    cadCommandCenter.scope.propertyCount === 1
      && cadCommandCenter.metrics.currency.length === 1
      && cadCommandCenter.metrics.currency[0].currencyCode === "CAD"
      && cadCommandCenter.metrics.totalUnits === 1
      && cadCommandCenter.metrics.occupiedUnits === 0
      && cadCommandCenter.propertyPerformance[0].propertyId === cadPropertyId,
    "Property/book filters mixed scopes or currencies in the command center.",
  );
  await expectDatabaseError(
    () => db.query(`select public.get_operator_command_center(
      '${organization.organizationId}','${property.propertyId}','${cadBookId}',current_date-29,current_date
    )`),
    "FILTER_COMBINATION_INVALID",
  );

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${scopedCoordinator}'`);
  const scopedCommandCenter = (await db.query(`
    select public.get_operator_command_center(
      '${organization.organizationId}',null,null,current_date-29,current_date
    ) as result
  `)).rows[0].result;
  assert(
    scopedCommandCenter.scope.propertyCount === 1
      && scopedCommandCenter.filters.properties.length === 1
      && scopedCommandCenter.filters.properties[0].propertyId === property.propertyId
      && scopedCommandCenter.domains.maintenance
      && !scopedCommandCenter.domains.finance
      && scopedCommandCenter.metrics.currency.length === 0
      && !JSON.stringify(scopedCommandCenter).includes("Harbour House"),
    "A property-scoped operator saw another property or an unauthorized finance aggregate.",
  );
  await expectDatabaseError(
    () => db.query(`select public.get_operator_command_center('${organization.organizationId}',null,'${cadBookId}',current_date-29,current_date)`),
    "BOOK_FILTER_SCOPE_DENIED",
  );
  await expectDatabaseError(
    () => db.query(`select public.get_operator_command_center('${organization.organizationId}',null,null,current_date,current_date-1)`),
    "INVALID_DATE_RANGE",
  );

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${admin}'`);
  const propertySearch = (await db.query(
    "select public.get_operator_global_search('Map',24) as result",
  )).rows[0].result;
  const unitSearch = (await db.query(
    "select public.get_operator_global_search('101',24) as result",
  )).rows[0].result;
  const residentSearch = (await db.query(
    "select public.get_operator_global_search('Avery',24) as result",
  )).rows[0].result;
  const leaseSearch = (await db.query(
    "select public.get_operator_global_search('FIN-',24) as result",
  )).rows[0].result;
  const paymentSearch = (await db.query(
    `select public.get_operator_global_search('${payment.publicReference}',24) as result`,
  )).rows[0].result;
  const maintenanceSearch = (await db.query(
    `select public.get_operator_global_search('${maintenance.publicReference}',24) as result`,
  )).rows[0].result;
  const workOrderSearch = (await db.query(
    `select public.get_operator_global_search('${workOrder.publicReference}',24) as result`,
  )).rows[0].result;
  const documentSearch = (await db.query(
    "select public.get_operator_global_search('Unit 101',24) as result",
  )).rows[0].result;
  const ownerSearch = (await db.query(
    "select public.get_operator_global_search('Finance Atlas Owner',24) as result",
  )).rows[0].result;
  const emailSearch = (await db.query(
    "select public.get_operator_global_search('avery@example.com',24) as result",
  )).rows[0].result;
  const limitedSearch = (await db.query(
    "select public.get_operator_global_search('Finance',1) as result",
  )).rows[0].result;
  const searchPayload = JSON.stringify({
    propertySearch,
    unitSearch,
    residentSearch,
    leaseSearch,
    paymentSearch,
    maintenanceSearch,
    workOrderSearch,
    documentSearch,
    ownerSearch,
  });
  assert(
    propertySearch.items.some((item) => item.kind === "property" && item.resourceId === property.propertyId)
      && unitSearch.items.some((item) => item.kind === "unit" && item.resourceId === unit.unitId)
      && residentSearch.items.some((item) => item.kind === "resident" && item.resourceId === activation.tenancyId)
      && leaseSearch.items.some((item) => item.kind === "lease" && item.resourceId === activation.leaseId)
      && paymentSearch.items.some((item) => item.kind === "payment" && item.resourceId === payment.paymentId)
      && maintenanceSearch.items.some((item) => item.kind === "maintenance_request" && item.resourceId === maintenance.maintenanceRequestId)
      && workOrderSearch.items.some((item) => item.kind === "work_order" && item.resourceId === workOrder.workOrderId)
      && documentSearch.items.some((item) => item.kind === "document" && item.resourceId === documentId)
      && ownerSearch.items.filter((item) => item.kind === "owner_entity").length === 2
      && emailSearch.items.length === 0
      && limitedSearch.items.length === 1,
    "Operator global search omitted an authorized resource, searched resident contact data, or exceeded its requested bound.",
  );
  assert(
    !searchPayload.includes("avery@example.com")
      && !searchPayload.includes("Water is dripping")
      && !searchPayload.includes("Call before entering")
      && !searchPayload.includes("Check received at the office")
      && !searchPayload.includes("acct_testFinance"),
    "Operator global search exposed resident contact data, maintenance access/detail, payment reasons, or provider identifiers.",
  );
  await expectDatabaseError(
    () => db.query("select public.get_operator_global_search('x',24)"),
    "SEARCH_QUERY_TOO_SHORT",
  );
  await expectDatabaseError(
    () => db.query(`select public.get_operator_global_search('${"x".repeat(81)}',24)`),
    "SEARCH_QUERY_TOO_LONG",
  );
  await expectDatabaseError(
    () => db.query("select public.get_operator_global_search('Map',51)"),
    "SEARCH_LIMIT_OUT_OF_BOUNDS",
  );

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${scopedCoordinator}'`);
  const scopedMaintenanceSearch = (await db.query(
    `select public.get_operator_global_search('${maintenance.publicReference}',24) as result`,
  )).rows[0].result;
  const scopedPaymentSearch = (await db.query(
    `select public.get_operator_global_search('${payment.publicReference}',24) as result`,
  )).rows[0].result;
  const scopedOtherPropertySearch = (await db.query(
    "select public.get_operator_global_search('Harbour',24) as result",
  )).rows[0].result;
  assert(
    scopedMaintenanceSearch.items.some((item) => item.kind === "maintenance_request")
      && scopedPaymentSearch.items.length === 0
      && scopedOtherPropertySearch.items.length === 0,
    "Property-scoped global search crossed a property or domain permission boundary.",
  );

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${expiredDashboardUser}'`);
  await expectDatabaseError(
    () => db.query(`select public.get_operator_command_center('${organization.organizationId}',null,null,current_date-29,current_date)`),
    "OPERATOR_ORGANIZATION_DENIED",
  );
  await expectDatabaseError(
    () => db.query("select public.get_operator_global_search('Map',24)"),
    "OPERATOR_ORGANIZATION_DENIED",
  );
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${outsider}'`);
  await expectDatabaseError(
    () => db.query(`select public.get_operator_command_center('${organization.organizationId}',null,null,current_date-29,current_date)`),
    "OPERATOR_ORGANIZATION_DENIED",
  );
  await expectDatabaseError(
    () => db.query("select public.get_operator_global_search('Map',24)"),
    "OPERATOR_ORGANIZATION_DENIED",
  );
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${resident}'`);
  await expectDatabaseError(
    () => db.query("select public.get_operator_global_search('Map',24)"),
    "OPERATOR_ORGANIZATION_DENIED",
  );

  await db.exec(`set role authenticated; set request.jwt.claim.sub='${resident}'`);
  await expectDatabaseError(() => db.query(`select public.generate_recurring_charges('2026-08-31',null,'unauthorized-worker')`), "permission denied");
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${outsider}'`);
  const outsiderSummary = (await db.query("select public.get_resident_balance_summary() as result")).rows[0].result;
  const outsiderCharges = (await db.query("select count(*)::integer as count from public.charges")).rows[0].count;
  const outsiderPayments = (await db.query("select count(*)::integer as count from public.payments")).rows[0].count;
  const outsiderAttempts = (await db.query("select count(*)::integer as count from public.payment_attempts")).rows[0].count;
  const outsiderRefunds = (await db.query("select count(*)::integer as count from public.payment_refunds")).rows[0].count;
  const outsiderSettlements = (await db.query("select count(*)::integer as count from public.settlement_batches")).rows[0].count;
  await expectDatabaseError(() => db.query(`select public.get_payment_dispute_history('${disputedPreparation.paymentId}')`), "PAYMENT_NOT_FOUND");
  await expectDatabaseError(() => db.query(`select public.get_payment_attempt_history('${failedPreparation.paymentId}')`), "PAYMENT_NOT_FOUND");
  await expectDatabaseError(() => db.query(`select public.get_resident_payment_retry_context('${failedPreparation.paymentId}')`), "PAYMENT_NOT_RETRYABLE");
  await expectDatabaseError(() => db.query(`select public.record_manual_payment('${organization.organizationId}','${activation.tenancyId}','cash',1000,'USD','${receivedAt}','Unauthorized cash','${evidenceDocumentId}','[{"chargeId":"${generated.chargeIds[0]}","amountMinor":1000}]'::jsonb,null,'outsider-manual-payment')`), "PROPERTY_SCOPE_DENIED");
  await expectDatabaseError(() => db.query(`select public.reverse_or_correct_payment('${payment.paymentId}','metadata_correction','Unauthorized correction','reversed',4,null,'{"manualReason":"Forged change"}'::jsonb,'outsider-payment-correction')`), "PROPERTY_SCOPE_DENIED");
  await expectDatabaseError(() => db.query(`select public.get_payment_receipt('${payment.receiptDocumentId}')`), "RECEIPT_NOT_FOUND");
  await expectDatabaseError(() => db.query(`select public.prepare_resident_payment_session(
    '${activation.tenancyId}',1000,'USD','[{"chargeId":"${generated.chargeIds[0]}","amountMinor":1000}]'::jsonb,'card','${paymentReturnUrl}','outsider-payment-session-0001'
  )`), "TENANCY_SCOPE_DENIED");
  assert(outsiderSummary.items.length === 0 && outsiderCharges === 0 && outsiderPayments === 0 && outsiderAttempts === 0 && outsiderRefunds === 0 && outsiderSettlements === 0, "Resident finance or settlement data leaked to an unrelated user.");

  // Maintenance cost posting to the ledger (phase_6_maintenance_cost). workOrder is closed,
  // highCostWorkOrder is canceled by this point.
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${outsider}'`);
  await expectDatabaseError(() => db.query(`select public.record_work_order_cost('${organization.organizationId}','${workOrder.workOrderId}',32000,'USD','Sink parts and labor','work-order-cost-denied-0001')`), "PROPERTY_SCOPE_DENIED");
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${admin}'`);
  const costGuardRequest = (await db.query(`select public.submit_maintenance_request('${activation.tenancyId}','plumbing','Cost guard request','A maintenance request used to test cost-before-completion.',null,null,'[]'::jsonb,array[]::uuid[],'work-order-cost-guard-req-0001') as result`)).rows[0].result;
  const costGuardWorkOrder = (await db.query(`select public.create_and_assign_work_order('${organization.organizationId}','${costGuardRequest.maintenanceRequestId}','${vendor.vendorId}','Guard scope for a not-yet-completed work order.',null,null,null,null,false,null,'work-order-cost-guard-wo-0001') as result`)).rows[0].result;
  await expectDatabaseError(() => db.query(`select public.record_work_order_cost('${organization.organizationId}','${costGuardWorkOrder.workOrderId}',10000,'USD','Not done yet','work-order-cost-notdone-0001')`), "WORK_ORDER_NOT_COMPLETED");
  await expectDatabaseError(() => db.query(`select public.record_work_order_cost('${organization.organizationId}','${workOrder.workOrderId}',32000,'CAD','Wrong currency','work-order-cost-currency-0001')`), "WORK_ORDER_COST_CURRENCY_MISMATCH");
  const workOrderCost = (await db.query(`select public.record_work_order_cost('${organization.organizationId}','${workOrder.workOrderId}',32000,'USD','Sink parts and labor','work-order-cost-0001') as result`)).rows[0].result;
  assert(workOrderCost.journalTransactionId && workOrderCost.amountMinor === 32000 && workOrderCost.currencyCode === "USD", "Work-order cost posting did not return its canonical journal.");
  const workOrderCostReplay = (await db.query(`select public.record_work_order_cost('${organization.organizationId}','${workOrder.workOrderId}',32000,'USD','Sink parts and labor','work-order-cost-0001') as result`)).rows[0].result;
  assert(workOrderCostReplay.journalTransactionId === workOrderCost.journalTransactionId, "Work-order cost replay did not return the canonical journal.");
  await expectDatabaseError(() => db.query(`select public.record_work_order_cost('${organization.organizationId}','${workOrder.workOrderId}',32000,'USD','Sink parts and labor','work-order-cost-again-0002')`), "WORK_ORDER_COST_ALREADY_POSTED");
  await db.exec("reset role");
  const costPosting = (await db.query(`select
    sum(e.debit_minor)::integer as debits, sum(e.credit_minor)::integer as credits,
    count(*) filter (where la.account_class='expense' and la.account_code='6200' and e.debit_minor>0 and e.property_id='${property.propertyId}')::integer as expense_legs,
    count(*) filter (where la.account_class='liability' and la.account_code='2000' and e.credit_minor>0)::integer as payable_legs,
    t.transaction_type
    from public.journal_transactions t
    join public.journal_entries e on e.journal_transaction_id=t.id
    join public.ledger_accounts la on la.id=e.ledger_account_id
    where t.id='${workOrderCost.journalTransactionId}' group by t.transaction_type`)).rows[0];
  assert(costPosting.debits === 32000 && costPosting.credits === 32000 && costPosting.expense_legs === 1 && costPosting.payable_legs === 1 && costPosting.transaction_type === "maintenance_cost", "Work-order cost journal is not a balanced expense/payable posting carrying the property.");
  await expectDatabaseError(() => db.query(`update public.journal_transactions set metadata='{}'::jsonb where id='${workOrderCost.journalTransactionId}'`), "APPEND_ONLY_RECORD");
  const costTraces = (await db.query(`select
    (select count(*)::integer from private.outbox_events where event_type='work_order.cost_posted') as events,
    (select count(*)::integer from audit.audit_events where action_code='work_order.cost_posted') as audits
  `)).rows[0];
  assert(costTraces.events === 1 && costTraces.audits === 1, "Work-order cost audit/outbox trace is incomplete.");
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${admin}'`);
  const maintenanceAfterCost = (await db.query("select public.get_operator_maintenance_workspace() as result")).rows[0].result;
  const costedItem = maintenanceAfterCost.items.find((item) => item.workOrder && item.workOrder.workOrderId === workOrder.workOrderId);
  assert(costedItem && costedItem.workOrder.cost && costedItem.workOrder.cost.amountMinor === 32000 && costedItem.workOrder.cost.currencyCode === "USD", "Operator workspace did not surface the posted work-order cost.");

  // Relationship-user invitation and activation (phase_8_relationship_invitations).
  const invitedResidentPerson = "e5000000-0000-4000-8000-000000000051";
  const invitedResidentUser = "e5000000-0000-4000-8000-000000000052";
  const invitedOwnerUser = "e5000000-0000-4000-8000-000000000053";
  const invitedOwnerEntity = "e5000000-0000-4000-8000-000000000054";
  const residentEmail = "invited.resident@example.com";
  const ownerEmail = "invited.owner@example.com";
  const residentTokenHash = "1".repeat(64);
  const residentTokenHashTwo = "2".repeat(64);
  const ownerTokenHash = "3".repeat(64);
  const ownerTokenHashTwo = "4".repeat(64);
  await db.exec(`reset role;
    insert into auth.users(id,email) values ('${invitedResidentUser}','${residentEmail}'),('${invitedOwnerUser}','${ownerEmail}');
    insert into public.people(id,organization_id,first_name,last_name,email)
    values ('${invitedResidentPerson}','${organization.organizationId}','Riley','Invited','${residentEmail}');
    insert into public.household_members(organization_id,household_id,person_id,is_primary_contact,is_financially_responsible)
    values ('${organization.organizationId}','${activation.householdId}','${invitedResidentPerson}',false,false);
    insert into public.owner_entities(id,organization_id,display_name,entity_type,email)
    values ('${invitedOwnerEntity}','${organization.organizationId}','Invited Owner LLC','company','${ownerEmail}');
    insert into public.ownership_interests(id,organization_id,property_id,owner_entity_id,ownership_fraction,effective_from)
    values ('e5000000-0000-4000-8000-000000000055','${organization.organizationId}','${property.propertyId}','${invitedOwnerEntity}',0.0001,'2026-01-01');
    set role authenticated; set request.jwt.claim.sub='${admin}';
  `);

  await expectDatabaseError(() => db.query(`select public.invite_relationship_user('${organization.organizationId}','${invitedResidentUser}','resident_person','${invitedResidentPerson}','${residentEmail}','en-US','crecy_owner','${residentTokenHash}','${residentTokenHash.slice(0, 10)}','relationship-invite-surface')`), "REDIRECT_SURFACE_MISMATCH");
  await expectDatabaseError(() => db.query(`select public.invite_relationship_user('${organization.organizationId}','${invitedResidentUser}','resident_person','${invitedResidentPerson}','wrong.email@example.com','en-US','crecy_living','${residentTokenHash}','${residentTokenHash.slice(0, 10)}','relationship-invite-email')`), "EMAIL_RELATIONSHIP_MISMATCH");
  await expectDatabaseError(() => db.query(`select public.invite_relationship_user('${organization.organizationId}','${invitedOwnerUser}','resident_person','${invitedResidentPerson}','${residentEmail}','en-US','crecy_living','${residentTokenHash}','${residentTokenHash.slice(0, 10)}','relationship-invite-usermismatch')`), "INVITED_USER_EMAIL_MISMATCH");

  const residentInvite = (await db.query(`select public.invite_relationship_user('${organization.organizationId}','${invitedResidentUser}','resident_person','${invitedResidentPerson}','${residentEmail}','en-US','crecy_living','${residentTokenHash}','${residentTokenHash.slice(0, 10)}','relationship-invite-resident-0001') as result`)).rows[0].result;
  assert(residentInvite.invitationId && residentInvite.status === "invited" && residentInvite.deliveryStatus === "queued" && residentInvite.relationshipType === "resident_person" && residentInvite.redirectSurface === "crecy_living", "Resident invitation did not return its canonical queued invitation.");
  const residentInviteReplay = (await db.query(`select public.invite_relationship_user('${organization.organizationId}','${invitedResidentUser}','resident_person','${invitedResidentPerson}','${residentEmail}','en-US','crecy_living','${residentTokenHash}','${residentTokenHash.slice(0, 10)}','relationship-invite-resident-0001') as result`)).rows[0].result;
  assert(residentInviteReplay.invitationId === residentInvite.invitationId && residentInviteReplay.idempotentReplay === true, "Resident invitation replay did not return the canonical invitation.");
  await db.exec("reset role");
  const invitedRelRow = (await db.query(`select status from public.user_relationships where user_id='${invitedResidentUser}' and relationship_type='resident_person' and relationship_id='${invitedResidentPerson}'`)).rows[0];
  assert(invitedRelRow.status === "invited", "The invited resident relationship row was not created in the invited state.");

  await db.exec(`set role authenticated; set request.jwt.claim.sub='${outsider}'`);
  await expectDatabaseError(() => db.query(`select public.invite_relationship_user('${organization.organizationId}','${invitedResidentUser}','resident_person','${invitedResidentPerson}','${residentEmail}','en-US','crecy_living','${residentTokenHashTwo}','${residentTokenHashTwo.slice(0, 10)}','relationship-invite-denied')`), "PROPERTY_SCOPE_DENIED");
  await expectDatabaseError(() => db.query(`select public.accept_relationship_invitation('${residentTokenHash}')`), "INVITATION_RECIPIENT_MISMATCH");

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${admin}'`);
  const residentReinvite = (await db.query(`select public.invite_relationship_user('${organization.organizationId}','${invitedResidentUser}','resident_person','${invitedResidentPerson}','${residentEmail}','en-US','crecy_living','${residentTokenHashTwo}','${residentTokenHashTwo.slice(0, 10)}','relationship-invite-resident-0002') as result`)).rows[0].result;
  assert(residentReinvite.invitationId !== residentInvite.invitationId, "Re-invitation did not mint a fresh invitation.");
  await db.exec("reset role");
  const pendingResidentInvites = (await db.query(`select count(*)::integer as count from public.invitations where relationship_id='${invitedResidentPerson}' and status='pending'`)).rows[0].count;
  const supersededResidentInvites = (await db.query(`select count(*)::integer as count from public.invitations where id='${residentInvite.invitationId}' and status='superseded'`)).rows[0].count;
  assert(pendingResidentInvites === 1 && supersededResidentInvites === 1, "Re-invitation did not supersede the prior pending token.");

  await db.exec(`set role authenticated; set request.jwt.claim.sub='${invitedResidentUser}'`);
  await expectDatabaseError(() => db.query(`select public.accept_relationship_invitation('${residentTokenHash}')`), "INVITATION_NOT_PENDING");
  const residentAccept = (await db.query(`select public.accept_relationship_invitation('${residentTokenHashTwo}') as result`)).rows[0].result;
  assert(residentAccept.status === "active" && residentAccept.relationshipType === "resident_person" && residentAccept.redirectSurface === "crecy_living", "Resident acceptance did not activate the relationship.");
  const residentAcceptReplay = (await db.query(`select public.accept_relationship_invitation('${residentTokenHashTwo}') as result`)).rows[0].result;
  assert(residentAcceptReplay.status === "active", "Resident acceptance replay was not idempotent.");
  await db.exec("reset role");
  const activeRelRow = (await db.query(`select status from public.user_relationships where user_id='${invitedResidentUser}' and relationship_type='resident_person' and relationship_id='${invitedResidentPerson}'`)).rows[0];
  assert(activeRelRow.status === "active", "The resident relationship row was not activated on acceptance.");

  // Owner path, including an expiry-then-recovery cycle.
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${admin}'`);
  const ownerInvite = (await db.query(`select public.invite_relationship_user('${organization.organizationId}','${invitedOwnerUser}','owner_entity','${invitedOwnerEntity}','${ownerEmail}','en-US','crecy_owner','${ownerTokenHash}','${ownerTokenHash.slice(0, 10)}','relationship-invite-owner-0001') as result`)).rows[0].result;
  assert(ownerInvite.relationshipType === "owner_entity" && ownerInvite.redirectSurface === "crecy_owner" && ownerInvite.status === "invited", "Owner invitation did not return its canonical queued invitation.");
  await db.exec(`reset role; update public.invitations set created_at=now()-interval '80 hours',expires_at=now()-interval '8 hours' where id='${ownerInvite.invitationId}'; set role authenticated; set request.jwt.claim.sub='${invitedOwnerUser}'`);
  await expectDatabaseError(() => db.query(`select public.accept_relationship_invitation('${ownerTokenHash}')`), "INVITATION_EXPIRED");
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${admin}'`);
  const ownerReinvite = (await db.query(`select public.invite_relationship_user('${organization.organizationId}','${invitedOwnerUser}','owner_entity','${invitedOwnerEntity}','${ownerEmail}','en-US','crecy_owner','${ownerTokenHashTwo}','${ownerTokenHashTwo.slice(0, 10)}','relationship-invite-owner-0002') as result`)).rows[0].result;
  assert(ownerReinvite.invitationId !== ownerInvite.invitationId, "Owner re-invitation did not mint a fresh invitation.");
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${invitedOwnerUser}'`);
  const ownerAccept = (await db.query(`select public.accept_relationship_invitation('${ownerTokenHashTwo}') as result`)).rows[0].result;
  assert(ownerAccept.status === "active" && ownerAccept.relationshipType === "owner_entity", "Owner acceptance did not activate the relationship.");

  await db.exec("reset role");
  const relationshipInviteTraces = (await db.query(`select
    (select count(*)::integer from private.outbox_events where event_type='relationship.invited') as invited,
    (select count(*)::integer from private.outbox_events where event_type='relationship.activated') as activated,
    (select count(*)::integer from private.outbox_events where event_type='notification.requested' and payload->>'recipientRelationship' in ('resident_person','owner_entity')) as notified,
    (select count(*)::integer from private.notification_jobs where template_code in ('resident_invitation','owner_invitation')) as jobs,
    (select count(*)::integer from audit.audit_events where action_code='relationship.invited') as invite_audits,
    (select count(*)::integer from audit.audit_events where action_code='relationship.activated') as activate_audits
  `)).rows[0];
  assert(relationshipInviteTraces.invited === 4 && relationshipInviteTraces.activated === 2 && relationshipInviteTraces.notified === 4 && relationshipInviteTraces.jobs === 4 && relationshipInviteTraces.invite_audits === 4 && relationshipInviteTraces.activate_audits === 2, "Relationship invitation audit/outbox/notification trace is incomplete.");

  // Reconciliation-exception resolution (phase_5_reconciliation_resolution). The po_CrecyMismatch001
  // batch left two open exceptions above; drive resolve/waive/escalate against them.
  await db.exec("reset role");
  const mismatchExceptions = (await db.query(`select id,exception_type,status from public.reconciliation_exceptions
    where settlement_batch_id='${mismatch.settlementId}' order by exception_type,id`)).rows;
  assert(mismatchExceptions.length === 2 && mismatchExceptions.every((row) => row.status === "open"), "Expected two open reconciliation exceptions on the mismatch batch.");
  const exceptionA = mismatchExceptions[0].id;
  const exceptionB = mismatchExceptions[1].id;

  await db.exec(`set role authenticated; set request.jwt.claim.sub='${outsider}'`);
  await expectDatabaseError(() => db.query(`select public.resolve_reconciliation_exception('${organization.organizationId}','${exceptionA}','resolved','Matched to the corrected payout total.','recon-denied-000001')`), "FINANCE_SCOPE_DENIED");
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${admin}'`);
  await expectDatabaseError(() => db.query(`select public.resolve_reconciliation_exception('${organization.organizationId}','${exceptionA}','dismissed','x','recon-badres-000001')`), "INVALID_RESOLUTION");
  await expectDatabaseError(() => db.query(`select public.resolve_reconciliation_exception('${organization.organizationId}','${exceptionA}','resolved',null,'recon-noev-0000001')`), "RESOLUTION_EVIDENCE_REQUIRED");
  await expectDatabaseError(() => db.query(`select public.resolve_reconciliation_exception('${organization.organizationId}','${"0".repeat(8)}-0000-4000-8000-000000009999','resolved','No such exception here.','recon-nf-00000001')`), "RECONCILIATION_EXCEPTION_NOT_FOUND");

  const escalation = (await db.query(`select public.resolve_reconciliation_exception('${organization.organizationId}','${exceptionA}','escalated','Needs finance-lead review before closing.','recon-escalate-0001') as result`)).rows[0].result;
  assert(escalation.status === "escalated" && escalation.batchCleared === false, "Escalation did not keep the exception open on the batch.");
  await expectDatabaseError(() => db.query(`select public.resolve_reconciliation_exception('${organization.organizationId}','${exceptionA}','escalated','Escalating again.','recon-escalate-0002')`), "EXCEPTION_ALREADY_ESCALATED");
  await db.exec("reset role");
  const escalatedRow = (await db.query(`select status,resolved_at,resolved_by from public.reconciliation_exceptions where id='${exceptionA}'`)).rows[0];
  assert(escalatedRow.status === "escalated" && escalatedRow.resolved_at === null && escalatedRow.resolved_by === null, "Escalated exception must not carry a resolver.");
  const batchAfterEscalate = (await db.query(`select reconciliation_status from public.settlement_batches where id='${mismatch.settlementId}'`)).rows[0].reconciliation_status;
  assert(batchAfterEscalate === "exception", "Batch left its exception state while an escalated exception remained.");

  await db.exec(`set role authenticated; set request.jwt.claim.sub='${admin}'`);
  // Close the OTHER exception (B) while A is still escalated. The batch must NOT clear, because an
  // unresolved escalated exception still blocks it — this is what makes the 'escalated' arm of the
  // batch-clear predicate load-bearing (a settlement mismatch cannot be silently closed). If the
  // predicate were mutated to only ('open'), this assertion would flip and catch it.
  const waivedB = (await db.query(`select public.resolve_reconciliation_exception('${organization.organizationId}','${exceptionB}','waived','Immaterial rounding difference; waived per policy.','recon-waiveB-00001') as result`)).rows[0].result;
  assert(waivedB.status === "waived" && waivedB.batchCleared === false, "Closing the open exception wrongly cleared the batch while an escalated exception was still its sole blocker.");
  await db.exec("reset role");
  const batchWithEscalatedBlocker = (await db.query(`select reconciliation_status from public.settlement_batches where id='${mismatch.settlementId}'`)).rows[0].reconciliation_status;
  assert(batchWithEscalatedBlocker === "exception", "Batch left its exception state while an escalated exception was still its sole blocker.");
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${admin}'`);
  await expectDatabaseError(() => db.query(`select public.resolve_reconciliation_exception('${organization.organizationId}','${exceptionB}','resolved','Trying to re-close a closed exception.','recon-reclose-0001')`), "EXCEPTION_ALREADY_RESOLVED");
  // Now resolve the previously-escalated A: it is the last blocker, so the batch clears.
  const resolvedA = (await db.query(`select public.resolve_reconciliation_exception('${organization.organizationId}','${exceptionA}','resolved','Confirmed the payout total against the bank record.','recon-resolveA-0001') as result`)).rows[0].result;
  assert(resolvedA.status === "resolved" && resolvedA.resolvedAt && resolvedA.batchCleared === true, "Resolving the last (previously escalated) exception did not clear the batch.");
  const resolvedAReplay = (await db.query(`select public.resolve_reconciliation_exception('${organization.organizationId}','${exceptionA}','resolved','Confirmed the payout total against the bank record.','recon-resolveA-0001') as result`)).rows[0].result;
  assert(resolvedAReplay.reconciliationExceptionId === resolvedA.reconciliationExceptionId && resolvedAReplay.status === "resolved", "Resolve replay did not return the stored response.");

  await db.exec("reset role");
  const resolvedRows = (await db.query(`select status,resolved_by,resolution_evidence from public.reconciliation_exceptions where id in ('${exceptionA}','${exceptionB}') order by status`)).rows;
  assert(resolvedRows[0].status === "resolved" && resolvedRows[0].resolved_by === admin && resolvedRows[1].status === "waived" && resolvedRows[1].resolved_by === admin, "Resolved/waived exceptions must carry the resolver and status.");
  const clearedBatch = (await db.query(`select reconciliation_status from public.settlement_batches where id='${mismatch.settlementId}'`)).rows[0].reconciliation_status;
  assert(clearedBatch === "unreconciled", "Batch did not return to unreconciled after all its exceptions were closed.");
  const resolutionTraces = (await db.query(`select
    (select count(*)::integer from private.outbox_events where event_type='reconciliation.exception_resolved' and aggregate_id in ('${exceptionA}','${exceptionB}')) as resolved_events,
    (select count(*)::integer from private.outbox_events where event_type='reconciliation.exception_escalated' and aggregate_id='${exceptionA}') as escalated_events,
    (select count(*)::integer from audit.audit_events where action_code='reconciliation.exception_resolved' and resource_id in ('${exceptionA}','${exceptionB}')) as resolved_audits,
    (select count(*)::integer from audit.audit_events where action_code='reconciliation.exception_escalated' and resource_id='${exceptionA}') as escalated_audits
  `)).rows[0];
  assert(resolutionTraces.resolved_events === 2 && resolutionTraces.escalated_events === 1 && resolutionTraces.resolved_audits === 2 && resolutionTraces.escalated_audits === 1, "Reconciliation-resolution audit/outbox trace is incomplete.");
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${admin}'`);
  const workspaceAfterResolution = (await db.query("select public.get_settlement_reconciliation_workspace() as result")).rows[0].result;
  assert(!workspaceAfterResolution.exceptions.some((row) => row.settlementId === mismatch.settlementId), "Resolved/waived exceptions still appear on the operator reconciliation queue.");

  // Receivable write-off (phase_4_receivable_write_off). Generate two fresh rent charges (the schedule
  // advanced to 2026-09-30, then 2026-10-31); partially pay September so its write-off posts the
  // REMAINING not the face amount, then write off BOTH in one call to exercise multi-charge aggregation.
  await db.exec(`reset role; set role service_role`);
  const writeOffGenSep = (await db.query(`select public.generate_recurring_charges('2026-09-30',array['${activation.chargeScheduleId}'::uuid],'finance-writeoff-gen-0001') as result`)).rows[0].result;
  assert(writeOffGenSep.generatedCount === 1 && writeOffGenSep.chargeIds.length === 1, "Fresh September write-off charge was not generated.");
  const writeOffCharge = writeOffGenSep.chargeIds[0];
  const writeOffGenOct = (await db.query(`select public.generate_recurring_charges('2026-10-31',array['${activation.chargeScheduleId}'::uuid],'finance-writeoff-gen-0002') as result`)).rows[0].result;
  assert(writeOffGenOct.generatedCount === 1 && writeOffGenOct.chargeIds.length === 1, "Fresh October write-off charge was not generated.");
  const writeOffChargeOct = writeOffGenOct.chargeIds[0];
  // Partially pay the fresh charge so the write-off must post the REMAINING (185000-60000), not the
  // charge face amount — this is what proves the remaining computation rather than a full-amount post.
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${admin}'`);
  await db.query(`select public.record_manual_payment('${organization.organizationId}','${activation.tenancyId}','cash',60000,'USD','${receivedAt}','Partial payment before write-off','${evidenceDocumentId}','[{"chargeId":"${writeOffCharge}","amountMinor":60000}]'::jsonb,null,'writeoff-partial-pay-0001')`);
  await db.exec("reset role");
  const balanceBefore = (await db.query(`select coalesce(sum(e.debit_minor-e.credit_minor),0)::integer as balance
    from public.journal_entries e join public.ledger_accounts a on a.id=e.ledger_account_id
    where e.tenancy_id='${activation.tenancyId}' and a.account_code='1100'`)).rows[0].balance;

  await db.exec(`set role authenticated; set request.jwt.claim.sub='${outsider}'`);
  await expectDatabaseError(() => db.query(`select public.write_off_receivable('${organization.organizationId}','${activation.tenancyId}',array['${writeOffCharge}']::uuid[],'Tenant is unreachable and the balance is uncollectible.','writeoff-denied-000001')`), "PROPERTY_SCOPE_DENIED");
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${admin}'`);
  await expectDatabaseError(() => db.query(`select public.write_off_receivable('${organization.organizationId}','${"0".repeat(8)}-0000-4000-8000-000000008888',array['${writeOffCharge}']::uuid[],'No such tenancy.','writeoff-notenancy-01')`), "TENANCY_NOT_FOUND");
  await expectDatabaseError(() => db.query(`select public.write_off_receivable('${organization.organizationId}','${activation.tenancyId}',array['${writeOffCharge}']::uuid[],'  ','writeoff-noreason-0001')`), "INVALID_WRITE_OFF_REASON");
  await expectDatabaseError(() => db.query(`select public.write_off_receivable('${organization.organizationId}','${activation.tenancyId}',array[]::uuid[],'Empty charge set.','writeoff-nocharge-0001')`), "INVALID_WRITE_OFF_CHARGES");
  await expectDatabaseError(() => db.query(`select public.write_off_receivable('${organization.organizationId}','${activation.tenancyId}',array['${"0".repeat(8)}-0000-4000-8000-000000007777']::uuid[],'That charge does not belong here.','writeoff-badcharge-01')`), "WRITE_OFF_CHARGE_NOT_AVAILABLE");
  // A set mixing a writable charge with an unavailable one is rejected wholesale (the count check).
  await expectDatabaseError(() => db.query(`select public.write_off_receivable('${organization.organizationId}','${activation.tenancyId}',array['${writeOffCharge}','${"0".repeat(8)}-0000-4000-8000-000000007777']::uuid[],'Mixed valid and invalid charges.','writeoff-mixed-000001')`), "WRITE_OFF_CHARGE_NOT_AVAILABLE");

  // Write off BOTH charges in one call: 125000 (September remaining after the partial payment) + 185000
  // (October in full) = 310000, proving both the remaining computation and multi-charge aggregation.
  const writeOff = (await db.query(`select public.write_off_receivable('${organization.organizationId}','${activation.tenancyId}',array['${writeOffCharge}','${writeOffChargeOct}']::uuid[],'Tenant moved out; the remaining rent is uncollectible.','writeoff-0001') as result`)).rows[0].result;
  assert(writeOff.writtenOffMinor === 310000 && writeOff.chargeCount === 2 && writeOff.journalTransactionId && writeOff.currencyCode === "USD", "Multi-charge write-off did not aggregate the two charges' remaining balances (125000 September + 185000 October).");
  const writeOffReplay = (await db.query(`select public.write_off_receivable('${organization.organizationId}','${activation.tenancyId}',array['${writeOffCharge}','${writeOffChargeOct}']::uuid[],'Tenant moved out; the remaining rent is uncollectible.','writeoff-0001') as result`)).rows[0].result;
  assert(writeOffReplay.journalTransactionId === writeOff.journalTransactionId, "Write-off replay did not return the canonical journal.");
  await expectDatabaseError(() => db.query(`select public.write_off_receivable('${organization.organizationId}','${activation.tenancyId}',array['${writeOffCharge}']::uuid[],'Attempting to write off an already-written-off charge.','writeoff-again-00001')`), "WRITE_OFF_CHARGE_NOT_AVAILABLE");

  await db.exec("reset role");
  const writeOffPosting = (await db.query(`select
    (select sum(e.debit_minor)::integer from public.journal_entries e where e.journal_transaction_id='${writeOff.journalTransactionId}') as debits,
    (select sum(e.credit_minor)::integer from public.journal_entries e where e.journal_transaction_id='${writeOff.journalTransactionId}') as credits,
    (select count(*)::integer from public.journal_entries e join public.ledger_accounts a on a.id=e.ledger_account_id
      where e.journal_transaction_id='${writeOff.journalTransactionId}' and a.account_code='6300' and a.account_class='expense' and e.debit_minor>0 and e.property_id='${property.propertyId}') as expense_legs,
    (select count(*)::integer from public.journal_entries e join public.ledger_accounts a on a.id=e.ledger_account_id
      where e.journal_transaction_id='${writeOff.journalTransactionId}' and a.account_code='1100' and e.credit_minor>0 and e.tenancy_id='${activation.tenancyId}') as ar_legs,
    (select t.transaction_type from public.journal_transactions t where t.id='${writeOff.journalTransactionId}') as transaction_type,
    (select count(*)::integer from public.charges c where c.id in ('${writeOffCharge}','${writeOffChargeOct}') and c.status='written_off' and c.voided_by_transaction_id='${writeOff.journalTransactionId}') as linked_written_off,
    (select coalesce(sum(e.debit_minor-e.credit_minor),0)::integer from public.journal_entries e join public.ledger_accounts a on a.id=e.ledger_account_id
      where e.tenancy_id='${activation.tenancyId}' and a.account_code='1100') as balance_after`)).rows[0];
  assert(writeOffPosting.debits === 310000 && writeOffPosting.credits === 310000 && writeOffPosting.expense_legs === 2 && writeOffPosting.ar_legs === 2 && writeOffPosting.transaction_type === "receivable_write_off", "Multi-charge write-off journal is not a balanced bad-debt/AR posting with one leg pair per charge.");
  assert(writeOffPosting.linked_written_off === 2, "Both written-off charges did not flip status and link the terminating transaction.");
  assert(balanceBefore - writeOffPosting.balance_after === 310000, "Write-off did not reduce the tenancy receivable balance by the summed remaining amounts.");
  await expectDatabaseError(() => db.query(`update public.journal_transactions set metadata='{}'::jsonb where id='${writeOff.journalTransactionId}'`), "APPEND_ONLY_RECORD");
  const writeOffTraces = (await db.query(`select
    (select count(*)::integer from private.outbox_events where event_type='receivable.written_off' and aggregate_id='${writeOff.receivableAccountId}') as events,
    (select count(*)::integer from audit.audit_events where action_code='receivable.written_off' and resource_id='${writeOff.receivableAccountId}') as audits
  `)).rows[0];
  assert(writeOffTraces.events === 1 && writeOffTraces.audits === 1, "Write-off audit/outbox trace is incomplete.");

  // Owner-portal invite state on the operator owner-statement workspace (phase_8_owner_portal_invite_state).
  // invitedOwnerEntity is active (accepted above); add a not-invited and an invited-only owner to cover
  // all three states, and rely on ownerEntityA (no email) for the null-email path.
  const ownerNotInvited = "e6000000-0000-4000-8000-000000000061";
  const ownerInvitedOnly = "e6000000-0000-4000-8000-000000000062";
  const ownerInvitedOnlyUser = "e6000000-0000-4000-8000-000000000063";
  await db.exec(`reset role;
    insert into public.owner_entities(id,organization_id,display_name,entity_type,email) values
      ('${ownerNotInvited}','${organization.organizationId}','Not Invited Owner LLC','company','notinvited.owner@example.com'),
      ('${ownerInvitedOnly}','${organization.organizationId}','Invited Only Owner LLC','company','invitedonly.owner@example.com');
    insert into public.ownership_interests(id,organization_id,property_id,owner_entity_id,ownership_fraction,effective_from) values
      ('e6000000-0000-4000-8000-000000000064','${organization.organizationId}','${property.propertyId}','${ownerNotInvited}',0.0001,'2026-01-01'),
      ('e6000000-0000-4000-8000-000000000065','${organization.organizationId}','${property.propertyId}','${ownerInvitedOnly}',0.0001,'2026-01-01');
    insert into auth.users(id,email) values ('${ownerInvitedOnlyUser}','invitedonly.owner@example.com');
    insert into public.user_relationships(id,user_id,organization_id,relationship_type,relationship_id,status) values
      ('e6000000-0000-4000-8000-000000000066','${ownerInvitedOnlyUser}','${organization.organizationId}','owner_entity','${ownerInvitedOnly}','invited');
  `);
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${admin}'`);
  const inviteStateWorkspace = (await db.query("select public.get_operator_owner_statement_workspace() as result")).rows[0].result;
  const activeOwnerRow = inviteStateWorkspace.owners.find((row) => row.ownerEntityId === invitedOwnerEntity);
  const notInvitedRow = inviteStateWorkspace.owners.find((row) => row.ownerEntityId === ownerNotInvited);
  const invitedOnlyRow = inviteStateWorkspace.owners.find((row) => row.ownerEntityId === ownerInvitedOnly);
  const noEmailRow = inviteStateWorkspace.owners.find((row) => row.ownerEntityId === ownerEntityA);
  assert(activeOwnerRow && activeOwnerRow.invitationState === "active" && activeOwnerRow.email === ownerEmail, "Owner-statement workspace did not surface the accepted owner as active with their email.");
  assert(notInvitedRow && notInvitedRow.invitationState === "not_invited" && notInvitedRow.email === "notinvited.owner@example.com", "Owner-statement workspace did not surface a not-invited owner.");
  assert(invitedOnlyRow && invitedOnlyRow.invitationState === "invited" && invitedOnlyRow.email === "invitedonly.owner@example.com", "Owner-statement workspace did not surface an invited owner.");
  assert(noEmailRow && noEmailRow.invitationState === "active" && noEmailRow.email === null, "Owner-statement workspace did not surface a null email for an owner entity without one.");

  // Journal idempotency actor-scoping (phase_4_journal_idempotency_actor_scope). Two DIFFERENT finance
  // actors reusing ONE idempotency-key string on distinct charges in the same accounting book must BOTH
  // post — journal uniqueness is now (accounting_book_id, created_by, idempotency_key) for user postings.
  await db.exec(`reset role;
    insert into auth.users(id) values ('e7000000-0000-4000-8000-000000000071');
    insert into public.organization_memberships(organization_id,user_id,role_code,status,invited_by)
    values ('${organization.organizationId}','e7000000-0000-4000-8000-000000000071','accountant','active','${admin}');
    set role service_role;`);
  const idemChargeNov = (await db.query(`select public.generate_recurring_charges('2026-11-30',array['${activation.chargeScheduleId}'::uuid],'finance-idem-gen-nov-01') as result`)).rows[0].result.chargeIds[0];
  const idemChargeDec = (await db.query(`select public.generate_recurring_charges('2026-12-31',array['${activation.chargeScheduleId}'::uuid],'finance-idem-gen-dec-01') as result`)).rows[0].result.chargeIds[0];
  const financeActorB = "e7000000-0000-4000-8000-000000000071";
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${admin}'`);
  const writeOffActorA = (await db.query(`select public.write_off_receivable('${organization.organizationId}','${activation.tenancyId}',array['${idemChargeNov}']::uuid[],'Uncollectible balance closed by actor A.','shared-idem-key-000001') as result`)).rows[0].result;
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${financeActorB}'`);
  const writeOffActorB = (await db.query(`select public.write_off_receivable('${organization.organizationId}','${activation.tenancyId}',array['${idemChargeDec}']::uuid[],'Uncollectible balance closed by actor B.','shared-idem-key-000001') as result`)).rows[0].result;
  assert(writeOffActorB.journalTransactionId && writeOffActorB.journalTransactionId !== writeOffActorA.journalTransactionId,
    "A second actor reusing one idempotency key on a distinct charge did not post — journal uniqueness is not actor-scoped.");
  // A single actor replaying the same key still short-circuits to the stored response (idempotency intact).
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${admin}'`);
  const writeOffActorAReplay = (await db.query(`select public.write_off_receivable('${organization.organizationId}','${activation.tenancyId}',array['${idemChargeNov}']::uuid[],'Uncollectible balance closed by actor A.','shared-idem-key-000001') as result`)).rows[0].result;
  assert(writeOffActorAReplay.journalTransactionId === writeOffActorA.journalTransactionId, "Same-actor idempotent replay did not return the stored journal after the actor-scoping change.");

  // Platform control-plane foundation (phase_8_platform_control_plane_foundation). Audited, time-boxed
  // support grants. The DECISIVE assertion is the negative one: an active session is INERT — it grants
  // zero cross-org data access until a later slice wires has_active_support_session into a policy.
  const platformAgent = "e8000000-0000-4000-8000-000000000081";
  const platformAgentTwo = "e8000000-0000-4000-8000-000000000082";
  const platformAdmin = "e8000000-0000-4000-8000-000000000083";
  const nonPlatformUser = "e8000000-0000-4000-8000-000000000084";
  const platformAgentActor = "e8000000-0000-4000-8000-000000000091";
  await db.exec(`reset role;
    insert into auth.users(id) values ('${platformAgent}'),('${platformAgentTwo}'),('${platformAdmin}'),('${nonPlatformUser}');
    insert into private.platform_actors(id,user_id,platform_role,status) values
      ('${platformAgentActor}','${platformAgent}','support_agent','active'),
      ('e8000000-0000-4000-8000-000000000092','${platformAgentTwo}','support_agent','active'),
      ('e8000000-0000-4000-8000-000000000093','${platformAdmin}','platform_admin','active');`);

  await db.exec(`set role authenticated; set request.jwt.claim.sub='${platformAgent}'; set request.jwt.claim.aal='aal1'`);
  await expectDatabaseError(() => db.query(`select public.start_support_session('${organization.organizationId}','Investigating a billing discrepancy.',60,'support-noaal-000001')`), "MFA_STEP_UP_REQUIRED");
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${nonPlatformUser}'; set request.jwt.claim.aal='aal2'`);
  await expectDatabaseError(() => db.query(`select public.start_support_session('${organization.organizationId}','A non-platform user must not open a session.',60,'support-notactor-01')`), "NOT_PLATFORM_ACTOR");
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${platformAgent}'; set request.jwt.claim.aal='aal2'`);
  await expectDatabaseError(() => db.query(`select public.start_support_session('${organization.organizationId}','   ',60,'support-noreason-01')`), "AUDIT_REASON_REQUIRED");
  await expectDatabaseError(() => db.query(`select public.start_support_session('${organization.organizationId}','A valid support reason.',1,'support-badttl-01')`), "INVALID_SUPPORT_TTL");
  await expectDatabaseError(() => db.query(`select public.start_support_session('${"0".repeat(8)}-0000-4000-8000-000000009999','No such org to support here.',60,'support-noorg-01')`), "ORGANIZATION_NOT_FOUND");

  const supportSession = (await db.query(`select public.start_support_session('${organization.organizationId}','Investigating a billing discrepancy.',60,'support-session-0001') as result`)).rows[0].result;
  assert(supportSession.supportSessionId && supportSession.status === "active" && supportSession.accessScope === "read_only" && supportSession.expiresAt, "Support session did not open as a read-only, time-boxed grant.");
  const supportSessionReplay = (await db.query(`select public.start_support_session('${organization.organizationId}','Investigating a billing discrepancy.',60,'support-session-0001') as result`)).rows[0].result;
  assert(supportSessionReplay.supportSessionId === supportSession.supportSessionId, "Support-session replay did not return the stored session.");

  await db.exec(`reset role; set request.jwt.claim.sub='${platformAgent}'`);
  const agentHasSession = (await db.query(`select private.has_active_support_session('${organization.organizationId}') as has`)).rows[0].has;
  await db.exec(`set request.jwt.claim.sub='${admin}'`);
  const memberHasSession = (await db.query(`select private.has_active_support_session('${organization.organizationId}') as has`)).rows[0].has;
  assert(agentHasSession === true && memberHasSession === false, "has_active_support_session did not resolve only the caller's own active session.");

  // DECISIVE INERT TEST: the agent holds an active session and is NOT a member of the org; the helper
  // is wired into no policy, so a normal tenant read still returns zero rows.
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${platformAgent}'; set request.jwt.claim.aal='aal2'`);
  const agentMaintenance = (await db.query("select public.get_operator_maintenance_workspace() as result")).rows[0].result;
  const agentReceivables = (await db.query("select public.get_operator_receivables_summary() as result")).rows[0].result;
  assert(agentMaintenance.items.length === 0 && (agentReceivables.items ?? []).length === 0,
    "An active support session leaked cross-org data — the grant must be inert until a policy wires the helper in.");

  await db.exec("reset role");
  const supportStartTrace = (await db.query(`select
    (select count(*)::integer from audit.audit_events where action_code='support.session_started' and actor_type='support' and organization_id='${organization.organizationId}' and resource_id='${supportSession.supportSessionId}') as audits,
    (select count(*)::integer from private.outbox_events where event_type='support.session_started' and aggregate_id='${supportSession.supportSessionId}') as events`)).rows[0];
  assert(supportStartTrace.audits === 1 && supportStartTrace.events === 1, "Support session start did not write a single support-typed audit + outbox trace.");

  // Time-box: an 'active' row past its expiry is not honored (checked on the admin, whose only session is expired).
  await db.exec(`insert into private.support_sessions(id,organization_id,platform_actor_id,user_id,reason,correlation_id,started_at,expires_at,created_by)
    values ('e8000000-0000-4000-8000-0000000000a1','${organization.organizationId}','e8000000-0000-4000-8000-000000000093','${platformAdmin}','Expired session for the time-box test.',gen_random_uuid(),now()-interval '2 hours',now()-interval '1 hour','${platformAdmin}')`);
  await db.exec(`set request.jwt.claim.sub='${platformAdmin}'`);
  const adminExpiredHasSession = (await db.query(`select private.has_active_support_session('${organization.organizationId}') as has`)).rows[0].has;
  assert(adminExpiredHasSession === false, "An expired support session was still honored — the time-box is not enforced.");

  // Lifecycle: a second agent cannot end another's session; the owner ends their own; re-end fails.
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${platformAgentTwo}'; set request.jwt.claim.aal='aal2'`);
  await expectDatabaseError(() => db.query(`select public.end_support_session('${organization.organizationId}','${supportSession.supportSessionId}','ended','support-forbidden-01')`), "SUPPORT_SESSION_FORBIDDEN");
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${platformAgent}'; set request.jwt.claim.aal='aal2'`);
  const supportEnd = (await db.query(`select public.end_support_session('${organization.organizationId}','${supportSession.supportSessionId}','ended','support-end-0001') as result`)).rows[0].result;
  assert(supportEnd.status === "ended", "Ending a support session did not close it.");
  const supportEndReplay = (await db.query(`select public.end_support_session('${organization.organizationId}','${supportSession.supportSessionId}','ended','support-end-0001') as result`)).rows[0].result;
  assert(supportEndReplay.status === "ended", "End-support-session replay did not return the stored response.");
  await expectDatabaseError(() => db.query(`select public.end_support_session('${organization.organizationId}','${supportSession.supportSessionId}','revoked','support-reend-0001')`), "SUPPORT_SESSION_NOT_ACTIVE");
  await db.exec(`reset role; set request.jwt.claim.sub='${platformAgent}'`);
  const agentHasSessionAfterEnd = (await db.query(`select private.has_active_support_session('${organization.organizationId}') as has`)).rows[0].has;
  assert(agentHasSessionAfterEnd === false, "The agent still held an active session after it was ended.");

  // ── Sanitized support-query surface (phase_8_platform_support_queries) ────────────────────────
  // Support access is served ONLY by definer support-query RPCs gated on (active platform actor)
  // AND (active, unexpired session for the exact org). Tenant RLS is untouched.

  // GUARD: no tenant base-table policy ORs the support gate in — support must not bypass tenant RLS.
  await db.exec("reset role");
  const supportPolicyLeak = (await db.query(`select count(*)::integer as c from pg_policies
    where schemaname in ('public','reporting') and (coalesce(qual,'')||coalesce(with_check,'')) ilike '%has_active_support_session%'`)).rows[0].c;
  assert(supportPolicyLeak === 0, "A tenant RLS policy references has_active_support_session — support access must not bypass tenant RLS.");

  // (A) A platform actor with NO active session gets zero org data.
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${platformAgent}'; set request.jwt.claim.aal='aal2'`);
  await expectDatabaseError(() => db.query(`select public.support_get_organization_overview('${organization.organizationId}')`), "SUPPORT_SESSION_REQUIRED");
  // (B) A non-platform user cannot touch the support surface at all.
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${nonPlatformUser}'; set request.jwt.claim.aal='aal2'`);
  await expectDatabaseError(() => db.query(`select public.support_lookup_organizations(null,25)`), "NOT_PLATFORM_ACTOR");

  // (C) Open a fresh session; sanitized reads now work and are audited. Set a member email first so
  // the masking is provable (test users otherwise have null emails).
  await db.exec(`reset role; update auth.users set email='jane.doe@example.com' where id='${admin}'`);
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${platformAgent}'; set request.jwt.claim.aal='aal2'`);
  const investigateSession = (await db.query(`select public.start_support_session('${organization.organizationId}','Investigating why a resident cannot see their tenancy.',60,'support-investigate-01') as r`)).rows[0].r;
  const overview = (await db.query(`select public.support_get_organization_overview('${organization.organizationId}') as r`)).rows[0].r;
  assert(overview.organizationId === organization.organizationId && typeof overview.propertyCount === "number" && typeof overview.activeMemberCount === "number",
    "Support overview did not return sanitized org counts.");
  assert(!Object.keys(overview).some((k) => /email|phone|secret|token|storage|balance|amount|before|after|password|provider|reason/i.test(k)),
    "Support overview DTO exposed a prohibited field.");
  const members = (await db.query(`select public.support_list_organization_members('${organization.organizationId}',50) as r`)).rows[0].r;
  assert(!JSON.stringify(members).includes("jane.doe@example.com"), "Support member list exposed a raw email address.");
  assert(members.members.length >= 1 && members.members[0].maskedEmail && members.members[0].maskedEmail.includes("***"), "Support member email was not masked.");
  assert(!members.members.some((m) => "beforeData" in m || "afterData" in m || "phone" in m || "phoneE164" in m), "Support member DTO exposed a prohibited field.");
  const activity = (await db.query(`select public.support_list_recent_activity('${organization.organizationId}',50) as r`)).rows[0].r;
  assert(Array.isArray(activity.activity) && activity.activity.every((a) => !("beforeData" in a) && !("afterData" in a) && !("reason" in a) && !("ipHash" in a)),
    "Support activity feed leaked raw before/after payloads or a reason.");

  // (D) Each investigation is audited with the support session id.
  await db.exec("reset role");
  const investigateAudit = (await db.query(`select count(*)::integer as c from audit.audit_events
    where actor_type='support' and organization_id='${organization.organizationId}'
      and action_code in ('support.viewed_overview','support.viewed_members','support.viewed_activity')
      and after_data->>'supportSessionId'='${investigateSession.supportSessionId}'`)).rows[0].c;
  assert(investigateAudit === 3, "Support investigations were not each audited with the support session id.");

  // (E) Org-scoping: the session is for this org only; any other org id is denied.
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${platformAgent}'; set request.jwt.claim.aal='aal2'`);
  await expectDatabaseError(() => db.query(`select public.support_get_organization_overview('${"0".repeat(8)}-0000-4000-8000-0000000000e2')`), "SUPPORT_SESSION_REQUIRED");

  // (F) The support session gate is active, yet a domain WRITE command is still denied — a session
  // never lets the actor mutate tenant data (write commands gate on membership, not on the session).
  // (has_active_support_session is definer-internal to schema private; call it as superuser — the uid
  // still resolves from the sub GUC — then attempt the write back as the authenticated agent.)
  await db.exec("reset role");
  const agentSupportGate = (await db.query(`select private.has_active_support_session('${organization.organizationId}') as support`)).rows[0].support;
  assert(agentSupportGate === true, "The support session gate was not active during the investigation.");
  await db.exec(`set role authenticated; set request.jwt.claim.aal='aal2'`);
  let supportWroteTenantData = false;
  try {
    await db.query(`select public.create_operating_entity_and_book('${organization.organizationId}','Support Co','Support','US','company','USD','Support Book','support-write-attempt-1')`);
    supportWroteTenantData = true;
  } catch { /* expected: the support actor is not a member, so the command's authorization denies it */ }
  assert(supportWroteTenantData === false, "A support session let the actor run a domain write command.");

  // (G) Suspending the platform actor revokes access immediately.
  await db.exec(`reset role; update private.platform_actors set status='suspended' where id='${platformAgentActor}'`);
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${platformAgent}'; set request.jwt.claim.aal='aal2'`);
  await expectDatabaseError(() => db.query(`select public.support_get_organization_overview('${organization.organizationId}')`), "NOT_PLATFORM_ACTOR");
  await db.exec(`reset role; update private.platform_actors set status='active' where id='${platformAgentActor}'`);

  // (H) An 'active'-status session past its expiry yields no data (expiry authoritative at query time).
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${platformAdmin}'; set request.jwt.claim.aal='aal2'`);
  await expectDatabaseError(() => db.query(`select public.support_get_organization_overview('${organization.organizationId}')`), "SUPPORT_SESSION_REQUIRED");

  // (I) Provisioning lifecycle: only a platform_admin at AAL2 provisions/suspends actors; no lockout.
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${platformAgent}'; set request.jwt.claim.aal='aal2'`);
  await expectDatabaseError(() => db.query(`select public.provision_platform_actor('${nonPlatformUser}','support_agent','New agent','provision-notadmin-1')`), "NOT_PLATFORM_ADMIN");
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${platformAdmin}'; set request.jwt.claim.aal='aal1'`);
  await expectDatabaseError(() => db.query(`select public.provision_platform_actor('${nonPlatformUser}','support_agent','New agent','provision-noaal-1')`), "MFA_STEP_UP_REQUIRED");
  await db.exec(`set request.jwt.claim.aal='aal2'`);
  await expectDatabaseError(() => db.query(`select public.provision_platform_actor('${"0".repeat(8)}-0000-4000-8000-0000000000ff','support_agent','Ghost','provision-nouser-1')`), "PLATFORM_USER_NOT_FOUND");
  const provisioned = (await db.query(`select public.provision_platform_actor('${nonPlatformUser}','support_agent','Provisioned agent','provision-ok-1') as r`)).rows[0].r;
  assert(provisioned.platformActorId && provisioned.status === "active", "Platform-admin provisioning did not create an active actor.");
  await expectDatabaseError(() => db.query(`select public.provision_platform_actor('${nonPlatformUser}','support_agent','Dup','provision-dup-1')`), "PLATFORM_ACTOR_EXISTS");
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${platformAgent}'; set request.jwt.claim.aal='aal2'`);
  await expectDatabaseError(() => db.query(`select public.set_platform_actor_status('${provisioned.platformActorId}','suspended','suspend-notadmin-1')`), "NOT_PLATFORM_ADMIN");
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${platformAdmin}'; set request.jwt.claim.aal='aal2'`);
  const suspendedActor = (await db.query(`select public.set_platform_actor_status('${provisioned.platformActorId}','suspended','suspend-ok-1') as r`)).rows[0].r;
  assert(suspendedActor.status === "suspended", "Suspend did not change the platform actor status.");
  await expectDatabaseError(() => db.query(`select public.set_platform_actor_status('e8000000-0000-4000-8000-000000000093','suspended','suspend-lastadmin-1')`), "CANNOT_SUSPEND_LAST_ADMIN");
  await db.exec("reset role");

  // ── Correction A/B/C: control-plane hardening (phase_8_platform_control_plane_hardening) ─────────
  // PGlite is single-connection, so a literal two-transaction race cannot execute here. These tests
  // prove the SERIALIZED outcome the transaction-scoped advisory lock guarantees, and additionally
  // assert the static presence of that lock and of the storage-layer partial unique index — the two
  // mechanisms that make the losing concurrent outcome impossible even under true parallelism.

  // (A) Last-admin cardinality is race-free. Provision a SECOND active admin, then suspend the two in
  // sequence: the first suspend succeeds (2 active → 1); suspending the now-last admin is refused. Under
  // real concurrency the advisory lock forces exactly this serialization, so at most one suspend commits.
  const platformAdminTwo = "e8000000-0000-4000-8000-000000000085";
  await db.exec(`reset role; insert into auth.users(id) values ('${platformAdminTwo}')`);
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${platformAdmin}'; set request.jwt.claim.aal='aal2'`);
  const provisionedAdminTwo = (await db.query(`select public.provision_platform_actor('${platformAdminTwo}','platform_admin','Second admin','provision-admintwo-1') as r`)).rows[0].r;
  assert(provisionedAdminTwo.platformActorId && provisionedAdminTwo.status === "active", "Provisioning a second platform admin did not create an active actor.");
  await db.exec("reset role");
  const twoAdmins = (await db.query(`select count(*)::integer as c from private.platform_actors where status='active' and platform_role='platform_admin'`)).rows[0].c;
  assert(twoAdmins === 2, "Expected exactly two active platform admins before the cardinality test.");
  // The second admin (085) suspends the first (093): 2 active → 1, allowed.
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${platformAdminTwo}'; set request.jwt.claim.aal='aal2'`);
  const suspendFirstAdmin = (await db.query(`select public.set_platform_actor_status('e8000000-0000-4000-8000-000000000093','suspended','suspend-admin-a-1') as r`)).rows[0].r;
  assert(suspendFirstAdmin.status === "suspended", "Suspending the first of two admins did not succeed.");
  // 085 is now the last active admin; suspending it is refused — the invariant re-read holds under lock.
  await expectDatabaseError(() => db.query(`select public.set_platform_actor_status('${provisionedAdminTwo.platformActorId}','suspended','suspend-admin-b-1')`), "CANNOT_SUSPEND_LAST_ADMIN");
  await db.exec("reset role");
  const oneAdminLeft = (await db.query(`select count(*)::integer as c from private.platform_actors where status='active' and platform_role='platform_admin'`)).rows[0].c;
  assert(oneAdminLeft === 1, "After the serialized suspends exactly one active admin must remain.");
  // The advisory lock that serializes every cardinality change is present in both commands.
  const provisionDef = (await db.query(`select pg_get_functiondef('public.provision_platform_actor(uuid,text,text,text)'::regprocedure) as d`)).rows[0].d;
  const statusDef = (await db.query(`select pg_get_functiondef('public.set_platform_actor_status(uuid,text,text)'::regprocedure) as d`)).rows[0].d;
  assert(provisionDef.includes("pg_advisory_xact_lock") && statusDef.includes("pg_advisory_xact_lock"), "The admin-cardinality commands must serialize on a transaction-scoped advisory lock.");
  // Reactivate 093 (the activate path also runs under the lock) to leave a clean two-admin state.
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${platformAdminTwo}'; set request.jwt.claim.aal='aal2'`);
  await db.query(`select public.set_platform_actor_status('e8000000-0000-4000-8000-000000000093','active','reactivate-admin-a-1')`);

  // (B) One active, unexpired support session per platform ACTOR, GLOBALLY. The agent already holds an
  // active session (support-investigate-01, opened in the sanitized-query tests and never ended).
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${platformAgent}'; set request.jwt.claim.aal='aal2'`);
  // Same org, different key → refused (not silently duplicated).
  await expectDatabaseError(() => db.query(`select public.start_support_session('${organization.organizationId}','A second concurrent session for the same org.',60,'support-second-same-1')`), "SUPPORT_SESSION_ALREADY_ACTIVE");
  // A genuinely different, open organization for the cross-org refusal.
  const orgTwoOwner = "e8000000-0000-4000-8000-000000000086";
  await db.exec(`reset role; insert into auth.users(id) values ('${orgTwoOwner}')`);
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${orgTwoOwner}'; set request.jwt.claim.aal='aal2'`);
  const orgTwo = (await db.query(`select public.create_organization('Beacon Realty','beacon-realty','property_manager','US','en-US','America/New_York','2026-07-20','beacon-org-0001') as result`)).rows[0].result;
  // The single active session must block a session for a DIFFERENT org too — the invariant is global.
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${platformAgent}'; set request.jwt.claim.aal='aal2'`);
  await expectDatabaseError(() => db.query(`select public.start_support_session('${orgTwo.organizationId}','A concurrent session for a different org.',60,'support-second-diff-1')`), "SUPPORT_SESSION_ALREADY_ACTIVE");
  // Storage-layer defense-in-depth: the partial unique index enforcing one active session per actor.
  await db.exec("reset role");
  const activeSessionIndex = (await db.query(`select count(*)::integer as c from pg_indexes where schemaname='private' and indexname='support_sessions_active_per_actor_unique'`)).rows[0].c;
  assert(activeSessionIndex === 1, "The one-active-session-per-actor partial unique index is missing.");
  // An EXPIRED prior session does NOT block a new one: force the agent's active session past its TTL,
  // then a fresh start succeeds (start_support_session materializes the lapsed row to 'expired' first).
  await db.exec(`reset role; update private.support_sessions set started_at=now()-interval '2 hours', expires_at=now()-interval '1 hour' where user_id='${platformAgent}' and status='active'`);
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${platformAgent}'; set request.jwt.claim.aal='aal2'`);
  const reopened = (await db.query(`select public.start_support_session('${organization.organizationId}','Reopening after the prior session lapsed at its TTL.',60,'support-reopen-after-expiry-1') as r`)).rows[0].r;
  assert(reopened.status === "active" && reopened.supportSessionId, "A new session was not allowed after the prior one lapsed at its TTL.");
  // The lapsed session was materialized to 'expired'; exactly one active session exists for the actor.
  await db.exec("reset role");
  const agentActiveCount = (await db.query(`select count(*)::integer as c from private.support_sessions where user_id='${platformAgent}' and status='active'`)).rows[0].c;
  assert(agentActiveCount === 1, "After reopening, the actor must have exactly one active session.");
  // True idempotent replay of the reopened session returns the SAME session (short-circuit before the
  // ALREADY_ACTIVE guard), never a spurious conflict.
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${platformAgent}'; set request.jwt.claim.aal='aal2'`);
  const reopenedReplay = (await db.query(`select public.start_support_session('${organization.organizationId}','Reopening after the prior session lapsed at its TTL.',60,'support-reopen-after-expiry-1') as r`)).rows[0].r;
  assert(reopenedReplay.supportSessionId === reopened.supportSessionId, "Idempotent replay of the reopened session did not return the stored session.");

  // (C) Deterministic current-subscription selection: a historical CANCELED Starter must never mask the
  // current Growth trial. Insert an older canceled Starter alongside the seeded Growth/trialing row.
  await db.exec("reset role");
  await db.exec(`insert into public.organization_subscriptions(organization_id,plan_code,country_price_book,status,created_at)
    values ('${organization.organizationId}','starter','US','canceled',now()-interval '400 days')`);
  const subRows = (await db.query(`select count(*)::integer as c from public.organization_subscriptions where organization_id='${organization.organizationId}'`)).rows[0].c;
  assert(subRows === 2, "Expected a current + a historical subscription row for the determinism test.");
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${platformAgent}'; set request.jwt.claim.aal='aal2'`);
  const overviewDeterministic = (await db.query(`select public.support_get_organization_overview('${organization.organizationId}') as r`)).rows[0].r;
  assert(overviewDeterministic.subscriptionPlanCode === "growth" && overviewDeterministic.subscriptionStatus === "trialing",
    "The overview did not deterministically report the current Growth trial over the historical canceled Starter.");
  await db.exec("reset role");

  // Document delivery & acknowledgement (phase_2_document_delivery). Operator delivers a finalized,
  // clean document version to a portal recipient identified by their active user_relationship; the
  // recipient records an append-only acknowledgement. Covers RLS isolation, replay, and the per-type
  // acknowledgement guard.
  const deliveryDoc = "e9000000-0000-4000-8000-0000000000d1";
  const deliveryVersion = "e9000000-0000-4000-8000-0000000000d2";
  const deliveryQuarantineDoc = "e9000000-0000-4000-8000-0000000000d5";
  const deliveryQuarantineVersion = "e9000000-0000-4000-8000-0000000000d6";
  const deliveryOutsider = "e9000000-0000-4000-8000-0000000000d4";
  await db.exec(`reset role;
    insert into auth.users(id) values ('${deliveryOutsider}');
    insert into public.documents(id,organization_id,property_id,document_type,title,source,status,created_by)
      select '${deliveryDoc}','${organization.organizationId}',p.id,'notice','Quiet hours notice','operator_supplied','active','${admin}' from public.properties p where p.organization_id='${organization.organizationId}' limit 1;
    insert into public.documents(id,organization_id,property_id,document_type,title,source,status,created_by)
      select '${deliveryQuarantineDoc}','${organization.organizationId}',p.id,'notice','Unscanned notice','operator_supplied','active','${admin}' from public.properties p where p.organization_id='${organization.organizationId}' limit 1;
    insert into public.document_versions(id,organization_id,document_id,version_number,storage_bucket,storage_path,mime_type,size_bytes,sha256_hex,original_filename,uploaded_by,upload_status) values
      ('${deliveryVersion}','${organization.organizationId}','${deliveryDoc}',1,'documents','org/notice-v1.pdf','application/pdf',2048,'${"a".repeat(64)}','notice.pdf','${admin}','clean'),
      ('${deliveryQuarantineVersion}','${organization.organizationId}','${deliveryQuarantineDoc}',1,'documents','org/notice-q.pdf','application/pdf',2048,'${"b".repeat(64)}','notice-q.pdf','${admin}','quarantined');`);

  await db.exec(`set role authenticated; set request.jwt.claim.sub='${admin}'`);
  await expectDatabaseError(() => db.query(`select public.deliver_document('${organization.organizationId}','${deliveryVersion}','resident_person','${invitedResidentPerson}','carrier_pigeon','doc-deliver-badchan-1')`), "UNSUPPORTED_DELIVERY_CHANNEL");
  await expectDatabaseError(() => db.query(`select public.deliver_document('${organization.organizationId}','${deliveryVersion}',null,null,'portal','doc-deliver-norecip-1')`), "INVALID_DELIVERY_RECIPIENT");
  await expectDatabaseError(() => db.query(`select public.deliver_document('${organization.organizationId}','e9000000-0000-4000-8000-0000000000ff','resident_person','${invitedResidentPerson}','portal','doc-deliver-noverr-1')`), "DOCUMENT_VERSION_NOT_FOUND");
  await expectDatabaseError(() => db.query(`select public.deliver_document('${organization.organizationId}','${deliveryQuarantineVersion}','resident_person','${invitedResidentPerson}','portal','doc-deliver-quar-01')`), "DOCUMENT_NOT_DELIVERABLE");
  await expectDatabaseError(() => db.query(`select public.deliver_document('${organization.organizationId}','${deliveryVersion}','resident_person','00000000-0000-4000-8000-0000000000fe','portal','doc-deliver-norel-1')`), "DELIVERY_RECIPIENT_NOT_FOUND");
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${deliveryOutsider}'`);
  await expectDatabaseError(() => db.query(`select public.deliver_document('${organization.organizationId}','${deliveryVersion}','resident_person','${invitedResidentPerson}','portal','doc-deliver-outsid-1')`), "PROPERTY_SCOPE_DENIED");

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${admin}'`);
  const documentDelivery = (await db.query(`select public.deliver_document('${organization.organizationId}','${deliveryVersion}','resident_person','${invitedResidentPerson}','portal','doc-deliver-0001') as result`)).rows[0].result;
  assert(documentDelivery.documentDeliveryId && documentDelivery.status === "delivered" && documentDelivery.recipientUserId === invitedResidentUser, "Document delivery did not create a portal delivery addressed to the resident.");
  const documentDeliveryReplay = (await db.query(`select public.deliver_document('${organization.organizationId}','${deliveryVersion}','resident_person','${invitedResidentPerson}','portal','doc-deliver-0001') as result`)).rows[0].result;
  assert(documentDeliveryReplay.documentDeliveryId === documentDelivery.documentDeliveryId, "Document delivery replay returned a different delivery.");

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${deliveryOutsider}'`);
  await expectDatabaseError(() => db.query(`select public.acknowledge_document_delivery('${organization.organizationId}','${documentDelivery.documentDeliveryId}','received','${"e".repeat(40)}',null,'doc-ack-forbid-01')`), "DOCUMENT_DELIVERY_FORBIDDEN");
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${invitedResidentUser}'`);
  await expectDatabaseError(() => db.query(`select public.acknowledge_document_delivery('${organization.organizationId}','${documentDelivery.documentDeliveryId}','signed','${"e".repeat(40)}',null,'doc-ack-badtype-1')`), "INVALID_ACKNOWLEDGEMENT_TYPE");
  await expectDatabaseError(() => db.query(`select public.acknowledge_document_delivery('${organization.organizationId}','${documentDelivery.documentDeliveryId}','received','short',null,'doc-ack-badhash-1')`), "INVALID_EVIDENCE_HASH");
  await expectDatabaseError(() => db.query(`select public.acknowledge_document_delivery('${organization.organizationId}','e9000000-0000-4000-8000-0000000000fd','received','${"e".repeat(40)}',null,'doc-ack-nodel-01')`), "DOCUMENT_DELIVERY_NOT_FOUND");
  const documentAck = (await db.query(`select public.acknowledge_document_delivery('${organization.organizationId}','${documentDelivery.documentDeliveryId}','received','${"e".repeat(40)}','lease-v3','doc-ack-0001') as result`)).rows[0].result;
  assert(documentAck.acknowledgementId && documentAck.acknowledgementType === "received", "Recipient acknowledgement did not record.");
  const documentAckReplay = (await db.query(`select public.acknowledge_document_delivery('${organization.organizationId}','${documentDelivery.documentDeliveryId}','received','${"e".repeat(40)}','lease-v3','doc-ack-0001') as result`)).rows[0].result;
  assert(documentAckReplay.acknowledgementId === documentAck.acknowledgementId, "Acknowledgement replay returned a different ack.");
  await expectDatabaseError(() => db.query(`select public.acknowledge_document_delivery('${organization.organizationId}','${documentDelivery.documentDeliveryId}','received','${"e".repeat(40)}','lease-v3','doc-ack-dup-0001')`), "DOCUMENT_DELIVERY_ALREADY_ACKNOWLEDGED");
  const documentAckViewed = (await db.query(`select public.acknowledge_document_delivery('${organization.organizationId}','${documentDelivery.documentDeliveryId}','viewed','${"e".repeat(40)}',null,'doc-ack-viewed-01') as result`)).rows[0].result;
  assert(documentAckViewed.acknowledgementId && documentAckViewed.acknowledgementId !== documentAck.acknowledgementId, "A distinct acknowledgement type did not create a separate ack.");

  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${invitedResidentUser}'`);
  const residentDocReads = (await db.query(`select (select count(*)::integer from public.document_deliveries where id='${documentDelivery.documentDeliveryId}') as deliveries,(select count(*)::integer from public.document_acknowledgements where document_delivery_id='${documentDelivery.documentDeliveryId}') as acks`)).rows[0];
  assert(residentDocReads.deliveries === 1 && residentDocReads.acks === 2, "Recipient could not read their own delivery and acknowledgements.");
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${deliveryOutsider}'`);
  const outsiderDocReads = (await db.query(`select (select count(*)::integer from public.document_deliveries where id='${documentDelivery.documentDeliveryId}') as deliveries,(select count(*)::integer from public.document_acknowledgements where document_delivery_id='${documentDelivery.documentDeliveryId}') as acks`)).rows[0];
  assert(outsiderDocReads.deliveries === 0 && outsiderDocReads.acks === 0, "An outsider read another member's document delivery or acknowledgements.");
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${admin}'`);
  const managerDocReads = (await db.query(`select (select count(*)::integer from public.document_deliveries where id='${documentDelivery.documentDeliveryId}') as deliveries,(select count(*)::integer from public.document_acknowledgements where document_delivery_id='${documentDelivery.documentDeliveryId}') as acks`)).rows[0];
  assert(managerDocReads.deliveries === 1 && managerDocReads.acks === 2, "The managing operator could not read the delivery and acknowledgements.");

  // The delivery grants its recipient read on the (property-scoped) delivered document + version via
  // the documents_scoped_read "delivered to me" clause — but not on documents never delivered to them,
  // and never to an outsider. deliveryDoc/deliveryQuarantineDoc are both property-scoped with no tenancy.
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${invitedResidentUser}'`);
  const recipientDocVisibility = (await db.query(`select
    (select count(*)::integer from public.documents where id='${deliveryDoc}') as delivered_doc,
    (select count(*)::integer from public.document_versions where id='${deliveryVersion}') as delivered_version,
    (select count(*)::integer from public.documents where id='${deliveryQuarantineDoc}') as undelivered_doc`)).rows[0];
  assert(recipientDocVisibility.delivered_doc === 1 && recipientDocVisibility.delivered_version === 1 && recipientDocVisibility.undelivered_doc === 0,
    "Delivery did not grant the recipient read on exactly the delivered document.");
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${deliveryOutsider}'`);
  const outsiderDocVisibility = (await db.query(`select (select count(*)::integer from public.documents where id='${deliveryDoc}') as delivered_doc`)).rows[0];
  assert(outsiderDocVisibility.delivered_doc === 0, "An outsider read a document delivered to another recipient.");

  await db.exec("reset role");
  const documentDeliveryTrace = (await db.query(`select
    (select count(*)::integer from audit.audit_events where action_code='document.delivered' and actor_type='user' and resource_id='${documentDelivery.documentDeliveryId}') as delivered_audits,
    (select count(*)::integer from audit.audit_events where action_code='document.acknowledged' and actor_type='user' and organization_id='${organization.organizationId}') as acknowledged_audits,
    (select count(*)::integer from private.outbox_events where event_type='document.delivered' and aggregate_id='${documentDelivery.documentDeliveryId}') as delivered_events,
    (select count(*)::integer from private.outbox_events where event_type='document.acknowledged' and organization_id='${organization.organizationId}') as acknowledged_events`)).rows[0];
  assert(documentDeliveryTrace.delivered_audits === 1 && documentDeliveryTrace.acknowledged_audits === 2 && documentDeliveryTrace.delivered_events === 1 && documentDeliveryTrace.acknowledged_events === 2, "Document delivery/acknowledgement trace counts are wrong.");

  // ── §3 Occupied-portfolio import — occupied-lease leg (phase_3_occupied_lease_import) ────────────
  // An operator imports an OCCUPIED unit against an already-imported unit: one row activates a lease —
  // household + tenancy + rent schedule + a balanced opening receivable — so the tenancy is operational
  // (its next recurring charge is generatable) and the opening ledger balances (1100 DR / 3900 CR).
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${admin}'`);
  const occUnit = (await db.query(`select public.create_unit('${organization.organizationId}','${property.propertyId}',null,'201','Apartment',2,1,900,'finance-occ-unit-0001') as result`)).rows[0].result;
  const occSourceDoc = "ea000000-0000-4000-8000-0000000000f1";
  const occSourceVersion = "ea000000-0000-4000-8000-0000000000f2";
  await db.exec(`reset role;
    insert into public.documents(id,organization_id,document_type,title,source,status,operator_supplied_unverified,created_by)
    values ('${occSourceDoc}','${organization.organizationId}','portfolio_import','Occupied roster','operator_supplied','active',true,'${admin}');
    insert into public.document_versions(id,organization_id,document_id,version_number,storage_bucket,storage_path,mime_type,size_bytes,sha256_hex,original_filename,uploaded_by,upload_status)
    values ('${occSourceVersion}','${organization.organizationId}','${occSourceDoc}',1,'private-documents','organizations/${organization.organizationId}/organization/${organization.organizationId}/${occSourceVersion}/occupied.csv','text/csv',256,'${"d".repeat(64)}','occupied.csv','${admin}','clean');
    set role authenticated; set request.jwt.claim.sub='${admin}';`);

  const occHeaders = ["Property","Address","City","Country","Unit","First","Last","Email","Start","Rent","Freq","Currency","Opening"];
  const occRows = [{ Property: "Maple Court", Address: "100 Main Street", City: "Richmond", Country: "US", Unit: "201", First: "Dana", Last: "Rivera", Email: "dana.rivera@example.test", Start: "2026-08-01", Rent: "120000", Freq: "monthly", Currency: "USD", Opening: "150000" }];
  const occMapping = { propertyName: "Property", addressLine1: "Address", locality: "City", countryCode: "Country", unitCode: "Unit", primaryFirstName: "First", primaryLastName: "Last", primaryEmail: "Email", leaseStartDate: "Start", rentAmountMinor: "Rent", rentFrequency: "Freq", currencyCode: "Currency", openingBalanceMinor: "Opening" };
  const occOptions = { dedupeMode: "strict", dateLocale: "en-US" };

  const occJob = (await db.query(`select public.create_import_job('${organization.organizationId}','leases','${occSourceDoc}','${occSourceVersion}','${JSON.stringify(occHeaders)}'::jsonb,'${JSON.stringify(occRows)}'::jsonb,'occupied-import-0001') as result`)).rows[0].result.importJobId;
  const occJobReplay = (await db.query(`select public.create_import_job('${organization.organizationId}','leases','${occSourceDoc}','${occSourceVersion}','${JSON.stringify(occHeaders)}'::jsonb,'${JSON.stringify(occRows)}'::jsonb,'occupied-import-0001') as result`)).rows[0].result.importJobId;
  assert(occJob === occJobReplay, "Occupied-import create replay returned a different job.");
  const occValidation = (await db.query(`select public.validate_occupied_import('${occJob}','${JSON.stringify(occMapping)}'::jsonb,'${JSON.stringify(occOptions)}'::jsonb) as result`)).rows[0].result;
  assert(occValidation.status === "ready" && occValidation.totals.creates === 1 && occValidation.totals.errors === 0, "Valid occupied-lease row did not reach ready with one create.");
  const occCommitted = (await db.query(`select public.commit_occupied_import('${occJob}','${occValidation.validationHash}') as result`)).rows[0].result;
  assert(occCommitted.status === "completed" && occCommitted.committed.tenancies === 1 && occCommitted.committed.openingBalances === 1, "Occupied import did not activate exactly one tenancy with an opening balance.");
  const occCommitReplay = (await db.query(`select public.commit_occupied_import('${occJob}','${occValidation.validationHash}') as result`)).rows[0].result;
  assert(occCommitReplay.reportDocumentId === occCommitted.reportDocumentId, "Occupied-import commit replay returned a different report document.");

  await db.exec("reset role");
  const occTenancy = (await db.query(`select t.id, t.status, cs.id as schedule_id
    from public.tenancies t join public.charge_schedules cs on cs.tenancy_id=t.id
    where t.unit_id='${occUnit.unitId}' and t.status='active'`)).rows[0];
  assert(occTenancy && occTenancy.status === "active" && occTenancy.schedule_id, "Occupied import did not create an active tenancy with a rent schedule.");
  const occLedger = (await db.query(`select
    coalesce(sum(je.debit_minor) filter (where la.account_code='1100'),0)::bigint as ar_debit,
    coalesce(sum(je.credit_minor) filter (where la.account_code='3900'),0)::bigint as equity_credit,
    coalesce(sum(je.debit_minor),0)::bigint as total_debit,
    coalesce(sum(je.credit_minor),0)::bigint as total_credit
    from public.journal_transactions jt
    join public.journal_entries je on je.journal_transaction_id=jt.id
    join public.ledger_accounts la on la.id=je.ledger_account_id
    where jt.source_type='tenancy' and jt.source_id='${occTenancy.id}' and jt.transaction_type='opening_balance'`)).rows[0];
  assert(Number(occLedger.ar_debit) === 150000 && Number(occLedger.equity_credit) === 150000, "Opening receivable did not post 150000 to 1100 DR / 3900 CR.");
  assert(Number(occLedger.total_debit) === Number(occLedger.total_credit), "Occupied-import opening journal is unbalanced.");

  // The tenancy is operational: its next recurring rent charge is generatable (service_role worker).
  await db.exec("reset role; set role service_role");
  const occCharge = (await db.query(`select public.generate_recurring_charges('2026-08-01',array['${occTenancy.schedule_id}']::uuid[],'occupied-charge-gen-0001') as result`)).rows[0].result;
  assert(occCharge.generatedCount >= 1, "The imported tenancy could not generate its first recurring rent charge.");

  // A row referencing an unknown property is a per-row error and blocks commit (no partial writes).
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${admin}'`);
  const occBadRows = [{ Property: "Nonexistent Manor", Address: "999 Nowhere Rd", City: "Richmond", Country: "US", Unit: "999", First: "Sam", Last: "Doe", Email: "", Start: "2026-08-01", Rent: "100000", Freq: "monthly", Currency: "USD", Opening: "0" }];
  const occBadJob = (await db.query(`select public.create_import_job('${organization.organizationId}','leases','${occSourceDoc}','${occSourceVersion}','${JSON.stringify(occHeaders)}'::jsonb,'${JSON.stringify(occBadRows)}'::jsonb,'occupied-import-bad-1') as result`)).rows[0].result.importJobId;
  const occBadValidation = (await db.query(`select public.validate_occupied_import('${occBadJob}','${JSON.stringify(occMapping)}'::jsonb,'${JSON.stringify(occOptions)}'::jsonb) as result`)).rows[0].result;
  assert(occBadValidation.status === "mapping" && occBadValidation.totals.errors === 1, "Unknown-property occupied row was not flagged as an error.");
  await expectDatabaseError(() => db.query(`select public.commit_occupied_import('${occBadJob}','${occBadValidation.validationHash}')`), "IMPORT_NOT_READY");

  // ── Single-pass combined import (phase_3_combined_import) ───────────────────────────────────────
  // The real onboarding artifact is ONE spreadsheet: unit, resident, rent, balance. This leg creates
  // the property and unit AND activates the tenancy from a single row, so the portfolio is operational
  // after one commit. Both rows below name a property that does NOT exist yet.
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${admin}'`);
  const cmbSourceDoc = "ea000000-0000-4000-8000-0000000000c1";
  const cmbSourceVersion = "ea000000-0000-4000-8000-0000000000c2";
  await db.exec(`reset role;
    insert into public.documents(id,organization_id,document_type,title,source,status,operator_supplied_unverified,created_by)
    values ('${cmbSourceDoc}','${organization.organizationId}','portfolio_import','Combined roster','operator_supplied','active',true,'${admin}');
    insert into public.document_versions(id,organization_id,document_id,version_number,storage_bucket,storage_path,mime_type,size_bytes,sha256_hex,original_filename,uploaded_by,upload_status)
    values ('${cmbSourceVersion}','${organization.organizationId}','${cmbSourceDoc}',1,'private-documents','organizations/${organization.organizationId}/organization/${organization.organizationId}/${cmbSourceVersion}/combined.csv','text/csv',512,'${"f".repeat(64)}','combined.csv','${admin}','clean');
    set role authenticated; set request.jwt.claim.sub='${admin}';`);

  const cmbHeaders = ["Property","Type","Address","City","State","Postal","Country","TZ","Unit","UnitType","Beds","Baths","Sqft","First","Last","Email","Start","Rent","Freq","Currency","Opening"];
  const cmbRow = (unit, first, last, opening) => ({
    Property: "Birch Terrace", Type: "multifamily", Address: "500 Birch Avenue", City: "Norfolk", State: "VA", Postal: "23510",
    Country: "US", TZ: "America/New_York", Unit: unit, UnitType: "Apartment", Beds: "2", Baths: "1", Sqft: "780",
    First: first, Last: last, Email: `${first.toLowerCase()}.${last.toLowerCase()}@example.test`,
    Start: "2026-08-01", Rent: "135000", Freq: "monthly", Currency: "USD", Opening: opening,
  });
  const cmbMapping = {
    propertyName: "Property", propertyType: "Type", addressLine1: "Address", locality: "City", subdivisionCode: "State",
    postalCode: "Postal", countryCode: "Country", timeZone: "TZ", unitCode: "Unit", unitType: "UnitType",
    bedrooms: "Beds", bathrooms: "Baths", squareFeet: "Sqft", primaryFirstName: "First", primaryLastName: "Last",
    primaryEmail: "Email", leaseStartDate: "Start", rentAmountMinor: "Rent", rentFrequency: "Freq",
    currencyCode: "Currency", openingBalanceMinor: "Opening",
  };
  const cmbOptions = { dedupeMode: "strict", dateLocale: "en-US" };
  const cmbRows = [cmbRow("A1", "Noor", "Haddad", "90000"), cmbRow("A2", "Iris", "Okafor", "0")];

  const cmbJob = (await db.query(`select public.create_import_job('${organization.organizationId}','combined','${cmbSourceDoc}','${cmbSourceVersion}','${JSON.stringify(cmbHeaders)}'::jsonb,'${JSON.stringify(cmbRows)}'::jsonb,'combined-import-0001') as result`)).rows[0].result.importJobId;
  const cmbValidation = (await db.query(`select public.validate_combined_import('${cmbJob}','${JSON.stringify(cmbMapping)}'::jsonb,'${JSON.stringify(cmbOptions)}'::jsonb) as result`)).rows[0].result;
  assert(cmbValidation.status === "ready" && cmbValidation.totals.creates === 2 && cmbValidation.totals.errors === 0, "Two valid combined rows did not reach ready.");
  assert(cmbValidation.totals.newUnits === 2, "The combined validation did not count both units as new seats.");
  await expectDatabaseError(() => db.query(`select public.commit_combined_import('${cmbJob}','${"0".repeat(64)}')`), "VALIDATION_HASH_CONFLICT");
  const cmbCommitted = (await db.query(`select public.commit_combined_import('${cmbJob}','${cmbValidation.validationHash}') as result`)).rows[0].result;
  assert(cmbCommitted.status === "completed", "The combined import did not complete.");
  assert(cmbCommitted.committed.properties === 1 && cmbCommitted.committed.units === 2 && cmbCommitted.committed.tenancies === 2 && cmbCommitted.committed.openingBalances === 1,
    "The combined commit did not create one property, two units, two tenancies, and one opening balance.");
  const cmbReplay = (await db.query(`select public.commit_combined_import('${cmbJob}','${cmbValidation.validationHash}') as result`)).rows[0].result;
  assert(cmbReplay.reportDocumentId === cmbCommitted.reportDocumentId, "Combined-import commit replay returned a different report document.");

  // Both rows named one property, so exactly ONE property exists — the second row reused the first
  // row's freshly created property rather than duplicating it.
  await db.exec("reset role");
  const cmbProperty = (await db.query(`select id,status from public.properties
    where organization_id='${organization.organizationId}' and lower(name)='birch terrace'`)).rows;
  assert(cmbProperty.length === 1, "The combined import duplicated the property across rows.");
  const cmbUnits = (await db.query(`select count(*)::integer as c from public.units where property_id='${cmbProperty[0].id}'`)).rows[0].c;
  assert(cmbUnits === 2, "The combined import did not create both units under the shared property.");

  // Each row is fully operational: active tenancy, household with a primary member, armed rent schedule.
  // Keyed by unit code, not array position: both rows share a possession_start, so ordering by date
  // would not deterministically identify which tenancy is A1 and which is A2.
  const cmbTenancies = (await db.query(`select u.unit_code, t.id, t.status, cs.id as schedule_id, cs.next_run_on, hm.is_primary_contact
    from public.tenancies t
    join public.units u on u.id=t.unit_id
    join public.charge_schedules cs on cs.tenancy_id=t.id
    join public.household_members hm on hm.household_id=t.household_id
    where t.property_id='${cmbProperty[0].id}' order by u.unit_code`)).rows;
  const cmbTenancyByUnit = Object.fromEntries(cmbTenancies.map((t) => [t.unit_code, t]));
  assert(cmbTenancyByUnit.A1 && cmbTenancyByUnit.A2, "The combined import did not produce a tenancy for each imported unit.");
  assert(cmbTenancies.length === 2 && cmbTenancies.every((t) => t.status === "active" && t.schedule_id && t.is_primary_contact === true),
    "A combined-imported row did not yield an active tenancy with a rent schedule and a primary household member.");

  // The opening receivable is balanced 1100 DR / 3900 CR, and the zero-balance row posts NO journal.
  const cmbLedger = (await db.query(`select
    coalesce(sum(je.debit_minor) filter (where la.account_code='1100'),0)::bigint as ar_debit,
    coalesce(sum(je.credit_minor) filter (where la.account_code='3900'),0)::bigint as equity_credit,
    coalesce(sum(je.debit_minor),0)::bigint as total_debit,
    coalesce(sum(je.credit_minor),0)::bigint as total_credit,
    count(distinct jt.id)::integer as transactions
    from public.journal_transactions jt
    join public.journal_entries je on je.journal_transaction_id=jt.id
    join public.ledger_accounts la on la.id=je.ledger_account_id
    where jt.transaction_type='opening_balance' and jt.metadata->>'importJobId'='${cmbJob}'`)).rows[0];
  assert(Number(cmbLedger.ar_debit) === 90000 && Number(cmbLedger.equity_credit) === 90000, "The combined opening receivable did not post 90000 to 1100 DR / 3900 CR.");
  assert(Number(cmbLedger.total_debit) === Number(cmbLedger.total_credit), "The combined opening journal is unbalanced.");
  assert(cmbLedger.transactions === 1, "A zero opening balance still posted a journal transaction.");

  // Operational end state: the imported tenancy generates its first recurring rent charge.
  await db.exec("reset role; set role service_role");
  const cmbCharge = (await db.query(`select public.generate_recurring_charges('2026-08-01',array['${cmbTenancyByUnit.A1.schedule_id}']::uuid[],'combined-charge-gen-0001') as result`)).rows[0].result;
  assert(cmbCharge.generatedCount >= 1, "A combined-imported tenancy could not generate its first recurring rent charge.");

  // Two rows for the same unit would activate overlapping tenancies; that is always an error.
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${admin}'`);
  const cmbDupRows = [cmbRow("B1", "Ada", "Stone", "0"), cmbRow("B1", "Leo", "Stone", "0")];
  const cmbDupJob = (await db.query(`select public.create_import_job('${organization.organizationId}','combined','${cmbSourceDoc}','${cmbSourceVersion}','${JSON.stringify(cmbHeaders)}'::jsonb,'${JSON.stringify(cmbDupRows)}'::jsonb,'combined-import-dup-1') as result`)).rows[0].result.importJobId;
  const cmbDupValidation = (await db.query(`select public.validate_combined_import('${cmbDupJob}','${JSON.stringify(cmbMapping)}'::jsonb,'${JSON.stringify(cmbOptions)}'::jsonb) as result`)).rows[0].result;
  assert(cmbDupValidation.status === "mapping" && cmbDupValidation.totals.errors === 1, "A repeated unit in one combined file was not rejected.");
  assert(JSON.stringify(cmbDupValidation.errors).includes("DUPLICATE_UNIT"), "The repeated-unit row did not raise DUPLICATE_UNIT.");
  await expectDatabaseError(() => db.query(`select public.commit_combined_import('${cmbDupJob}','${cmbDupValidation.validationHash}')`), "IMPORT_NOT_READY");

  // Re-importing a unit that is ALREADY occupied is rejected rather than double-booked.
  const cmbOverlapRows = [cmbRow("A1", "Mona", "Vale", "0")];
  const cmbOverlapJob = (await db.query(`select public.create_import_job('${organization.organizationId}','combined','${cmbSourceDoc}','${cmbSourceVersion}','${JSON.stringify(cmbHeaders)}'::jsonb,'${JSON.stringify(cmbOverlapRows)}'::jsonb,'combined-import-overlap-1') as result`)).rows[0].result.importJobId;
  const cmbOverlapValidation = (await db.query(`select public.validate_combined_import('${cmbOverlapJob}','${JSON.stringify(cmbMapping)}'::jsonb,'${JSON.stringify(cmbOptions)}'::jsonb) as result`)).rows[0].result;
  assert(cmbOverlapValidation.status === "mapping" && JSON.stringify(cmbOverlapValidation.errors).includes("TENANCY_OVERLAP"),
    "Importing into an already-occupied unit was not rejected.");

  // Seat accounting: a row that REUSES an existing unit must consume no new unit seat. Pinned at the
  // plan boundary, because with headroom an over-count is invisible — and an over-count would refuse a
  // perfectly legal import with PLAN_LIMIT_EXCEEDED.
  const reuseUnit = (await db.query(`select public.create_unit('${organization.organizationId}','${property.propertyId}',null,'301','Apartment',1,1,600,'finance-reuse-unit-0001') as result`)).rows[0].result;
  const cmbReuseRows = [{
    Property: "Maple Court", Type: "multifamily", Address: "100 Main Street", City: "Richmond", State: "VA", Postal: "23220",
    Country: "US", TZ: "America/New_York", Unit: "301", UnitType: "Apartment", Beds: "1", Baths: "1", Sqft: "600",
    First: "Rae", Last: "Kimura", Email: "rae.kimura@example.test",
    Start: "2026-08-01", Rent: "99000", Freq: "monthly", Currency: "USD", Opening: "0",
  }];
  const cmbReuseJob = (await db.query(`select public.create_import_job('${organization.organizationId}','combined','${cmbSourceDoc}','${cmbSourceVersion}','${JSON.stringify(cmbHeaders)}'::jsonb,'${JSON.stringify(cmbReuseRows)}'::jsonb,'combined-import-reuse-1') as result`)).rows[0].result.importJobId;
  const cmbReuseValidation = (await db.query(`select public.validate_combined_import('${cmbReuseJob}','${JSON.stringify(cmbMapping)}'::jsonb,'${JSON.stringify(cmbOptions)}'::jsonb) as result`)).rows[0].result;
  assert(cmbReuseValidation.status === "ready" && cmbReuseValidation.totals.newUnits === 0, "A row reusing an existing unit was counted as a new unit seat.");

  // Squeeze the plan limit to exactly the units that already exist: a zero-new-seat import must still
  // commit, and any genuinely new unit must be refused.
  await db.exec("reset role");
  const unitsNow = (await db.query(`select count(*)::integer as c from public.units
    where organization_id='${organization.organizationId}' and operational_status<>'retired' and archived_at is null`)).rows[0].c;
  await db.exec(`update public.plan_entitlements set limit_value=${unitsNow} where plan_code='growth' and feature_code='core.unit'`);
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${admin}'`);
  const cmbReuseCommitted = (await db.query(`select public.commit_combined_import('${cmbReuseJob}','${cmbReuseValidation.validationHash}') as result`)).rows[0].result;
  assert(cmbReuseCommitted.status === "completed" && cmbReuseCommitted.committed.units === 0 && cmbReuseCommitted.committed.tenancies === 1,
    "Reusing an existing unit at the exact plan limit was refused — new-unit seats are being over-counted.");
  await db.exec("reset role");
  const reuseTenancy = (await db.query(`select count(*)::integer as c from public.tenancies where unit_id='${reuseUnit.unitId}' and status='active'`)).rows[0].c;
  assert(reuseTenancy === 1, "The reuse row did not activate a tenancy on the existing unit.");

  // Same limit, but this row needs a genuinely new unit: refused, and nothing is written.
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${admin}'`);
  const cmbOverLimitRows = [cmbRow("C9", "Zed", "Marsh", "0")];
  const cmbOverLimitJob = (await db.query(`select public.create_import_job('${organization.organizationId}','combined','${cmbSourceDoc}','${cmbSourceVersion}','${JSON.stringify(cmbHeaders)}'::jsonb,'${JSON.stringify(cmbOverLimitRows)}'::jsonb,'combined-import-overlimit-1') as result`)).rows[0].result.importJobId;
  const cmbOverLimitValidation = (await db.query(`select public.validate_combined_import('${cmbOverLimitJob}','${JSON.stringify(cmbMapping)}'::jsonb,'${JSON.stringify(cmbOptions)}'::jsonb) as result`)).rows[0].result;
  assert(cmbOverLimitValidation.status === "ready", "The over-limit fixture did not validate.");
  const cmbOverLimitCommit = (await db.query(`select public.commit_combined_import('${cmbOverLimitJob}','${cmbOverLimitValidation.validationHash}') as result`)).rows[0].result;
  assert(cmbOverLimitCommit.status === "failed" && cmbOverLimitCommit.error === "PLAN_LIMIT_EXCEEDED", "A combined import past the unit limit was not refused.");
  await db.exec("reset role");
  const overLimitUnits = (await db.query(`select count(*)::integer as c from public.units u
    join public.properties p on p.id=u.property_id
    where p.organization_id='${organization.organizationId}' and lower(u.unit_code)='c9'`)).rows[0].c;
  assert(overLimitUnits === 0, "A refused over-limit import still wrote a unit — the commit is not atomic.");
  await db.exec(`update public.plan_entitlements set limit_value=50 where plan_code='growth' and feature_code='core.unit'`);
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${admin}'`);

  // ── True .xlsx sources (phase_3_xlsx_source_documents) ──────────────────────────────────────────
  // The mime allowlist is enforced in five places; these assertions cover the two SQL gates, without
  // which an operator could upload nothing and create_import_job would reject the version anyway.
  const xlsxMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const xlsxGrant = (await db.query(`select public.create_document_upload_grant(
    '${organization.organizationId}','organization','${organization.organizationId}','portfolio_import','Roster workbook','roster.xlsx','${xlsxMime}',4096,'xlsx-upload-grant-0001'
  ) as result`)).rows[0].result;
  assert(xlsxGrant.grantId && xlsxGrant.storagePath, "An .xlsx upload grant was refused by the mime allowlist.");
  await expectDatabaseError(() => db.query(`select public.create_document_upload_grant(
    '${organization.organizationId}','organization','${organization.organizationId}','portfolio_import','Executable','payload.exe','application/x-msdownload',4096,'xlsx-upload-grant-bad-1'
  )`), "MIME_TYPE_NOT_ALLOWED");
  await db.exec("reset role");
  const bucketMimes = (await db.query(`select allowed_mime_types from storage.buckets where id='private-documents'`)).rows[0].allowed_mime_types;
  assert(Array.isArray(bucketMimes) && bucketMimes.includes(xlsxMime), "The storage bucket still rejects .xlsx uploads.");

  // An .xlsx source document is accepted by create_import_job exactly like a CSV one.
  const xlsxDoc = "ea000000-0000-4000-8000-0000000000e1";
  const xlsxVersion = "ea000000-0000-4000-8000-0000000000e2";
  await db.exec(`insert into public.documents(id,organization_id,document_type,title,source,status,operator_supplied_unverified,created_by)
    values ('${xlsxDoc}','${organization.organizationId}','portfolio_import','Roster workbook','operator_supplied','active',true,'${admin}');
    insert into public.document_versions(id,organization_id,document_id,version_number,storage_bucket,storage_path,mime_type,size_bytes,sha256_hex,original_filename,uploaded_by,upload_status)
    values ('${xlsxVersion}','${organization.organizationId}','${xlsxDoc}',1,'private-documents','organizations/${organization.organizationId}/organization/${organization.organizationId}/${xlsxVersion}/roster.xlsx','${xlsxMime}',4096,'${"9".repeat(64)}','roster.xlsx','${admin}','clean');`);
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${admin}'`);
  const xlsxJob = (await db.query(`select public.create_import_job('${organization.organizationId}','combined','${xlsxDoc}','${xlsxVersion}','${JSON.stringify(cmbHeaders)}'::jsonb,'${JSON.stringify([cmbRow("X1", "Ivy", "Nakamura", "0")])}'::jsonb,'xlsx-import-0001') as result`)).rows[0].result;
  assert(xlsxJob.importJobId && xlsxJob.status === "mapping", "An .xlsx-backed import job was refused by create_import_job.");

  // ── Residents leg: multi-member households (phase_3_resident_and_balance_imports) ───────────────
  // The lease-bearing legs create a household with exactly ONE member. Real households have
  // co-residents; this leg adds them to a tenancy that already exists.
  const resHeaders = ["Property","Address","City","Country","Unit","First","Last","Email","Phone","Responsible","Starts"];
  const resRows = [
    { Property: "Birch Terrace", Address: "500 Birch Avenue", City: "Norfolk", Country: "US", Unit: "A1", First: "Sam", Last: "Haddad", Email: "sam.haddad@example.test", Phone: "+14155550188", Responsible: "true", Starts: "2026-08-01" },
    { Property: "Birch Terrace", Address: "500 Birch Avenue", City: "Norfolk", Country: "US", Unit: "A1", First: "Kai", Last: "Haddad", Email: "kai.haddad@example.test", Phone: "", Responsible: "false", Starts: "2026-08-01" },
  ];
  const resMapping = { propertyName: "Property", addressLine1: "Address", locality: "City", countryCode: "Country", unitCode: "Unit", firstName: "First", lastName: "Last", email: "Email", phone: "Phone", financiallyResponsible: "Responsible", startsOn: "Starts" };
  const resJob = (await db.query(`select public.create_import_job('${organization.organizationId}','residents','${cmbSourceDoc}','${cmbSourceVersion}','${JSON.stringify(resHeaders)}'::jsonb,'${JSON.stringify(resRows)}'::jsonb,'resident-import-0001') as result`)).rows[0].result.importJobId;
  const resValidation = (await db.query(`select public.validate_resident_import('${resJob}','${JSON.stringify(resMapping)}'::jsonb,'${JSON.stringify(cmbOptions)}'::jsonb) as result`)).rows[0].result;
  assert(resValidation.status === "ready" && resValidation.totals.creates === 2, "Two co-resident rows did not validate against the existing tenancy.");
  const resCommitted = (await db.query(`select public.commit_resident_import('${resJob}','${resValidation.validationHash}') as result`)).rows[0].result;
  assert(resCommitted.status === "completed" && resCommitted.committed.householdMembers === 2 && resCommitted.committed.people === 2,
    "The residents import did not add both co-residents.");

  await db.exec("reset role");
  const householdRoster = (await db.query(`select
    count(*)::integer as members,
    count(*) filter (where hm.is_primary_contact)::integer as primaries,
    count(*) filter (where hm.is_financially_responsible)::integer as responsible
    from public.household_members hm
    join public.tenancies t on t.household_id=hm.household_id
    where t.id='${cmbTenancyByUnit.A1.id}'`)).rows[0];
  assert(householdRoster.members === 3, "The household did not end with the primary resident plus two co-residents.");
  assert(householdRoster.primaries === 1, "A co-resident was made a second primary contact — notification routing would be ambiguous.");
  assert(householdRoster.responsible === 2, "The financially-responsible flag was not carried from the roster.");

  // Re-running the same roster must not duplicate people: the existing person is matched by email and
  // the row is flagged as already a member.
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${admin}'`);
  const resRerunJob = (await db.query(`select public.create_import_job('${organization.organizationId}','residents','${cmbSourceDoc}','${cmbSourceVersion}','${JSON.stringify(resHeaders)}'::jsonb,'${JSON.stringify(resRows)}'::jsonb,'resident-import-rerun-1') as result`)).rows[0].result.importJobId;
  const resRerunValidation = (await db.query(`select public.validate_resident_import('${resRerunJob}','${JSON.stringify(resMapping)}'::jsonb,'${JSON.stringify(cmbOptions)}'::jsonb) as result`)).rows[0].result;
  assert(resRerunValidation.status === "mapping" && resRerunValidation.totals.errors === 2, "Re-running the roster did not flag both rows as already-members.");
  assert(JSON.stringify(resRerunValidation.errors).includes("ALREADY_A_MEMBER"), "The re-run rows did not raise ALREADY_A_MEMBER.");
  await db.exec("reset role");
  const peopleAfterRerun = (await db.query(`select count(*)::integer as c from public.people
    where organization_id='${organization.organizationId}' and email='sam.haddad@example.test'`)).rows[0].c;
  assert(peopleAfterRerun === 1, "Re-running the roster duplicated a person record.");

  // A roster row for a unit with no tenancy is a per-row error, not a silent skip.
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${admin}'`);
  const resOrphanRows = [{ Property: "Birch Terrace", Address: "500 Birch Avenue", City: "Norfolk", Country: "US", Unit: "Z9", First: "Ola", Last: "Vex", Email: "ola.vex@example.test", Phone: "", Responsible: "false", Starts: "2026-08-01" }];
  const resOrphanJob = (await db.query(`select public.create_import_job('${organization.organizationId}','residents','${cmbSourceDoc}','${cmbSourceVersion}','${JSON.stringify(resHeaders)}'::jsonb,'${JSON.stringify(resOrphanRows)}'::jsonb,'resident-import-orphan-1') as result`)).rows[0].result.importJobId;
  const resOrphanValidation = (await db.query(`select public.validate_resident_import('${resOrphanJob}','${JSON.stringify(resMapping)}'::jsonb,'${JSON.stringify(cmbOptions)}'::jsonb) as result`)).rows[0].result;
  assert(resOrphanValidation.status === "mapping" && JSON.stringify(resOrphanValidation.errors).includes("TENANCY_NOT_FOUND"), "A roster row with no tenancy was not rejected.");
  await expectDatabaseError(() => db.query(`select public.commit_resident_import('${resOrphanJob}','${resOrphanValidation.validationHash}')`), "IMPORT_NOT_READY");

  // ── Opening-balances leg ────────────────────────────────────────────────────────────────────────
  // Balances usually arrive as a separate export from the rent roll. Unit A2 was imported with a zero
  // opening balance, so it has no opening journal yet and is the legitimate target.
  const balHeaders = ["Property","Address","City","Country","Unit","Balance","Effective","Memo"];
  const balRows = [{ Property: "Birch Terrace", Address: "500 Birch Avenue", City: "Norfolk", Country: "US", Unit: "A2", Balance: "47500", Effective: "2026-08-01", Memo: "Migrated balance" }];
  const balMapping = { propertyName: "Property", addressLine1: "Address", locality: "City", countryCode: "Country", unitCode: "Unit", openingBalanceMinor: "Balance", effectiveDate: "Effective", memo: "Memo" };
  const balJob = (await db.query(`select public.create_import_job('${organization.organizationId}','opening_balances','${cmbSourceDoc}','${cmbSourceVersion}','${JSON.stringify(balHeaders)}'::jsonb,'${JSON.stringify(balRows)}'::jsonb,'balance-import-0001') as result`)).rows[0].result.importJobId;
  const balValidation = (await db.query(`select public.validate_opening_balance_import('${balJob}','${JSON.stringify(balMapping)}'::jsonb,'${JSON.stringify(cmbOptions)}'::jsonb) as result`)).rows[0].result;
  assert(balValidation.status === "ready" && Number(balValidation.totals.netOpeningBalanceMinor) === 47500, "The opening-balance file did not validate to its net total.");
  const balCommitted = (await db.query(`select public.commit_opening_balance_import('${balJob}','${balValidation.validationHash}') as result`)).rows[0].result;
  assert(balCommitted.status === "completed" && balCommitted.committed.openingBalances === 1, "The opening-balance import did not post exactly one balance.");

  await db.exec("reset role");
  const balLedger = (await db.query(`select
    coalesce(sum(je.debit_minor) filter (where la.account_code='1100'),0)::bigint as ar_debit,
    coalesce(sum(je.credit_minor) filter (where la.account_code='3900'),0)::bigint as equity_credit,
    coalesce(sum(je.debit_minor),0)::bigint as total_debit,
    coalesce(sum(je.credit_minor),0)::bigint as total_credit
    from public.journal_transactions jt
    join public.journal_entries je on je.journal_transaction_id=jt.id
    join public.ledger_accounts la on la.id=je.ledger_account_id
    where jt.transaction_type='opening_balance' and jt.metadata->>'importJobId'='${balJob}'`)).rows[0];
  assert(Number(balLedger.ar_debit) === 47500 && Number(balLedger.equity_credit) === 47500, "The imported opening balance did not post 47500 to 1100 DR / 3900 CR.");
  assert(Number(balLedger.total_debit) === Number(balLedger.total_credit), "The imported opening-balance journal is unbalanced.");

  // Re-importing the same balance must be refused: doubling a receivable is a financial defect.
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${admin}'`);
  const balRerunJob = (await db.query(`select public.create_import_job('${organization.organizationId}','opening_balances','${cmbSourceDoc}','${cmbSourceVersion}','${JSON.stringify(balHeaders)}'::jsonb,'${JSON.stringify(balRows)}'::jsonb,'balance-import-rerun-1') as result`)).rows[0].result.importJobId;
  const balRerunValidation = (await db.query(`select public.validate_opening_balance_import('${balRerunJob}','${JSON.stringify(balMapping)}'::jsonb,'${JSON.stringify(cmbOptions)}'::jsonb) as result`)).rows[0].result;
  assert(balRerunValidation.status === "mapping" && JSON.stringify(balRerunValidation.errors).includes("OPENING_BALANCE_EXISTS"), "Re-importing an opening balance was not refused.");
  await db.exec("reset role");
  const balTotalAfterRerun = (await db.query(`select coalesce(sum(je.debit_minor),0)::bigint as ar
    from public.journal_transactions jt
    join public.journal_entries je on je.journal_transaction_id=jt.id
    join public.ledger_accounts la on la.id=je.ledger_account_id
    where jt.source_type='tenancy' and jt.source_id='${cmbTenancyByUnit.A2.id}' and la.account_code='1100'`)).rows[0].ar;
  assert(Number(balTotalAfterRerun) === 47500, "The receivable was doubled by a repeated opening-balance import.");

  // A zero balance has nothing to post, and a row for an unknown unit is an error.
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${admin}'`);
  const balBadRows = [
    { Property: "Birch Terrace", Address: "500 Birch Avenue", City: "Norfolk", Country: "US", Unit: "A1", Balance: "0", Effective: "2026-08-01", Memo: "" },
    { Property: "Birch Terrace", Address: "500 Birch Avenue", City: "Norfolk", Country: "US", Unit: "Q7", Balance: "1000", Effective: "2026-08-01", Memo: "" },
  ];
  const balBadJob = (await db.query(`select public.create_import_job('${organization.organizationId}','opening_balances','${cmbSourceDoc}','${cmbSourceVersion}','${JSON.stringify(balHeaders)}'::jsonb,'${JSON.stringify(balBadRows)}'::jsonb,'balance-import-bad-1') as result`)).rows[0].result.importJobId;
  const balBadValidation = (await db.query(`select public.validate_opening_balance_import('${balBadJob}','${JSON.stringify(balMapping)}'::jsonb,'${JSON.stringify(cmbOptions)}'::jsonb) as result`)).rows[0].result;
  assert(balBadValidation.totals.errors === 2, "The zero-balance and unknown-unit rows were not both rejected.");
  assert(JSON.stringify(balBadValidation.errors).includes("ZERO_OPENING_BALANCE") && JSON.stringify(balBadValidation.errors).includes("TENANCY_NOT_FOUND"),
    "The opening-balance validator did not raise the expected per-row codes.");

  // Each leg refuses a job belonging to another leg.
  await expectDatabaseError(() => db.query(`select public.validate_resident_import('${balBadJob}','${JSON.stringify(resMapping)}'::jsonb,'${JSON.stringify(cmbOptions)}'::jsonb)`), "IMPORT_TYPE_MISMATCH");
  await expectDatabaseError(() => db.query(`select public.validate_opening_balance_import('${resOrphanJob}','${JSON.stringify(balMapping)}'::jsonb,'${JSON.stringify(cmbOptions)}'::jsonb)`), "IMPORT_TYPE_MISMATCH");

  // A combined job cannot be driven by the occupied-lease commands, and vice versa.
  await expectDatabaseError(() => db.query(`select public.validate_occupied_import('${cmbOverlapJob}','${JSON.stringify(cmbMapping)}'::jsonb,'${JSON.stringify(cmbOptions)}'::jsonb)`), "IMPORT_TYPE_MISMATCH");
  await expectDatabaseError(() => db.query(`select public.validate_combined_import('${occJob}','${JSON.stringify(cmbMapping)}'::jsonb,'${JSON.stringify(cmbOptions)}'::jsonb)`), "IMPORT_TYPE_MISMATCH");
  await db.exec("reset role");
  await db.exec("reset role");

  // ── Transactional notification worker (phase_4_notification_worker) ─────────────────────────────
  // Commands enqueue private.notification_jobs everywhere; this is the drain half. Park every job
  // queued by the earlier slices so this block's assertions are deterministic (and prove available_at
  // gating on the way), then drive the worker against jobs enqueued here.
  await db.exec("reset role");
  await db.exec(`update private.notification_jobs set available_at=now()+interval '30 days' where status='queued'`);
  const parkedClaim = (await db.query(`select public.claim_notification_jobs('email',50,'worker-run-parked-01') as r`)).rows[0].r;
  assert(parkedClaim.claimed === 0, "Jobs scheduled into the future must not be claimable — available_at is not gating the queue.");

  // Only the service role may drive the worker; the browser role cannot touch the queue at all.
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${admin}'`);
  await expectDatabaseError(() => db.query(`select public.claim_notification_jobs('email',10,'worker-run-forbidden-1')`), "permission denied");
  await expectDatabaseError(() => db.query(`select public.complete_notification_job('${"0".repeat(8)}-0000-4000-8000-00000000f001','smtp','msg-1')`), "permission denied");
  await expectDatabaseError(() => db.query(`select public.fail_notification_job('${"0".repeat(8)}-0000-4000-8000-00000000f001','ERR',true)`), "permission denied");

  // Input validation.
  await db.exec("reset role; set role service_role");
  await expectDatabaseError(() => db.query(`select public.claim_notification_jobs('carrier_pigeon',10,'worker-run-badchan-1')`), "INVALID_NOTIFICATION_CHANNEL");
  await expectDatabaseError(() => db.query(`select public.claim_notification_jobs('email',0,'worker-run-badsize-1')`), "INVALID_NOTIFICATION_BATCH_SIZE");
  await expectDatabaseError(() => db.query(`select public.claim_notification_jobs('email',10,'short')`), "INVALID_WORKER_RUN_ID");
  await expectDatabaseError(() => db.query(`select public.requeue_stalled_notification_jobs(0)`), "INVALID_STALL_WINDOW");

  // Enqueue a deterministic batch: two sendable transactional emails plus one category email whose
  // recipient has switched that category off.
  await db.exec("reset role");
  await db.exec(`update auth.users set email='worker.recipient@example.com' where id='${admin}'`);
  await db.exec(`insert into public.notification_preferences(user_id,category,channel,enabled)
    values ('${admin}','documents','email',false)
    on conflict (user_id,category,channel) do update set enabled=false`);
  await db.exec(`insert into private.notification_jobs(organization_id,template_code,locale,channel,recipient_user_id,recipient_address,payload,idempotency_key)
    values
      ('${organization.organizationId}','staff_invitation','en-US','email','${admin}','worker.recipient@example.com','{"invitationId":"w1"}'::jsonb,'worker-test:transactional-1'),
      ('${organization.organizationId}','staff_invitation','en-US','email','${admin}','worker.recipient@example.com','{"invitationId":"w2"}'::jsonb,'worker-test:transactional-2'),
      ('${organization.organizationId}','document_delivered','en-US','email','${admin}','worker.recipient@example.com','{"documentId":"w3"}'::jsonb,'worker-test:category-optout-1')`);

  // Claim: the opted-out category job is suppressed terminally; the two transactional ones are claimed.
  // An invitation must never be silenced by a preference row — that would lock a user out of the product.
  await db.exec("reset role; set role service_role");
  const claimOne = (await db.query(`select public.claim_notification_jobs('email',10,'worker-run-claim-0001') as r`)).rows[0].r;
  assert(claimOne.claimed === 2 && claimOne.suppressed === 1, "The worker did not claim both transactional emails while suppressing the opted-out category email.");
  assert(claimOne.jobs.every((j) => j.channel === "email" && j.recipientAddress === "worker.recipient@example.com" && j.attempt === 1), "Claimed job DTOs are missing a resolved recipient address or a first-attempt counter.");
  assert(claimOne.jobs.every((j) => j.category === null), "A transactional invitation must map to a null preference category.");
  await db.exec("reset role");
  const notifSuppressedRow = (await db.query(`select status,last_error from private.notification_jobs where idempotency_key='worker-test:category-optout-1'`)).rows[0];
  assert(notifSuppressedRow.status === "canceled" && notifSuppressedRow.last_error === "RECIPIENT_OPTED_OUT", "The opted-out job was not terminally canceled.");

  // A claimed job is no longer visible to the next claim — this is what SKIP LOCKED buys under true concurrency.
  await db.exec("reset role; set role service_role");
  const claimTwo = (await db.query(`select public.claim_notification_jobs('email',10,'worker-run-claim-0002') as r`)).rows[0].r;
  assert(claimTwo.claimed === 0, "A second worker re-claimed jobs that were already in flight.");

  // Success path: complete → 'sent' + an 'accepted' provider receipt; a duplicate completion is idempotent.
  const sentJobId = claimOne.jobs[0].notificationJobId;
  const retryJobId = claimOne.jobs[1].notificationJobId;
  const notifCompleted = (await db.query(`select public.complete_notification_job('${sentJobId}','smtp','provider-msg-0001') as r`)).rows[0].r;
  assert(notifCompleted.status === "sent" && notifCompleted.duplicate === false, "Completing a claimed job did not mark it sent.");
  const notifCompletedReplay = (await db.query(`select public.complete_notification_job('${sentJobId}','smtp','provider-msg-0001') as r`)).rows[0].r;
  assert(notifCompletedReplay.duplicate === true && notifCompletedReplay.status === "sent", "A duplicate completion was not idempotent.");
  await expectDatabaseError(() => db.query(`select public.complete_notification_job('${"0".repeat(8)}-0000-4000-8000-00000000f0ff','smtp','x')`), "NOTIFICATION_JOB_NOT_FOUND");

  // Retryable failure: back to 'queued' behind a backoff, so it is not immediately re-claimable.
  const failedOnce = (await db.query(`select public.fail_notification_job('${retryJobId}','SMTP_TIMEOUT',true) as r`)).rows[0].r;
  assert(failedOnce.status === "queued" && failedOnce.attempts === 1, "A retryable send failure did not return the job to the queue.");
  const claimThree = (await db.query(`select public.claim_notification_jobs('email',10,'worker-run-claim-0003') as r`)).rows[0].r;
  assert(claimThree.claimed === 0, "A backed-off job was re-claimed before its retry delay elapsed.");
  await db.exec("reset role");
  const notifBackoffRow = (await db.query(`select available_at > now() as backed_off, last_error from private.notification_jobs where id='${retryJobId}'`)).rows[0];
  assert(notifBackoffRow.backed_off === true && notifBackoffRow.last_error === "SMTP_TIMEOUT", "The retry backoff or the recorded error is wrong.");

  // Completing a job that is not currently claimed is refused — bookkeeping cannot skip the queue.
  await db.exec("reset role; set role service_role");
  await expectDatabaseError(() => db.query(`select public.complete_notification_job('${retryJobId}','smtp','msg')`), "NOTIFICATION_JOB_NOT_CLAIMED");

  // Non-retryable verdict (hard bounce) dead-letters immediately and leaves an audit trail.
  await db.exec(`reset role; update private.notification_jobs set available_at=now() where id='${retryJobId}'`);
  await db.exec("set role service_role");
  const notifReclaimed = (await db.query(`select public.claim_notification_jobs('email',10,'worker-run-claim-0004') as r`)).rows[0].r;
  assert(notifReclaimed.claimed === 1 && notifReclaimed.jobs[0].attempt === 2, "The backed-off job did not become claimable again with an incremented attempt.");
  const deadLettered = (await db.query(`select public.fail_notification_job('${retryJobId}','INVALID_RECIPIENT_ADDRESS',false) as r`)).rows[0].r;
  assert(deadLettered.status === "dead_letter", "A non-retryable failure did not dead-letter the job.");
  await db.exec("reset role");
  const deadLetterAudit = (await db.query(`select count(*)::integer as c from audit.audit_events
    where action_code='notification.deadLettered' and actor_type='system' and resource_id='${retryJobId}'`)).rows[0].c;
  assert(deadLetterAudit === 1, "A dead-lettered notification did not write exactly one system audit event.");

  // Exhausting the retry budget dead-letters even when the provider says the error is retryable.
  await db.exec(`insert into private.notification_jobs(organization_id,template_code,locale,channel,recipient_user_id,recipient_address,payload,idempotency_key,attempts,max_attempts)
    values ('${organization.organizationId}','staff_invitation','en-US','email','${admin}','worker.recipient@example.com','{"invitationId":"w4"}'::jsonb,'worker-test:notifExhausted-1',2,3)`);
  await db.exec("set role service_role");
  const lastAttempt = (await db.query(`select public.claim_notification_jobs('email',10,'worker-run-claim-0005') as r`)).rows[0].r;
  assert(lastAttempt.claimed === 1 && lastAttempt.jobs[0].attempt === 3 && lastAttempt.jobs[0].maxAttempts === 3, "The notifExhausted-budget fixture did not reach its final attempt.");
  const notifExhausted = (await db.query(`select public.fail_notification_job('${lastAttempt.jobs[0].notificationJobId}','SMTP_TIMEOUT',true) as r`)).rows[0].r;
  assert(notifExhausted.status === "dead_letter", "A retryable failure on the final attempt did not dead-letter the job.");

  // A crashed worker's claim is recovered by the stall sweep rather than being lost forever.
  await db.exec("reset role");
  await db.exec(`insert into private.notification_jobs(organization_id,template_code,locale,channel,recipient_user_id,recipient_address,payload,idempotency_key)
    values ('${organization.organizationId}','staff_invitation','en-US','email','${admin}','worker.recipient@example.com','{"invitationId":"w5"}'::jsonb,'worker-test:stalled-1')`);
  await db.exec("set role service_role");
  const stalledClaim = (await db.query(`select public.claim_notification_jobs('email',10,'worker-run-claim-0006') as r`)).rows[0].r;
  assert(stalledClaim.claimed === 1, "The stall fixture was not claimed.");
  const stalledJobId = stalledClaim.jobs[0].notificationJobId;
  await db.exec(`reset role; update private.notification_jobs set claimed_at=now()-interval '2 hours' where id='${stalledJobId}'`);
  await db.exec("set role service_role");
  const notifSwept = (await db.query(`select public.requeue_stalled_notification_jobs(30) as r`)).rows[0].r;
  assert(notifSwept.requeued === 1, "The stall sweep did not recover the crashed worker's claim.");
  await db.exec("reset role");
  const notifSweptRow = (await db.query(`select status,claimed_at,last_error from private.notification_jobs where id='${stalledJobId}'`)).rows[0];
  assert(notifSweptRow.status === "queued" && notifSweptRow.claimed_at === null && notifSweptRow.last_error === "WORKER_STALLED", "A swept job was not returned to the queue cleanly.");

  // A stall that exhausts the retry budget is a dead letter too: it must be counted for THIS sweep only
  // and audited exactly like a provider-reported dead letter, not silently dropped.
  await db.exec(`reset role; insert into private.notification_jobs(organization_id,template_code,locale,channel,recipient_user_id,recipient_address,payload,idempotency_key,attempts,max_attempts,status,claimed_at)
    values ('${organization.organizationId}','staff_invitation','en-US','email','${admin}','worker.recipient@example.com','{"invitationId":"w6"}'::jsonb,'worker-test:stalled-exhausted-1',4,4,'processing',now()-interval '3 hours')`);
  const stalledDeadId = (await db.query(`select id from private.notification_jobs where idempotency_key='worker-test:stalled-exhausted-1'`)).rows[0].id;
  await db.exec("set role service_role");
  const sweepTwo = (await db.query(`select public.requeue_stalled_notification_jobs(30) as r`)).rows[0].r;
  assert(sweepTwo.requeued === 1 && sweepTwo.deadLettered === 1, "The stall sweep did not report exactly this run's dead letters.");
  const sweepThree = (await db.query(`select public.requeue_stalled_notification_jobs(30) as r`)).rows[0].r;
  assert(sweepThree.requeued === 0 && sweepThree.deadLettered === 0, "The stall sweep reported dead letters from an earlier run - the counter is cumulative, not per-run.");
  await db.exec("reset role");
  const stallDeadAudit = (await db.query(`select count(*)::integer as c from audit.audit_events
    where action_code='notification.deadLettered' and actor_type='system' and resource_id='${stalledDeadId}'`)).rows[0].c;
  assert(stallDeadAudit === 1, "A stall-induced dead letter was not audited like a provider-reported one.");

  // Provider notifReceipts are recorded per attempt for both outcomes.
  const notifReceipts = (await db.query(`select
    (select count(*)::integer from private.notification_deliveries where notification_job_id='${sentJobId}' and status='accepted') as accepted,
    (select count(*)::integer from private.notification_deliveries where notification_job_id='${retryJobId}' and status='failed') as failed`)).rows[0];
  assert(notifReceipts.accepted === 1 && notifReceipts.failed === 2, "Provider notifReceipts were not recorded once per send attempt.");

  // in_app jobs are never preference-suppressed (the preference table's own check excludes in_app).
  await db.exec("reset role; set role service_role");
  const inAppBatch = (await db.query(`select public.claim_notification_jobs('in_app',5,'worker-run-inapp-0001') as r`)).rows[0].r;
  assert(inAppBatch.suppressed === 0, "The worker attempted preference suppression on the in_app channel.");
  await db.exec("reset role");

  const notificationWorkerTrace = (await db.query(`select
    (select count(*)::integer from private.notification_jobs where status='sent' and idempotency_key like 'worker-test:%') as sent,
    (select count(*)::integer from private.notification_jobs where status='dead_letter' and idempotency_key like 'worker-test:%') as dead,
    (select count(*)::integer from private.notification_jobs where status='canceled' and idempotency_key like 'worker-test:%') as canceled`)).rows[0];
  assert(notificationWorkerTrace.sent === 1 && notificationWorkerTrace.dead === 3 && notificationWorkerTrace.canceled === 1,
    "The notification worker did not leave the expected terminal job states.");

  // ── Document delivery over email and secure_link (phase_4_document_delivery_channels) ───────────
  // Off-portal delivery is only real once the worker can drain the queue. These assertions prove the
  // delivery row tracks what ACTUALLY happened rather than optimistically claiming success.
  await db.exec(`reset role; update auth.users set email='resident.recipient@example.com' where id='${invitedResidentUser}'`);
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${admin}'`);

  // Channel/parameter guards.
  await expectDatabaseError(() => db.query(`select public.deliver_document('${organization.organizationId}','${deliveryVersion}','resident_person','${invitedResidentPerson}','secure_link',0,'doc-secure-badttl-1')`), "INVALID_SECURE_LINK_TTL");
  await expectDatabaseError(() => db.query(`select public.deliver_document('${organization.organizationId}','${deliveryVersion}','resident_person','${invitedResidentPerson}','email',72,'doc-email-ttl-1')`), "SECURE_LINK_TTL_NOT_APPLICABLE");

  // EMAIL: the delivery is queued, not "delivered", and a notification job is enqueued for it.
  const emailDelivery = (await db.query(`select public.deliver_document('${organization.organizationId}','${deliveryVersion}','resident_person','${invitedResidentPerson}','email',null,'doc-deliver-email-0001') as r`)).rows[0].r;
  assert(emailDelivery.deliveryChannel === "email" && emailDelivery.status === "queued" && emailDelivery.deliveredAt === null,
    "An email delivery must start queued — claiming 'delivered' before the worker sends is a lie to the operator.");
  const emailDeliveryReplay = (await db.query(`select public.deliver_document('${organization.organizationId}','${deliveryVersion}','resident_person','${invitedResidentPerson}','email',null,'doc-deliver-email-0001') as r`)).rows[0].r;
  assert(emailDeliveryReplay.documentDeliveryId === emailDelivery.documentDeliveryId, "Email delivery replay returned a different delivery.");
  await db.exec("reset role");
  const emailJob = (await db.query(`select id,template_code,channel,recipient_address,payload->>'documentDeliveryId' as delivery_id
    from private.notification_jobs where idempotency_key='document-delivery:${emailDelivery.documentDeliveryId}'`)).rows[0];
  assert(emailJob && emailJob.template_code === "document_delivered" && emailJob.channel === "email"
    && emailJob.recipient_address === "resident.recipient@example.com" && emailJob.delivery_id === emailDelivery.documentDeliveryId,
    "The email delivery did not enqueue a document_delivered job addressed to the recipient.");
  assert(!JSON.stringify(emailJob.payload ?? {}).includes("Token") , "The notification payload must never carry a secret token.");

  // Draining the queue advances the delivery to 'sent' — the worker's outcome drives the delivery row.
  await db.exec("set role service_role");
  const docClaim = (await db.query(`select public.claim_notification_jobs('email',10,'worker-run-docdeliver-01') as r`)).rows[0].r;
  assert(docClaim.claimed === 1 && docClaim.jobs[0].templateCode === "document_delivered", "The document-delivery email was not claimable by the worker.");
  await db.query(`select public.complete_notification_job('${docClaim.jobs[0].notificationJobId}','relay','relay-msg-doc-1')`);
  await db.exec("reset role");
  const emailDeliveryRow = (await db.query(`select status,last_error from public.document_deliveries where id='${emailDelivery.documentDeliveryId}'`)).rows[0];
  assert(emailDeliveryRow.status === "sent", "A sent notification did not advance its document delivery to 'sent'.");

  // A dead letter must mark the delivery FAILED — an operator must never see 'queued' for a message
  // the system already gave up on.
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${admin}'`);
  const failedDelivery = (await db.query(`select public.deliver_document('${organization.organizationId}','${deliveryVersion}','resident_person','${invitedResidentPerson}','email',null,'doc-deliver-email-0002') as r`)).rows[0].r;
  await db.exec("reset role; set role service_role");
  const failClaim = (await db.query(`select public.claim_notification_jobs('email',10,'worker-run-docdeliver-02') as r`)).rows[0].r;
  assert(failClaim.claimed === 1, "The second document-delivery email was not claimable.");
  await db.query(`select public.fail_notification_job('${failClaim.jobs[0].notificationJobId}','INVALID_RECIPIENT_ADDRESS',false)`);
  await db.exec("reset role");
  const failedDeliveryRow = (await db.query(`select status,last_error from public.document_deliveries where id='${failedDelivery.documentDeliveryId}'`)).rows[0];
  assert(failedDeliveryRow.status === "failed" && failedDeliveryRow.last_error === "INVALID_RECIPIENT_ADDRESS",
    "A dead-lettered notification did not mark its document delivery failed.");

  // SECURE_LINK: the database mints the token, persists only its hash, and returns the plaintext once.
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${admin}'`);
  const secureDelivery = (await db.query(`select public.deliver_document('${organization.organizationId}','${deliveryVersion}','resident_person','${invitedResidentPerson}','secure_link',72,'doc-deliver-secure-0001') as r`)).rows[0].r;
  assert(secureDelivery.deliveryChannel === "secure_link" && secureDelivery.status === "queued" && secureDelivery.expiresAt, "The secure-link delivery did not mint a time-boxed, queued delivery.");
  assert(typeof secureDelivery.secureLinkToken === "string" && secureDelivery.secureLinkToken.length >= 32, "The command did not return a one-time secure-link token.");
  const secureTokenRaw = secureDelivery.secureLinkToken;
  await db.exec("reset role");
  const secureRow = (await db.query(`select secure_link_token_hash,expires_at from public.document_deliveries where id='${secureDelivery.documentDeliveryId}'`)).rows[0];
  const expectedHash = (await db.query(`select encode(sha256(convert_to('${secureTokenRaw}','UTF8')),'hex') as h`)).rows[0].h;
  assert(secureRow.secure_link_token_hash === expectedHash, "The delivery row must store the token hash, never the token.");
  assert(secureRow.secure_link_token_hash !== secureTokenRaw, "The plaintext token was persisted on the delivery row.");

  // Replaying the idempotency key must NOT re-issue the one-time secret.
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${admin}'`);
  const secureReplay = (await db.query(`select public.deliver_document('${organization.organizationId}','${deliveryVersion}','resident_person','${invitedResidentPerson}','secure_link',72,'doc-deliver-secure-0001') as r`)).rows[0].r;
  assert(secureReplay.documentDeliveryId === secureDelivery.documentDeliveryId, "Secure-link replay returned a different delivery.");
  assert(!secureReplay.secureLinkToken, "An idempotent replay re-read a one-time secure-link token.");

  // The worker needs the token in flight; once the job terminates it must be scrubbed from the queue.
  await db.exec("reset role");
  const inFlightToken = (await db.query(`select payload->>'secureLinkToken' as t from private.notification_jobs where idempotency_key='document-delivery:${secureDelivery.documentDeliveryId}'`)).rows[0].t;
  assert(inFlightToken === secureTokenRaw, "The worker cannot build the link: the in-flight job carries no token.");
  await db.exec("set role service_role");
  const secureClaim = (await db.query(`select public.claim_notification_jobs('email',10,'worker-run-secure-0001') as r`)).rows[0].r;
  assert(secureClaim.claimed === 1 && secureClaim.jobs[0].payload.secureLinkToken === secureTokenRaw, "The claimed secure-link job did not expose the token to the worker.");
  await db.query(`select public.complete_notification_job('${secureClaim.jobs[0].notificationJobId}','relay','relay-msg-secure-1')`);
  await db.exec("reset role");
  const scrubbed = (await db.query(`select payload ? 'secureLinkToken' as still_there from private.notification_jobs where idempotency_key='document-delivery:${secureDelivery.documentDeliveryId}'`)).rows[0].still_there;
  assert(scrubbed === false, "A terminal job still holds the plaintext secure-link token.");

  // Redemption is anonymous by necessity; every rejection returns one sentinel so the token space
  // cannot be probed for which hashes exist.
  await db.exec("set role anon");
  await expectDatabaseError(() => db.query(`select public.redeem_document_secure_link('short')`), "SECURE_LINK_NOT_REDEEMABLE");
  await expectDatabaseError(() => db.query(`select public.redeem_document_secure_link('${"e".repeat(64)}')`), "SECURE_LINK_NOT_REDEEMABLE");
  // DECISIVE: the STORED HASH must not redeem. Only the plaintext token does, so the column is not a
  // bearer credential for this anon-callable command.
  await expectDatabaseError(() => db.query(`select public.redeem_document_secure_link('${expectedHash}')`), "SECURE_LINK_NOT_REDEEMABLE");
  const redeemed = (await db.query(`select public.redeem_document_secure_link('${secureTokenRaw}') as r`)).rows[0].r;
  assert(redeemed.storageBucket === "documents" && redeemed.storagePath && redeemed.documentTitle === "Quiet hours notice",
    "Redeeming a secure link did not return the document's storage coordinates.");
  assert(!Object.keys(redeemed).some((k) => /token|recipient|email|user/i.test(k)), "The secure-link DTO leaked a token or recipient identity.");
  await db.exec("reset role");
  const redeemedRow = (await db.query(`select status,redeemed_at from public.document_deliveries where id='${secureDelivery.documentDeliveryId}'`)).rows[0];
  assert(redeemedRow.status === "delivered" && redeemedRow.redeemed_at !== null, "Redemption did not mark the delivery delivered.");

  // An expired link is dead even though its row still exists.
  await db.exec(`update public.document_deliveries set expires_at=now()-interval '1 hour' where id='${secureDelivery.documentDeliveryId}'`);
  await db.exec("set role anon");
  await expectDatabaseError(() => db.query(`select public.redeem_document_secure_link('${expectedHash}')`), "SECURE_LINK_NOT_REDEEMABLE");
  await db.exec("reset role");

  // A recipient who switched OFF document emails must not silently lose the delivery: the job is
  // canceled and the delivery is marked failed, so the operator can see it never went out and follow
  // up another way. (A legally-significant document quietly vanishing is the failure mode here.)
  await db.exec(`reset role; insert into public.notification_preferences(user_id,category,channel,enabled)
    values ('${invitedResidentUser}','documents','email',false)
    on conflict (user_id,category,channel) do update set enabled=false`);
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${admin}'`);
  const optedOutDelivery = (await db.query(`select public.deliver_document('${organization.organizationId}','${deliveryVersion}','resident_person','${invitedResidentPerson}','email',null,'doc-deliver-email-0003') as r`)).rows[0].r;
  await db.exec("reset role; set role service_role");
  const optOutClaim = (await db.query(`select public.claim_notification_jobs('email',10,'worker-run-optout-0001') as r`)).rows[0].r;
  assert(optOutClaim.suppressed === 1 && optOutClaim.claimed === 0, "The opted-out document email was not suppressed at claim time.");
  await db.exec("reset role");
  const optedOutRow = (await db.query(`select status,last_error from public.document_deliveries where id='${optedOutDelivery.documentDeliveryId}'`)).rows[0];
  assert(optedOutRow.status === "failed" && optedOutRow.last_error === "RECIPIENT_OPTED_OUT",
    "A preference-suppressed document email left its delivery looking queued — the operator would never know it did not go out.");
  await db.exec(`update public.notification_preferences set enabled=true where user_id='${invitedResidentUser}' and category='documents' and channel='email'`);

  // The legacy 6-argument signature still works and is still portal-only.
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${admin}'`);
  const legacyPortal = (await db.query(`select public.deliver_document('${organization.organizationId}','${deliveryVersion}','resident_person','${invitedResidentPerson}','portal','doc-deliver-legacy-0001') as r`)).rows[0].r;
  assert(legacyPortal.deliveryChannel === "portal" && legacyPortal.status === "delivered", "The legacy 6-argument deliver_document signature regressed.");
  await db.exec("reset role");

  await db.close();
  return { generatedCharges: generated.generatedCount, replayedCharge: replay.replayed, manualPayments: 1, paymentCorrections: 3, providerConnections: providerTraces.connections, residentPaymentSessions: 5, persistedRefunds: operatorRefunds, paymentDisputes: 3, settlementBatches: 2, reconciliationExceptions: 2, maintenanceRequests: 1, vendors: 1, workOrders: 2, workOrderTransitions: workOrderTraces.statuschanges, ownerRemittances: workOrderTraces.remittanceevents, conversationMessages: messageTraces.messages, announcements: announcementTraces.announcements, announcementDeliveries: announcementTraces.deliveries, privacyRequests: privacyTraces.requests, privacyRequestJobs: privacyTraces.jobs, staffInvitations: staffTraces.invitations, staffInvitationNotifications: staffTraces.notification_jobs, staffRevocations: staffTraces.revoked_audits, notificationPreferenceUpdates: preferenceTraces.audits, relationshipInvitations: relationshipInviteTraces.invited, relationshipActivations: relationshipInviteTraces.activated, workOrderCostMinor: workOrderCost.amountMinor, receivableWriteOffMinor: writeOff.writtenOffMinor, balanceMinor: residentSummary.items[0].balanceMinor, outsiderCharges, documentDeliveries: 1, documentAcknowledgements: documentDeliveryTrace.acknowledged_audits };
}

try {
  const result = {
    authority: await validateAuthority(),
    foundation: await validateFoundation(),
    portfolio: await validatePortfolio(),
    documents: await validateDocuments(),
    imports: await validateImports(),
    leasing: await validateLeasing(),
    finance: await validateRecurringCharges(),
  };
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(
    JSON.stringify({
      message: error instanceof Error ? error.message : String(error),
      code: error?.code,
      detail: error?.detail,
      where: error?.where,
      position: error?.position,
      internalQuery: error?.internalQuery,
      routine: error?.routine,
    }),
  );
  process.exitCode = 1;
}
