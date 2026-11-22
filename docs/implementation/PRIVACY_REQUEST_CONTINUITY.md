# Privacy request history and receipts

My requests shows only cases submitted by the signed-in account. Request ownership follows the original authenticated user ID when a rental relationship ends, an organization membership expires, or the account chooses another workspace. The personal history can move back through older cases without accepting a cursor owned by another account. The selected workspace shows cases routed to that organization, subject to current review permission.

A verified requester can open an exact case receipt from personal history and complete the authenticator check on the receipt's URL. The receipt shows case metadata comprising the controller name, request type, current status, reference, and submission, verification, target, and closure timestamps. It derives from the durable case after transient command receipts expire.

The intake API preserves the existing requirements for starting a new organization case. A matching retry using the original request key can confirm an earlier submission after access changes. The requester can finish verifying or canceling a previously submitted case after their relationship ends. Cancellation retires the associated unfinished jobs. The requester can reopen the terminal receipt to confirm the final state.

Apply migration `20261122151039_preserve_privacy_request_receipts.sql` before the application. Existing workspace, submit, verify, and cancel signatures remain available. The migration narrows existing database projections, so keep it in place on application rollback. Resume the receipt UI through a forward redeploy.

The local database fixtures cover expired relationship and reviewer access, personal and workspace isolation, identity step-up, intake replay, pagination, and cancellation after idempotency cleanup. Checkout and staging can rehearse the authenticated receipt with synthetic data. Automated fulfillment still needs an approved retention and legal-hold policy, controller procedures, a scoped artifact delivery path, and independently verified worker operation.

## Account export and workspace outcomes

A verified requester can download a JSON file for a platform access or export case from its personal receipt. The download independently checks MFA and ownership. It contains the signed-in user's account profile, notification preferences, and up to 500 platform-only consent records. The case continues to track the wider review.

A workspace manager with organization-wide authorization and MFA can record an outcome that the operator has already reviewed. The command matches the active organization and exact verified operator-controlled request, records one audit event and outbox event, preserves held jobs, and cancels queued jobs on terminal disposition. The requester's verified receipt shows the decision explanation. An internal reference stays in the audit trail.

The command records partial or denied deletion outcomes. Full automated deletion and subprocessor tasks require a retention policy, a hold register, and independently tested workers.

Apply `20261122161723_phase_8_privacy_fulfillment.sql` before the application update. Receipt and workspace responses are additive, and the migration preserves the existing commands for an application rollback.
