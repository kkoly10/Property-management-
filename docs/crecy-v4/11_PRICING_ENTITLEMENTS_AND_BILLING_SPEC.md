# Pricing, Entitlements, and SaaS Billing Specification

**Status:** Founder approved. These values override generated-image prices.

## 1. Billing principles

- Operators pay Crecy; resident and owner accounts are included according to plan.
- SaaS subscription billing is separate from rent collection.
- Prices use localized country price books, not runtime FX conversion.
- Annual billing equals approximately ten monthly payments.
- A 30-day no-card Growth trial is offered.
- Trial does not bypass Stripe connected-account verification or production payment gates.
- No Crecy transaction/application fee on resident rent in P0.
- No mandatory resident convenience fee in P0.
- Stripe/provider processing charges are the operator’s responsibility under connected-account terms.

## 2. Price books

### United States

| Plan | Monthly | Annual | Included active units |
|---|---:|---:|---:|
| Free | $0 | $0 | 1 |
| Starter | $15 | $150 | 10 |
| Growth | $49 | $490 | 50 |
| Pro | $129 | $1,290 | 150 |

Additional active unit above Pro allowance: **$0.75/month**. Custom agreement at 500+ units.

### Canada

| Plan | Monthly | Annual | Included active units |
|---|---:|---:|---:|
| Free | C$0 | C$0 | 1 |
| Starter | C$19 | C$190 | 10 |
| Growth | C$69 | C$690 | 50 |
| Pro | C$169 | C$1,690 | 150 |

Additional active unit above Pro allowance: **C$1/month**. Custom agreement at 500+ units.

### Mexico

| Plan | Monthly | Annual | Included active units |
|---|---:|---:|---:|
| Free | MX$0 | MX$0 | 1 |
| Starter | MX$299 | MX$2,990 | 10 |
| Growth | MX$799 | MX$7,990 | 50 |
| Pro | MX$1,799 | MX$17,990 | 150 |

Additional active unit above Pro allowance: **MX$12/month**. Custom agreement at 500+ units.

## 3. Entitlements

| Capability | Free | Starter | Growth | Pro |
|---|---:|---:|---:|---:|
| Organizations | 1 | 1 | 1 | 1 |
| Active units | 1 | 10 | 50 | 150 + meter |
| Staff users | 1 | 2 | 5 | Unlimited fair use |
| Resident portal | Yes | Yes | Yes | Yes |
| Online payments | Yes after verification | Yes | Yes | Yes |
| Manual payment recording | Yes | Yes | Yes | Yes |
| Maintenance requests | Basic | Full | Full + automations | Full + advanced controls |
| Documents | 1 GB | 5 GB | 25 GB | 100 GB |
| Existing lease upload | Yes | Yes | Yes | Yes |
| Bulk import wizard | No | Basic CSV | Full import + mapping | Full + assisted migration |
| Basic financial ledger | Yes | Yes | Yes | Yes |
| Reconciliation workspace | No | Basic | Full | Full + advanced exports |
| Owner portal | No | No | Standard | Advanced |
| Ownership interests | No | No | Basic | Advanced/multiple interests |
| Owner approvals | No | No | Basic | Thresholds and workflows |
| Inspections | No | No | Basic post-pilot | Advanced post-pilot |
| Branding | Crecy | Crecy | Co-branded | Advanced branding |
| Custom domain | No | No | No | Post-MVP add-on |
| API access | No | No | No | Post-MVP/approved integration |
| Support | Community/email | Email | Priority email | Priority + implementation assistance |

## 4. Metering rules

- An **active unit** is an operational unit not archived/retired during the billing day.
- Usage is sampled daily and billed using the highest plan-defined method approved by billing implementation; P0 may use end-of-cycle maximum active units for simplicity.
- Unit deletion cannot erase historical usage.
- Trial organizations cannot exceed 50 active units without support approval.
- Plan downgrade is blocked if current usage exceeds destination limits until operator archives units or accepts metered overage where supported.
- Entitlements are evaluated server-side; hiding UI is not authorization.

## 5. Feature codes

```text
core.organization
core.property
core.unit
core.resident
portal.resident
payments.online
payments.manual
finance.reconciliation.basic
finance.reconciliation.full
maintenance.basic
maintenance.full
maintenance.automation
documents.storage_gb
imports.basic
imports.full
portal.owner.standard
portal.owner.advanced
owners.multiple_interests
owners.approvals
branding.cobrand
branding.advanced
support.priority
migration.assisted
```

## 6. Billing states

`trialing → active → past_due → restricted → canceled`

- `past_due`: grace period; notifications; no data loss.
- `restricted`: read/export and resident payment continuity remain available where safe; creation/automation limits apply.
- `canceled`: export window and retention policy begin; existing financial/legal records are not silently deleted.

## 7. Generated-image correction

Any image showing $49 Starter, $129 Growth, $279 Pro, different unit allowances, “unlimited” without conditions, SOC 2, or other claims is illustrative only. Product code and public copy must use this file.
