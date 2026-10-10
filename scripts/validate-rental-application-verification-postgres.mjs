// Runs the actual B4 verification RPC on a disposable, localhost-only PostgreSQL
// test database. Covers first use, replay, expiry, and concurrent lock ordering.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { execFileSync, spawn } from "node:child_process";
import { resolve } from "node:path";

const host = "127.0.0.1", port = "55439", adminDb = "postgres";
const database = `crecy_b4_verify_${randomBytes(5).toString("hex")}`;
const sql = await readFile(resolve(import.meta.dirname,
  "../supabase/migrations/20261008020000_verified_rental_applications.sql"), "utf8");
const from = sql.indexOf("create or replace function public.verify_public_rental_application(p_token text)");
const to = sql.indexOf("revoke all on function public.verify_public_rental_application(text)", from);
if (from < 0 || to < 0) throw new Error("B4 verification function extraction failed");
const definition = sql.slice(from, to);
const args = (db, statement) => ["-X", "-v", "ON_ERROR_STOP=1", "-h", host, "-p", port,
  "-d", db, "--tuples-only", "--no-align", "-c", statement];
function execute(db, statement) {
  return execFileSync("psql", args(db, statement), {
    encoding: "utf8", timeout: 12000, stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
function concurrent(db, statement) {
  return new Promise((resolve) => {
    const child = spawn("psql", args(db, statement));
    let out = "", err = "";
    child.stdout.on("data", (buffer) => { out += buffer.toString(); });
    child.stderr.on("data", (buffer) => { err += buffer.toString(); });
    child.on("error", (error) => resolve({ code: -1, out, err: error.message }));
    child.on("close", (code) => resolve({ code, out: out.trim(), err }));
  });
}
const hash = (token) => createHash("sha256").update(token).digest("hex");
const rpc = (token) => `select public.verify_public_rental_application('${token}')`;
const organization = randomUUID(), listing = randomUUID(), unit = randomUUID();
function seed(token, expires = "now()+interval '60 minutes'") {
  const appId = randomUUID(), notificationId = randomUUID();
  execute(database, `
    insert into public.rental_applications
      (id,organization_id,unit_id,listing_id,public_reference,status)
      values('${appId}','${organization}','${unit}','${listing}',
        'APP-${randomBytes(6).toString("hex").toUpperCase()}','pending_verification');
    insert into private.notification_jobs(id,status) values('${notificationId}','queued');
    insert into private.rental_application_verifications
      (application_id,organization_id,token_hash,expires_at,notification_job_id)
      values('${appId}','${organization}','${hash(token)}',${expires},'${notificationId}');
  `);
  return { appId, notificationId };
}
const parse = (value) => JSON.parse(value.trim().split("\n").at(-1));
let created = false;
try {
  if (execute(adminDb, "select current_setting('data_directory')") !== "/tmp/crecy-b4-local-pg-guard") {
    throw new Error("Refusing verification fixture: unexpected PostgreSQL cluster identity.");
  }
  execute(adminDb, `create database ${database}`);
  created = true;
  execute(database, `
    create schema private; create schema audit;
    create table public.rental_applications(
      id uuid primary key, organization_id uuid, unit_id uuid, listing_id uuid,
      public_reference text, status text, verified_at timestamptz,
      updated_at timestamptz default now(), version integer default 1);
    create table private.rental_application_verifications(
      application_id uuid, organization_id uuid, token_hash text,
      expires_at timestamptz, consumed_at timestamptz, notification_job_id uuid);
    create table private.rental_application_access(
      application_id uuid, organization_id uuid, token_hash text, expires_at timestamptz);
    create table private.notification_jobs(id uuid, status text, last_error text);
    create table audit.audit_events(
      organization_id uuid, actor_type text, action_code text, resource_type text,
      resource_id uuid, correlation_id uuid, after_data jsonb);
    create table private.outbox_events(
      organization_id uuid, event_type text, aggregate_type text, aggregate_id uuid,
      correlation_id uuid, payload jsonb);
    ${definition}
  `);
  if (parse(execute(database, rpc("f".repeat(64)))).verified !== false)
    throw new Error("Unknown verification credential accepted");
  const token1 = "1".repeat(64);
  const first = seed(token1);
  const verified = parse(execute(database, rpc(token1)));
  if (verified.verified !== true || !/^[0-9a-f]{64}$/.test(verified.accessToken ?? ""))
    throw new Error("First-time verification did not issue an access credential");
  const replay = parse(execute(database, rpc(token1)));
  if (replay.verified !== true || replay.accessToken !== undefined)
    throw new Error("Consumed verification token replay issued a second credential");
  if (Number(execute(database, `select count(*) from private.rental_application_access
      where application_id='${first.appId}'`)) !== 1)
    throw new Error("Expected exactly one capability credential for verified applicant");
  const expiredToken = "2".repeat(64);
  const expired = seed(expiredToken, "now()-interval '1 hour'");
  if (parse(execute(database, rpc(expiredToken))).verified !== false)
    throw new Error("Expired credential verified");
  if (execute(database, `select a.status||':'||j.status from public.rental_applications a
    join private.rental_application_verifications v on v.application_id=a.id
    join private.notification_jobs j on j.id=v.notification_job_id
    where a.id='${expired.appId}'`) !== "expired:canceled")
    throw new Error("Expired verification did not invalidate application and notification");
  const token3 = "3".repeat(64);
  const raced = seed(token3);
  const [verifyA, verifyB] = await Promise.all([
    concurrent(database, rpc(token3)), concurrent(database, rpc(token3)),
  ]);
  if (verifyA.code !== 0 || verifyB.code !== 0)
    throw new Error(`Concurrent verify failed or deadlocked: ${JSON.stringify({verifyA,verifyB})}`);
  const raceResults = [parse(verifyA.out), parse(verifyB.out)];
  if (raceResults.some((result) => !result.verified) ||
      raceResults.filter((result) => result.accessToken !== undefined).length !== 1)
    throw new Error("Concurrent verify must return one credential and one harmless replay");
  if (Number(execute(database, `select count(*) from private.rental_application_access
    where application_id='${raced.appId}'`)) !== 1)
    throw new Error("Concurrent first-use issued duplicate application capabilities");
  const token4 = "4".repeat(64), expiring = seed(token4);
  const expiration = concurrent(database, `begin;
    select id from public.rental_applications where id='${expiring.appId}' for update;
    select pg_sleep(0.6);
    update public.rental_applications set status='expired' where id='${expiring.appId}';
    update private.rental_application_verifications set consumed_at=now()
      where application_id='${expiring.appId}';
    commit`);
  await new Promise((resolve) => setTimeout(resolve, 120));
  const verificationRace = concurrent(database, rpc(token4));
  const [expireResult, verifyResult] = await Promise.all([expiration, verificationRace]);
  if (expireResult.code !== 0 || verifyResult.code !== 0 ||
      parse(verifyResult.out).verified !== false)
    throw new Error(`Verification vs expiration lock race failed: ${JSON.stringify({expireResult,verifyResult})}`);
  console.log(JSON.stringify({
    isolatedPostgresVerification: true,
    realRpcFirstUse: true, replayDoesNotLeakAccess: true, expiredTokenRejected: true,
    concurrentVerificationSingleCredential: true,
    verificationVsExpirationNoDeadlock: true,
    fullApplicationConcurrencyCertified: false,
  }));
} finally {
  if (created) execute(adminDb, `drop database ${database} with (force)`);
}
