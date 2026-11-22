# Move-in handover

An operator with lease management access can plan or reschedule an appointment for an exact scheduled tenancy, record a missed appointment, and confirm the actual possession date. Handover records include the number of keys or access devices and a condition checklist reference. The form asks the operator to confirm the existing lease and rent dates.

A planned or missed appointment holds the scheduled tenancy. Confirmation requires a property-local date within the signed term and vacant possession. The next eligible scheduler run checks that the lease is active, the exact pinned source is clean, and the previous household completed handback before the date it promotes the new tenancy. Existing unplanned tenancies continue through the same scheduler. A handover records operational facts. Amendments to legally effective dates or payment terms require their own workflow.

The versioned command locks the unit and tenancy, preserves prior appointments and records each successful operation once. The embedded fixture covers scope, retries, rescheduling, no-show, clean-source eligibility, keys and condition, and unchanged rent dates. Native PostgreSQL replay uses a synthetic tenancy.
