import { randomUUID } from "node:crypto";

export async function validateRentalWorkflowCommunication(db, { assert, expectDatabaseError, createOrganizationAsServer }) {
  const owner = randomUUID();
  const renter = "rental-flow-renter@example.test";
  const network = "a".repeat(64);
  await db.exec("reset role");
  await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'rental-flow-owner@example.test',now())", [owner]);
  const { organizationId } = (await createOrganizationAsServer(db, owner,
    "'Workflow Email Fixture','workflow-email-fixture','self_managing','US','en-US','America/New_York','operator_terms@0.1.0-draft+privacy_notice@0.1.0-draft#0123456789abcdef','workflow-email-fixture'"))
    .rows[0].result;
  const rpc = async (query, args) => (await db.query(`select public.${query} as reply`, args)).rows[0].reply;
  const service = () => db.exec("reset role; set role service_role");
  const operator = async () => {
    await db.exec("reset role; set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.aal','aal2',false),set_config('request.jwt.claims','',false),set_config('crecy.active_organization_id','',false)", [owner]);
  };
  await operator();
  const { propertyId, unitId } = await rpc("create_homeowner_rental($1,$2::jsonb,$3)", [organizationId, JSON.stringify({
    property: { kind: "new", accountingBookId: null, legalName: "Workflow Fixture", entityType: "individual",
      name: "Workflow fixture house", addressLine1: "1 Fictional Road", addressLine2: "", locality: "Fairfax",
      subdivisionCode: "VA", postalCode: "22030", countryCode: "US", timeZone: "America/New_York" },
    space: { name: "Suite", type: "basement", bedrooms: 1, bathrooms: 1, entrance: "private",
      kitchen: "private", bathroom: "private", laundry: "shared", utilitiesNotes: "Water included", parkingNotes: "" },
  }), randomUUID()]);
  await db.exec("reset role");
  const listing = (await db.query(`insert into public.rental_listings(organization_id,property_id,unit_id,title,summary,
    rent_amount_minor,currency_code,available_on,country_code,status,visibility,published_at,created_by)
    values($1,$2,$3,'Workflow fixture','A fictional rental for workflow email assertions.',120000,'USD',current_date+4,
      'US','published','unlisted',now(),$4) returning public_id`,
  [organizationId, propertyId, unitId, owner])).rows[0].public_id;

  const operation = randomUUID();
  await service();
  await rpc("submit_public_rental_inquiry($1,'Synthetic','Prospect',$2,'Does the fictional rent include water?',$3,'en-US',$4)",
    [listing, renter, network, operation]);
  const job = await rpc("locate_rental_fast_mail('inquiry',$1,$2,$3)", [listing, renter, operation]);
  assert(job && (await rpc("locate_rental_fast_mail('inquiry',$1,$2,$3)", [listing, renter, randomUUID()])) === null,
    "The expedited mail lookup did not honor the exact operation.");
  const claimed = await rpc("claim_rental_fast_notification_job($1,'rental-exact-worker')", [job]);
  assert(claimed.jobs.length === 1 && claimed.jobs[0].notificationJobId === job, "Expedited worker claimed the wrong job.");
  assert((await rpc("claim_rental_fast_notification_job($1,'rental-exact-replay')", [job])).jobs.length === 0,
    "Another worker claimed the same in-flight mail.");
  const token = claimed.jobs[0].payload.verificationToken;
  await rpc("complete_notification_job($1,'relay','workflow-renter-receipt')", [job]);
  assert((await rpc("verify_public_rental_inquiry($1)", [token])).verified, "Renter verification failed.");
  await db.exec("reset role");
  const inquiry = (await db.query("select id,public_reference from public.rental_inquiries where organization_id=$1", [organizationId])).rows[0];
  await operator();
  const replyOperation = randomUUID();
  const reply = () => rpc("manage_rental_conversation($1,'inquiry',$2,'Water is included in the fixture.',$3)",
    [organizationId, inquiry.id, replyOperation]);
  const replyState = await reply();
  assert(replyState.messages.length === 1 && replyState.notificationJobId && (await reply()).notificationJobId === null,
    "A replay created a second reply or email.");
  await db.exec("reset role");
  const replyPayload = (await db.query("select payload from private.notification_jobs where id=$1", [replyState.notificationJobId])).rows[0].payload;
  assert(replyPayload.inquiryReference === inquiry.public_reference && !JSON.stringify(replyPayload).includes("Water is included"),
    "Renter email contains the private reply content.");
  await service();
  const open = (secret) => rpc("redeem_rental_conversation($1)", [secret]);
  const session = (await open(replyPayload.conversationToken)).session;
  assert((await open(replyPayload.conversationToken)) === null
    && (await rpc("access_rental_conversation($1)", ["b".repeat(64)])) === null, "Conversation access was replayable or unscoped.");
  assert((await rpc("access_rental_conversation($1,'Wrong case.',$2,'INQ-0123456789AB')",
    [session, randomUUID()])) === null, "A stale browser tab could post a reply to another conversation.");
  const response = await rpc("access_rental_conversation($1,'Thank you for answering.',$2,$3)",
    [session, randomUUID(), inquiry.public_reference]);
  assert(response.reference === inquiry.public_reference && response.messages[1].author === "renter",
    "The renter response did not use the verified thread.");

  await db.exec("reset role");
  const date = (await db.query("select (current_date+10)::text as day")).rows[0].day;
  await service();
  await rpc("submit_public_rental_tour_request($1,'Synthetic','Visitor',$2,$3::jsonb,$4,'en-US',$5)",
    [listing, renter, JSON.stringify([`${date}T10:00`, `${date}T12:00`, `${date}T15:00`]), network, randomUUID()]);
  await db.exec("reset role");
  const tour = (await db.query(`select t.id,j.payload->>'verificationToken' as token
    from public.rental_tour_requests t join private.rental_tour_verifications v on v.tour_request_id=t.id
    join private.notification_jobs j on j.id=v.notification_job_id where t.organization_id=$1`, [organizationId])).rows[0];
  await service();
  assert((await rpc("verify_public_rental_tour($1)", [tour.token])).verified, "Tour verification failed.");
  await operator();
  const confirm = (updatedVersion, position) => rpc(
    "confirm_rental_tour($1,$2,$3,$4,'Private fixture meeting point',$5)", [organizationId, tour.id, updatedVersion, position, randomUUID()],
  );
  const confirmed = await confirm(2, 0);
  const changed = await confirm(confirmed.version, 1);
  assert(changed.confirmedStartAt !== confirmed.confirmedStartAt, "Tour reschedule did not persist.");
  const cancelKey = randomUUID();
  const cancel = () => rpc("cancel_rental_tour($1,$2,$3,$4)", [organizationId, tour.id, changed.version, cancelKey]);
  assert((await cancel()).status === "cancelled" && (await cancel()).status === "cancelled", "Tour cancellation did not replay.");
  await expectDatabaseError(() => confirm(changed.version + 1, 2), "TOUR_NOT_REQUESTED");

  await service();
  await rpc("submit_public_rental_application($1,'Synthetic','Applicant',$2,$3::date,'12 months','A fictional note.',$4,'en-US',$5)",
    [listing, renter, date, network, randomUUID()]);
  await db.exec("reset role");
  const application = (await db.query(`select a.id,j.payload->>'verificationToken' as token
    from public.rental_applications a join private.rental_application_verifications v on v.application_id=a.id
    join private.notification_jobs j on j.id=v.notification_job_id where a.organization_id=$1`, [organizationId])).rows[0];
  await service();
  assert((await rpc("verify_public_rental_application($1)", [application.token])).verified, "Application verification failed.");
  await db.exec("reset role");
  const mail = (await db.query("select template_code,recipient_user_id,recipient_address,status,payload from private.notification_jobs where organization_id=$1",
    [organizationId])).rows;
  const only = (code) => mail.filter((row) => row.template_code === code);
  assert(only("message_rental_tour_received")[0].recipient_user_id === owner
    && only("rental_tour_confirmed")[0].status === "canceled"
    && only("rental_tour_rescheduled")[0].status === "canceled"
    && only("rental_tour_cancelled").length === 1, "Tour mail was duplicated or stale.");
  assert(only("message_rental_application_received")[0].recipient_user_id === owner
    && only("rental_application_received")[0].recipient_address === renter
    && !JSON.stringify(only("rental_application_received")[0].payload).includes("fictional note"),
  "Application milestone emails were misrouted or included private application content.");
  assert(only("message_rental_inquiry_reply")[0].recipient_user_id === owner, "Renter reply did not notify the scoped landlord.");

  // Pre-release cron traffic must keep its own templates moving while leaving newer jobs intact.
  const [legacyJob, lifecycleJob, optedOutJob] = [randomUUID(), randomUUID(), randomUUID()];
  await db.query(`insert into private.notification_jobs(
      id,organization_id,template_code,locale,channel,recipient_address,recipient_user_id,payload,idempotency_key,available_at
    ) values
      ($3,$1,'rental_tour_confirmed','en-US','email',$2,null,'{}','rollout-legacy-fixture','1900-01-02'),
      ($4,$1,'rental_tour_cancelled','en-US','email',$2,null,'{}','rollout-lifecycle-fixture','1900-01-01'),
      ($5,$1,'message_rental_tour_received','en-US','email',null,$6,'{}','rollout-opt-out-fixture','1900-01-01')`,
  [organizationId, renter, legacyJob, lifecycleJob, optedOutJob, owner]);
  await db.query("insert into public.notification_preferences(user_id,category,channel,enabled) values($1,'messages','email',false)", [owner]);
  await operator();
  await expectDatabaseError(() => rpc("claim_notification_jobs_v2('email',1,'rental-unauthorized-worker')", []), "permission denied");
  await service();
  const legacy = await rpc("claim_notification_jobs('email',1,'rental-legacy-worker')", []);
  assert(legacy.jobs[0]?.notificationJobId === legacyJob, "An older worker claimed a template it cannot render.");
  await db.exec("reset role");
  const readLifecycleJobs = async () => (await db.query(`select id,status,attempts,last_error from private.notification_jobs
    where id=any($1::uuid[])`, [[lifecycleJob, optedOutJob]])).rows;
  assert((await readLifecycleJobs()).every((row) => row.status === "queued" && row.attempts === 0 && row.last_error === null),
    "An older worker changed a newer job or suppressed its recipient preference.");
  await service();
  const modern = await rpc("claim_notification_jobs_v2('email',1,'rental-modern-worker')", []);
  assert(modern.jobs[0]?.notificationJobId === lifecycleJob && modern.jobs[0]?.attempt === 1,
    "The updated worker could not claim a newer queued template.");
  await db.exec("reset role");
  assert((await readLifecycleJobs()).some((row) => row.id === optedOutJob && row.status === "canceled"
    && row.attempts === 0 && row.last_error === "RECIPIENT_OPTED_OUT"),
  "The updated worker did not preserve preference suppression for newer templates.");

  return { exactExpeditedSend: true, verifiedConversation: true, tourChanges: true,
    applicationNotices: true, rollingDeploymentTemplateFence: true };
}
