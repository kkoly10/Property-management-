# Account continuity

Decision recorded November 22, 2026.

Crecy retains password login and one-time email sign-in. A signup request uses a new provider key for a newly minted email credential. A retry of that send reuses its original key and message. The public outcome stays neutral across account and mail states. Provider failures leave an existing or pending identity intact so the owner can use a received link or request a fresh one.

The recovery request shares the sign-in throttle and uses the configured origin for the recipient’s product. Crecy signs recovery intent because the auth provider stores magic-link and recovery tokens in the same category. Opening the email stages the signed capability in a short-lived HttpOnly cookie. The token stays out of the destination URL. Only password submission redeems it. The reset form binds to the staged flow, and a separate in-memory provider client updates the verified user without replacing another browser session. A successful reset requests global refresh-session revocation. Already issued access tokens remain subject to the provider’s token expiry.

The OS header and setup header expose sign-out. Living and Owner expose sign-out in Preferences. Each action revokes the current provider session when available and clears the current host’s project session, verifier, workspace selection and staged recovery cookies. Independent sessions on other product hosts follow their own provider state.

This change reuses the existing service-only throttle RPC and needs no schema migration. The optional recovery signing secret can be rotated independently. Links signed before rotation can be replaced through the recovery screen. Supabase Auth and mail production configuration still require controlled verification. Account email changes and lost-factor recovery require their own identity and authorization workflows.
