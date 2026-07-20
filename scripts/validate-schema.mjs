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
  const db = createDatabase();
  await prepareSupabasePrelude(db);
  await db.exec(authoritySql);
  await db.exec(rlsSql);
  const tableResult = await db.query(`select count(*)::integer as count from information_schema.tables where table_schema in ('public','private','audit','reporting')`);
  const policyResult = await db.query(`select count(*)::integer as count from pg_policies where schemaname in ('public','reporting')`);
  assert(tableResult.rows[0].count === 73, "Authority schema table count changed unexpectedly.");
  assert(policyResult.rows[0].count === 58, "Authority RLS policy count changed unexpectedly.");
  await db.close();
  return { tables: tableResult.rows[0].count, policies: policyResult.rows[0].count };
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

try {
  const result = {
    authority: await validateAuthority(),
    foundation: await validateFoundation(),
    portfolio: await validatePortfolio(),
    documents: await validateDocuments(),
    imports: await validateImports(),
    leasing: await validateLeasing(),
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
