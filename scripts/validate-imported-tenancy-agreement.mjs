import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

export async function validateImportedTenancyAgreement(db, { assert, expectDatabaseError, migrationsApplied = false }) {
  await db.exec("reset role");
  if (!migrationsApplied) {
    await db.exec(await readFile(new URL("../supabase/migrations/20261122153644_attach_imported_tenancy_agreement.sql", import.meta.url), "utf8"));
  }

  const [actor, outsider, csvDocument, csvVersion, leaseDocument, oldVersion, cleanVersion, otherDocument, otherVersion] = Array.from({ length: 9 }, () => randomUUID());
  const rpc = async (sql, args = []) => (await db.query("select public." + sql + " as result", args)).rows[0].result;
  const act = async (user = actor) => {
    await db.exec("reset role; set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.aal','aal2',false),set_config('request.jwt.claims','',false)",[user]);
  };
  const service = () => db.exec("reset role; set role service_role");
  await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'import-agreement-owner@example.com',now()),($2,'import-agreement-other@example.com',now())",[actor,outsider]);
  await service();
  const { organizationId } = await rpc("create_organization_as_actor($1,'Import Agreement','import-agreement-fixture','property_manager','US','en-US','America/New_York','operator_terms@0.1.0-draft+privacy_notice@0.1.0-draft#0123456789abcdef',$2)",[actor,randomUUID()]);

  await db.exec("reset role");
  const due = (await db.query("select ((now() at time zone 'America/New_York')::date+3)::text as due")).rows[0].due;
  await db.query("insert into public.documents(id,organization_id,document_type,title,created_by) values($1,$2,'portfolio_import','Scheduled tenancy roster',$3)",[csvDocument,organizationId,actor]);
  const version = (versionId, documentId, sequence, parentKind, parentId, filename, mimeType) => db.query(
    "insert into public.document_versions(id,organization_id,document_id,version_number,storage_bucket,storage_path,mime_type,size_bytes,sha256_hex,original_filename,uploaded_by,upload_status) values($1,$2,$3,$4,'private-documents',$5,$6,250,$7,$8,$9,'clean')",
    [versionId,organizationId,documentId,sequence,["organizations",organizationId,parentKind,parentId,versionId,filename].join("/"),mimeType,"a".repeat(64),filename,actor],
  );
  await version(csvVersion,csvDocument,1,"organization",organizationId,"lease-roster.csv","text/csv");

  await act();
  await rpc("create_operating_entity_and_book($1,'Import Agreement LLC','Import Agreement','US','company','USD','Operating book',$2)",[organizationId,randomUUID()]);
  const row = {
    Property:"Import Agreement House",Type:"multifamily",Address:"5 Test Lane",City:"Norfolk",State:"VA",
    Postal:"23510",Country:"US",TZ:"America/New_York",Unit:"1",UnitType:"Apartment",
    First:"Import",Last:"Fixture",Email:"import-fixture@example.com",Start:due,Rent:"135000",Freq:"monthly",Currency:"USD",
  };
  const mapping = {
    propertyName:"Property",propertyType:"Type",addressLine1:"Address",locality:"City",subdivisionCode:"State",postalCode:"Postal",
    countryCode:"Country",timeZone:"TZ",unitCode:"Unit",unitType:"UnitType",primaryFirstName:"First",primaryLastName:"Last",
    primaryEmail:"Email",leaseStartDate:"Start",rentAmountMinor:"Rent",rentFrequency:"Freq",currencyCode:"Currency",
  };
  const { importJobId } = await rpc("create_import_job($1,'combined',$2,$3,$4::jsonb,$5::jsonb,$6)",
    [organizationId,csvDocument,csvVersion,JSON.stringify(Object.keys(row)),JSON.stringify([row]),randomUUID()]);
  const validation = await rpc("validate_combined_import($1,$2::jsonb,$3::jsonb)",[importJobId,JSON.stringify(mapping),JSON.stringify({dedupeMode:"strict",dateLocale:"en-US"})]);
  assert(validation.status === "ready", "Scheduled combined import did not validate: " + JSON.stringify(validation));
  const commitment = await rpc("commit_combined_import($1,$2)",[importJobId,validation.validationHash]);
  assert(commitment.status === "completed", "Scheduled combined import did not commit.");

  await db.exec("reset role");
  const tenancy = (await db.query("select * from public.tenancies where organization_id=$1",[organizationId])).rows[0];
  assert(tenancy.status === "scheduled", "Fixture importer did not reserve a scheduled tenancy.");
  await db.query("insert into public.documents(id,organization_id,property_id,unit_id,document_type,title,created_by) values($1,$2,$3,$4,'signed_lease','Exact imported lease',$5),($6,$2,$3,null,'signed_lease','Unrelated document',$5)",
    [leaseDocument,organizationId,tenancy.property_id,tenancy.unit_id,actor,otherDocument]);
  await version(oldVersion,leaseDocument,1,"unit",tenancy.unit_id,"old-signed.pdf","application/pdf");
  await version(cleanVersion,leaseDocument,2,"unit",tenancy.unit_id,"signed.pdf","application/pdf");
  await version(otherVersion,otherDocument,1,"property",tenancy.property_id,"unrelated.pdf","application/pdf");

  const get = () => rpc("get_imported_tenancy_agreement($1,$2)",[organizationId,tenancy.id]);
  const attach = (versionId, confirmed = true) => rpc("attach_imported_tenancy_agreement($1,$2,$3,$4)",[organizationId,tenancy.id,versionId,confirmed]);
  const evaluate = async () => {
    await service();
    await rpc("start_due_homeowner_tenancies($1,500)",[due + "T17:00:00Z"]);
    await db.exec("reset role");
    return (await db.query("select status from public.tenancies where id=$1",[tenancy.id])).rows[0].status;
  };

  assert(await evaluate() === "scheduled", "An import without scoped signed evidence started.");
  await act(outsider);
  await expectDatabaseError(() => get(),"ORGANIZATION_SCOPE_DENIED");
  await expectDatabaseError(() => attach(cleanVersion),"ORGANIZATION_SCOPE_DENIED");
  await act();
  const visible = await get();
  assert(visible.choices.length === 1 && visible.choices[0].versionId === cleanVersion && visible.unitId === tenancy.unit_id,
    "Imported agreement options included a different unit, stale version, or unrelated PDF.");
  await expectDatabaseError(() => attach(cleanVersion,false),"IMPORT_AGREEMENT_CONFIRMATION_REQUIRED");
  await expectDatabaseError(() => attach(oldVersion),"IMPORT_SIGNED_VERSION_UNAVAILABLE");
  await expectDatabaseError(() => attach(otherVersion),"IMPORT_SIGNED_VERSION_UNAVAILABLE");
  const filed = await attach(cleanVersion);
  assert(filed.tenancyId === tenancy.id && filed.versionId === cleanVersion && !filed.replayed
    && (await attach(cleanVersion)).replayed && (await get()).versionId === cleanVersion,"Imported evidence did not file exactly once.");
  await expectDatabaseError(() => attach(oldVersion),"IMPORT_AGREEMENT_UNAVAILABLE");
  assert(await evaluate() === "active", "Filing the clean scoped agreement did not unblock the scheduled import.");
  const audit = (await db.query("select (select count(*)::int from audit.audit_events where resource_id=$1 and action_code='lease.imported_agreement_attached') as entries,(select count(*)::int from public.tenancies where unit_id=$2) as tenants", [tenancy.lease_id,tenancy.unit_id])).rows[0];
  assert(audit.entries === 1 && audit.tenants === 1,"Attachment duplicated evidence or created an additional tenancy.");
  return { exactImportedEpisode:true, blockedBeforeFiling:true, activationEligibleAfterFiling:true, deniedStaleAndUnrelated:true, idempotent:true };
}
