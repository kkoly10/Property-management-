# First-time renter signing

The operator starts from the verified application’s prepared lease. The owner
approves the current draft revision and the matching current clean PDF. If the
application has a private evidence packet, sending requires the current manual
review receipt. The envelope identifies the applicant, exact PDF version and
hash, approved term digest, and approved currency. Crecy sends the signing
invitation to the application’s verified email address.

The invitation’s fragment carries a random credential. Opening the page does
not consume it, create an account, or dispatch a second email. An explicit
continue request can send a rate-limited sign-in email to the expected address.
Crecy can create an unconfirmed authentication account for a first-time renter.
The second email returns to the exact agreement on Crecy Living and works in
a different browser. Its ten-minute credential is in the fragment and binds
the Supabase single-use sign-in token to the current invitation and agreement.
Opening the link displays a **Continue to agreement** button. Only selecting it
redeems the sign-in token and claims the agreement. An already verified,
matching account can claim directly.
A different account cannot claim or discover the agreement. The resulting
authority is the named agreement signer. Tenancy and workspace relationships
have separate workflows.

The landlord and renter sign the same PDF. The renter counts as a required
party before the account is claimed. The existing explicit review,
electronic-signature consent, and intent controls remain required. An identical
signature retry returns the exact original signing receipt. The invitation
worker tracks delivery independently of signature state.

The issuing operator can explicitly resend an open invitation while the renter
still needs to sign. The operator selects the existing agreement and confirms
delivery to the unchanged, verified application email. An authorized MFA
session is required. Each new request preserves the approved terms, PDF,
existing signatures, and original deadline. The previous invitation and any
unredeemed sign-in link it produced become invalid. The same submitted
operation replays the original send receipt. New requests are at least five
minutes apart, with up to three resends per agreement.

An open or executed application-linked envelope freezes approved terms and
its PDF. Void or expiration permits revision and a new signing request.
Filing an executed agreement selects the pinned version on the linked lease
draft. Applying the lease uses the existing tenancy activation permissions and
application conversion transaction. The applicant can continue to see the
executed receipt through the verified signer account after application
conversion. The signed download contains the original PDF, signature evidence
JSON, and SHA-256 checksums. The application entry also identifies whether the
tenancy is pending setup, scheduled, recorded, or closed.

This flow covers the verified applicant as one required lessee, and the
authorized landlord. It supports a future move-in date. Independent agreements
retain their existing multi-party workflow. The new envelope expiry cannot
extend into the entered occupancy start. Provider delivery, physical handover,
and resident portal invitations remain independently recorded.

Apply `20261123055219_applicant_agreement_claim_and_binding.sql` after the
private evidence migration. After the updated operator application serves
the new issue command, apply the contract migration
`20261123060522_retire_unapproved_application_agreement_issue.sql`.
