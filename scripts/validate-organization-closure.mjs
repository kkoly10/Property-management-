import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export async function validateOrganizationClosure(db) {
  const [org, otherOrg, operator, otherOperator, scopedAdmin, unscopedAdmin, entity, book, property, unit, household, document, version, request, ledger, creditAccount, otherCreditAccount] =
    Array.from({ length: 17 }, () => randomUUID());
  const result = async (sql, params) => (await db.query(sql, params)).rows[0].result;
  const read = (id = org) => result("select public.get_organization_closure_readiness($1) as result", [id]);
  const readReview = (id = org) => result("select public.get_workspace_closure_review($1) as result", [id]);
  const recordReview = (action, expected = null, key = randomUUID(), id = org) => result(
    "select public.record_workspace_closure_action($1,$2,$3,$4,$5) as result",
    [id, expected?.caseId ?? null, expected?.caseVersion ?? 0, action, key],
  );
  const setActor = (actor, aal = "aal2") => db.exec(
    `reset role; set role authenticated; set request.jwt.claim.sub='${actor}'; set request.jwt.claim.aal='${aal}'`,
  );
  await db.exec("reset role; reset request.jwt.claims; reset crecy.active_organization_id");
  await db.query("insert into auth.users(id,email) values ($1,'closure-admin@example.invalid'),($2,'other@example.invalid'),($3,'scoped@example.invalid'),($4,'closure-manager@example.invalid')",
    [operator, otherOperator, scopedAdmin, unscopedAdmin]);
  for (const [id, owner] of [[org, operator], [otherOrg, otherOperator]]) {
    await db.query("insert into public.organizations(id,display_name,slug,headquarters_country_code,default_locale,default_time_zone,customer_path,created_by) "
      + "values($1,'Synthetic closure workspace',$2,'US','en-US','UTC','property_manager',$3)", [id, "closure-" + id, owner]);
    await db.query("insert into public.organization_memberships(organization_id,user_id,role_code,status) values($1,$2,'org_owner','active')", [id, owner]);
    await db.query("insert into public.organization_subscriptions(organization_id,plan_code,country_price_book,trial_ends_at) "
      + "values($1,'growth','US',now()+interval '1 day')", [id]);
  }
  await db.query("insert into public.organization_memberships(organization_id,user_id,role_code,status) values($1,$2,'org_admin','active')",
    [org, unscopedAdmin]);
  await db.query("insert into public.operating_entities(id,organization_id,legal_name,display_name,country_code,entity_type,created_by) "
    + "values($1,$2,'Synthetic entity','Synthetic entity','US','company',$3)", [entity, org, operator]);
  await db.query("insert into public.accounting_books(id,organization_id,operating_entity_id,name,functional_currency_code) values($1,$2,$3,'Synthetic book','USD')",
    [book, org, entity]);
  await db.query("insert into public.properties(id,organization_id,operating_entity_id,accounting_book_id,country_profile_id,name,property_type,country_code,address_line1,time_zone) "
    + "values($1,$2,$3,$4,(select id from public.country_profiles where code='US_NATIONAL' limit 1),'Synthetic property','single_family','US','Fixture address','UTC')",
  [property, org, entity, book]);
  await db.query("insert into public.units(id,organization_id,property_id,unit_code) values($1,$2,$3,'Unit A')", [unit, org, property]);
  await db.query("insert into public.households(id,organization_id,display_name) values($1,$2,'Fixture household')", [household, org]);
  const scopedMembership = await result("insert into public.organization_memberships(organization_id,user_id,role_code,status) "
    + "values($1,$2,'org_admin','active') returning id as result", [org, scopedAdmin]);
  await db.query("insert into public.membership_property_scopes(organization_id,membership_id,property_id) values($1,$2,$3)",
    [org, scopedMembership, property]);

  await setActor(operator);
  const clean = await read();
  assert.equal(clean.organizationId, org);
  assert.ok(Object.values(clean.counts).every(value => value === 0));
  await assert.rejects(() => read(otherOrg), /ORGANIZATION_SCOPE_DENIED/);
  await db.exec(`set crecy.active_organization_id='${otherOrg}'`);
  await assert.rejects(read, /ORGANIZATION_SCOPE_DENIED/);
  await db.exec("reset crecy.active_organization_id");
  await setActor(operator, "aal1");
  await assert.rejects(read, /MFA_REQUIRED/);
  await setActor(scopedAdmin);
  await assert.rejects(read, /ORGANIZATION_SCOPE_DENIED/);
  await db.exec("reset role; set role anon");
  await assert.rejects(read, /permission denied/);
  await db.exec("reset role; set role service_role");
  await assert.rejects(read, /permission denied/);
  await db.exec("reset role");

  const episodes = [];
  for (const [i, from, to, status] of [[0, -10, 5, "active"], [1, 6, 18, "scheduled"], [2, -40, -11, "closed"]]) {
    const [lease, account, tenancy] = Array.from({ length: 3 }, () => randomUUID());
    episodes.push({ lease, account, tenancy });
    await db.query("insert into public.receivable_accounts(id,organization_id,accounting_book_id,public_reference,currency_code) "
      + "values($1,$2,$3,$4,'USD')", [account, org, book, "closure-reference-" + i]);
    await db.query("insert into public.leases(id,organization_id,property_id,unit_id,household_id,country_profile_id,start_date,end_date,rent_amount_minor,currency_code) "
      + "values($1,$2,$3,$4,$5,(select country_profile_id from public.properties where id=$3),current_date+$6::int,current_date+$7::int,100,'USD')",
    [lease, org, property, unit, household, from, to]);
    await db.query("insert into public.tenancies(id,organization_id,property_id,unit_id,household_id,lease_id,receivable_account_id,possession_start,possession_end,status) "
      + "values($1,$2,$3,$4,$5,$6,$7,current_date+$8::int,current_date+$9::int,$10)", [tenancy, org, property, unit, household, lease, account, from, to, status]);
  }

  await db.query("insert into public.documents(id,organization_id,property_id,document_type,title) values($1,$2,$3,'general','Synthetic signing fixture')",
    [document, org, property]);
  await db.query("insert into public.document_versions(id,organization_id,document_id,version_number,storage_bucket,storage_path,mime_type,size_bytes,sha256_hex,original_filename) "
    + "values($1,$2,$3,1,'closure-fixture',$4,'application/pdf',12,repeat('a',64),'synthetic.pdf')", [version, org, document, version]);
  await db.query("insert into private.rental_agreements(id,organization_id,property_id,unit_id,source_version_id,source_sha256,title,property_label,unit_label,created_by,issue_hash,issued_at,expires_at) "
    + "values(gen_random_uuid(),$1,$2,$3,$4,repeat('a',64),'Synthetic','Synthetic property','Unit A',$5,'fixture',now()-interval '2 days',now()+interval '1 day'),"
    + "(gen_random_uuid(),$1,$2,$3,$4,repeat('a',64),'Expired','Synthetic property','Unit A',$5,'fixture',now()-interval '2 days',now()-interval '1 day')",
  [org, property, unit, version, operator]);
  const delivery = await result("insert into public.document_deliveries(organization_id,document_version_id,recipient_user_id,delivery_channel,signature_requested_at,status) "
    + "values($1,$2,$3,'portal',now(),'delivered') returning id as result", [org, version, otherOperator]);
  await db.query("insert into public.document_deliveries(organization_id,document_version_id,recipient_user_id,delivery_channel,signature_requested_at,status) "
    + "values($1,$2,$3,'portal',now(),'delivered'),($1,$2,$3,'portal',null,'delivered')", [org, version, otherOperator]);
  await db.query("insert into public.document_acknowledgements(organization_id,document_delivery_id,user_id,acknowledgement_type,evidence_hash) "
    + "values($1,$2,$3,'declined','synthetic')", [org, delivery, otherOperator]);

  await db.query("insert into public.ledger_accounts(id,organization_id,accounting_book_id,account_code,account_name,account_class,normal_balance) "
    + "values($1,$4,$5,'1100','Resident receivable','asset','debit'),($2,$4,$5,'1150','Owner receivable','asset','debit'),($3,$4,$5,'2100','Owner payable','liability','credit')",
  [ledger, creditAccount, otherCreditAccount, org, book]);
  await db.exec("begin");
  try {
    const transaction = await result("insert into public.journal_transactions(organization_id,operating_entity_id,accounting_book_id,transaction_type,effective_date,source_type,idempotency_key,currency_code) "
      + "values($1,$2,$3,'closure_fixture',current_date,'closure_fixture','closure-fixture','USD') returning id as result", [org, entity, book]);
    await db.query("insert into public.journal_entries(journal_transaction_id,organization_id,accounting_book_id,ledger_account_id,debit_minor,credit_minor,property_id,receivable_account_id) "
      + "values($1,$2,$3,$4,100,0,$5,$6),($1,$2,$3,$4,0,100,$5,$7),($1,$2,$3,$8,100,0,$5,null),($1,$2,$3,$9,0,100,$5,null)",
    [transaction, org, book, ledger, property, episodes[0].account, episodes[2].account, creditAccount, otherCreditAccount]);
    await db.query("insert into public.charges(organization_id,accounting_book_id,receivable_account_id,tenancy_id,charge_type,description,due_date,amount_minor,currency_code,journal_transaction_id) "
      + "values($1,$2,$3,$4,'fixture','Synthetic charge',current_date,100,'USD',$5)", [org, book, episodes[0].account, episodes[0].tenancy, transaction]);
    await db.exec("commit");
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
  const payment = await result("insert into public.payments(organization_id,operating_entity_id,accounting_book_id,receivable_account_id,tenancy_id,public_reference,payment_source,amount_minor,currency_code,status) "
    + "values($1,$2,$3,$4,$5,'closure-payment','provider',100,'USD','pending') returning id as result",
  [org, entity, book, episodes[0].account, episodes[0].tenancy]);
  await db.query("insert into public.payment_refunds(organization_id,payment_id,amount_minor,currency_code,reason) values($1,$2,10,'USD','Synthetic refund')",
    [org, payment]);
  const maintenance = await result("insert into public.maintenance_requests(organization_id,property_id,unit_id,public_reference,category,title,description) "
    + "values($1,$2,$3,'closure-maintenance','other','Synthetic request','Synthetic maintenance request') returning id as result", [org, property, unit]);
  await db.query("insert into public.work_orders(organization_id,maintenance_request_id,property_id,public_reference,scope,status) "
    + "values($1,$2,$3,'closure-work','Synthetic order','completed')", [org, maintenance, property]);
  await db.query("insert into public.privacy_requests(id,organization_id,requester_user_id,request_type,controller_role,due_at) "
    + "values($1,$2,$3,'deletion','operator',now()+interval '1 day'),(gen_random_uuid(),$4,$3,'access','operator',now()+interval '1 day')",
  [request, org, otherOperator, otherOrg]);
  await db.query("insert into private.privacy_request_jobs(privacy_request_id,job_type,status) "
    + "values($1,'delete','blocked_by_hold'),($1,'anonymize','blocked_by_hold')", [request]);

  try {
    await setActor(operator);
    const populated = await read();
    assert.deepEqual(Object.keys(populated).sort(), ["checkedAt", "counts", "organizationId", "organizationStatus"]);
    assert.deepEqual(populated.counts, {
      ...clean.counts, occupiedTenancies: 1, scheduledTenancies: 1, pendingAgreements: 1, pendingDocumentSignatures: 1,
      residentLedgerPositions: 2, ownerLedgerPositions: 2, openCharges: 1, pendingPayments: 1, pendingRefunds: 1,
      openWorkOrders: 1, openPrivacyRequests: 1, privacyCasesWithHolds: 1,
    });
    const today = await result("select ((now() at time zone 'UTC')::date)::text as result", []);
    const recordDeposit = (episode, expectedVersion, entry) => result(
      "select public.record_tenancy_deposit_entry($1,$2,$3,$4,$5::jsonb) as result",
      [org, episode.tenancy, expectedVersion, randomUUID(), JSON.stringify(entry)],
    );
    const obligation = { kind: "obligation", amountMinor: 100, effectiveOn: today };
    const receipt = { kind: "receipt", amountMinor: 100, effectiveOn: today, reference: "custodian-receipt", custodian: "Synthetic", confirmed: true };
    const refund = { kind: "refund", amountMinor: 100, effectiveOn: today, reference: "custodian-refund", confirmed: true };
    await recordDeposit(episodes[0], 0, obligation);
    await recordDeposit(episodes[2], 0, obligation);
    const closedTenancyReceipt = await recordDeposit(episodes[2], 1, { ...receipt, amountMinor: 50 });
    assert.equal((await read()).counts.unresolvedDepositTenancies, 2, "Held funds and a shortfall count only one time per tenancy.");
    await recordDeposit(episodes[2], 2, { ...refund, amountMinor: 50, targetId: closedTenancyReceipt.entryId });
    assert.equal((await read()).counts.unresolvedDepositTenancies, 2, "A disposed partial receipt leaves the recorded shortfall.");
    await recordDeposit(episodes[2], 3, { ...obligation, amountMinor: 50, detail: "Recorded obligation corrected." });
    assert.equal((await read()).counts.unresolvedDepositTenancies, 1, "A fully received and disposed deposit clears the count.");
    const openTenancyReceipt = await recordDeposit(episodes[0], 1, receipt);
    const openTenancyRefund = await recordDeposit(episodes[0], 2, { ...refund, targetId: openTenancyReceipt.entryId });
    assert.equal((await read()).counts.unresolvedDepositTenancies, 0);

    assert.deepEqual(await readReview(), { organizationId: org, case: null });
    await assert.rejects(() => recordReview("review"), /CLOSURE_REVIEW_NOT_ACTIVE/);
    await setActor(operator, "aal1");
    await assert.rejects(readReview, /MFA_REQUIRED/);
    await assert.rejects(() => recordReview("request"), /MFA_REQUIRED/);
    await setActor(unscopedAdmin);
    assert.equal((await read()).organizationId, org);
    await assert.rejects(readReview, /WORKSPACE_OWNER_REQUIRED/);
    await assert.rejects(() => recordReview("request"), /WORKSPACE_OWNER_REQUIRED/);
    await setActor(otherOperator);
    await assert.rejects(readReview, /ORGANIZATION_SCOPE_DENIED/);
    await assert.rejects(() => recordReview("request"), /ORGANIZATION_SCOPE_DENIED/);
    await setActor(operator);
    await assert.rejects(() => db.query("select * from private.organization_closure_actions"), /permission denied/);
    const requestKey = randomUUID();
    const started = await recordReview("request", null, requestKey);
    assert.equal(started.status, "requested");
    assert.deepEqual(await recordReview("request", null, requestKey), started);
    await assert.rejects(() => recordReview("review", started, requestKey), /IDEMPOTENCY_CONFLICT/);
    await assert.rejects(() => recordReview("request", started), /CLOSURE_REVIEW_ALREADY_ACTIVE_OR_UNAVAILABLE/);
    const reviewed = await recordReview("review", started);
    const firstSnapshot = (await readReview()).case.reviewedReadiness;
    assert.equal(firstSnapshot.caseVersion, reviewed.caseVersion);
    assert.equal(firstSnapshot.readiness.counts.unresolvedDepositTenancies, 0);
    assert.equal(firstSnapshot.readiness.counts.privacyCasesWithHolds, 1);
    await assert.rejects(() => recordReview("cancel", started), /CLOSURE_VERSION_CONFLICT/);

    await recordDeposit(episodes[0], 3, { kind: "correction", targetId: openTenancyRefund.entryId, detail: "Custodian corrected the refund record." });
    assert.equal((await read()).counts.unresolvedDepositTenancies, 1, "Correcting a refund restores the unresolved balance.");
    assert.deepEqual((await readReview()).case.reviewedReadiness, firstSnapshot);
    const reviewedAgain = await recordReview("review", reviewed);
    const secondSnapshot = (await readReview()).case.reviewedReadiness;
    assert.equal(secondSnapshot.readiness.counts.unresolvedDepositTenancies, 1);
    const canceled = await recordReview("cancel", reviewedAgain);
    assert.equal((await readReview()).case.status, "canceled");
    assert.deepEqual((await readReview()).case.reviewedReadiness, secondSnapshot);
    assert.deepEqual(await recordReview("request", null, requestKey), started);
    await assert.rejects(() => recordReview("review", canceled), /CLOSURE_REVIEW_NOT_ACTIVE/);
    const restarted = await recordReview("request", canceled);
    assert.notEqual(restarted.caseId, canceled.caseId);
    assert.equal((await readReview()).case.reviewedReadiness, null);
    assert.equal((await read()).organizationStatus, clean.organizationStatus);

    await setActor(otherOperator);
    const own = await read(otherOrg);
    assert.deepEqual(own.counts, { ...clean.counts, openPrivacyRequests: 1 });
    await assert.rejects(read, /ORGANIZATION_SCOPE_DENIED/);
    assert.deepEqual(await readReview(otherOrg), { organizationId: otherOrg, case: null });
    await db.exec("reset role");
    assert.equal(await result("select count(*)::int as result from private.organization_closure_actions where organization_id=$1", [org]), 5);
    assert.equal(await result("select count(*)::int as result from audit.audit_events where organization_id=$1 and action_code='organization_closure.action_recorded'", [org]), 5);
    assert.equal(await result("select count(*)::int as result from private.outbox_events where organization_id=$1 and event_type='organization_closure.action_recorded'", [org]), 5);
    assert.deepEqual(await result("select readiness as result from private.organization_closure_actions where organization_id=$1 and case_id=$2 and case_version=2",
      [org, started.caseId]), firstSnapshot.readiness);
    await db.query("update public.organizations set status='closed' where id=$1", [org]);
    await setActor(operator);
    const historical = await read();
    assert.equal(historical.organizationStatus, "closed");
    assert.deepEqual(historical.counts, { ...populated.counts, unresolvedDepositTenancies: 1 });
    assert.equal((await readReview()).case.caseId, restarted.caseId);
  } finally {
    await db.exec("reset role; reset request.jwt.claim.sub; reset request.jwt.claim.aal; reset crecy.active_organization_id");
  }
}
