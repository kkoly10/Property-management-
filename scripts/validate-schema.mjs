import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const root = resolve(import.meta.dirname, "..");
const foundationSql = await readFile(resolve(root, "supabase/migrations/20260720095008_phase_1_foundation.sql"), "utf8");
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

try {
  const result = { authority: await validateAuthority(), foundation: await validateFoundation() };
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
