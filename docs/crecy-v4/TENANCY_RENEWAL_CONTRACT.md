# Same-tenancy fixed-term renewal

Use this flow for an operator-uploaded signed renewal that extends a finite lease
for the same household with the same rent, currency, and billing cadence. The
next term begins the day after the recorded lease end. The operator supplies the
new end date, confirms the first charge shown from the existing cadence, selects
the clean PDF version, and confirms the signed renewal reflects these terms.

The property-scoped read accepts `lease.read` or `lease.manage`. Scheduling and
transition require property-scoped `lease.manage`, `finance.manage`, and
`documents.manage`. The active workspace and exact tenancy are explicit.
The current lease, document, unit, accounting book and receivable account are
checked at scheduling and again when recording the effective term.

Scheduling reserves the contiguous range under the same unit lock and overlapping
possession constraint used for independent tenancies. It changes the tenancy's
operational reservation end. The existing signed lease, rent schedule, resident
access, and posted accounts continue as recorded. The pending PDF stays reserved
for this renewal. Canceling a pending renewal releases the extension and PDF.
Physical handback closes the tenancy and prevents applying a pending renewal.

On or after the property-local start, an authorized operator applies the
renewal while the same household is still active. For recurring rent, the first
charge date must still be current or future. The transition inserts a new lease
linked to the previous lease, adds its rent schedule on the existing receivable
account, and makes the exact signed PDF available through the existing tenancy
access. Both signed terms, earlier charge schedules, parties, and journals
remain in history. The recurring worker posts future charges through its usual
schedule. The renewal transition itself creates no charge, opening balance,
payment, journal, or provider action.

The product supports this specific continuation. A new household uses a
distinct tenancy and possession handback. A changed rate, cadence, currency,
allocation, or household requires explicitly governed amended terms. Native
signing envelopes still have a one-to-one tenancy filing constraint. Neither an
open-ended rollover nor a missed first charge is inferred. These cases remain
outside this command, as do legal notices and automatic contract decisions.

The migration is forward-only. Apply it before serving the renewal routes.
