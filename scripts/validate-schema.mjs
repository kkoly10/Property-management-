import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const root = resolve(import.meta.dirname, "..");
const foundationSql = await readFile(resolve(root, "supabase/migrations/20260720095008_phase_1_foundation.sql"), "utf8");
const portfolioSql = await readFile(resolve(root, "supabase/migrations/20260720104921_phase_2_portfolio_foundation.sql"), "utf8");
const documentsSql = await readFile(resolve(root, "supabase/migrations/20260720113426_phase_2_document_ingestion.sql"), "utf8");
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

try {
  const result = {
    authority: await validateAuthority(),
    foundation: await validateFoundation(),
    portfolio: await validatePortfolio(),
    documents: await validateDocuments(),
  };
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(
    JSON.stringify({
      message: error instanceof Error ? error.message : String(error),
      code: error?.code,
      detail: error?.detail,
      where: error?.where,
    }),
  );
  process.exitCode = 1;
}
