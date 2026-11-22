import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

export async function validateMaintenanceCostApproval(db, {
  assert, expectDatabaseError, organizationId, propertyId, tenancyId, admin,
  resident, ownerA, ownerB, ownerEntityA, ownerEntityB, successor,
}) {
  await db.exec("reset role");
  await db.exec(await readFile(new URL(
    "../supabase/migrations/20261122145120_enforce_maintenance_cost_approval.sql", import.meta.url
  ), "utf8"));
  await db.exec(await readFile(new URL(
    "../supabase/migrations/20261122152949_allow_in_house_work_orders.sql", import.meta.url
  ), "utf8"));
  await db.query(`update public.organizations
    set settings=settings || '{"work_order_owner_approval_threshold_minor":"100000",
      "work_order_completion_evidence_required":"false"}' where id=$1`, [organizationId]);
  // Earlier portal and invitation checks add other synthetic interests to this property.
  await db.query(`update public.ownership_interests set effective_to=current_date-1
    where organization_id=$1 and property_id=$2 and owner_entity_id not in ($3,$4)
      and effective_from<current_date and (effective_to is null or effective_to>=current_date)`,
  [organizationId, propertyId, ownerEntityA, ownerEntityB]);

  const as = (id) => db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${id}'; set request.jwt.claim.aal='aal2'`);
  const receipt = async (sql, inputs) => (await db.query(sql, inputs)).rows[0].receipt;
  const currentApproval = async (workOrderId) => {
    await db.exec("reset role");
    return (await db.query(`select a.id,a.owner_entity_id,a.approval_round,a.amount_minor,a.status,a.version
      from public.owner_approval_requests a join public.work_orders w on w.id=a.work_order_id
      where a.work_order_id=$1 and a.approval_round=w.owner_approval_round order by a.owner_entity_id`, [workOrderId])).rows;
  };
  const transition = (order, version, action, actual = null, reason = null) => receipt(
    `select public.transition_work_order(
       $1,$2,$3,$4,now()+interval '1 hour',now()+interval '2 hours',
       $5,'Completed the fixture repair.',null,$6
     ) as receipt`, [order, version, action, reason, actual, `cost-fixture-${randomUUID()}`]);

  await as(admin);
  const vendor = (await receipt(
    "select public.create_vendor($1,'Approval fixture vendor',null,null,'approval-fixture-new-vendor') as receipt",
    [organizationId],
  )).vendorId;

  async function openOrder(estimated = null, explicit = false, selectedVendor = vendor) {
    await as(resident);
    const request = await receipt(`select public.submit_maintenance_request(
      $1,'plumbing','Fixture repair request','A synthetic work order for owner approval.',
      null,null,'[]'::jsonb,array[]::uuid[],$2
    ) as receipt`, [tenancyId, `cost-fixture-${randomUUID()}`]);
    await as(admin);
    return receipt(`select public.create_and_assign_work_order(
      $1,$2,$3,'Repair fixture plumbing.',null,null,$4,$5,$6,null,$7
    ) as receipt`, [organizationId, request.maintenanceRequestId, selectedVendor, estimated, estimated === null ? null : "USD",
      explicit, `cost-fixture-${randomUUID()}`]);
  }

  const bringInProgress = async (order) => {
    await as(admin);
    await transition(order, 1, "accept");
    await transition(order, 2, "schedule");
    await transition(order, 3, "start");
  };
  const decide = (row, decision = "approved") => receipt(
    "select public.respond_to_owner_approval($1,$2,$3,$4,$5) as receipt",
    [row.id, decision, decision === "rejected" ? "Revise the fixture invoice." : null, row.version, `cost-fixture-${randomUUID()}`],
  );
  const post = (order, amount, key = `cost-fixture-${randomUUID()}`) => receipt(
    "select public.record_work_order_cost($1,$2,$3,'USD','Fixture ledger posting',$4) as receipt",
    [organizationId, order, amount, key],
  );
  const requestApproval = (order, amount, version, key = `cost-fixture-${randomUUID()}`) => receipt(
    "select public.request_work_order_cost_approval($1,$2,$3,'USD',$4,'Verified against invoice',$5) as receipt",
    [organizationId, order, amount, version, key],
  );
  const ownerUser = (row) => row.owner_entity_id === ownerEntityA ? ownerA : ownerB;

  const actualOnly = (await openOrder()).workOrderId;
  await expectDatabaseError(() => transition(actualOnly, 1, "assign_in_house"), "IN_HOUSE_ASSIGNMENT_UNAVAILABLE");
  await bringInProgress(actualOnly);
  const actualCompletion = await transition(actualOnly, 4, "complete", 150000);
  assert(actualCompletion.status === "awaiting_approval", "Omitting the estimate bypassed review of the actual expense.");
  const originalApprovals = await currentApproval(actualOnly);
  assert(originalApprovals.length === 2 && originalApprovals.every(row => Number(row.amount_minor) === 150000),
    "Approval did not carry the actual amount to both current owners.");
  await as(ownerUser(originalApprovals[0]));
  const firstDecision = await decide(originalApprovals[0]);
  assert(firstDecision.workOrderStatus === "awaiting_approval", "One co-owner completed an order without the other.");
  await as(ownerUser(originalApprovals[1]));
  const finalDecision = await decide(originalApprovals[1]);
  await as(admin);
  const closed = await transition(actualOnly, finalDecision.workOrderVersion, "close");
  await expectDatabaseError(() => post(actualOnly, 175000), "WORK_ORDER_COST_APPROVAL_REQUIRED");
  const requestKey = `cost-fixture-${randomUUID()}`;
  const newReview = await requestApproval(actualOnly, 175000, closed.version, requestKey);
  assert(newReview.approvalStatus === "pending" && newReview.approvalRound > originalApprovals[0].approval_round,
    "Finance overrun did not create a new approval round.");
  const requestReplay = await requestApproval(actualOnly, 175000, closed.version, requestKey);
  assert(JSON.stringify(requestReplay) === JSON.stringify(newReview), "The approval retry did not return its canonical receipt.");
  let revisedApprovals = await currentApproval(actualOnly);
  await as(ownerUser(revisedApprovals[0]));
  await decide(revisedApprovals[0], "rejected");
  await as(admin);
  await expectDatabaseError(() => post(actualOnly, 175000), "WORK_ORDER_COST_APPROVAL_REQUIRED");
  await db.exec("reset role");
  const workOrderAfterRejection = (await db.query("select version from public.work_orders where id=$1", [actualOnly])).rows[0];
  await as(admin);
  const rereview = await requestApproval(actualOnly, 170000, workOrderAfterRejection.version);
  assert(rereview.approvalRound > newReview.approvalRound, "A corrected invoice did not recover a rejected review.");
  revisedApprovals = await currentApproval(actualOnly);
  for (const row of revisedApprovals) {
    await as(ownerUser(row));
    const approved = await decide(row);
    assert(approved.workOrderStatus === "closed", "Financial review changed the closed maintenance lifecycle.");
  }
  await as(admin);
  const postKey = `cost-fixture-${randomUUID()}`;
  const cost = await post(actualOnly, 170000, postKey);
  assert((await post(actualOnly, 170000, postKey)).journalTransactionId === cost.journalTransactionId,
    "Posting retry duplicated its journal.");
  await db.exec("reset role");
  const history = (await db.query(`select count(*) filter (where r.status='approved')::int as approved,
      count(*) filter (where r.status='rejected')::int as rejected,
      count(*) filter (where r.status='canceled')::int as canceled
    from public.owner_approval_requests r where r.work_order_id=$1`, [actualOnly])).rows[0];
  assert(history.approved === 4 && history.rejected === 1 && history.canceled === 1,
    "Review replacement failed to preserve prior decisions or retire pending requests.");
  const balance = (await db.query(`select sum(e.debit_minor)::int as debit,sum(e.credit_minor)::int as credit,
    (t.metadata->>'ownerApprovalRound')::integer as approval_round from public.journal_entries e
    join public.journal_transactions t on t.id=e.journal_transaction_id
    where e.journal_transaction_id=$1 group by t.id`, [cost.journalTransactionId])).rows[0];
  assert(balance.debit === 170000 && balance.credit === 170000 && balance.approval_round === rereview.approvalRound,
    "The approved posting did not balance or link to its authorization.");

  const lowEstimate = (await openOrder(32000)).workOrderId;
  await bringInProgress(lowEstimate);
  assert((await transition(lowEstimate, 4, "complete", 120000)).status === "awaiting_approval",
    "An actual cost above the threshold bypassed review when its estimate was below the threshold.");
  const canceledApprovals = await currentApproval(lowEstimate);
  await as(admin);
  await transition(lowEstimate, 5, "cancel", null, "Work canceled for fixture verification.");
  await as(ownerA);
  await expectDatabaseError(() => decide(canceledApprovals.find(row => row.owner_entity_id === ownerEntityA)), "VERSION_CONFLICT");

  const small = (await openOrder()).workOrderId;
  await bringInProgress(small);
  assert((await transition(small, 4, "complete")).status === "completed", "A work order without an expense was blocked.");
  await expectDatabaseError(() => post(small, 101000), "WORK_ORDER_COST_APPROVAL_REQUIRED");
  assert((await post(small, 100000)).amountMinor === 100000, "An expense at the upper limit was blocked.");

  const approvedEstimate = (await openOrder(140000)).workOrderId;
  await bringInProgress(approvedEstimate);
  const estimateApprovals = await currentApproval(approvedEstimate);
  let estimateVersion;
  for (const row of estimateApprovals) {
    await as(ownerUser(row));
    estimateVersion = (await decide(row)).workOrderVersion;
  }
  await as(admin);
  const actualOverrun = await transition(approvedEstimate, estimateVersion, "complete", 160000);
  const overrunApprovals = await currentApproval(approvedEstimate);
  assert(actualOverrun.status === "awaiting_approval" && overrunApprovals.length === 2
    && overrunApprovals.every(row => row.status === "pending" && Number(row.amount_minor) === 160000
      && row.approval_round > estimateApprovals[0].approval_round),
    "An approved estimate improperly authorized a larger actual expense.");

  const draft = await openOrder(null, false, null);
  assert(draft.status === "draft", "Vendor-free work was assigned before explicit acceptance.");
  await expectDatabaseError(() => transition(draft.workOrderId, 1, "accept"), "INVALID_TRANSITION");
  const assignInHouse = () => receipt(`select public.transition_work_order(
    $1,1,'assign_in_house',null,null,null,null,null,null,'in-house-accept-fixture'
  ) as receipt`, [draft.workOrderId]);
  await as(resident);
  await expectDatabaseError(assignInHouse, "PROPERTY_SCOPE_DENIED");
  await as(admin);
  const inHouse = await assignInHouse();
  assert(inHouse.status === "accepted" && inHouse.version === 2
    && JSON.stringify(await assignInHouse()) === JSON.stringify(inHouse),
  "The explicit in-house assignment did not return its canonical receipt.");
  await transition(draft.workOrderId, 2, "schedule");
  await transition(draft.workOrderId, 3, "start");
  const inHouseCompletion = await transition(draft.workOrderId, 4, "complete", 145000);
  assert(inHouseCompletion.status === "awaiting_approval", "In-house work bypassed review of the actual expense.");
  const inHouseApproval = await currentApproval(draft.workOrderId);
  assert(inHouseApproval.length === 2 && inHouseApproval.every(row => Number(row.amount_minor) === 145000),
    "The in-house expense did not reach both owners.");
  let completedInHouse;
  for (const row of inHouseApproval) {
    await as(ownerUser(row));
    completedInHouse = await decide(row);
  }
  await as(admin);
  const inHouseLedger = await post(draft.workOrderId, 145000);
  await expectDatabaseError(() => transition(draft.workOrderId, completedInHouse.workOrderVersion, "assign_in_house"),
    "IN_HOUSE_ASSIGNMENT_UNAVAILABLE");
  await db.exec("reset role");
  const inHouseTrace = (await db.query(`select w.vendor_id,
    (select count(*)::int from audit.audit_events
      where resource_id=w.id and action_code='work_order.status_changed' and after_data->>'transition'='assign_in_house') as assignment_audits,
    (select count(*)::int from private.outbox_events where aggregate_id=w.id and event_type='work_order.assigned') as vendor_events,
    (select (metadata->>'ownerApprovalRound')::integer from public.journal_transactions where id=$2) as approval_round
    from public.work_orders w where w.id=$1`, [draft.workOrderId, inHouseLedger.journalTransactionId])).rows[0];
  assert(inHouseTrace.vendor_id === null && inHouseTrace.assignment_audits === 1 && inHouseTrace.vendor_events === 0
    && inHouseTrace.approval_round === inHouseApproval[0].approval_round,
  "In-house work lost its audit or approval link, or was announced as a vendor assignment.");

  const saleOrder = (await openOrder(140000)).workOrderId;
  await bringInProgress(saleOrder);
  await transition(saleOrder, 4, "complete", 140000);
  const beforeSale = await currentApproval(saleOrder);
  const successorEntity = randomUUID();
  await db.query(`update public.ownership_interests set effective_to=current_date-1
    where organization_id=$1 and property_id=$2 and owner_entity_id=$3`, [organizationId, propertyId, ownerEntityB]);
  await db.query("insert into public.owner_entities(id,organization_id,display_name,entity_type) values ($1,$2,'Fixture successor','person')",
    [successorEntity, organizationId]);
  await db.query(`insert into public.ownership_interests(organization_id,property_id,owner_entity_id,ownership_fraction,effective_from)
    values ($1,$2,$3,0.5,current_date)`, [organizationId, propertyId, successorEntity]);
  await db.query(`insert into public.user_relationships(user_id,organization_id,relationship_type,relationship_id,status)
    values ($1,$2,'owner_entity',$3,'active')`, [successor, organizationId, successorEntity]);
  await as(ownerA);
  await expectDatabaseError(() => decide(beforeSale.find(row => row.owner_entity_id === ownerEntityA)), "OWNER_APPROVAL_ROSTER_CHANGED");
  await as(admin);
  const saleReview = await requestApproval(saleOrder, 140000, 5);
  assert(saleReview.approvalRound > beforeSale[0].approval_round, "Changed ownership could not recover a pending review.");
  const afterSale = await currentApproval(saleOrder);
  assert(afterSale.some(row => row.owner_entity_id === successorEntity) && afterSale.every(row => row.owner_entity_id !== ownerEntityB),
    "The replacement request retained an obsolete recipient.");
  await as(admin);
  const updatedSaleReview = await requestApproval(saleOrder, 133000, saleReview.version);
  const afterInvoiceCorrection = await currentApproval(saleOrder);
  assert(updatedSaleReview.approvalRound > saleReview.approvalRound
    && afterInvoiceCorrection.every(row => row.status === "pending" && Number(row.amount_minor) === 133000),
    "A lower corrected invoice stayed attached to an outdated pending amount.");
  await as(resident);
  await expectDatabaseError(() => requestApproval(saleOrder, 190000, updatedSaleReview.version), "PROPERTY_SCOPE_DENIED");
  await db.exec("reset role");
  return { estimateOptional: true, thresholdEnforced: true, approvedCeilingEnforced: true,
    unanimous: true, cancellationRetiresRequests: true, rejectionAndSaleRecoverable: true,
    balancedLedgerWithApprovalRound: true, approvalAndPostingIdempotent: true, inHouseWorkOrderLifecycle: true };
}
