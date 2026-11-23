import { createHash, randomUUID } from "node:crypto";

const sha = (value) => createHash("sha256").update(value).digest("hex");

export async function validateRentalEvidence(connection, options) {
  const context = (await connection.query(`select current_user as role,
    current_setting('request.jwt.claim.sub',true) as user_id,
    current_setting('request.jwt.claim.aal',true) as aal,
    current_setting('request.jwt.claims',true) as claims,
    current_setting('crecy.active_organization_id',true) as organization_id`)).rows[0];
  try {
    return await runEvidenceFixture(connection, options);
  } finally {
    await connection.exec("reset role");
    await connection.query(`select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.aal',$2,false),
      set_config('request.jwt.claims',$3,false),set_config('crecy.active_organization_id',$4,false)`,
    [context.user_id ?? "", context.aal ?? "", context.claims ?? "", context.organization_id ?? ""]);
    if (["authenticated", "anon", "service_role"].includes(context.role)) await connection.exec(`set role ${context.role}`);
  }
}

async function runEvidenceFixture(connection, { assert, expectDatabaseError, proveSelectedAgreement }) {
  const db = {
    exec: (sql) => connection.exec(sql),
    async query(sql, params) {
      try { return await connection.query(sql, params); }
      catch (error) { throw new Error(`${String(error.message)} in evidence fixture SQL: ${sql.trim().slice(0, 120)}`, { cause: error }); }
    },
  };
  const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
  const result = async (sql, params = []) => (await one(`select ${sql} as result`, params)).result;
  const actor = async (role, user = null, fresh = true) => {
    await db.exec(`reset role; set role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false),set_config('crecy.active_organization_id','',false)", [
      user ?? "", user ? JSON.stringify({ sub: user, aal: "aal2", amr: [{ method: "totp", timestamp: Math.floor(Date.now() / 1000) - (fresh ? 0 : 3600) }] }) : "",
    ]);
  };
  await db.exec("reset role");
  const source = await one(`select l.id,l.organization_id,l.property_id,p.time_zone,
    ((now() at time zone p.time_zone)::date+30)::text as move_in,
    (current_date-1)::text as score_observed_on,
    (select m.user_id from public.organization_memberships m where m.organization_id=l.organization_id
      and m.status='active' and m.role_code='org_owner' order by m.id limit 1) as reviewer
    from public.rental_listings l join public.properties p on p.id=l.property_id
    where l.title='Walkout apartment' and l.status='published' and l.visibility='unlisted'
    order by l.created_at desc limit 1`);
  assert(source?.reviewer, "Evidence test needs an active synthetic landlord and listing.");
  await actor("authenticated",source.reviewer);
  const freshUnit = await result("public.create_unit($1,$2,null,'EVIDENCE-01','Evidence fixture rental',2,1,750,$3)",
    [source.organization_id,source.property_id,`evidence-unit-${randomUUID()}`]);
  await db.exec("reset role");
  const seeded = await one(`insert into public.rental_listings(organization_id,property_id,unit_id,title,rent_amount_minor,currency_code,available_on,country_code,status,visibility,published_at,created_by)
    values($1,$2,$3,'Evidence fixture listing',132500,'USD',$4::date,'US','published','unlisted',now(),$5) returning id,public_id`,
    [source.organization_id,source.property_id,freshUnit.unitId,source.move_in,source.reviewer]);
  const listing = { ...source, ...seeded, unit_id: freshUnit.unitId };
  await db.query("update auth.users set email=coalesce(email,'b4-evidence-landlord@example.test'),email_confirmed_at=coalesce(email_confirmed_at,now()) where id=$1", [listing.reviewer]);

  const version = randomUUID();
  const laterVersion = randomUUID();
  const policy = randomUUID();
  const notice = "Synthetic intake notice for the restricted evidence fixture.";
  const applicant = randomUUID();
  const outsider = randomUUID();
  const email = "b4-restricted-evidence@example.test";
  const file = randomUUID();
  const claim = randomUUID();
  const fileSha = sha("fixture bytes");
  const documentTypes = ["credit_evidence", "identity", "income_evidence"];
  const requirements = { requirementsVersion: version, criteriaText: "Submit photo ID, income proof, and credit evidence",
    requiredDocumentTypes: documentTypes, acceptedAlternatives: "Income letter" };

  await db.query("insert into auth.users(id,email,email_confirmed_at) values ($1,$2,now()),($3,'evidence-outsider@example.test',now())",
    [applicant,email,outsider]);
  await db.query("update public.rental_listings set application_requirements=$2::jsonb where id=$1",
    [listing.id, JSON.stringify(requirements)]);
  const submit = (requirementsVersion = version, emailAddress = email) => result(
    "public.submit_rental_application_with_requirements($1,'Fixture','Applicant',$2,$3::date,'','',$4,'en-US',$5,$6)",
    [listing.public_id,emailAddress,listing.move_in,sha(emailAddress),randomUUID(),requirementsVersion]);
  await actor("service_role");
  await expectDatabaseError(() => submit(randomUUID()), "APPLICATION_REQUIREMENTS_CHANGED");
  await submit(version, "b4-evidence-policy-off@example.test");
  await db.exec("reset role");
  const policyOff = await one(`select s.requirements_version,e.application_id as packet
    from public.rental_applications a join private.rental_application_requirement_snapshots s on s.application_id=a.id
    left join private.rental_application_evidence_packets e on e.application_id=a.id where a.email='b4-evidence-policy-off@example.test'`);
  assert(policyOff?.requirements_version === version && policyOff.packet === null, "Criteria without an approved policy enabled restricted intake.");
  await db.query(`insert into private.rental_application_evidence_policies(id,organization_id,property_id,reviewer_user_id,
    notice_version,notice_text,allowed_document_types,allow_self_reported_score,terminal_retention_days,approved_at,approval_reference,enabled)
    values ($1,$2,$3,$4,'fixture-1',$5,array['identity','income_evidence','credit_evidence'],true,7,now(),'synthetic fixture',true)`,
    [policy,listing.organization_id,listing.property_id,listing.reviewer,notice]);

  await actor("service_role");
  assert((await submit()).accepted, "Restricted listing did not use the existing submit path.");
  await db.exec("reset role");
  const application = await one(`select a.id,a.public_reference,j.payload->>'verificationToken' as verification,e.requirements
    from public.rental_applications a join private.rental_application_verifications v on v.application_id=a.id
    join private.notification_jobs j on j.id=v.notification_job_id
    join private.rental_application_evidence_packets e on e.application_id=a.id where a.email=$1`,[email]);
  assert(application?.verification && application.requirements.requirementsVersion === version,"Application did not capture the exact approved criteria.");
  await db.query("update public.rental_listings set application_requirements=$2::jsonb where id=$1",
    [listing.id, JSON.stringify({ ...requirements, requirementsVersion: laterVersion })]);
  await actor("service_role");
  const verified = await result("public.verify_public_rental_application($1)",[application.verification]);
  const ref = application.public_reference;
  const openMine = () => result("public.get_my_rental_application_evidence($1)",[ref]);
  const bind = (token) => result("public.bind_rental_application_evidence($1,$2)",[ref,token]);
  const read = (fileId = file) => result("public.authorize_rental_evidence_file($1,null,null,null,$2)",[ref,fileId]);
  const draft = (packetVersion, digest = sha(notice), scoreSource = "credit_bureau", scoreDate = listing.score_observed_on) => result(
    "public.save_rental_application_evidence_draft($1,$2,712,$3,$4::date,'{}','fixture-1',$5)",
    [ref,packetVersion,scoreSource,scoreDate,digest]);
  const submitEvidence = (packetVersion, acknowledge = true, current = laterVersion) => result(
    "public.submit_rental_application_evidence($1,$2,$3,$4)",[ref,packetVersion,acknowledge,current]);
  const reviewArgs = [listing.organization_id,application.id,listing.unit_id];
  const readReview = () => result("public.get_rental_application_evidence_review($1,$2,$3)",reviewArgs);
  const review = (packetVersion, action, types) => result("public.review_rental_application_evidence($1,$2,$3,$4,$5,$6)",
    [...reviewArgs,packetVersion,action,types]);
  await actor("authenticated",applicant,false);
  await expectDatabaseError(openMine,"EVIDENCE_RECENT_MFA_REQUIRED");
  await actor("authenticated",outsider);
  await expectDatabaseError(openMine,"EVIDENCE_UNAVAILABLE");
  await actor("authenticated",applicant);
  await expectDatabaseError(() => bind("1".repeat(64)),"EVIDENCE_APPLICATION_CLAIM_REQUIRED");
  const bound = await bind(verified.accessToken);
  assert(bound.bound && bound.requirements.requirementsVersion === version && bound.currentRequirementsVersion === laterVersion,
    "The applicant claim lost its original criteria or live comparison version.");
  await expectDatabaseError(() => draft(bound.version,"1".repeat(64)),"EVIDENCE_NOTICE_CHANGED");
  await expectDatabaseError(() => draft(bound.version,sha(notice),"unapproved source"),"EVIDENCE_DRAFT_INVALID");
  await expectDatabaseError(() => draft(bound.version,sha(notice),"credit_bureau","2999-01-01"),"EVIDENCE_DRAFT_INVALID");
  const saved = await draft(bound.version);
  assert(saved.score === 712 && saved.scoreSource === "credit_bureau" && saved.scoreObservedOn === listing.score_observed_on && saved.consented === true,
    "The private consent and score provenance were not recorded.");
  await expectDatabaseError(() => submitEvidence(saved.version),"EVIDENCE_REQUIREMENTS_INCOMPLETE");
  const grant = await result("public.start_rental_application_evidence_upload($1,$2,$3,'income_evidence','application/pdf',13,$4)",
    [ref,saved.version,file,fileSha]);
  const store = (owner, path) => db.query("insert into storage.objects(bucket_id,name,owner_id) values ('private-rental-evidence',$1,$2)",[path,owner]);
  assert(grant.id === file,"Exact object upload grant was denied.");
  await store(applicant,grant.objectKey);
  assert((await one("select count(*)::int as count from storage.objects where bucket_id='private-rental-evidence'")).count === 0,
    "An applicant could list restricted bytes through Storage.");
  await expectDatabaseError(read,"EVIDENCE_UNAVAILABLE");
  await expectDatabaseError(() => result("public.finish_rental_application_evidence_upload($1,$2,13,$3)",[applicant,file,fileSha]),"permission denied");
  await actor("authenticated",outsider);
  await expectDatabaseError(() => store(outsider,grant.objectKey),"row-level security");
  await actor("service_role");
  await result("public.finish_rental_application_evidence_upload($1,$2,13,$3)",[applicant,file,fileSha]);
  const claimed = await result("public.claim_rental_evidence_scan($1)",[claim]);
  assert(claimed.id === file,"The guarded scanner did not claim the finalized file.");
  assert(!await result("public.settle_rental_evidence_scan($1,$2,'clean',$3)",[randomUUID(),file,fileSha]),"A stale worker settled another claim.");
  assert(await result("public.settle_rental_evidence_scan($1,$2,'clean',$3)",[claim,file,fileSha]),"Current scan could not release the file.");
  await actor("authenticated",applicant);
  assert((await read()).objectKey === grant.objectKey,"A clean file could not be authorized on its exact application.");
  const objectGrants = [grant];
  async function addScannedEvidence(documentType, packetVersion) {
    const id = randomUUID();
    const synthetic = `Fictional ${documentType} fixture`;
    const digest = sha(synthetic);
    const size = Buffer.byteLength(synthetic);
    const other = await result("public.start_rental_application_evidence_upload($1,$2,$3,$4,'application/pdf',$5,$6)",
      [ref,packetVersion,id,documentType,size,digest]);
    objectGrants.push(other);
    await store(applicant,other.objectKey);
    await actor("service_role");
    await result("public.finish_rental_application_evidence_upload($1,$2,$3,$4)",[applicant,id,size,digest]);
    assert((await result("public.claim_rental_evidence_scan($1)",[claim])).id === id,"The scanner did not claim the exact synthetic file.");
    assert(await result("public.settle_rental_evidence_scan($1,$2,'clean',$3)",[claim,id,digest]),"The file could not be released.");
    await actor("authenticated",applicant);
    assert((await read(id)).objectKey === other.objectKey,"The clean document was not available inside the exact packet.");
  }
  for (const documentType of ["identity", "credit_evidence"]) await addScannedEvidence(documentType, saved.version);
  await expectDatabaseError(() => submitEvidence(saved.version,false),"EVIDENCE_REQUIREMENTS_ACKNOWLEDGMENT_REQUIRED");
  await expectDatabaseError(() => submitEvidence(saved.version,true,version),"EVIDENCE_REQUIREMENTS_ACKNOWLEDGMENT_REQUIRED");
  const submitted = await submitEvidence(saved.version);
  await actor("authenticated",outsider);
  await expectDatabaseError(readReview,"ORGANIZATION_SCOPE_DENIED");
  await actor("authenticated",listing.reviewer);
  const reviewPacket = await readReview();
  assert(reviewPacket.score === 712 && reviewPacket.files.length === documentTypes.length,
    "The designated reviewer did not receive the full private packet.");
  await expectDatabaseError(() => review(submitted.version,"select",[]),"EVIDENCE_REVIEW_CHECKLIST_INCOMPLETE");
  await expectDatabaseError(() => review(submitted.version,"decline",[]),"EVIDENCE_CREDIT_DECISION_REQUIRES_APPROVED_NOTICE_WORKFLOW");
  const correction = await review(submitted.version,"request_changes",["income_evidence"]);
  assert((await review(submitted.version,"request_changes",["income_evidence"])).version === correction.version,"Review retry was not idempotent.");
  assert((await readReview()).status === "changes_requested","The reviewer could not see the correction status.");
  await expectDatabaseError(() => result("public.authorize_rental_evidence_file(null,$1,$2,$3,$4)",[...reviewArgs,file]),"EVIDENCE_UNAVAILABLE");
  await actor("authenticated",applicant);
  await expectDatabaseError(read,"EVIDENCE_UNAVAILABLE");
  await expectDatabaseError(() => submitEvidence(correction.version),"EVIDENCE_REQUIREMENTS_INCOMPLETE");
  await addScannedEvidence("income_evidence", correction.version);
  const resubmitted = await submitEvidence(correction.version);
  await db.exec("reset role");
  await expectDatabaseError(() => db.query("update public.rental_applications set status='lease_preparation',lease_prepared_at=now() where id=$1",[application.id]),"APPLICANT_EVIDENCE_REVIEW_REQUIRED");
  await actor("authenticated",listing.reviewer);
  assert((await review(resubmitted.version,"select",documentTypes)).status === "selected","Explicit review did not select the applicant.");
  const signedAgreement = proveSelectedAgreement ? await proveSelectedAgreement(connection, {
    organizationId: listing.organization_id, propertyId: listing.property_id, unitId: listing.unit_id,
    applicationId: application.id, applicantId: applicant, reviewerId: listing.reviewer, email, reference: ref,
  }) : null;
  await actor("service_role");
  await result("public.withdraw_public_rental_application($1,$2)",[verified.accessToken,randomUUID()]);
  await actor("authenticated",applicant);
  await expectDatabaseError(read,"EVIDENCE_UNAVAILABLE");
  await db.exec("reset role");
  await db.query("update private.rental_application_evidence_packets set purge_after=now()-interval '1 hour', legal_hold_at=now() where application_id=$1",[application.id]);
  await actor("service_role");
  assert((await result("public.claim_rental_evidence_purge($1,10)",[claim])).length === 0,"A held packet was claimed for purge.");
  await db.exec("reset role");
  await db.query("update private.rental_application_evidence_packets set legal_hold_at=null where application_id=$1",[application.id]);
  await actor("service_role");
  const purge = await result("public.claim_rental_evidence_purge($1,10)",[claim]);
  assert(purge.length === objectGrants.length && objectGrants.every((item) => purge.some((row) => row.id === item.id)),
    "The eligible terminal files were not scheduled for purge.");
  await db.exec("reset role");
  await db.query("delete from storage.objects where bucket_id='private-rental-evidence' and name=any($1::text[])",
    [objectGrants.map((item) => item.objectKey)]);
  await actor("service_role");
  for (const object of objectGrants) {
    assert(await result("public.complete_rental_evidence_purge($1,$2)",[claim,object.id]),"Completed object purge was not recorded.");
  }
  await db.exec("reset role");
  const erased = await one(`select bool_and(f.status='purged' and f.sha256 is null) as all_purged,
    e.self_reported_credit_score,e.self_reported_score_source,e.self_reported_score_observed_on,e.status
    from private.rental_application_evidence_packets e
    join private.rental_application_evidence_files f on f.application_id=e.application_id where e.application_id=$1
    group by e.application_id`,[application.id]);
  assert(erased.all_purged && erased.self_reported_credit_score === null && erased.self_reported_score_source === null
    && erased.self_reported_score_observed_on === null && erased.status === "closed","Purge retained restricted derivatives.");
  return { defaultOff: true, exactRequirements: true, exactAuth: true, restrictedStorage: true,
    fencedScan: true, allRequiredDocumentTypes: true, replacementRequired: true, requirementsAcknowledged: true, scoreProvenance: true, manualVersionedReview: true,
    creditDecisionGuard: true, terminalPurge: true, signedAgreement };
}
