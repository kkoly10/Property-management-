import { createHash, randomUUID } from "node:crypto";

export async function validateFirstTimeAgreementSigning(db, {
  assert, expectDatabaseError, assertNotifications = false, assertActivity = false, assertDelivery = false, assertRecovery = false,
  assertMoveIn = false,
}) {
  await db.exec("reset role");
  const owner = randomUUID();
  const renter = randomUUID();
  const outsider = randomUUID();
  const email = "first-time-renter@example.test";
  await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'signing-owner@example.test',now()),($2,'wrong-account@example.test',now())",
    [owner, outsider]);
  const rpc = async (sql, values = []) => (await db.query("select public." + sql + " as result", values)).rows[0].result;
  const role = async (databaseRole, actor, aal = "aal1") => {
    await db.exec("reset role; set role " + databaseRole);
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.aal',$2,false),set_config('request.jwt.claims','',false)",
      [actor ?? "", aal]);
  };
  const operator = () => role("authenticated", owner, "aal2");
  const service = () => role("service_role");
  await service();
  const { organizationId } = await rpc("create_organization_as_actor($1,'Signing Fixture','signing-fixture','self_managing','US','en-US','America/New_York','operator_terms@0.1.0-draft+privacy_notice@0.1.0-draft#0123456789abcdef',$2)", [owner, randomUUID()]);
  await operator();
  const { unitId, propertyId } = await rpc("create_homeowner_rental($1,$2::jsonb,$3)", [organizationId, JSON.stringify({
    property: { kind: "new", accountingBookId: null, legalName: "Signing Fixture Owner", entityType: "individual",
      name: "Signing House", addressLine1: "45 Fixture Road", addressLine2: "", locality: "Richmond",
      subdivisionCode: "VA", postalCode: "23220", countryCode: "US", timeZone: "America/New_York" },
    space: { name: "Suite", type: "basement", bedrooms: 1, bathrooms: 1, entrance: "private",
      kitchen: "private", bathroom: "private", laundry: "shared", utilitiesNotes: "", parkingNotes: "" },
  }), randomUUID()]);
  await db.exec("reset role");
  const { rows: [{ start, end }] } = await db.query("select (current_date+10)::text as start,(current_date+180)::text as end");
  const [listing, application, doc, oldVersion, version, agreement] = Array.from({ length: 6 }, () => randomUUID());
  await db.query(`insert into public.rental_listings(id,organization_id,property_id,unit_id,title,rent_amount_minor,currency_code,
    available_on,country_code) values($1,$2,$3,$4,'Signing house',100000,'USD',$5,'US')`, [listing, organizationId, propertyId, unitId, start]);
  await db.query(`insert into public.rental_applications(id,public_reference,organization_id,listing_id,property_id,unit_id,
    first_name,last_name,email,desired_move_in_on,listing_title_snapshot,listing_rent_amount_minor,currency_code,
    listing_available_on,status,verified_at) values($1,'APP-A712C3DE9901',$2,$3,$4,$5,'Test','Applicant',$6,$7,
      'Signing house',100000,'USD',$7,'submitted',now())`, [application, organizationId, listing, propertyId, unitId, email, start]);
  await db.query(`insert into public.documents(id,organization_id,property_id,unit_id,document_type,title,created_by)
    values($1,$2,$3,$4,'rental_agreement_source','Signing fixture PDF',$5)`, [doc, organizationId, propertyId, unitId, owner]);
  const sha = "c".repeat(64);
  const addVersion = (id, number) => db.query(`insert into public.document_versions(id,organization_id,document_id,version_number,
    storage_bucket,storage_path,mime_type,size_bytes,sha256_hex,original_filename,uploaded_by,upload_status)
    values($1,$2,$3,$4,'private-documents',$5,'application/pdf',100,$6,'agreement.pdf',$7,'clean')`,
  [id, organizationId, doc, number, `organizations/${organizationId}/unit/${unitId}/${id}/agreement.pdf`, sha, owner]);
  // These are file quarantine-result fixtures. They do not certify a provider.
  await addVersion(oldVersion, 1);
  await addVersion(version, 2);
  await operator();
  const prepared = await rpc("prepare_rental_application_lease($1,$2,1,$3)", [organizationId, application, randomUUID()]);
  const getDraft = () => rpc("get_homeowner_lease_episode($1,$2,$3,null,false)", [organizationId, unitId, prepared.setupId]);
  const save = (current, changes) => rpc("save_homeowner_lease_episode($1,$2,$3,$4,$5::jsonb,$6)",
    [organizationId, unitId, prepared.setupId, current.revision, JSON.stringify({ ...current.draft, ...changes }), randomUUID()]);
  const draft = await save(await getDraft(), { endDate: end, startDate: start, firstChargeDueDate: start,
    rentAmount: "1000.00", openingBalance: "0", documentVersionId: "", occupancy: "future" });
  const send = (selected = version, revision = draft.revision, id = agreement) => rpc(
    "send_rental_application_agreement($1,$2,$3,$4,$5,$6,$7,14,true,true)",
    [organizationId, application, prepared.setupId, prepared.applicationVersion, revision, id, selected],
  );
  await expectDatabaseError(() => send(oldVersion), "AGREEMENT_SOURCE_UNAVAILABLE");
  await expectDatabaseError(() => send(version, draft.revision - 1), "APPLICATION_SIGNING_SETUP_CHANGED");
  await expectDatabaseError(() => rpc("issue_rental_application_agreement($1,$2,$3,$4,$5,$6,14,true)",
    [organizationId, application, prepared.setupId, prepared.applicationVersion, randomUUID(), version]), "permission denied");
  assert((await send()).status==="open" && (await send()).replayed, "First-time issue was not durable and idempotent.");
  assert((await rpc("get_rental_agreement($1,$2)", [agreement, organizationId])).requiredCount===2,
    "An unclaimed renter disappeared from the signature requirements.");
  await expectDatabaseError(() => save(draft, { rentAmount: "1075.00" }), "APPLICATION_AGREEMENT_TERMS_LOCKED");
  await db.exec("reset role");
  await expectDatabaseError(() => addVersion(randomUUID(), 3), "APPLICATION_AGREEMENT_PDF_LOCKED");
  const { rows: [invite] } = await db.query(`select j.id as job_id,j.payload->>'signingInvitationToken' as token,
    c.token_hash as digest,j.recipient_address as address
    from private.rental_agreement_signer_claims c join private.notification_jobs j on j.id=c.notification_job_id
    where c.agreement_id=$1`, [agreement]);
  assert(invite.address===email && invite.digest===createHash("sha256").update(invite.token).digest("hex"),
    "Invitation delivery did not bind the exact scoped credential.");
  if (assertDelivery) {
    const readDelivery = (org = organizationId, id = agreement) =>
      rpc("get_rental_agreement_invitation_delivery($1,$2)", [org, id]);
    await operator();
    const queued = await readDelivery();
    assert(queued.agreementId===agreement && queued.state==="queued" && queued.reissue===null
      && Object.keys(queued).sort().join(",")===(assertRecovery ? "agreementId,reissue,resendEligible,state" : "agreementId,reissue,state")
      && (!assertRecovery || queued.resendEligible===true),
      "Expected the exact invite to expose queue status without recipient or credential fields.");
    await expectDatabaseError(() => readDelivery(null), "AGREEMENT_FORBIDDEN");
    await expectDatabaseError(() => readDelivery(organizationId, randomUUID()), "AGREEMENT_FORBIDDEN");
    await role("authenticated", outsider);
    await expectDatabaseError(() => readDelivery(), "ORGANIZATION_SCOPE_DENIED");

    await db.exec("reset role; begin");
    try {
      await db.query("update private.notification_jobs set status='failed' where id=$1", [invite.job_id]);
      await operator();
      assert((await readDelivery()).state==="delayed", "A queue failure awaiting retry was shown as permanent.");
      await db.exec("reset role");
      await db.query("update private.notification_jobs set status='dead_letter' where id=$1", [invite.job_id]);
      await operator();
      assert((await readDelivery()).state==="failed", "An exhausted queue job did not show failure.");
      await db.exec("reset role");
      const providerId = randomUUID();
      await db.query("update private.notification_jobs set status='queued' where id=$1", [invite.job_id]);
      await db.query(`insert into private.notification_deliveries(notification_job_id,provider_code,provider_message_id,status)
        values($1,'relay',$2,'accepted')`, [invite.job_id, providerId]);
      await operator();
      assert((await readDelivery()).state==="accepted", "Provider acceptance was not distinguished from delivery.");
      for (const [index, receipt, state] of [[1, "delayed", "delayed"], [2, "delivered", "delivered"], [3, "bounced", "failed"]]) {
        await service();
        assert(await rpc("record_resend_notification_event($1,$2,$3,$4)",
          [`msg_${randomUUID()}`, providerId, receipt, `2026-01-01T00:00:0${index}Z`]),
        "The local provider receipt could not be recorded.");
        await operator();
        assert((await readDelivery()).state===state, `The exact invite did not reflect provider receipt ${receipt}.`);
      }
      await db.exec("reset role");
      await db.query("update private.notification_jobs set payload=jsonb_set(payload,'{agreementId}',to_jsonb($2::text)) where id=$1",
        [invite.job_id, randomUUID()]);
      await db.query(`update private.rental_agreements set issued_at=now()-interval '2 days',expires_at=now()-interval '1 day'
        where id=$1`, [agreement]);
      await operator();
      const expired = await readDelivery();
      assert(expired.state===null && expired.reissue.applicationId===application && expired.reissue.unitId===unitId
        && (!assertRecovery || expired.resendEligible===false)
        && Object.keys(expired.reissue).sort().join(",")==="applicationId,unitId",
        "An unrelated job was correlated, or the expired invitation lost its exact authorized application return.");
    } finally {
      await db.exec("rollback; reset role");
    }
  }
  let activeDigest = invite.digest;
  const resend = (operationId = randomUUID()) => rpc("resend_rental_agreement_invitation($1,$2,$3)",
    [organizationId, agreement, operationId]);
  if (assertRecovery) {
    await role("anon");
    await expectDatabaseError(() => resend(), "permission denied");
    await role("authenticated", outsider, "aal2");
    await expectDatabaseError(() => resend(), "ORGANIZATION_SCOPE_DENIED");
    await role("authenticated", owner);
    await expectDatabaseError(() => resend(), "MFA_REQUIRED");
    await operator();
    await expectDatabaseError(() => resend(), "AGREEMENT_INVITATION_RESEND_COOLDOWN");
    let previous = invite.job_id;
    for (let attempt=0; attempt<3; attempt++) {
      await db.exec("reset role");
      await db.query("update private.notification_jobs set created_at=now()-interval '6 minutes' where id=$1", [previous]);
      await operator();
      const operationId = randomUUID();
      const updated = await resend(operationId);
      const replay = await resend(operationId);
      assert(updated.agreementId===agreement && !updated.replayed && replay.replayed
        && updated.notificationJobId===replay.notificationJobId && updated.notificationJobId!==previous,
        "Retry rotated the exact agreement a second time.");
      await db.exec("reset role");
      const { rows: [mail] } = await db.query(`select j.id,j.recipient_address,j.payload->>'signingInvitationToken' token,
        j.payload->>'agreementId' agreement_id,c.token_hash,
        c.expires_at=a.expires_at and (j.payload->>'expiresAt')::timestamptz=a.expires_at as keeps_expiry,
        old.status='canceled' and not (old.payload ? 'signingInvitationToken') as replaced
        from private.rental_agreement_signer_claims c join private.notification_jobs j on j.id=c.notification_job_id
        join private.rental_agreements a on a.id=c.agreement_id
        join private.notification_jobs old on old.id=$2 where c.agreement_id=$1`, [agreement, previous]);
      assert(mail.id===updated.notificationJobId && mail.recipient_address===email && mail.agreement_id===agreement
        && mail.replaced && mail.keeps_expiry && mail.token_hash!==activeDigest
        && mail.token_hash===createHash("sha256").update(mail.token).digest("hex"),
        "Resend did not supersede the previous job with the original verified recipient, deadline, and exact agreement.");
      await service();
      assert((await rpc("begin_rental_application_signer_access($1,false)", [activeDigest]))===null,
        "A replaced invitation still resolved access.");
      previous = mail.id;
      activeDigest = mail.token_hash;
    }
    await db.exec("reset role");
    await db.query("update private.notification_jobs set created_at=now()-interval '6 minutes' where id=$1", [previous]);
    await operator();
    await expectDatabaseError(() => resend(), "AGREEMENT_INVITATION_RESEND_LIMIT");
  }
  const sign = (actor, name) => rpc("sign_rental_agreement($1,$2,$3,$4,$5,'esign_consent@1.0.0#260463bcf84a7827',true,true)",
    [actor, agreement, version, sha, name]);
  await service();
  assert((await rpc("begin_rental_application_signer_access($1,true)", [activeDigest])).agreementId===agreement
    && (await rpc("begin_rental_application_signer_access($1,true)", [activeDigest])).throttled,
  "The invitation did not resolve the exact pending signer with a send throttle.");
  assert((await sign(owner, "Test landlord")).status==="open", "Landlord alone executed an unclaimed applicant agreement.");
  await role("authenticated", outsider);
  await expectDatabaseError(() => rpc("claim_rental_application_agreement($1)", [agreement]), "AGREEMENT_CLAIM_UNAVAILABLE");
  await db.exec("reset role");
  await db.query("insert into auth.users(id,email) values($1,$2)", [renter, email]);
  await role("authenticated", renter);
  await expectDatabaseError(() => rpc("claim_rental_application_agreement($1)", [agreement]), "AGREEMENT_CLAIM_UNAVAILABLE");
  await db.exec("reset role");
  await db.query("update auth.users set email_confirmed_at=now() where id=$1", [renter]);
  await role("authenticated", renter);
  await expectDatabaseError(() => rpc("get_rental_agreement($1,null)", [agreement]), "AGREEMENT_FORBIDDEN");
  const claimed = await rpc("claim_rental_application_agreement($1)", [agreement]);
  assert(claimed.claimed && !claimed.replayed && (await rpc("claim_rental_application_agreement($1)", [agreement])).replayed,
    "The same verified-email claim did not replay exactly.");
  if (assertDelivery) {
    await expectDatabaseError(() => rpc("get_rental_agreement_invitation_delivery(null,$1)", [agreement]), "AGREEMENT_FORBIDDEN");
    await expectDatabaseError(() => rpc("get_rental_agreement_invitation_delivery($1,$2)", [organizationId, agreement]), "ORGANIZATION_SCOPE_DENIED");
  }
  await service();
  const executed = await sign(renter, "Test applicant");
  assert(executed.status==="executed" && executed.actorId===renter && executed.sourceVersionId===version && executed.capacity==="lessee",
    "The returned signature receipt did not identify the exact actor or reviewed version.");
  await operator();
  if (assertRecovery) await expectDatabaseError(() => resend(), "AGREEMENT_INVITATION_NOT_OPEN");
  const filed = await rpc("file_executed_rental_agreement($1,$2)", [organizationId, agreement]);
  const next = await getDraft();
  assert(filed.applicationSetupId===prepared.setupId && next.draft.documentVersionId===version && next.revision===draft.revision+1,
    "The exact filed version was not selected automatically in the frozen draft.");
  const activated = await rpc("activate_homeowner_lease_episode($1,$2,$3,$4,true,true)",
    [organizationId, unitId, prepared.setupId, next.revision]);
  if (assertMoveIn) {
    const moveIn = (id = null) => rpc("get_resident_move_in_checklist($1)", [id]);
    await db.exec("reset role; begin");
    try {
      await role("authenticated", renter);
      assert((await moveIn()).items.length===0, "A signer without a resident invitation accessed the resident home projection.");
      const signedChecklist = (await moveIn(agreement)).items;
      assert(signedChecklist.length===1 && signedChecklist[0].tenancyId===activated.tenancyId && signedChecklist[0].startOn===start,
        "The named renter lost their exact upcoming checklist before portal enrollment.");
      await role("authenticated", outsider);
      assert((await moveIn(agreement)).items.length===0, "A different account obtained an executed agreement's move-in.");
      await operator();
      assert((await moveIn(agreement)).items.length===0, "A landlord signer obtained the renter-only checklist.");
      await db.exec("reset role");
      await db.query(`insert into public.user_relationships(user_id,organization_id,relationship_type,relationship_id,status)
        select $2,t.organization_id,'resident_person',m.person_id,'active' from public.tenancies t
        join public.household_members m on m.organization_id=t.organization_id and m.household_id=t.household_id
        where t.id=$1 and m.is_financially_responsible`, [activated.tenancyId, renter]);
      await role("authenticated", renter);
      assert((await moveIn()).items[0]?.tenancyId===activated.tenancyId,
        "An enrolled renter lost move-in access ahead of the future household start.");
      await db.exec("reset role");
      await db.query("update public.user_relationships set status='revoked' where user_id=$1 and organization_id=$2", [renter, organizationId]);
      await role("authenticated", renter);
      assert((await moveIn()).items.length===0 && (await moveIn(agreement)).items.length===0,
        "Revocation left a move-in checklist accessible on one of the renter surfaces.");
    } finally {
      await db.exec("rollback; reset role");
    }
    await operator();
  }
  if (assertActivity) {
    const [inquiry, tour] = [randomUUID(), randomUUID()];
    const outsideScope = await rpc("create_homeowner_rental($1,$2::jsonb,$3)", [organizationId, JSON.stringify({
      property: { kind: "new", accountingBookId: null, legalName: "Other Signing Fixture Entity", entityType: "individual",
        name: "Other Property", addressLine1: "54 Fixture Road", addressLine2: "", locality: "Richmond",
        subdivisionCode: "VA", postalCode: "23220", countryCode: "US", timeZone: "America/New_York" },
      space: { name: "Other suite", type: "basement", bedrooms: 1, bathrooms: 1, entrance: "private",
        kitchen: "private", bathroom: "private", laundry: "shared", utilitiesNotes: "", parkingNotes: "" },
    }), randomUUID()]);
    await db.exec("reset role");
    await db.query(`insert into public.rental_inquiries(id,organization_id,listing_id,property_id,unit_id,
      public_reference,first_name,last_name,email,question,status,verified_at)
      values($1,$2,$3,$4,$5,'INQ-38D398F569A0','Private','Renter',$6,'Sensitive fictional inquiry content.','open',now())`,
    [inquiry, organizationId, listing, propertyId, unitId, email]);
    await db.query(`insert into public.rental_tour_requests(id,organization_id,listing_id,property_id,unit_id,
      public_reference,first_name,last_name,email,property_time_zone,status,verified_at)
      values($1,$2,$3,$4,$5,'TOUR-38D398F569A0','Private','Renter',$6,'America/New_York','requested',now())`,
    [tour, organizationId, listing, propertyId, unitId, email]);
    await db.query(`insert into private.outbox_events(organization_id,event_type,aggregate_type,aggregate_id,correlation_id,payload)
      values($1,'rental_inquiry.verified','rental_inquiry',$2,gen_random_uuid(),jsonb_build_object('privateEmail',$4::text)),
        ($1,'rental_tour.verified','rental_tour',$3,gen_random_uuid(),jsonb_build_object('privateEmail',$4::text)),
        ($1,'rental_application.pending_verification','rental_application',$5,gen_random_uuid(),'{}'),
        ($1,'rental_inquiry.verified','rental_inquiry',gen_random_uuid(),gen_random_uuid(),jsonb_build_object('unitId',$6::uuid))`,
    [organizationId, inquiry, tour, email, application, unitId]);
    await operator();
    const activity = await rpc("get_rental_unit_activity($1,$2)", [organizationId, unitId]);
    assert(activity.unitId===unitId && activity.nextAction.reference==="TOUR-38D398F569A0"
      && activity.events.filter((event) => event.label==="A party signed").length===2
      && activity.events.filter((event) => event.kind==="inquiry").length===1
      && activity.events.some((event) => event.label==="Tenancy recorded")
      && activity.events.some((event) => event.label==="All parties signed" && event.targetId===agreement),
    "Activity missed a verified stage, trusted an unbound event, duplicated signature records, or picked the wrong live action.");
    assert(activity.events.every((event) => Object.keys(event).sort().join(",")==="id,kind,label,occurredAt,reference,targetId")
      && !JSON.stringify(activity).includes(email) && !JSON.stringify(activity).includes("pending_verification")
      && !JSON.stringify(activity).includes("Sensitive fictional inquiry content."),
    "Activity disclosed a private source field.");
    await expectDatabaseError(() => rpc("get_rental_unit_activity($1,$2)", [organizationId, randomUUID()]), "RENTAL_ACTIVITY_UNAVAILABLE");
    await role("authenticated", outsider);
    await expectDatabaseError(() => rpc("get_rental_unit_activity($1,$2)", [organizationId, unitId]), "ORGANIZATION_SCOPE_DENIED");
    await db.exec("reset role");
    const { rows: [membership] } = await db.query(`insert into public.organization_memberships(organization_id,user_id,role_code,status)
      values($1,$2,'property_manager','active') returning id`, [organizationId, outsider]);
    await db.query("insert into public.membership_property_scopes(organization_id,membership_id,property_id) values($1,$2,$3)",
      [organizationId, membership.id, outsideScope.propertyId]);
    await role("authenticated", outsider);
    await expectDatabaseError(() => rpc("get_rental_unit_activity($1,$2)", [organizationId, unitId]), "RENTAL_ACTIVITY_UNAVAILABLE");
    assert((await rpc("get_rental_unit_activity($1,$2)", [organizationId, outsideScope.unitId])).events.length===0,
      "The scoped property manager did not receive the authorized exact unit.");
    await role("anon");
    await expectDatabaseError(() => rpc("get_rental_unit_activity($1,$2)", [organizationId, unitId]), "permission denied");
  }
  await role("authenticated", renter);
  const bundle = await rpc("get_rental_agreement_artifacts($1,null)", [agreement]);
  const result = await rpc("get_rental_agreement($1,null)", [agreement]);
  assert(result.tenancyStatus==="scheduled" && bundle.source.versionId===version && JSON.parse(bundle.evidenceText).approvedTermsSha256,
    "Conversion made the persistent signed receipt inaccessible or lost the approved terms binding.");
  await db.exec("reset role");
  const { rows: [effects] } = await db.query(`select
    (select count(*)::int from private.notification_jobs j where j.idempotency_key=$1) as invites,
    (select count(*)::int from private.outbox_events e where e.event_type='rental_agreement.signed' and e.aggregate_id=$2) as signed,
    (select count(*)::int from public.user_relationships ur where ur.user_id=$3) as relationships,
    (select converted_tenancy_id from public.rental_applications a where a.id=$4) as converted`,
  [`rental-agreement-invite:${agreement}:1`, agreement, renter, application]);
  assert(effects.invites===1 && effects.signed===2 && effects.relationships===0 && effects.converted===activated.tenancyId,
    "Onboarding granted another relationship, duplicated delivery/signing, or lost the exact tenancy receipt.");
  if (assertNotifications) {
    const { rows } = await db.query(`select template_code,recipient_user_id from private.notification_jobs j
      where j.organization_id=$1 and j.payload->>'agreementId'=$2
        and j.template_code in ('rental_agreement_operator_executed','rental_agreement_renter_executed')`,
    [organizationId, agreement]);
    assert(rows.length===2
      && rows.some((row) => row.template_code==="rental_agreement_operator_executed" && row.recipient_user_id===owner)
      && rows.some((row) => row.template_code==="rental_agreement_renter_executed" && row.recipient_user_id===renter),
    "Execution must enqueue one exact notice for each signer without leaking the package.");
  }
  return { firstTimeClaim: true, frozenTerms: true, latestPdf: true, namedReceipt: true, persistentExecutedReceipt: true,
    ...(assertActivity && { scopedRentalActivity: true }), ...(assertDelivery && { scopedInvitationDelivery: true }),
    ...(assertRecovery && { exactInvitationResendRecovery: true }),
    ...(assertMoveIn && { exactSignerAndResidentMoveIn: true }) };
}

export async function proveSelectedApplicationAgreement(db, fixture, { assert, expectDatabaseError, assertListingPaused = false }) {
  const { organizationId, propertyId, unitId, applicationId, applicantId, reviewerId } = fixture;
  const rpc = async (sql, values = []) => (await db.query("select public." + sql + " as result", values)).rows[0].result;
  const role = async (databaseRole, actor, aal = "aal1") => {
    await db.exec("reset role; set role " + databaseRole);
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.aal',$2,false),set_config('request.jwt.claims','',false)",
      [actor ?? "", aal]);
  };
  await db.exec("reset role");
  const { rows: [application] } = await db.query(`select a.version,a.desired_move_in_on::text as start,
    (a.desired_move_in_on+365)::text as end,l.id as listing_id,l.public_id,l.version as listing_version
    from public.rental_applications a join private.rental_application_evidence_packets p
      on p.application_id=a.id and p.organization_id=a.organization_id
    join public.rental_listings l on l.id=a.listing_id and l.organization_id=a.organization_id
    where a.id=$1 and a.organization_id=$2 and a.unit_id=$3 and p.status='selected' and p.version=p.reviewed_version`,
  [applicationId, organizationId, unitId]);
  assert(application, "Signing proof did not use the same manually selected application and reviewed packet.");
  const [doc, version, agreement] = [randomUUID(), randomUUID(), randomUUID()];
  const digest = createHash("sha256").update("synthetic reviewed lease PDF fixture").digest("hex");
  await db.query(`insert into public.documents(id,organization_id,property_id,unit_id,document_type,title,created_by)
    values($1,$2,$3,$4,'rental_agreement_source','Reviewed applicant lease fixture',$5)`,
  [doc, organizationId, propertyId, unitId, reviewerId]);
  await db.query(`insert into public.document_versions(id,organization_id,document_id,version_number,storage_bucket,storage_path,
    mime_type,size_bytes,sha256_hex,original_filename,uploaded_by,upload_status)
    values($1,$2,$3,1,'private-documents',$4,'application/pdf',100,$5,'lease.pdf',$6,'clean')`,
  [version, organizationId, doc, `organizations/${organizationId}/unit/${unitId}/${version}/lease.pdf`, digest, reviewerId]);
  await role("authenticated", reviewerId, "aal2");
  const prepared = await rpc("prepare_rental_application_lease($1,$2,$3,$4)",
    [organizationId, applicationId, application.version, randomUUID()]);
  const context = [organizationId, unitId, prepared.setupId];
  const original = await rpc("get_homeowner_lease_episode($1,$2,$3,null,false)", context);
  const terms = { ...original.draft, startDate: application.start, endDate: application.end,
    firstChargeDueDate: application.start, openingBalance: "0", documentVersionId: "", occupancy: "future" };
  const draft = await rpc("save_homeowner_lease_episode($1,$2,$3,$4,$5::jsonb,$6)",
    [...context, original.revision, JSON.stringify(terms), randomUUID()]);
  const sent = await rpc("send_rental_application_agreement($1,$2,$3,$4,$5,$6,$7,10,true,true)",
    [organizationId, applicationId, prepared.setupId, prepared.applicationVersion, draft.revision, agreement, version]);
  assert(sent.agreementId===agreement && sent.status==="open", "Approved evidence did not lead to the exact signing request.");
  const knownEmailClaim = () => rpc("claim_rental_application_agreement($1)", [agreement]);
  await role("authenticated", applicantId);
  assert((await knownEmailClaim()).claimed, "The exact applicant could not access the selected agreement.");
  await role("service_role");
  const sign = (actor, name) => rpc("sign_rental_agreement($1,$2,$3,$4,$5,'esign_consent@1.0.0#260463bcf84a7827',true,true)",
    [actor, agreement, version, digest, name]);
  const signed = await sign(applicantId, "Reviewed Fixture Applicant");
  assert(signed.status==="open" && signed.actorId===applicantId,
    "The applicant's first signature did not leave the landlord's exact counter-signature outstanding.");
  await db.exec("reset role");
  const { rows: countersign } = await db.query(`select recipient_user_id,payload from private.notification_jobs
    where organization_id=$1 and template_code='rental_agreement_signature_required' and payload->>'agreementId'=$2`,
  [organizationId, agreement]);
  assert(countersign.length===1 && countersign[0].recipient_user_id===reviewerId
    && Object.keys(countersign[0].payload).join(",")==="agreementId",
  "Counter-signing did not queue for only the authorized owner or leaked restricted fields.");
  await role("service_role");
  assert((await sign(reviewerId, "Fixture Landlord")).status==="executed", "Landlord counter-signing did not execute the same packet.");
  if (assertListingPaused) {
    assert((await sign(reviewerId, "Fixture Landlord")).replayed, "A replay could repeat lease execution.");
    assert((await rpc("get_public_rental_listing($1)", [application.public_id])) === null,
      "The public share link still accepts leads for a signed rental.");
    await db.exec("reset role");
    const { rows: [listing] } = await db.query(`select l.status,l.version,
      (select count(*)::int from audit.audit_events e where e.resource_id=l.id
        and e.after_data->>'reason'='application_lease_executed') as pauses
      from public.rental_listings l where l.id=$1 and l.organization_id=$2`,
    [application.listing_id, organizationId]);
    assert(listing.status==="paused" && listing.version===application.listing_version+1 && listing.pauses===1,
      "The linked listing was not paused and audited exactly once.");
  }
  await role("authenticated", applicantId);
  const packageResult = await rpc("get_rental_agreement_artifacts($1,null)", [agreement]);
  assert(packageResult.source.versionId===version && JSON.parse(packageResult.evidenceText).signatures.length===2,
    "The exact signed PDF and certificate did not remain visible to the matched applicant.");
  await db.exec("reset role");
  const { rows: [effects] } = await db.query(`select
    (select count(*)::int from private.notification_jobs where organization_id=$1
      and template_code in ('rental_agreement_renter_executed','rental_agreement_operator_executed')
      and payload->>'agreementId'=$2) as completions,
    (select count(*)::int from private.notification_jobs where organization_id=$1
      and template_code='rental_agreement_signing_requested' and payload->>'agreementId'=$2) as invites,
    (select count(*)::int from public.user_relationships where user_id=$3 and organization_id=$1) as relationships`,
  [organizationId, agreement, applicantId]);
  assert(effects.completions===2 && effects.invites===1 && effects.relationships===0,
    "Selected agreement did not retain exact delivery, final notices, and agreement-only authority.");
  await role("authenticated", applicantId);
  await expectDatabaseError(() => rpc("claim_rental_application_agreement($1)", [randomUUID()]), "AGREEMENT_CLAIM_UNAVAILABLE");
  return { selectedEvidenceToExecutedAgreement: true, exactCounterSign: true,
    ...(assertListingPaused && { exactListingPaused: true }) };
}
