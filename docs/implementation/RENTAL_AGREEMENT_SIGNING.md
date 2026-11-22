# Pre-tenancy rental agreement signing

## Scope

This local native ceremony uses an operator-supplied PDF and already verified Crecy accounts. An active workspace owner with MFA attests signing authority and names one to eight distinct lessees. The scanner must clear the property's or unit's specific agreement-source PDF version. The landlord can share the participant link with those named. The link identifies a package. An authorized identity is required before Crecy shows it.

Each party reviews the exact version and acknowledges the published disclosure before signing. The trusted server derives the signer from the verified session. PostgreSQL binds the signature to source version, digest, capacity, time, and disclosure. Execution under the package lock requires every named signature. Participants can retrieve the PDF and the exact JSON evidence text once all parties sign. An operator can void a pending request with MFA and an unsigned lessee can decline. An expired request cannot collect further signatures.

## Deployment and remaining work

Deploy the expand migration before the application. The migration adds private tables and isolated commands. It leaves existing delivered-document signing and externally signed lease intake available. Signing creates no household, charge, schedule, tenancy or portal grant. An authorized operator explicitly files the executed package, which makes its PDF selectable for the existing tenancy activation flow. Activation rechecks the unit, clean source and exact named renters before linking the package once. The activation path continues to apply the existing possession, financial and application rules. The operator transcribes and confirms the tenancy terms from their agreement. Crecy keeps the original PDF and signature record together as evidence.

This is an implementation for synthetic evaluation. The Docusign sandbox decision, provider sandbox credentials, independent evidence retention, account bootstrap for new renters, landlord agents/agency evidence, and counsel review remain open. The evidence digest verifies the returned bytes against the stored digest. Separately retained artifacts and audit evidence are required to detect privileged changes. Restore testing must cover both the database record and the source PDF bytes.

## Verification

The local validator covers verified named access, cross-workspace denial, MFA, invalid source and consent, partial and full execution, direct privilege denial, stable replay, exact evidence bytes, decline, void, expiry, and zero tenancy access from signing. It also covers separately approved filing, substituted and changed renter address denial, exact artifact and execution timestamp, and one scheduled activation across retries. Artifact route tests cover scoped lookup, cache headers, byte-level digest verification and refusal to sign unexpected storage paths.
