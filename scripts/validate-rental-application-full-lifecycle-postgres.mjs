// B4 positive lifecycle replay on *full* PostgreSQL migrations, not a reduced mock.
// Only the explicitly identified local test cluster and per-run disposable DB are used.
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateRentalTour } from "./validate-rental-tour.mjs";
import { validateRentalApplicationLifecycle } from "./validate-rental-application-lifecycle.mjs";
import { validateRentalApplicationFullRaces, validateApplicationActivationVersusClose } from "./validate-rental-application-full-races-postgres.mjs";

const root = resolve(import.meta.dirname, "..");
const host = "127.0.0.1";
const port = "55439";
const name = `crecy_b4_lifecycle_${randomBytes(6).toString("hex")}`;
const clusterIdentity = "/tmp/crecy-b4-local-pg-guard";

function psql(db, sql, { file = false } = {}) {
  const args = ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1",
    "-h", host, "-p", port, "-d", db, file ? "-f" : "-c", sql];
  try {
    return execFileSync("psql", args, {
      encoding: "utf8", timeout: 45000,
      maxBuffer: 6 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    throw new Error(`Isolated PG statement failed: ${String(error.stderr || error.message).slice(0, 2500)}`);
  }
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return "'" + text.replaceAll("'", "''") + "'";
}
function substitute(sql, params) {
  return sql.replace(/\$(\d+)(?!\d)/g, (_match, num) => {
    const position = Number(num) - 1;
    if (position < 0 || position >= params.length) {
      throw new Error(`Missing safe test parameter: ${num}`);
    }
    return sqlLiteral(params[position]);
  });
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
async function expectDatabaseError(action, fragment) {
  try {
    await action();
  } catch (error) {
    if (String(error.message).includes(fragment)) return;
    throw error;
  }
  throw new Error(`Expected PostgreSQL refusal containing ${fragment}`);
}

// Each call uses a fresh psql connection while retaining the PGlite fixture's
// effective role and JWT GUCs; no ambient role is silently escalated.
function fixtureAdapter(database) {
  const state = { role: null, user: null, aal: null };
  const context = () => [
    "set statement_timeout='20000ms';",
    state.role ? `set role ${state.role};` : "",
    state.user ? `set request.jwt.claim.sub=${sqlLiteral(state.user)};` : "",
    state.aal ? `set request.jwt.claim.aal=${sqlLiteral(state.aal)};` : "",
  ].join("\n");
  const record = (sql) => {
    for (const part of sql.split(";")) {
      const command = part.trim();
      if (/^reset\s+role$/i.test(command)) state.role = null;
      const role = command.match(/^set\s+role\s+(\w+)$/i);
      if (role) state.role = role[1];
      const actor = command.match(/^set\s+request\.jwt\.claim\.sub\s*=\s*'([^']+)'$/i);
      if (actor) state.user = actor[1];
      const aal = command.match(/^set\s+request\.jwt\.claim\.aal\s*=\s*'([^']+)'$/i);
      if (aal) state.aal = aal[1];
    }
  };
  return {
    exec: async (sql) => {
      psql(database, context() + "\n" + sql);
      record(sql);
    },
    query: async (sql, params = []) => {
      const statement = substitute(sql.trim().replace(/;\s*$/, ""), params);
      const isSelect = /^(select|with)\b/i.test(statement);
      const isReturning = /\breturning\b/i.test(statement);
      const wrapped = isSelect
        ? `select row_to_json(fixture_row)::text from (${statement}) fixture_row`
        : isReturning
          ? `with fixture_changed as (${statement}) select row_to_json(fixture_changed)::text from fixture_changed`
          : statement;
      const result = psql(database, context() + "\n" + wrapped);
      if (!isSelect && !isReturning) return { rows: [] };
      const rows = result.split("\n").filter(Boolean).map((line) => JSON.parse(line));
      return { rows };
    },
  };
}

const rolesCreated = [];
let created = false;
try {
  assert(psql("postgres", "select current_setting('data_directory')") === clusterIdentity,
    "Refusing non-test PostgreSQL cluster.");
  const roles = psql("postgres",
    "select rolname from pg_roles where rolname in ('anon','authenticated','service_role')").split("\n");
  for (const role of ["anon", "authenticated", "service_role"]) {
    if (!roles.includes(role)) {
      psql("postgres", `create role ${role} nologin`);
      rolesCreated.push(role);
    }
  }
  psql("postgres", `create database ${name}`);
  created = true;
  psql(name, "create extension if not exists citext; create extension if not exists pgcrypto");
  const source = readFileSync(resolve(root, "scripts/validate-schema.mjs"), "utf8");
  const prelude = source.match(
    /async function prepareSupabasePrelude\(db\) \{\s*await db\.exec\(`([\s\S]*?)`\);\s*\}/,
  )?.[1];
  assert(prelude, "Canonical Supabase test prelude not found.");
  psql(name, prelude.replace(/create role (anon|authenticated|service_role) nologin;/g, ""));
  const names = new Map([...source.matchAll(
    /const (\w+Sql) = await readFile\(resolve\(root, "([^"]+)"\), "utf8"\);/g,
  )].map((match) => [match[1], match[2]]));
  const beginning = source.indexOf("async function validateRecurringCharges()");
  const end = source.indexOf("\n  const admin =", beginning);
  assert(beginning > 0 && end > beginning, "Canonical ordered migration replay unavailable.");
  const order = [...source.slice(beginning, end).matchAll(
    /await db\.exec\((\w+Sql)\);/g,
  )].map((match) => match[1]);
  assert(order.length >= 75 && order.every((key) => names.has(key)),
    "Full migration sequence not recovered.");
  for (const key of order) psql(name, resolve(root, names.get(key)), { file: true });
  const db = fixtureAdapter(name);
  const createOrganizationAsServer = async (_db, actorId, argsSql, { aal } = {}) => {
    await db.exec("reset role; set role service_role");
    const result = await db.query(
      `select public.create_organization_as_actor('${actorId}',${argsSql}) as result`,
    );
    await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${actorId}'`);
    if (aal) await db.exec(`set request.jwt.claim.aal='${aal}'`);
    return result;
  };
  const tour = await validateRentalTour(db, {
    assert, expectDatabaseError, createOrganizationAsServer,
  });
  const lifecycle = await validateRentalApplicationLifecycle(db, {
    assert, expectDatabaseError,
    runFullPostgresRaces: ({ db, listing, day }) =>
      validateRentalApplicationFullRaces(db, { database: name, listing, day }),
    runFullPostgresActivationRace: ({ db, application, setupRevision }) =>
      validateApplicationActivationVersusClose(db, { database: name, application, setupRevision }),
  });
  assert(lifecycle.fullLeaseConversion && lifecycle.samePropertyActorDraftIsolation
    && lifecycle.realPostgresPreparationAndClosureRaces
    && lifecycle.realPostgresDistinctApplicantPreparationRace
    && lifecycle.realPostgresNetworkBudgetRace
    && lifecycle.realPostgresActivationCloseRace,
    "Full-schema PostgreSQL B4 lifecycle or multi-session races missing assertions.");
  console.log(JSON.stringify({
    isolatedFullPostgresApplicationLifecycle: true,
    migrationsApplied: order.length, fixtureTour: Boolean(tour),
    signedTenancyConversion: lifecycle.fullLeaseConversion,
    crossActorLeaseSetupDenied: lifecycle.samePropertyActorDraftIsolation,
    fullSchemaPreparationAndClosureRaces: lifecycle.realPostgresPreparationAndClosureRaces,
    fullSchemaDistinctApplicantPreparationRace: lifecycle.realPostgresDistinctApplicantPreparationRace,
    fullSchemaCrossListingNetworkRace: lifecycle.realPostgresNetworkBudgetRace,
    fullSchemaActivationCloseRace: lifecycle.realPostgresActivationCloseRace,
    // Database concurrency is certified by the explicit multi-session fixtures above.
    // HTTP routing and production-domain attachment are verified by separate gates.
    concurrencyCertified: true,
  }));
} finally {
  if (created) psql("postgres", `drop database ${name} with (force)`);
  for (const role of rolesCreated.reverse()) psql("postgres", `drop role if exists ${role}`);
}
