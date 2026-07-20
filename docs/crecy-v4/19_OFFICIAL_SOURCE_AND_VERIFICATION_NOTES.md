# Official Source and Verification Notes

**Last reviewed:** 2026-07-19  
**Policy:** Use primary/official sources for payment, privacy, security, platform, and language requirements. Re-verify before production because provider capabilities and laws change.

## Stripe Connect/payment architecture

1. Stripe — SaaS platforms and marketplaces with Connect  
   https://docs.stripe.com/connect/saas-platforms-and-marketplaces  
   Verifies the SaaS pattern in which connected accounts act as merchant of record, may pay Stripe fees directly, and platforms may charge subscriptions/application fees.

2. Stripe — Direct charges  
   https://docs.stripe.com/connect/direct-charges  
   Verifies that direct charges live on connected accounts, increase connected-account balances, are suited to SaaS platforms, and require connected-account context to retrieve payment objects.

3. Stripe — Direct-charge fee-payer behavior  
   https://docs.stripe.com/connect/direct-charges-fee-payer-behavior  
   Verifies that `account` fee-payer behavior charges processing/dispute fees to the connected account; legacy Standard accounts map to this behavior.

4. Stripe — SaaS fee billing to connected accounts  
   https://docs.stripe.com/connect/integrate-billing-connect  
   Verifies Accounts v2 responsibility fields, full Dashboard configuration, separate SaaS billing, and fees/loss responsibility options. Implementation must check whether the project uses Accounts v1 or v2 before coding.

5. Stripe — Bank transfers  
   https://docs.stripe.com/payments/bank-transfers  
   Verifies MXN bank transfer availability, Connect support, refunds/partial refunds, and asynchronous reconciliation behavior.

6. Stripe — ACSS debit  
   https://docs.stripe.com/payments/acss-debit  
   Verify Canadian debit mandates, delayed confirmation, return handling, Connect, and recurring-payment support immediately before implementation.

## Supabase/PostgreSQL security

7. Supabase — Row Level Security  
   https://supabase.com/docs/guides/database/postgres/row-level-security  
   Verifies use of `auth.uid()`, danger of user-editable metadata for authorization, role-targeted policies, indexed policy predicates, and security-definer helper patterns.

8. Supabase — Storage access control  
   https://supabase.com/docs/guides/storage/security/access-control  
   Re-verify upload/download policy requirements and signed URL behavior before storage implementation.

9. PostgreSQL — Row security policies  
   https://www.postgresql.org/docs/current/ddl-rowsecurity.html  
   Canonical database behavior for RLS, permissive/restrictive policy combination, and table owner/service role considerations.

## United States privacy/security/communications

10. FTC — Privacy and Security  
    https://www.ftc.gov/business-guidance/privacy-security

11. FTC — Start with Security  
    https://www.ftc.gov/business-guidance/resources/start-security-guide-business

12. Virginia Code §§ 59.1-578 to 580  
    https://law.lis.virginia.gov/vacode/title59.1/chapter53/section59.1-578/  
    https://law.lis.virginia.gov/vacode/title59.1/chapter53/section59.1-579/  
    https://law.lis.virginia.gov/vacode/title59.1/chapter53/section59.1-580/

13. FTC — CAN-SPAM compliance guide  
    https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business

14. FTC — Consumer reports for landlords  
    https://www.ftc.gov/business-guidance/resources/using-consumer-reports-what-landlords-need-know  
    Screening is excluded from P0.

15. U.S. DOJ — Web accessibility guidance  
    https://www.justice.gov/archives/opa/pr/justice-department-issues-web-accessibility-guidance-under-americans-disabilities-act

## Canada

16. Office of the Privacy Commissioner of Canada — PIPEDA business guide  
    https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/pipeda-compliance-help/guide_org/

17. OPC Canada — Meaningful consent  
    https://www.priv.gc.ca/en/privacy-topics/business-privacy/collecting-personal-information/consent/info_mc/

18. OPC Canada — Breach reporting  
    https://www.priv.gc.ca/en/privacy-topics/business-privacy/breaches-and-safeguards/privacy-breaches-at-your-business/gd_pb_201810/

19. CRTC — CASL guidance  
    https://crtc.gc.ca/eng/internet/anti/reg.htm

20. OQLF — Language of commerce and business  
    https://www.oqlf.gouv.qc.ca/francisation/droits_linguistiques/droits/langue-du-commerce-et-des-affaires.html

## Mexico

21. Diario Oficial de la Federación — March 20, 2025 private-sector personal-data law decree  
    https://www.dof.gob.mx/nota_detalle.php?codigo=5752569&fecha=20/03/2025

22. PROFECO — Virtual store monitoring  
    https://www.profeco.gob.mx/tiendasvirtuales/

23. SAT — official tax/invoicing portal  
    https://www.sat.gob.mx/  
    Obtain a Mexico tax memo before implementing CFDI issuance. Preserve tax-ready fields and exports in P0; do not claim automated compliant CFDI until an approved provider/integration exists.

## PCI

24. PCI Security Standards Council — SAQ A eligibility guidance  
    https://www.pcisecuritystandards.org/faqs/1588/

## Verification procedure

Before production activation, record:

- reviewer name and date;
- exact source URL and archived copy/hash where permitted;
- affected feature and country;
- implementation decision/ADR;
- tests and UI copy changed;
- next review date.

An official source does not substitute for qualified legal/tax advice when the checklist assigns professional approval.
