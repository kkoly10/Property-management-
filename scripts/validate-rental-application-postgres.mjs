import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

// Real PostgreSQL transaction proof for the B4 deferred tenancy guard only.
// Always target the known disposable localhost cluster; never accept a remote DSN.
const bin = "/opt/homebrew/opt/postgresql@17/bin";
const env = { ...process.env, PGHOST: "127.0.0.1", PGPORT: "55439", PGDATABASE: "postgres" };
const run = (program, args) => spawnSync(`${bin}/${program}`, args, {
  encoding: "utf8", env, timeout: 30000,
});
function successful(program, args) {
  const result = run(program, args);
  if (result.status !== 0) throw new Error(`${program} failed: ${result.stderr || result.error}`);
  return result.stdout.trim();
}
function sql(database, statement) {
  return run("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-d", database, "-At", "-c", statement]);
}
function ok(database, statement) {
  const result = sql(database, statement);
  if (result.status !== 0) throw new Error(`PostgreSQL failed: ${result.stderr || result.error}`);
  return result.stdout.trim();
}
function blocked(database, statement, label) {
  const result = sql(database, statement);
  if (result.status === 0 || !result.stderr.includes("APPLICATION_LEASE_PREPARATION_ACTIVE")) {
    throw new Error(`${label}: expected deferred tenancy guard failure; got ${result.stderr || result.stdout}`);
  }
}
const location = successful("psql", [
  "-X", "-d", "postgres", "-At", "-c", "select current_setting('data_directory')",
]);
if (location !== "/tmp/crecy-b4-local-pg-guard") {
  throw new Error("Refusing to mutate PostgreSQL: the connection is not the known disposable test cluster.");
}
const name = `crecy_b4_guard_${process.pid}`;
let created = false;
try {
  successful("createdb", ["--maintenance-db=postgres", name]);
  created = true;
  const source = readFileSync(resolve(import.meta.dirname,
    "../supabase/migrations/20261008020000_verified_rental_applications.sql"), "utf8");
  const start = source.indexOf("create or replace function private.prevent_rental_application_tenancy_bypass()");
  const finish = source.indexOf("end; $$;", start) + "end; $$;".length;
  const triggerStart = source.indexOf("create constraint trigger rental_application_tenancy_activation_guard", finish);
  const triggerFinish = source.indexOf(";", triggerStart) + 1;
  if (start < 0 || triggerStart < 0 || finish < start || triggerFinish <= triggerStart) {
    throw new Error("Cannot extract the unchanged B4 deferred guard and trigger.");
  }
  // The fixture deliberately contains only the guard's referenced columns.
  // Full migration installation/grants are independently covered by pnpm test:db.
  ok(name, `create schema private;
    create table public.rental_applications(organization_id uuid,unit_id uuid,status text);
    create table public.tenancies(id uuid primary key,organization_id uuid,unit_id uuid,status text);`);
  ok(name, source.slice(start, finish) + "\n" + source.slice(triggerStart, triggerFinish));
  const org = "'10101010-1010-4010-8010-101010101010'";
  const unit = "'20202020-2020-4020-8020-202020202020'";
  const existing = "'30303030-3030-4030-8030-303030303030'";
  const scheduled = "'40404040-4040-4040-8040-404040404040'";
  const rejected = "'50505050-5050-4050-8050-505050505050'";
  // Commit the existing tenancies BEFORE selecting an applicant. A multi-statement
  // psql -c request is one implicit transaction and would correctly trip the deferred guard.
  ok(name, `insert into public.tenancies values(${existing},${org},${unit},'active');
    insert into public.tenancies values(${scheduled},${org},${unit},'scheduled');`);
  ok(name, `insert into public.rental_applications values(${org},${unit},'lease_preparation')`);
  blocked(name, `begin;insert into public.tenancies values(${rejected},${org},${unit},'active');commit;`,
    "Direct active tenancy insertion");
  blocked(name, `begin;update public.tenancies set status='active' where id=${scheduled};commit;`,
    "Scheduled-to-active occupancy bypass");
  blocked(name, `begin;update public.tenancies set status='notice_given' where id=${scheduled};commit;`,
    "Scheduled-to-notice occupancy bypass");
  ok(name, `update public.tenancies set status='notice_given' where id=${existing}`);
  if (ok(name, `select status from public.tenancies where id=${existing}`) !== "notice_given") {
    throw new Error("A valid existing occupant could not enter notice.");
  }
  ok(name, `update public.rental_applications set status='converted'`);
  ok(name, `update public.tenancies set status='active' where id=${scheduled}`);
  if (ok(name, `select status from public.tenancies where id=${scheduled}`) !== "active") {
    throw new Error("Correctly converted application could not release the tenancy guard.");
  }
  console.log(JSON.stringify({
    postgresqlDeferredGuard: true, directInsertionDenied: true, scheduledActivationDenied: true,
    scheduledNoticeDenied: true, validExistingNoticeAllowed: true, convertedApplicationReleasedGuard: true,
    fullPostgresqlApplicationLifecycle: false, concurrencyCertified: false,
  }));
} finally {
  if (created) successful("dropdb", ["--maintenance-db=postgres", name]);
}
