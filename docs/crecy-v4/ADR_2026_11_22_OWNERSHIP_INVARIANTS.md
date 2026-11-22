# Staff continuity and effective-dated ownership

Decision recorded November 22, 2026.

## Staff continuity

Staff commands serialize writes per organization before reading final authority or taking invitation and membership row locks. The organization permission is checked again after waiting. This orders concurrent revocations, role changes, scope changes, invitations, acceptance and abandonment. Organization creation supplies its first owner in the same transaction.

When a staff change removes or shortens an active owner's remaining tenure, the resulting active owner intervals must extend continuously from the decision time. Each membership covers its start up to, but excluding, its end. Adjacent intervals support an exact handoff. The recipient accepts their own invitation before the membership can be edited or counted toward continuity. Invitation cleanup only withdraws an undelivered invitation for a membership that still awaits acceptance. It preserves valid date bounds when the planned start is still in the future.

## Property ownership

New ownership interests serialize writes per property. Interest dates are inclusive. A new write rejects overlaps for the same owner and rejects a total above 100% at any affected start date. Partial allocations remain available during setup. The statement engine still requires exactly 100% ownership on dates containing qualifying ledger activity.

## Migration and recovery

The forward migration replaces the affected RPC definitions in place and adds a private write-lock table. Existing clients retain their RPC signatures, grants, audit events and replay identifiers. Each lock acquisition updates its key row. A waiting request at READ COMMITTED rereads the committed state. A stale higher-isolation transaction receives a serialization failure and can retry the whole transaction.

Existing memberships, interests, audit events and statement snapshots remain intact. An existing legacy owner gap requires a verified recovery decision. Extending a valid owner's tenure or adding an accepted successor can repair coverage. Existing historic interest conflicts require the owner and a qualified accounting reviewer to establish effective dates and corrections. Resolving those conflicts must preserve posted ledger entries and statement snapshots.

Use the standard schema suite for permission, replay, invitation, interval and allocation assertions. Use isolated PostgreSQL sessions to verify the write order for revocation and interest creation, including a higher-isolation retry. These checks use synthetic identities and records.
