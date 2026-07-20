# 09 — Privacy, Security, Consumer, Payment, and Platform Compliance Specification

**Status:** Senior-engineering compliance baseline for counsel review  
**Markets:** United States, Canada, Mexico  
**Scope:** The platform's own legal, privacy, security, payment, accessibility, communications, subscription, and consumer-protection obligations.  
**Not in scope:** Determining the legality of an operator's lease, deposit, rent increase, notice, eviction, screening decision, or property-management activity.

> This specification is a product and compliance architecture document, not legal advice. Country counsel must approve the final legal documents and launch posture.

---

## 1. Executive decision

The platform will operate nationwide in the United States, Canada, and Mexico as neutral property-management software.

Operators remain responsible for:

- Their leases, addenda, notices, and property rules
- Compliance with landlord-tenant and fair-housing laws
- Security-deposit handling
- Applicant and resident decisions
- Late fees, rent increases, and other operator-configured charges
- Property-management, brokerage, and licensing obligations
- Their relationship with property owners and vendors

The platform remains responsible for:

- Its own privacy notices and data practices
- Security of data under its control
- Data-processing contracts and subprocessors
- Consumer privacy rights workflows
- Payment-interface disclosures and Stripe Connect configuration
- SaaS subscription billing and cancellation
- E-sign consent and audit evidence
- Marketing email and SMS compliance
- Accessibility of its applications
- Incident and breach response
- Language obligations for its own commercial materials
- Tax treatment of its SaaS fees and any platform fees
- Accuracy of its own claims and representations

The platform must never imply that being “software only” removes these obligations.

---

## 2. Privacy role model

The same company may be a **controller/business** for one processing activity and a **processor/service provider** for another. Role is determined by the purpose and context of processing.

### 2.1 Platform as controller/business

The platform determines the purposes and means of processing for:

- Operator account creation and authentication
- SaaS subscription billing
- Product security and fraud prevention
- Support tickets and support communications
- Platform analytics necessary to operate and improve the service
- Marketing leads, newsletters, and sales activity
- Platform audit logs
- Compliance records
- Platform employee and contractor records

### 2.2 Platform as processor/service provider

The platform processes data on an operator's instructions for:

- Residents and household members
- Lease and tenancy records
- Property-owner records
- Operator-uploaded documents
- Maintenance requests and inspection evidence
- Rent ledgers and operator-configured charges
- Operator communications to residents and owners
- Applicant information when application workflows are enabled

### 2.3 Operator as controller/business

The operator determines why resident, owner, applicant, vendor, lease, and property data are collected and how those data are used for property operations.

### 2.4 Contract requirement

Every paid operator agreement must incorporate a Data Processing Addendum that defines:

- Processing instructions
- Purpose, scope, duration, and data categories
- Confidentiality obligations
- Security controls
- Subprocessor conditions
- Assistance with rights requests and breach response
- Data return or deletion at termination
- Audit or independent-assessment rights
- Cross-border processing disclosures
- Allocation of controller and processor responsibilities

This structure aligns with controller/processor contract duties found in laws such as Virginia's Consumer Data Protection Act and with Canadian accountability guidance for service providers. [S4] [S8]

---

## 3. Privacy principles approved for the product

The platform adopts one global baseline that can be strengthened by regional addenda.

### 3.1 Data minimization

Collect only data required for a documented product purpose. Do not collect Social Security numbers, Social Insurance Numbers, CURP, passport data, government IDs, precise geolocation, bank credentials, or sensitive demographic data unless an enabled workflow and approved country specification require them.

The FTC recommends inventorying data, keeping only what is needed, limiting access, disposing of data when no longer necessary, and planning for incidents. [S1] [S2]

### 3.2 Purpose limitation

Every collected field must map to a declared processing purpose. New purposes require privacy review and, when applicable, fresh consent.

### 3.3 Least privilege

Users, staff, support personnel, vendors, and service accounts receive only the minimum access needed. Sensitive access is logged.

### 3.4 Privacy by default

Defaults must be the least invasive reasonable configuration:

- No sale of personal information
- No cross-context behavioral advertising in resident, owner, or operator portals
- No use of operator content to train public or shared AI models
- No public resident profiles
- No public property documents
- No precise-location collection unless explicitly needed
- Marketing communication preferences off unless valid consent or another lawful basis exists

### 3.5 Transparency

Privacy notices must clearly explain:

- Categories of data collected
- Sources
- Purposes
- Recipients and subprocessors
- Retention approach
- International transfers
- Rights and request methods
- Contact details
- Whether data is sold or shared for targeted advertising
- Material risks for sensitive processing

Virginia expressly requires a clear privacy notice, data minimization, security practices, rights methods, and disclosure of sale or targeted-advertising activity. [S3]

### 3.6 No dark patterns

Privacy, cancellation, consent, payment, and communication controls must be easy to understand and must not manipulate users into unintended choices.

---

## 4. Required public and contractual documents

The launch is not compliant with only a Privacy Policy and Terms of Service.

### 4.1 Global documents

1. **Operator Terms of Service**
2. **Resident and Owner Portal Terms**
3. **Global Privacy Notice**
4. **Data Processing Addendum**
5. **Subprocessor List**
6. **Cookie and Tracking Notice**
7. **Acceptable Use Policy**
8. **Security and Trust Overview**
9. **E-Sign Consent and Electronic Records Disclosure**
10. **Payment and Stripe Connect Disclosure**
11. **SaaS Subscription and Cancellation Terms**
12. **Communications Consent and Preference Notice**
13. **Accessibility Statement**
14. **AI Features and Data-Use Addendum**
15. **Document Import and Operator Responsibility Notice**
16. **Data Retention Summary**
17. **Vulnerability Disclosure Policy**

### 4.2 United States addenda

- U.S. State Privacy Rights Addendum
- California Notice at Collection and CCPA/CPRA disclosures when applicable
- U.S. marketing-email notice
- U.S. SMS/telephone-consent language
- Tenant-screening/FCRA addendum before screening is enabled
- State breach-response matrix maintained internally

### 4.3 Canada addenda

- Canada Privacy Addendum under PIPEDA and applicable provincial laws
- CASL consent and unsubscribe language
- Quebec Privacy Addendum where applicable
- Complete French versions of commercial website, product interface, notices, invoices, and customer-facing documents used in Quebec

The Office québécois de la langue française states that businesses operating in Quebec must provide a complete French version of their commercial website and commercial publications. [S12]

### 4.4 Mexico addenda

- Spanish **Aviso de Privacidad Integral**
- Short-form privacy notice at data-collection points
- Mexico consumer and e-commerce terms
- Mexico cancellation and complaint process
- Spanish payment and subscription disclosures
- Mexico tax and invoicing addendum after SAT classification

Mexico enacted a new Federal Law on Protection of Personal Data Held by Private Parties on March 20, 2025, replacing the 2010 law. The law applies nationwide and defines the privacy notice as the document informing data subjects of processing purposes. [S14] [S15]

---

## 5. Privacy notice structure

The final Privacy Notice should use a layered design rather than one legal wall of text.

### 5.1 First layer

Show concise, plain-language summaries of:

- Who operates the platform
- What information is collected
- Why it is used
- Whether the platform acts for an operator
- Who receives information
- How to exercise rights
- How to contact the privacy team

### 5.2 Detailed sections

1. Scope and covered users
2. Roles of the platform and operators
3. Categories of personal information
4. Sources
5. Purposes
6. Payment information and Stripe
7. Operator-uploaded documents
8. Maintenance photos and property evidence
9. Cookies and analytics
10. AI-assisted features
11. Sharing and subprocessors
12. International transfers
13. Retention
14. Security
15. Privacy rights
16. Marketing preferences
17. Children and household-member accounts
18. Changes to the notice
19. Regional addenda
20. Contact and complaints

### 5.3 Privacy notice promises

Do not promise absolute security, zero sharing, or deletion when legal retention may apply. The FTC emphasizes that businesses must honor the privacy promises they make. [S1]

---

## 6. Data inventory and classification

Every production table, storage bucket, analytics event, log, and integration must be mapped in a data inventory.

### 6.1 Classification levels

| Level | Examples | Required controls |
|---|---|---|
| Public | Public operator storefront information | Integrity controls |
| Internal | Product configuration, non-sensitive logs | Authentication and role controls |
| Confidential | Resident contacts, leases, payment status, owner statements | Encryption, RLS, audit, retention |
| Restricted | Government ID, bank-account metadata, screening reports, signed legal documents | Field masking, step-up access, enhanced logs, minimal retention |

### 6.2 Prohibited storage

The platform must not store:

- Raw card numbers
- Card CVV
- Online banking credentials
- Stripe secret data that belongs only to Stripe
- Passwords in plaintext
- Full government identifiers in analytics or application logs
- Real user data in development fixtures

### 6.3 Data map requirement

The compliance inventory must identify:

- Data category
- Purpose
- Source
- Controller
- Processor
- System of record
- Subprocessors
- Countries of processing
- Retention class
- Rights eligibility
- Deletion mechanism
- Encryption status
- Responsible owner

---

## 7. Consent and preference architecture

Create a canonical consent ledger.

### 7.1 Required fields

```text
consent_records
- id
- person_id
- organization_id nullable
- consent_type
- purpose_code
- legal_document_version_id
- status
- granted_at
- withdrawn_at nullable
- locale
- source_surface
- session_id
- evidence_hash
- created_at
```

### 7.2 Separate consent categories

Do not bundle:

- Terms acceptance
- Privacy acknowledgement
- E-sign consent
- Marketing email
- Marketing SMS
- Optional analytics
- AI document processing
- Screening authorization
- Recurring debit mandate

### 7.3 Canada meaningful consent

Canadian consent should prominently explain what is collected, who receives it, purposes, consequences, and meaningful risks. Optional uses must have a genuine choice, and significant changes may require fresh consent. [S9] [S10]

### 7.4 Transactional versus marketing messages

Rent reminders, receipts, maintenance updates, security notices, and account statements must be sent through transactional templates that contain no unrelated promotion.

Marketing campaigns use separate audiences, consent rules, templates, and suppression lists.

---

## 8. Privacy rights center

Implement a single rights center capable of routing requests by jurisdiction.

### 8.1 Supported request types

- Access or know
- Correction
- Deletion or cancellation
- Portability/export
- Objection or opt-out
- Restriction where applicable
- Withdrawal of consent
- Appeal of a denied request where applicable
- Marketing unsubscribe
- Request concerning automated or AI-assisted processing

### 8.2 Routing model

```text
Request submitted
→ identity verification
→ determine platform/controller role
→ route to platform or operator
→ collect records from systems and subprocessors
→ legal-hold and retention checks
→ approve, partially approve, or deny with reason
→ deliver securely
→ record completion and evidence
```

### 8.3 Operator-assisted requests

When the platform is a processor, the operator remains responsible for the substantive response, while the platform provides tools to locate, export, correct, restrict, or delete data.

### 8.4 Global operational target

- Acknowledge within 5 business days
- Complete ordinary verified requests within 30 calendar days when feasible
- Apply the shorter or otherwise mandatory country deadline where required
- Preserve extensions, appeals, exemptions, and denial reasons by jurisdiction

The global target is an internal service goal and does not replace statutory deadlines.

---

## 9. Retention and deletion

A user deleting an account does not mean every record can immediately disappear. The platform needs a documented retention schedule and legal-hold process.

### 9.1 Retention classes

| Data class | Baseline policy |
|---|---|
| Marketing lead | Delete or anonymize after inactivity period approved by counsel |
| Authentication/session logs | Short security retention unless incident hold applies |
| Support records | Retain for operational and dispute period |
| SaaS invoices and tax records | Retain for statutory tax/accounting period |
| Operator content | Retain while contract is active; export/delete after termination subject to operator instructions and law |
| Payment metadata | Retain for accounting, dispute, and audit periods; do not retain raw card data |
| Signed documents | Operator-controlled retention, versioning, and legal-hold rules |
| AI prompts/outputs | Minimal retention; no model-training reuse by default |

### 9.2 Deletion architecture

Use deletion jobs that:

- Verify authorization
- Discover linked records
- Respect legal holds
- Remove or anonymize eligible data
- Notify subprocessors
- Record proof of completion
- Preserve minimal compliance evidence without preserving deleted content

### 9.3 Termination export

Operators must have a structured export before deletion:

- CSV/JSON business records
- Original documents
- Audit-history export where appropriate
- Payment and ledger reports
- Ownership and resident relationships

---

## 10. Security program

The platform must maintain a written information-security program proportionate to the sensitivity and volume of rental, financial, and identity data.

### 10.1 Governance

- Appoint a security owner and privacy owner
- Maintain risk register
- Perform annual security and privacy risk assessment
- Review high-risk changes before release
- Train employees and contractors
- Maintain vendor-security reviews
- Carry cyber-liability insurance before production payment collection

### 10.2 Identity and access

- MFA required for platform administrators and privileged operator roles
- Step-up authentication for payout/bank changes, exports, impersonation, and sensitive documents
- Short-lived sessions for privileged access
- Session revocation and device history
- Property- and role-scoped authorization
- Database RLS as a mandatory second control layer
- Quarterly privileged-access review

### 10.3 Application security

- Secure development lifecycle
- Dependency and secret scanning
- Static analysis
- Dynamic testing of critical routes
- Input validation and output encoding
- CSRF, XSS, SSRF, injection, and file-upload controls
- Signed URLs for private files
- Malware scanning for uploads
- Rate limiting and bot controls
- Immutable audit events for financial and privileged actions

### 10.4 Infrastructure

- Encryption in transit and at rest
- Separate production, staging, and development environments
- No production data in local development
- Encrypted backups and restoration tests
- Secret manager with rotation
- Centralized logs and alerts
- Defined RPO and RTO
- Regional and provider outage runbooks

### 10.5 Independent assurance

Recommended sequence:

1. Internal control baseline using NIST CSF or CIS Controls
2. Independent penetration test before broad launch
3. SOC 2 Type I when selling to larger operators
4. SOC 2 Type II after controls have operated long enough to demonstrate effectiveness

SOC 2 is a commercial assurance objective, not a universal launch-law requirement.

---

## 11. Incident and breach response

All U.S. states and several territories have breach-notification laws, and the rules differ by affected resident, data type, timing, and regulator. [S6]

Canada requires organizations subject to PIPEDA to report breaches posing a real risk of significant harm, notify affected people, and keep records of all security breaches. [S11]

### 11.1 Required incident stages

```text
Detect
→ contain
→ preserve evidence
→ classify data and affected people
→ determine controllers and processors
→ assess jurisdictional notification duties
→ notify operators and subprocessors
→ notify regulators and individuals when required
→ remediate
→ complete post-incident review
```

### 11.2 Incident records

```text
security_incidents
breach_assessments
jurisdiction_notification_decisions
regulator_notifications
individual_notifications
corrective_actions
```

### 11.3 Contractual timeline

The DPA should require the platform to notify the operator of a confirmed personal-data incident without undue delay and within a counsel-approved maximum contractual period.

Do not hardcode one public promise before counsel reconciles U.S., Canadian, Mexican, and contract requirements.

### 11.4 Exercises

- Tabletop exercise before production
- Annual exercise thereafter
- Payment-compromise scenario
- Ransomware scenario
- Support-account takeover scenario
- Cross-tenant data exposure scenario
- Malicious document-upload scenario

---

## 12. Stripe Connect and payment compliance

The approved model is a SaaS platform using connected operator accounts and direct charges.

Stripe describes the SaaS model as one where connected accounts act as merchant of record and collect directly from their customers. Stripe recommends direct charges for software-as-a-service platforms; transaction objects live on the connected account, and the connected account can bear processing fees, refunds, disputes, and negative-balance responsibility depending on account configuration. [S17] [S18] [S19]

### 12.1 Required disclosure

Before the operator connects Stripe, disclose:

- Stripe is the payment processor
- The operator is the merchant receiving resident rent
- Stripe performs onboarding and verification
- The operator controls its payout bank account
- Stripe's fees, refunds, disputes, and payout rules apply
- The platform records the rental ledger but does not hold rent
- Payment availability depends on Stripe capability approval

### 12.2 Resident payment disclosure

At checkout show:

- Operator legal/display name
- Amount and currency
- Charges being paid
- Payment method
- Any fee before confirmation
- Pending/processing nature of ACH or ACSS debit
- Receipt destination
- Refund contact and responsibility

### 12.3 PCI scope

Use Stripe-hosted Checkout or other appropriately outsourced Stripe payment UI so raw card data never enters platform systems. PCI scope still requires validation and secure protection of redirect or embedded-payment mechanisms. PCI SSC notes that SAQ A eligibility depends on outsourcing payment-page elements and meeting all eligibility requirements; script-security considerations still apply to embedded forms. [S20] [S21]

### 12.4 Webhooks

- Verify Stripe signatures
- Store immutable webhook receipt
- Enforce idempotency
- Process events in a durable queue
- Scope direct-charge API calls to the connected account
- Reconcile out-of-order and duplicate events
- Never accept a browser callback as proof of payment

---

## 13. E-signatures and electronic records

The platform should use a dedicated e-sign provider or a rigorously designed signature service.

Required evidence:

- Signer identity and role
- Document hash
- Document version
- Consent to electronic records
- Time and time zone
- IP/device/session metadata where lawful
- Authentication method
- Signature event trail
- Final signed copy
- Delivery and access evidence
- Withdrawal or refusal workflow

For consumer electronic records, the United States E-SIGN framework requires appropriate consent and the ability to retain/access records. Final flows must be reviewed by counsel before being represented as legally sufficient in every context.

The platform must clearly state that an operator-uploaded document is supplied by the operator and has not been certified for legal sufficiency by the platform.

---

## 14. Communications compliance

### 14.1 United States

Commercial email must use accurate sender information, non-deceptive subjects, a valid postal address, and a working opt-out mechanism; opt-outs generally must be honored within 10 business days. Transactional messages should not be diluted with prominent promotional material. [S5]

Marketing SMS and telephone campaigns require a separate consent and legal-review framework. Do not use resident operational phone numbers for promotional campaigns by default.

### 14.2 Canada

CASL applies to commercial email and SMS sent to Canadian recipients, including messages sent from outside Canada. It generally requires consent, identification information, and a working unsubscribe mechanism; the sender must retain evidence of consent. [S7] [S13]

### 14.3 Mexico

Marketing preferences, privacy notice, provider identity, and consumer complaint/cancellation channels must be clearly presented in Spanish.

### 14.4 Product architecture

Maintain:

```text
communication_preferences
marketing_consents
suppression_entries
message_classifications
campaign_approvals
unsubscribe_events
```

Separate operational and marketing delivery infrastructure as much as practical.

---

## 15. Accessibility

The platform will target **WCAG 2.2 Level AA** for operator, resident, owner, vendor, support, payment, consent, and legal-document surfaces.

The U.S. Department of Justice states that businesses open to the public should make websites accessible under the ADA. [S16]

Accessibility requirements include:

- Keyboard navigation
- Visible focus
- Screen-reader labels and landmarks
- Text resizing
- Sufficient contrast
- Accessible validation and error summaries
- Captions/transcripts for multimedia
- Accessible PDFs or HTML alternatives
- No color-only status communication
- Accessible authentication and payment flows
- Reduced-motion support
- Accessibility issue-reporting channel

Automated scans are not sufficient; use manual keyboard and screen-reader testing for critical journeys.

---

## 16. Canada-specific program

### 16.1 PIPEDA baseline

Canada's privacy regulator describes PIPEDA through ten fair-information principles, meaningful consent, security safeguards, accountability, access, and breach obligations. [S8] [S9]

The platform must:

- Name a privacy officer
- Document purposes
- Obtain meaningful consent where required
- Limit collection, use, disclosure, and retention
- Safeguard information
- Give people access and correction mechanisms
- Remain accountable for service providers
- Maintain breach records

### 16.2 Provincial routing

The system should retain province/territory because provincial private-sector laws may govern particular processing. The privacy notice and DPA must support federal and provincial routing without disabling nationwide product access.

### 16.3 Quebec

Before serving Quebec publicly:

- Complete French product experience
- Complete French public website
- French legal and privacy materials
- French invoices and customer communications where required
- Quebec privacy impact assessment for qualifying projects and cross-border processing, as confirmed by Quebec counsel
- Quebec-specific privacy-officer and governance review

### 16.4 Cross-border cloud processing

Disclose that Canadian data may be processed outside Canada and may be subject to foreign laws. Contracts and vendor assessments must preserve accountability and comparable safeguards.

---

## 17. Mexico-specific program

### 17.1 Privacy notice

The Spanish privacy notice must cover:

- Identity and address of the responsible entity
- Data categories
- Sensitive-data handling, if any
- Primary and secondary purposes
- ARCO rights and request method
- Consent withdrawal
- Limitation of use/disclosure
- Transfers and recipients
- Notice changes
- Contact method

Use a short notice at the point of collection with a link to the integral notice.

### 17.2 Consumer-commerce disclosures

PROFECO's virtual-store monitoring evaluates whether online providers show contact information, total amount payable, prices in national currency, service characteristics, payment methods, privacy notice, and cancellation information. [S22]

The Mexico checkout and subscription flows should therefore display:

- Legal provider name and contact
- Service description
- MXN price and taxes/fees
- Payment methods
- Renewal terms
- Cancellation method
- Complaint/support route
- Privacy notice
- Terms
- Transaction confirmation

### 17.3 Tax classification

Obtain a written Mexican tax memo on whether the company is:

- A foreign digital-service provider
- A Mexican resident supplier
- An intermediary digital platform
- Subject to VAT registration, withholding, information reporting, or CFDI obligations

The product should keep SaaS billing distinct from operator rent. Do not issue a landlord's rental CFDI unless an approved tax/invoicing integration and operator instruction exist.

---

## 18. SaaS subscription compliance

### 18.1 Required UX

Before purchase show:

- Plan name
- Included units and usage limits
- Billing frequency
- Exact price and currency
- Taxes when known
- Trial length
- Trial conversion date
- Automatic-renewal terms
- Cancellation method
- Refund policy
- Material limitations

### 18.2 Consent evidence

Store:

```text
subscription_consents
- plan_version
- price_book_version
- renewal_term
- trial_end
- terms_version
- consent_timestamp
- consent_evidence
```

### 18.3 Cancellation

Cancellation must be available through the account without requiring a phone call. The platform should show effective date, retained access, export options, and data-deletion schedule.

### 18.4 Renewal reminders

Send reminders before trial conversion and material pricing changes. Do not rely on silence, prechecked boxes, or confusing button labels.

---

## 19. Cookies, analytics, and advertising

### 19.1 Approved launch position

- No third-party advertising in authenticated portals
- No sale of personal data
- No cross-context behavioral advertising
- Product analytics limited to operating and improving the service
- Analytics data pseudonymized when practical
- No session replay on screens containing leases, payment details, IDs, maintenance photos, or private messages unless specifically configured to redact every sensitive field and approved by privacy review

### 19.2 Consent manager

Use a consent manager capable of:

- Country/state routing
- Necessary/functional/analytics/marketing categories
- Consent withdrawal
- Preference versioning
- Global Privacy Control handling when legally applicable
- Blocking nonessential tags until authorization

### 19.3 Vendor review

Every analytics vendor must appear in the subprocessor/vendor inventory with retention, hosting, security, and use restrictions.

---

## 20. AI compliance boundaries

AI can assist with:

- Maintenance categorization
- Drafting communications
- Document-field extraction
- Summarizing owner reports
- Translation
- Explaining existing ledger records

AI cannot autonomously:

- Approve or deny applicants
- Recommend protected-class discrimination
- Determine a legal notice or eviction action
- Set rent or fees without operator approval
- Change ledger entries
- Sign or modify legal documents
- Submit reports to regulators
- Train on resident documents outside the operator's service context

### 20.1 AI controls

- Human confirmation for consequential actions
- Prompt and model version logging
- Access control identical to source data
- Redaction before external model calls when feasible
- No provider training on customer data by contract
- Configurable AI disablement
- Output labeling
- Feedback and error-reporting
- Data protection assessment before high-risk profiling

Virginia requires assessments for certain profiling or other processing presenting significant risks. [S23]

---

## 21. Tenant screening and identity verification

Screening is post-launch.

When enabled in the United States:

- Use an established consumer-reporting agency partner
- Obtain permissible-purpose certifications and applicant authorization
- Do not create an opaque proprietary tenant score initially
- Preserve report access controls and retention limits
- Provide operator tools for required adverse-action notices
- Provide dispute and correction information
- Log whether a report affected a decision

The FTC states that landlords using consumer reports have FCRA duties, including adverse-action notice obligations when a report contributes to an unfavorable decision. [S24]

Canada and Mexico require separate screening and discrimination reviews before activation.

---

## 22. Children and household members

The product is not directed to children.

Recommended policy:

- Operator and owner accounts require adulthood and contractual capacity
- Resident accounts are ordinarily for adults
- Minor household members may be recorded only when necessary for tenancy administration
- Do not create direct minor logins at launch
- Do not collect children's unnecessary identifiers, contact information, analytics profiles, or marketing consents
- Guardian-managed workflows require later privacy review

---

## 23. Vendor and subprocessor management

Maintain a register containing:

- Vendor legal name
- Service
- Data categories
- Purpose
- Processing countries
- Security certifications
- Contract and DPA status
- Retention/deletion terms
- Incident-notification commitment
- Subprocessor chain
- Risk rating
- Review date
- Exit plan

Priority vendors include:

- Supabase
- Vercel
- Stripe
- Email provider
- SMS/WhatsApp provider
- Error monitoring
- Analytics
- E-signature provider
- AI providers
- Identity/screening providers when enabled
- Customer-support platform

Give operators advance notice of material subprocessor changes through the DPA process.

---

## 24. Customer-support and platform-admin compliance

Support access is a major privacy risk.

Required controls:

- No unrestricted default access to tenant content
- Time-limited support elevation
- Operator authorization when practical
- Visible impersonation banner
- Mandatory reason
- Full audit log
- Sensitive-field masking
- No bank-account changes during impersonation
- No deletion, refund, lease execution, or ledger posting through ordinary impersonation
- Periodic review of support access

---

## 25. Launch gates

### 25.1 Global gates

- Approved Terms, Privacy Notice, DPA, Subprocessor List, and AUP
- Privacy role and data inventory completed
- Rights request workflow tested
- Retention and deletion workflow tested
- Incident response plan and tabletop completed
- Independent penetration test completed
- MFA and step-up authentication enabled
- RLS negative tests passing
- Stripe webhook and idempotency tests passing
- PCI validation path confirmed
- Accessibility audit of critical flows
- Consent and preference records verified
- Support/admin access controls verified
- Cyber insurance active

### 25.2 United States gates

- State privacy applicability matrix
- California notice and rights path when applicable
- 50-state breach-response playbook
- E-sign review
- Subscription/automatic-renewal review
- CAN-SPAM and SMS program review
- FCRA disabled until screening compliance is approved

### 25.3 Canada gates

- PIPEDA/provincial routing memo
- Meaningful-consent review
- Breach register and reporting procedure
- CASL compliance program
- English and French release parity
- Quebec language and privacy review
- GST/HST classification and registration assessment

### 25.4 Mexico gates

- Spanish privacy notice
- ARCO request process
- PROFECO-facing e-commerce disclosures
- SAT tax classification memo
- Spanish subscription and cancellation flow
- Stripe Mexico capability verification
- CFDI strategy approved

---

## 26. Professional counsel workstreams

The founder has set the product posture. The following should be commissioned, not guessed by engineering:

### 26.1 U.S. counsel

- Nationwide SaaS Terms and Privacy Notice
- State privacy applicability and addenda
- E-SIGN consent
- Subscription renewal/cancellation review
- SMS/telephone marketing review
- Fair-housing and FCRA boundaries before screening
- Payment/merchant disclosure review

### 26.2 Canadian counsel

- PIPEDA and provincial-law routing
- Quebec Law 25 privacy governance
- Quebec French language review
- CASL program
- Cross-border processing disclosure
- GST/HST review

### 26.3 Mexican counsel

- 2025 private-sector privacy law and aviso de privacidad
- ARCO process
- PROFECO digital-commerce terms
- SAT classification, VAT, and CFDI strategy
- Stripe and payment disclosures
- Cross-border processing and Spanish documentation

### 26.4 Payment counsel

- Confirm connected operator as merchant of record
- Confirm platform does not control rent
- Review application-fee plans before activation
- Review refund/dispute allocations
- Review security-deposit exclusion

---

## 27. Recommended founder approvals

The following defaults are recommended for immediate approval:

1. No sale of personal information.
2. No targeted advertising in authenticated products.
3. No mandatory resident convenience fee at launch.
4. No platform custody of rent or deposits.
5. No tenant screening at launch.
6. No autonomous AI housing decisions.
7. No public model training on customer data.
8. Complete English, Spanish, and French legal/product localization for the markets served.
9. WCAG 2.2 AA product target.
10. Global data-rights center with regional routing.
11. DPA and subprocessor list available to every operator.
12. Independent penetration test before broad public launch.
13. SOC 2 roadmap after early validation, before enterprise expansion.
14. Operator-uploaded legal documents remain operator-controlled and visibly unverified by the platform.
15. Privacy and security controls are launch scope, not post-launch cleanup.

---

## 28. Required implementation epics

### Compliance foundation

- Data inventory and classification
- Legal document/version registry
- Consent ledger
- Privacy preference center
- Rights request center
- DPA/subprocessor publication system
- Retention and deletion orchestrator
- Legal hold system

### Security foundation

- MFA and step-up authentication
- Platform-admin restricted access
- Audit and sensitive-access logs
- File malware scanning
- Incident/breach register
- Security alerting and response runbooks

### Regional compliance

- U.S. privacy addendum and notice-at-collection support
- Canada meaningful-consent and breach support
- Quebec French localization and regional notices
- Mexico privacy notices and ARCO workflow
- Country-specific marketing consent
- Country-specific tax fields and exports

### Payment compliance

- Stripe connected-account disclosure
- Direct-charge synchronization
- Webhook idempotency
- Payment-method mandates and consent
- PCI evidence and validation workflow
- Resident payment transparency

### Commercial compliance

- Subscription consent records
- Trial reminders
- Self-service cancellation
- Refund policy enforcement
- Transactional/marketing message separation
- Accessibility reporting and remediation

---

## 29. Acceptance criteria

The compliance implementation is not complete until:

- A data subject can understand whether the platform or operator controls each processing purpose.
- Every personal-data field maps to an approved purpose and retention class.
- A verified rights request can be exported, corrected, restricted, or deleted across systems.
- Operator processor data is not reused for unrelated platform advertising or public model training.
- Consent evidence can reproduce the exact document, purpose, locale, and timestamp accepted.
- Marketing opt-outs propagate to all providers.
- A support agent cannot silently inspect restricted data.
- A cross-tenant access test fails at the database layer.
- A duplicate Stripe webhook cannot duplicate a payment or ledger entry.
- Raw card data never enters application storage or logs.
- A breach can be classified by affected jurisdiction and controller.
- English, Spanish, and French critical flows pass localization QA.
- Critical journeys pass keyboard and screen-reader testing.
- Subscription cancellation is available online without unnecessary friction.
- Legal and privacy documents are versioned and acceptance is auditable.
- Country launch gates have named human approvers and evidence links.

---

## 30. Sources

- **[S1]** FTC, Privacy and Security: https://www.ftc.gov/business-guidance/privacy-security
- **[S2]** FTC, Start with Security: https://www.ftc.gov/business-guidance/resources/start-security-guide-business
- **[S3]** Code of Virginia § 59.1-578, controller responsibilities and transparency: https://law.lis.virginia.gov/vacode/title59.1/chapter53/section59.1-578/
- **[S4]** Code of Virginia § 59.1-579, controller/processor responsibilities: https://law.lis.virginia.gov/vacode/title59.1/chapter53/section59.1-579/
- **[S5]** FTC, CAN-SPAM compliance guide: https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business
- **[S6]** NCSL, Security Breach Notification Laws: https://www.ncsl.org/technology-and-communication/security-breach-notification-laws
- **[S7]** CRTC, CASL FAQs: https://crtc.gc.ca/eng/com500/faq500.htm
- **[S8]** Office of the Privacy Commissioner of Canada, Privacy Guide for Businesses: https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/pipeda-compliance-help/guide_org/
- **[S9]** OPC Canada, Obtaining Meaningful Consent: https://www.priv.gc.ca/en/privacy-topics/business-privacy/collecting-personal-information/consent/info_mc/
- **[S10]** OPC Canada, PIPEDA Consent Principle: https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/p_principle/principles/p_consent/
- **[S11]** OPC Canada, Mandatory Breach Reporting: https://www.priv.gc.ca/en/privacy-topics/business-privacy/breaches-and-safeguards/privacy-breaches-at-your-business/gd_pb_201810/
- **[S12]** OQLF, Language of Commerce and Business: https://www.oqlf.gouv.qc.ca/francisation/droits_linguistiques/droits/langue-du-commerce-et-des-affaires.html
- **[S13]** CRTC, CASL legislation and guidelines: https://crtc.gc.ca/eng/internet/anti/reg.htm
- **[S14]** Mexico DOF, decree enacting the 2025 private-sector personal-data law: https://www.dof.gob.mx/nota_detalle.php?codigo=5752569&fecha=20/03/2025
- **[S15]** Mexico DOF, March 20, 2025 edition: https://www.dof.gob.mx/index_113.php?day=20&month=03&year=2025
- **[S16]** U.S. DOJ, web accessibility guidance under the ADA: https://www.justice.gov/archives/opa/pr/justice-department-issues-web-accessibility-guidance-under-americans-disabilities-act
- **[S17]** Stripe, SaaS platforms and marketplaces with Connect: https://docs.stripe.com/connect/saas-platforms-and-marketplaces
- **[S18]** Stripe, Direct Charges: https://docs.stripe.com/connect/direct-charges
- **[S19]** Stripe, Direct Charge Fee Behavior: https://docs.stripe.com/connect/direct-charges-fee-payer-behavior
- **[S20]** PCI SSC FAQ 1588, SAQ A script eligibility: https://www.pcisecuritystandards.org/faqs/1588/
- **[S21]** PCI SSC, SAQ A updates under PCI DSS 4.0.1: https://blog.pcisecuritystandards.org/important-updates-announced-for-merchants-validating-to-self-assessment-questionnaire-a
- **[S22]** PROFECO, Virtual Store Monitoring: https://www.profeco.gob.mx/tiendasvirtuales/
- **[S23]** Code of Virginia § 59.1-580, data protection assessments: https://law.lis.virginia.gov/vacode/title59.1/chapter53/section59.1-580/
- **[S24]** FTC, Using Consumer Reports: What Landlords Need to Know: https://www.ftc.gov/business-guidance/resources/using-consumer-reports-what-landlords-need-know

