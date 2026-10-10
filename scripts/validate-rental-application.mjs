import { validateRentalApplicationLifecycle } from "./validate-rental-application-lifecycle.mjs";

// B4 installation smoke check. Not a substitute for behavioral lifecycle tests.
export async function validateRentalApplication(db, { assert, expectDatabaseError }) {
  const result = await db.query(
    "select count(*)::int n from pg_tables where schemaname='public' and tablename='rental_applications'"
  );
  assert(result.rows[0].n === 1, "Rental applications table is missing.");
  const guard = (await db.query(
    "select tgdeferrable, tginitdeferred, tgtype from pg_trigger where tgname='rental_application_tenancy_activation_guard'"
  )).rows[0];
  assert(guard?.tgdeferrable && guard?.tginitdeferred,
    "Application tenancy bypass guard must run at the commit boundary.");
  assert((guard.tgtype & 4) === 4 && (guard.tgtype & 16) === 16,
    "Application guard must cover new tenancies and scheduled-to-active tenancy updates.");
  const scope = (await db.query(
    "select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='rental_applications'"
  )).rows[0];
  assert(scope?.relrowsecurity === true, "Applicant identity table must enforce row-level security.");
  // Negative public boundaries are executable, not merely grant-structure assertions.
  await db.exec("reset role; set role anon");
  await expectDatabaseError(
    () => db.query("select id from public.rental_applications"),
    "permission denied",
  );
  await expectDatabaseError(
    () => db.query("select public.verify_public_rental_application($1)", ["a".repeat(64)]),
    "permission denied",
  );
  await expectDatabaseError(
    () => db.query("select public.get_public_rental_application_for_access($1)", ["a".repeat(64)]),
    "permission denied",
  );
  await expectDatabaseError(
    () => db.query("select public.withdraw_public_rental_application($1,$2)", ["a".repeat(64), "anon-withdraw-0001"]),
    "permission denied",
  );
  await db.exec("reset role; set role service_role");
  const unknownVerification = (await db.query(
    "select public.verify_public_rental_application($1) as result", ["e".repeat(64)],
  )).rows[0].result;
  assert(unknownVerification.verified === false, "Unknown application verification token was accepted.");
  const unknownAccess = (await db.query(
    "select public.get_public_rental_application_for_access($1) as result", ["f".repeat(64)],
  )).rows[0].result;
  assert(unknownAccess === null, "Unknown application capability disclosed an application.");
  await expectDatabaseError(
    () => db.query("select public.withdraw_public_rental_application($1,$2)", ["f".repeat(64), "unknown-withdraw-0001"]),
    "APPLICATION_ACCESS_NOT_FOUND",
  );
  await db.exec("reset role");
  const positive = await validateRentalApplicationLifecycle(db, { assert, expectDatabaseError });
  return { positive, schemaPresent: true, rowLevelSecurityEnabled: true,
    deferredTenancyGuardPresent: true, anonymousReadDenied: true,
    anonymousVerifyDenied: true, anonymousStatusDenied: true,
    anonymousWithdrawalDenied: true, unknownTokenDenied: true,
    unknownCapabilityDenied: true, unauthorizedWithdrawalDenied: true,
    // This flag certifies the application/database lifecycle exercised above.
    // Production hostname/proxy attachment is a separate release prerequisite.
    lifecycleCertified: true };
}
