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
  assert(rlsMarkdown.includes("| RLS-030 |"), "The mandatory v4.1.1 RLS matrix does not reach RLS-030.");
  const db = createDatabase();
  await prepareSupabasePrelude(db);
  await db.exec(authoritySql);
  await db.exec(rlsSql);
  const tableResult = await db.query(`select count(*)::integer as count from information_schema.tables where table_schema in ('public','private','audit','reporting')`);
  const policyResult = await db.query(`select count(*)::integer as count from pg_policies where schemaname in ('public','reporting')`);
  assert(tableResult.rows[0].count === 73, "Authority schema table count changed unexpectedly.");
  assert(policyResult.rows[0].count === 58, "Authority RLS policy count changed unexpectedly.");

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
  const ownerRows = await db.query(`select
    (select count(*)::integer from reporting.owner_statement_snapshots) as statements,
    (select count(*)::integer from public.owner_remittance_records) as remittances`);
  assert(ownerRows.rows[0].statements === 1 && ownerRows.rows[0].remittances === 1, "RLS-027 failed: a co-owner crossed the exact owner-entity boundary.");

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
  return { tables: tableResult.rows[0].count, policies: policyResult.rows[0].count, coOwnerRows: ownerRows.rows[0].statements, residentWorkOrders: residentRows.rows[0].projected_work_orders, deliveredAnnouncements: residentRows.rows[0].announcements, scopedImports: scopedRows.rows[0].imports };
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

  const admin = "c1000000-0000-4000-8000-000000000001";
  const resident = "c2000000-0000-4000-8000-000000000002";
  const outsider = "c3000000-0000-4000-8000-000000000003";
  await db.exec(`insert into auth.users(id) values ('${admin}'),('${resident}'),('${outsider}')`);
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

  await db.close();
  return { generatedCharges: generated.generatedCount, replayedCharge: replay.replayed, manualPayments: 1, paymentCorrections: 3, providerConnections: providerTraces.connections, residentPaymentSessions: 5, persistedRefunds: operatorRefunds, paymentDisputes: 3, settlementBatches: 2, reconciliationExceptions: 2, balanceMinor: residentSummary.items[0].balanceMinor, outsiderCharges };
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
