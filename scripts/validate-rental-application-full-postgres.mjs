// Ephemeral full B4 migration replay on localhost PostgreSQL 17.
// Creates a fresh database (and missing fixture roles) and removes them afterward.
// Never reads Supabase credentials or connects to production.
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const host = "127.0.0.1", port = "55439", admin = "postgres";
const name = `crecy_b4_full_${randomBytes(5).toString("hex")}`;
const source = await readFile(resolve(root, "scripts/validate-schema.mjs"), "utf8");
const definitions = new Map([...source.matchAll(
  /const (\w+Sql) = await readFile\(resolve\(root, "([^"]+)"\), "utf8"\)/g,
)].map((match) => [match[1], match[2]]));
const fnStart = source.indexOf("async function validateRecurringCharges()");
const fnEnd = source.indexOf("\n  const admin =", fnStart);
if (fnStart < 0 || fnEnd < 0) throw new Error("Full PostgreSQL migration order not found");
const order = [...source.slice(fnStart, fnEnd).matchAll(
  /await db\.exec\((\w+Sql)\);/g,
)].map((match) => match[1]);
const prelude = source.match(
  /async function prepareSupabasePrelude\(db\) \{\s*await db\.exec\(`([\s\S]*?)`\);\s*\}/,
)?.[1];
if (!prelude || order.length < 75 || order.some((key) => !definitions.has(key))) {
  throw new Error("Full PG fixture cannot safely extract exact ordered schema migrations");
}
function psql(database, sql, file = false) {
  const args = ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-h", host,
    "-p", port, "-d", database, "--tuples-only", "--no-align",
    file ? "-f" : "-c", sql];
  try {
    return execFileSync("psql", args, {
      encoding: "utf8", timeout: 35000, stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    throw new Error(`Isolated PG replay failed (${file ? sql.split("/").at(-1) : "statement"}):
${String(error.stderr ?? error.message).slice(0, 1300)}`);
  }
}
const rolesCreated = [];
let created = false, migrated = 0;
try {
  if (psql(admin, "select current_setting('data_directory')") !== "/tmp/crecy-b4-local-pg-guard") {
    throw new Error("Refusing fixture setup: PostgreSQL is not the known isolated B4 test cluster.");
  }
  const existingRoles = psql(admin,
    "select rolname from pg_roles where rolname in ('anon','authenticated','service_role')").split("\n");
  for (const role of ["anon", "authenticated", "service_role"]) {
    if (!existingRoles.includes(role)) {
      psql(admin, `create role ${role} nologin`);
      rolesCreated.push(role);
    }
  }
  psql(admin, `create database ${name}`);
  created = true;
  psql(name, prelude.replace(
    /create role (anon|authenticated|service_role) nologin;/g,
    "",
  ));
  for (const key of order) {
    psql(name, resolve(root, definitions.get(key)), true);
    migrated++;
  }
  const tables = Number(psql(name,
    "select count(*) from pg_tables where schemaname in ('public','private','audit')"));
  const b4 = psql(name,
    "select count(*) from pg_proc where proname in ('submit_public_rental_application','verify_public_rental_application','prepare_rental_application_lease')");
  if (tables < 85 || Number(b4) !== 3) {
    throw new Error(`Full PostgreSQL schema incomplete: ${tables} tables and ${b4} B4 RPCs`);
  }
  console.log(JSON.stringify({ fullIsolatedPostgresqlSchemaReplay: true,
    migrationsApplied: migrated, tables, b4RpcCount: Number(b4), localOnly: true,
    fullApplicationLifecycleCertified: false }));
} finally {
  if (created) psql(admin, `drop database ${name} with (force)`);
  for (const role of rolesCreated.reverse()) psql(admin, `drop role if exists ${role}`);
}
