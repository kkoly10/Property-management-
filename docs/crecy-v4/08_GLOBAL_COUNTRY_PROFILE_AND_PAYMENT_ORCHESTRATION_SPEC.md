# Global Country Operating Profile and Payment Orchestration Specification

**Owner:** Principal Engineering / Product Infrastructure  
**Status:** Approved architecture; country activation remains gated  
**Early commercial family:** United States, Canada, Mexico  
**Preparation markets:** Ghana, Nigeria, Singapore

## 1. Objective

Build one global rental operating platform that selects behavior from the property's confirmed operating context. The system must not fork into regional products, and it must not use a continent, language, device location, or payment provider as a proxy for law.

## 2. Resolution model

```text
Global rental core
  → Regional preset family
  → Country operating profile version
  → Subnational jurisdiction package version
  → Organization operating entity
  → Single-currency accounting book
  → Property assignment
  → Obligation and payment-method policy
```

### 2.1 Regional preset family

Supplies suggested language, address format, common rent cadence, communication providers, payment-provider candidates, and onboarding content. It contains no production legal rule.

### 2.2 Country operating profile

Supplies national currency, identity fields, tax/privacy integration flags, supported payment families, merchant requirements, and national document policy.

### 2.3 Subnational jurisdiction package

Supplies state/province/territory/city tenancy rules, document templates, deposits, notices, late fees, payment restrictions, and local reviewer approvals.

### 2.4 Operating entity and accounting book

An organization can create one or more legal/merchant operating entities. Each entity owns one or more accounting books. Every accounting book has one immutable functional currency after posting begins. A property belongs to exactly one book at a time.

## 3. Onboarding resolver

Detected location may prefill a suggestion. The operator must confirm:

1. headquarters country;
2. operator type and legal/registration context;
3. property country and subnational jurisdiction;
4. lease/ledger currency;
5. merchant account country and owner;
6. whether the operator is owner, manager, or agent;
7. desired payment methods;
8. whether deposits are collected online.

The resolver returns one of:

- `ACTIVE`
- `LEGAL_REVIEW_REQUIRED`
- `PAYMENT_VERIFICATION_REQUIRED`
- `CONFIGURATION_ONLY`
- `RESEARCH_ONLY`
- `UNSUPPORTED`

Only `ACTIVE` can generate production documents and enable approved money movement.

## 4. Canonical payment model

Country adapters map into:

- MerchantConnection
- PaymentMethodCapability
- PaymentIntent
- PaymentAttempt
- ProviderTransaction
- Payment
- PaymentAllocation
- Refund
- Reversal
- Dispute
- SettlementBatch
- SettlementItem
- ReconciliationException

Provider balances and statuses are synchronized facts, not the canonical rental ledger.

## 5. Stripe Connect launch configuration

For eligible small landlords and operators in the early launch countries:

```text
Resident
  → Stripe payment method
  → direct charge on operator connected account
  → operator Stripe balance
  → operator payout bank account

Optional approved application fee
  → platform Stripe balance
```

Required configuration intent:

- full Stripe Dashboard access;
- Stripe-hosted onboarding/KYC;
- direct charges;
- connected account pays processing and dispute fees where supported;
- operator controls payout destination;
- platform does not pool rent;
- platform stores connected-account ID on every provider object mapping;
- webhook idempotency includes provider account context;
- payment success is authoritative only from signed events or provider retrieval.

## 6. North American method profiles

### 6.1 United States

- Currency: USD
- Primary: ACH debit
- Secondary: cards; approved bank transfer
- Initial jurisdiction: Virginia
- Key implementation states: mandate/authorization evidence, delayed ACH processing, returns, disputes, and state-specific deposit/fee/document rules

### 6.2 Canada

- Currency: CAD
- Primary: ACSS pre-authorized debit
- Secondary: cards
- Province activation: founder decision; recommended Alberta then Ontario
- Quebec is blocked until French and Quebec-specific legal/privacy review
- PAD UX must preserve mandate schedule, confirmation, pending/return state, cancellation, and notice evidence

### 6.3 Mexico

- Currency: MXN
- Primary: SPEI-backed bank transfer
- Secondary: cards
- Optional: OXXO for approved obligation types within provider constraints
- State activation: founder decision
- National integration flags: RFC, CFDI, privacy, tax invoice, cadastral/property identifiers where required
- Bank-transfer logic must support unique instructions, underpayment, overpayment, unapplied cash, refunds, and reconciliation

## 7. Security deposit policy

`obligation_type=security_deposit` resolves independently from rent.

A deposit method requires:

- approved destination account type;
- segregation/trust policy;
- interest policy;
- maximum amount;
- receipt/disclosure;
- return deadline;
- deduction evidence and notice;
- reviewer/version record.

Absent approval, the platform may record an externally held deposit but cannot initiate its online collection.

## 8. Multi-country organization rules

- Membership and subscription remain organization-wide.
- Staff can be scoped to operating entities, books, or properties.
- Legal documents and payment methods resolve per property.
- No journal crosses books/currencies.
- Consolidated reporting is read-only and uses explicit FX snapshots; consolidated accounting is deferred.
- Moving a live property between books or jurisdictions is a controlled migration, not an edit.

## 9. Country profile activation checklist

A profile cannot become active until:

1. product scope and operator segment are approved;
2. country and subnational legal reviews are attached;
3. privacy/retention/data-transfer rules are approved;
4. tax/invoice configuration is approved;
5. e-sign and document templates are approved;
6. payment provider and merchant responsibility are approved;
7. payment-method sandbox and production tests pass;
8. deposits are approved or disabled;
9. language/accessibility review passes;
10. support, dispute, and incident runbooks exist;
11. RLS, ledger, webhook, reconciliation, E2E, and restoration tests pass;
12. feature flag activation is approved by product, engineering, legal, and operations.

## 10. Preparation-market contract

Ghana, Nigeria, and Singapore may have draft profiles, operator interviews, provider research, translations, and sandbox adapters. They may not:

- create production leases;
- claim legal compliance;
- enable resident payment processing;
- issue tax/legal documents;
- market the country as active.

Their activation order is a founder decision informed by demand, legal clarity, mobile adoption, provider availability, and partner readiness.

## 11. Required acceptance tests

- IP/GPS suggestion cannot override confirmed property jurisdiction.
- A Canadian property cannot display Mexican payment methods.
- A Mexican MXN journal cannot post to a USD book.
- A direct-charge webhook for connected account A cannot update organization B.
- A delayed ACH/PAD transfer remains pending until authoritative success.
- Under/overpaid Mexican bank transfers reconcile without mutating expected charges.
- Deposit checkout is rejected when custody policy is inactive.
- Retired profile versions remain readable for historical contracts but cannot create new ones.
