# Signing a prepared rental application

From a verified rental application, choose **Prepare lease**. Return to the application and open **Agreement signing**. The verified workspace owner uses MFA and chooses an exact clean private agreement PDF for the rental. Crecy derives the sole renter from the verified application's stored email and requires one existing confirmed Crecy account at that address. The form shows the recorded applicant and rental. The operator confirms authority and initiates the signing request.

The request binds the application, application version, original operator's exact draft, rental, and PDF version. A prepared application allows one pending request at a time. A void, decline, or expiration allows the operator to issue a replacement. The current agreement can be reopened from the application. The parties use the existing signing flow, and the operator can share the existing participant link directly.

After both parties sign, the operator files the executed agreement and opens **Continue application lease setup**. Choose the filed version and review the household and terms before confirming activation. The case conversion, tenancy, document filing, and the exact agreement commit together. Closure or withdrawal removes the draft and voids pending requests. Executed evidence remains in the agreement history, and a closed or withdrawn application's agreement cannot activate a different tenancy.

Apply migration `20261122153750_bind_applicant_to_rental_agreement.sql` before deploying the new controls. Existing application, agreement, and activation command signatures remain available. Keep the migration in place on an application rollback to retain the binding.

The linked path covers one applicant with an existing confirmed account. Account enrollment, co-applicant intake, hosted signing and Storage delivery, and professional legal and launch certification have separate gates. A previously issued short-lived Storage download URL follows its existing expiration.
