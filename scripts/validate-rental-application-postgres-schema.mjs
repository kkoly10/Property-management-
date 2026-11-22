import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

// Nonproduction PostgreSQL 17 migration replay. Every write is guarded by an
// exact localhost cluster identity and isolated per-run database.
const root = resolve(import.meta.dirname, "..");
const bin = "/opt/homebrew/opt/postgresql@17/bin";
const env = { ...process.env, PGHOST: "127.0.0.1", PGPORT: "55439", PGDATABASE: "postgres" };
function execute(binary, args, input) {
  const result = spawnSync(`${bin}/${binary}`, args, {
    encoding: "utf8", env, input, timeout: 45000, maxBuffer: 4 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`${binary}: ${result.stderr || result.error || "unknown failure"}`);
  }
  return result.stdout.trim();
}
function query(db, sql) {
  return execute("psql", ["-X", "-At", "-v", "ON_ERROR_STOP=1", "-d", db, "-c", sql]);
}
function replay(db, sql, label) {
  try {
    execute("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", db, "-f", "-"], sql);
  } catch (err) {
    throw new Error(`Isolated PostgreSQL replay failed at ${label}: ${err.message}`);
  }
}
const location = query("postgres", "select current_setting('data_directory')");
if (location !== "/tmp/crecy-b4-local-pg-guard") {
  throw new Error("Refusing replay: PostgreSQL target is not the known isolated B4 cluster.");
}
const source = readFileSync(resolve(root, "scripts/validate-schema.mjs"), "utf8");
const prelude = source.match(/async function prepareSupabasePrelude\(db\)\s*\{\s*await db\.exec\(`([\s\S]*?)`\);\s*\}/)?.[1];
if (!prelude) throw new Error("Could not recover the existing Supabase test prelude.");
const pathByVariable = new Map(
  [...source.matchAll(/const (\w+Sql) = await readFile\(resolve\(root, "([^"]+)"\), "utf8"\);/g)]
    .map((match) => [match[1], match[2]]),
);
const beginning = source.indexOf("async function validateRecurringCharges()");
const end = source.indexOf("  const admin = ", beginning);
if (beginning < 0 || end < 0) throw new Error("Current migration replay section not found.");
const migrations = [...source.slice(beginning, end).matchAll(/await db\.exec\((\w+Sql)\);/g)]
  .map((match) => match[1]);
const missing = migrations.filter((name) => !pathByVariable.has(name));
if (missing.length || !migrations.includes("rentalApplicationSql")) {
  throw new Error(`Incomplete migration plan: ${missing.join(",")}`);
}
const db = `crecy_b4_schema_${process.pid}`;
let created = false;
try {
  execute("createdb", ["--maintenance-db=postgres", db]);
  created = true;
  replay(db, "create extension if not exists citext; create extension if not exists pgcrypto;", "extensions");
  // Database roles are cluster-global and survive dropping the prior fixture DB.
  const roleSafePrelude = prelude.replace(/create role (anon|authenticated|service_role) nologin;/g,
    (_match, role) => `do $$ begin if not exists(select 1 from pg_roles where rolname='${role}') then execute 'create role ${role} nologin'; end if; end $$;`);
  replay(db, roleSafePrelude, "Supabase test prelude");
  for (const name of migrations) {
    replay(db, readFileSync(resolve(root, pathByVariable.get(name)), "utf8"), name);
  }
  const tables = query(db, "select count(*) from pg_tables where schemaname='public'");
  const guard = query(db, "select count(*) from pg_trigger where tgname='rental_application_tenancy_activation_guard' and tgdeferrable and tginitdeferred");
  // Finance replay contains 70 public tables; the separate authority fixture has 91.
  if (Number(tables) < 65 || Number(guard) !== 1) {
    throw new Error(`Incomplete real PostgreSQL schema: ${tables} tables / ${guard} deferred guards`);
  }
  console.log(JSON.stringify({
    postgresFullSchemaApplied: true, replayedMigrations: migrations.length,
    publicTables: Number(tables), applicationDeferredGuardInstalled: true,
    transactionalLifecycleCertified: false, concurrencyCertified: false,
  }));
} finally {
  if (created) execute("dropdb", ["--maintenance-db=postgres", db]);
}
