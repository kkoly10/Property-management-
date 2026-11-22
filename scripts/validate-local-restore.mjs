import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { basename, join, normalize, resolve } from "node:path";
import { promisify } from "node:util";

const [binArgument, dependencyArgument, scratchArgument] = process.argv.slice(2);
assert(binArgument && dependencyArgument && scratchArgument,
  "Use: node scripts/validate-local-restore.mjs <PostgreSQL 17 bin> <directory with pg installed> <scratch parent>");
const bins = await realpath(binArgument);
const dependencies = await realpath(dependencyArgument);
const scratch = await realpath(scratchArgument);
const repository = resolve(import.meta.dirname, "..");
const { Client } = createRequire(join(dependencies, "package.json"))("pg");
const run = promisify(execFile);
const port = 55443;
const host = "127.0.0.1";
const startedAt = new Date().toISOString();
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const samePath = (left, right) => {
  const canonical = (value) => process.platform === "win32" ? normalize(value).toLowerCase() : normalize(value);
  return canonical(left) === canonical(right);
};
const binary = (program) => join(bins, program + (process.platform === "win32" ? ".exe" : ""));
const pg = (program, args) => run(binary(program), args, { windowsHide: true, timeout: 90_000 });
const control = (args) => new Promise((accept, reject) => {
  const child = spawn(binary("pg_ctl"), args, { windowsHide: true, stdio: "ignore" });
  child.once("error", reject);
  child.once("exit", (code) => code === 0 ? accept() : reject(new Error("pg_ctl exited with status " + code)));
});

const portProbe = createServer();
await new Promise((accept, reject) => portProbe.once("error", reject).listen(port, host, accept));
await new Promise((accept, reject) => portProbe.close(error => error ? reject(error) : accept()));
const rehearsal = await mkdtemp(join(scratch, "crecy-local-restore-"));
const source = join(rehearsal, "source-pg");
const backup = join(rehearsal, "snapshot-pg");
const restored = join(rehearsal, "restored-pg");
const sourceStorage = join(rehearsal, "source-storage");
const backupStorage = join(rehearsal, "snapshot-storage");
const restoredStorage = join(rehearsal, "restored-storage");
const passwordFile = join(rehearsal, "initdb-password");
const password = randomBytes(32).toString("hex");
const database = "crecy_restore_fixture";
const clientFor = (name) => new Client({
  host, port, database: name, user: "postgres", password, ssl: false, connectionTimeoutMillis: 4000,
  application_name: "crecy-synthetic-restore", statement_timeout: 30000,
});
const one = async (db, sql, values = []) => (await db.query(sql, values)).rows[0];
const receipt = async (db, sql, values = []) => (await one(db, sql, values)).result;
const copy = (from, to) => cp(from, to, { recursive: true, force: false, errorOnExist: true, mode: constants.COPYFILE_EXCL });
let startedDirectory;

async function start(dir) {
  assert([source, restored].includes(dir) && samePath(await realpath(dir), dir), "Unexpected database directory");
  startedDirectory = dir;
  await control(["-D", dir, "-l", join(rehearsal, basename(dir) + ".log"), "-w", "-t", "30", "start"]);
}

async function stop() {
  assert([source, restored].includes(startedDirectory), "Unexpected database directory");
  await control(["-D", startedDirectory, "-m", "fast", "-w", "-t", "30", "stop"]);
  await assert.rejects(access(join(startedDirectory, "postmaster.pid")), { code: "ENOENT" });
  startedDirectory = undefined;
}

async function connected(name, directory, inspect) {
  const db = clientFor(name);
  try {
    await db.connect();
    const server = await one(db, `select current_setting('data_directory') as directory, version() as version,
      host(inet_server_addr()) as address, inet_server_port() as port,
      (select system_identifier::text from pg_control_system()) as system_identifier`);
    assert(samePath(server.directory, await realpath(directory)), "Connected to the wrong PostgreSQL data directory");
    assert.equal(server.address, host);
    assert.equal(server.port, port);
    assert.match(server.version, /^PostgreSQL 17\./);
    return await inspect(db, server);
  } finally {
    await db.end();
  }
}

async function applyMigrations(db, revision) {
  const testSuite = await readFile(join(repository, "scripts", "validate-schema.mjs"), "utf8");
  const prelude = testSuite.match(/async function prepareSupabasePrelude\(db\) \{\s*await db\.exec\(`([\s\S]*?)`\);/)?.[1];
  assert(prelude, "The embedded Supabase fixture prelude changed");
  await db.query("create extension citext; create extension pgcrypto");
  await db.query(prelude);
  const fingerprint = createHash("sha256");
  const counts = {};
  for (const directory of ["migrations", "migrations-contract"]) {
    const path = join(repository, "supabase", directory);
    const files = (await readdir(path)).filter((file) => file.endsWith(".sql")).sort();
    for (const name of files) {
      const sql = (await readFile(join(path, name), "utf8")).replaceAll("\r\n", "\n");
      fingerprint.update(directory + "/" + name + "\n" + sql + "\n");
      await db.query(sql).catch((error) => { throw new Error(directory + "/" + name + ": " + error.message, { cause: error }); });
    }
    counts[directory] = files.length;
  }
  const identity = { revision, counts, sha256: fingerprint.digest("hex") };
  await db.query("create table private.local_restore_fixture_identity (manifest jsonb not null, recorded_at timestamptz not null default now())");
  return identity;
}

const objectFixtures = ["signed_lease", "payment_evidence"].map((type) => {
  const contents = Buffer.from("Crecy local restore fixture\n" + type + "\nsynthetic bytes\n");
  return { type, contents, id: randomUUID(), version: randomUUID(), path: type + ".fixture", digest: sha256(contents) };
});
const bucket = "private-documents";

async function seed(db, identity) {
  const [admin, outsider] = [randomUUID(), randomUUID()];
  const today = await one(db, `select current_date::text as due, (current_date-30)::text as began,
    (current_date+180)::text as ends`);
  await db.query("insert into auth.users(id,email) values($1,'restore-admin@example.test'),($2,'restore-outsider@example.test')", [admin, outsider]);
  await db.query("set role service_role");
  const org = await receipt(db, `select public.create_organization_as_actor(
    $1,'Restore Fixture','restore-fixture','property_manager','US','en-US','America/New_York',
    'operator_terms@0.1.0-draft+privacy_notice@0.1.0-draft#0123456789abcdef','restore-create-organization'
  ) as result`, [admin]);
  const authenticate = (user) => db.query(`reset role; set role authenticated; set request.jwt.claim.sub='${user}'; set request.jwt.claim.aal='aal2'`);
  await authenticate(admin);
  const entity = await receipt(db, `select public.create_operating_entity_and_book(
    $1,'Restore Fixture LLC','Restore Fixture','US','company','USD','Restore book','restore-create-book') as result`, [org.organizationId]);
  const property = await receipt(db, `select public.create_property(
    $1,$2,$3,'US_NATIONAL','Restore Property','multifamily','1 Fixture Road',null,
    'Richmond','VA','23220','US','America/New_York','restore-create-property') as result`,
  [org.organizationId, entity.operatingEntityId, entity.accountingBookId]);
  const unit = await receipt(db, `select public.create_unit(
    $1,$2,null,'101','Apartment',2,1,850,'restore-create-unit') as result`, [org.organizationId, property.propertyId]);
  const owner = await receipt(db, `select public.create_owner_entity(
    $1,'Restore Owner','company',null,null,'restore-create-owner') as result`, [org.organizationId]);
  await receipt(db, `select public.create_ownership_interest(
    $1,$2,$3,1,$4,null,'restore-create-interest') as result`, [org.organizationId, property.propertyId, owner.ownerEntityId, today.began]);
  await db.query("reset role");
  await mkdir(join(sourceStorage, bucket), { recursive: true });
  for (const object of objectFixtures) {
    await db.query(`insert into public.documents(id,organization_id,property_id,unit_id,document_type,title,created_by)
      values ($1,$2,$3,$4,$5,'Synthetic restore document',$6)`,
    [object.id, org.organizationId, property.propertyId, unit.unitId, object.type, admin]);
    await db.query(`insert into public.document_versions(id,organization_id,document_id,version_number,storage_bucket,
      storage_path,mime_type,size_bytes,sha256_hex,original_filename,uploaded_by,upload_status)
      values ($1,$2,$3,1,$4,$5,'application/pdf',$6,$7,$5,$8,'clean')`,
    [object.version, org.organizationId, object.id, bucket, object.path, object.contents.length, object.digest, admin]);
    await db.query("insert into storage.objects(bucket_id,name,owner_id) values($1,$2,$3)", [bucket, object.path, admin]);
    await writeFile(join(sourceStorage, bucket, object.path), object.contents, { flag: "wx" });
  }
  await authenticate(admin);
  const household = { displayName: "Restore Fixture", members: [{ firstName: "Fixture", lastName: "Resident",
    email: "fixture-resident@example.test", primaryContact: true, financiallyResponsible: true }] };
  const lease = { source: "operator_supplied", externalReference: "RESTORE-101", startDate: today.began, endDate: today.ends,
    rentAmountMinor: 185000, currencyCode: "USD", rentFrequency: "monthly", signedDocumentId: objectFixtures[0].id };
  const activation = await receipt(db, `select public.activate_existing_lease(
    $1,$2,$3,$4::jsonb,$5::jsonb,42500,$6,'restore-activate-lease') as result`,
  [org.organizationId, property.propertyId, unit.unitId, JSON.stringify(household), JSON.stringify(lease), today.due]);
  await db.query("reset role; set role service_role");
  const generated = await receipt(db, `select public.generate_recurring_charges(
    $1,array[$2::uuid],'restore-rent-charge') as result`, [today.due, activation.chargeScheduleId]);
  assert.equal(generated.generatedCount, 1);
  await authenticate(admin);
  const payment = await receipt(db, `select public.record_manual_payment(
    $1,$2,'check',85000,'USD',now(),'Synthetic payment',$3,$4::jsonb,'RESTORE-CHECK','restore-record-payment') as result`,
  [org.organizationId, activation.tenancyId, objectFixtures[1].id, JSON.stringify([{ chargeId: generated.chargeIds[0], amountMinor: 85000 }])]);
  await db.query("reset role");
  const recorded = await one(db, "insert into private.local_restore_fixture_identity(manifest) values ($1::jsonb) returning recorded_at",
    [JSON.stringify(identity)]);
  return { admin, outsider, orgId: org.organizationId, propertyId: property.propertyId, unitId: unit.unitId,
    tenancyId: activation.tenancyId, ownerId: owner.ownerEntityId, paymentId: payment.paymentId, recordedAt: recorded.recorded_at };
}

async function inspectFixture(db, fixture, identity) {
  assert.deepEqual((await one(db, "select manifest from private.local_restore_fixture_identity")).manifest, identity);
  const result = await one(db, `select
    (select count(*)::int from public.organizations o
      join public.organization_subscriptions s on s.organization_id=o.id where o.id=$1) as subscriptions,
    (select count(*)::int from public.properties p join public.units u on u.property_id=p.id and u.organization_id=p.organization_id
      where p.organization_id=$1 and p.id=$2 and u.id=$3) as property_units,
    (select count(*)::int from public.tenancies t join public.household_members m on m.household_id=t.household_id
      where t.organization_id=$1 and t.unit_id=$3 and t.id=$4) as tenancy_members,
    (select count(*)::int from public.ownership_interests i join public.owner_entities o on o.id=i.owner_entity_id
      where i.organization_id=$1 and i.property_id=$2 and o.id=$5 and i.ownership_fraction=1) as ownership_interests,
    (select count(*)::int from auth.users where id in ($7,$8)) as auth_users,
    (select count(*)::int from public.payments p join public.payment_allocations a on a.payment_id=p.id
      where p.organization_id=$1 and p.tenancy_id=$4 and p.id=$6 and p.amount_minor=85000 and a.amount_minor=85000
         and p.manual_external_reference='RESTORE-CHECK' and p.receipt_document_id is not null) as payments,
    (select count(*)::int from pg_class where oid='public.payments'::regclass and relrowsecurity) as rls_enabled`,
  [fixture.orgId, fixture.propertyId, fixture.unitId, fixture.tenancyId, fixture.ownerId, fixture.paymentId, fixture.admin, fixture.outsider]);
  assert.deepEqual(result, { subscriptions: 1, property_units: 1, tenancy_members: 1, ownership_interests: 1,
    auth_users: 2, payments: 1, rls_enabled: 1 });
  const journals = (await db.query(`select t.id,t.transaction_type,count(e.id)::integer as entries,
    coalesce(sum(e.debit_minor)::integer,0) as debit,coalesce(sum(e.credit_minor)::integer,0) as credit
    from public.journal_transactions t left join public.journal_entries e on e.journal_transaction_id=t.id
    where t.organization_id=$1 group by t.id order by t.id`, [fixture.orgId])).rows;
  assert.equal(journals.length, 3);
  assert(journals.every(({ entries, debit, credit }) => entries === 2 && debit > 0 && debit === credit), "Unbalanced fixture journal");
  const objects = (await db.query(`select d.document_type,v.storage_bucket,v.storage_path,v.size_bytes,v.sha256_hex
    from public.documents d join public.document_versions v on v.document_id=d.id
    join storage.objects o on o.bucket_id=v.storage_bucket and o.name=v.storage_path
    where d.organization_id=$1 and v.id=any($2::uuid[]) order by d.document_type`,
  [fixture.orgId, objectFixtures.map((object) => object.version)])).rows;
  assert.equal(objects.length, 2);
  await db.query(`set role authenticated; set request.jwt.claim.sub='${fixture.admin}'`);
  const workspace = await receipt(db, "select public.get_operator_payment_summary($1) as result", [fixture.orgId]);
  assert(workspace, "Restored administrator could not read payment workspace");
  await db.query(`set request.jwt.claim.sub='${fixture.outsider}'`);
  await assert.rejects(db.query("select public.get_operator_payment_summary($1)", [fixture.orgId]), /ORGANIZATION_SCOPE_DENIED/);
  await db.query("reset role");
  return { ...result, journals, objects };
}

async function verifyObject(path, metadata) {
  const contents = await readFile(path);
  assert.equal(contents.length, Number(metadata.size_bytes), "Storage byte count mismatch");
  assert.equal(sha256(contents), metadata.sha256_hex, "Storage SHA-256 mismatch");
}

try {
  const { stdout: revision } = await run("git", ["rev-parse", "HEAD"], { cwd: repository, windowsHide: true });
  const { stdout: migrationChanges } = await run("git", ["status", "--porcelain", "--", "supabase/migrations", "supabase/migrations-contract"],
    { cwd: repository, windowsHide: true });
  assert(!migrationChanges, "Run the rehearsal with committed migrations");
  await writeFile(passwordFile, password + "\n", { flag: "wx", mode: 0o600 });
  await pg("initdb", ["-D", source, "--encoding=UTF8", "--locale=C", "--auth=scram-sha-256", "--username=postgres", "--pwfile=" + passwordFile]);
  await rm(passwordFile);
  await writeFile(join(source, "postgresql.auto.conf"), `listen_addresses = '${host}'\nport = ${port}\nshared_buffers = '32MB'\nmax_connections = 10\nlog_min_messages = 'warning'\n`);
  await start(source);
  await connected("postgres", source, (db) => db.query("create database " + database));
  const before = await connected(database, source, async (db, server) => {
    const identity = await applyMigrations(db, revision.trim());
    const fixture = await seed(db, identity);
    return { identity, fixture, server, checks: await inspectFixture(db, fixture, identity) };
  });
  await stop();
  const snapshotCutoff = new Date().toISOString();
  await copy(source, backup);
  await copy(sourceStorage, backupStorage);
  const controlDigest = sha256(await readFile(join(source, "global", "pg_control")));
  assert.equal(sha256(await readFile(join(backup, "global", "pg_control"))), controlDigest);
  const restoreStartedAt = new Date().toISOString();
  await copy(backup, restored);
  await copy(backupStorage, restoredStorage);
  assert.equal(sha256(await readFile(join(restored, "global", "pg_control"))), controlDigest);
  await start(restored);
  const after = await connected(database, restored, async (db, server) => {
    assert.equal(server.system_identifier, before.server.system_identifier);
    assert.equal(server.version, before.server.version);
    return inspectFixture(db, before.fixture, before.identity);
  });
  assert.deepEqual(after, before.checks);
  for (const object of after.objects) {
    const originals = objectFixtures.find((candidate) => candidate.path === object.storage_path);
    assert(originals && originals.digest === object.sha256_hex);
    await verifyObject(join(restoredStorage, object.storage_bucket, object.storage_path), object);
  }
  const restoreVerifiedAt = new Date().toISOString();
  const object = after.objects[0];
  const altered = await readFile(join(restoredStorage, object.storage_bucket, object.storage_path));
  altered[0] ^= 1;
  const mismatch = join(rehearsal, "same-size-corrupt.fixture");
  await writeFile(mismatch, altered, { flag: "wx" });
  await assert.rejects(verifyObject(mismatch, object), /Storage SHA-256 mismatch/);
  await assert.rejects(verifyObject(join(rehearsal, "absent.fixture"), object), { code: "ENOENT" });
  await stop();
  const endedAt = new Date().toISOString();
  const report = { snapshot: basename(rehearsal), engine: before.server.version.split(" on ")[0], host, port,
    systemIdentifier: before.server.system_identifier, checkout: before.identity, controlDigest,
    startedAt, snapshotCutoff, restoreStartedAt, restoreVerifiedAt, endedAt,
    lastFixtureWriteAt: before.fixture.recordedAt, recoveryTimeMs: Date.parse(restoreVerifiedAt) - Date.parse(restoreStartedAt),
    fixtureWritesLost: 0, checks: after, sameSizeCorruptionDetected: true, missingObjectDetected: true };
  await writeFile(join(rehearsal, "result.json"), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify(report));
} finally {
  if (startedDirectory && await access(join(startedDirectory, "postmaster.pid")).then(() => true, () => false)) await stop();
  await rm(passwordFile, { force: true });
}
