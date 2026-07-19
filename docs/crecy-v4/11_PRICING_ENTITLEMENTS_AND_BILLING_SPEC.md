# Pricing, Entitlements, and SaaS Billing Specification

**Status:** Founder approved. These values override generated-image prices.

## Billing principles

- Operators pay Crecy; resident/owner accounts are included according to plan.
- SaaS subscription billing is separate from rent.
- Local country price books; no runtime FX conversion.
- Annual billing approximates ten monthly payments.
- 30-day no-card Growth trial; it does not bypass merchant/payment verification.
- No Crecy transaction/application fee on resident rent in P0.
- No mandatory resident convenience fee in P0.
- Provider processing costs are the connected operator’s responsibility.

## Price books

| Country | Free | Starter | Growth | Pro | Included units |
|---|---:|---:|---:|---:|---|
| United States monthly | $0 | $15 | $49 | $129 | 1 / 10 / 50 / 150 |
| United States annual | $0 | $150 | $490 | $1,290 | same |
| Canada monthly | C$0 | C$19 | C$69 | C$169 | 1 / 10 / 50 / 150 |
| Canada annual | C$0 | C$190 | C$690 | C$1,690 | same |
| Mexico monthly | MX$0 | MX$299 | MX$799 | MX$1,799 | 1 / 10 / 50 / 150 |
| Mexico annual | MX$0 | MX$2,990 | MX$7,990 | MX$17,990 | same |

Pro overage: US $0.75, Canada C$1, Mexico MX$12 per additional active unit/month. Custom agreement at 500+ units.

## Entitlements

| Capability | Free | Starter | Growth | Pro |
|---|---|---|---|---|
| Staff users | 1 | 2 | 5 | Unlimited fair use |
| Resident portal | Yes | Yes | Yes | Yes |
| Online payments | After verification | Yes | Yes | Yes |
| Manual payment recording | Yes | Yes | Yes | Yes |
| Maintenance | Basic | Full | Full + automations | Advanced controls |
| Documents | 1 GB | 5 GB | 25 GB | 100 GB |
| Lease upload | Yes | Yes | Yes | Yes |
| Imports | No | Basic CSV | Full mapping | Full + assisted migration |
| Financial ledger | Basic | Basic | Full | Full + advanced exports |
| Reconciliation | No | Basic | Full | Full |
| Owner portal | No | No | Standard | Advanced |
| Multiple ownership interests | No | No | Basic | Advanced |
| Owner approvals | No | No | Basic | Threshold workflows |
| Branding | Crecy | Crecy | Co-branded | Advanced branding |
| Custom domain | No | No | No | Post-MVP add-on |
| API access | No | No | No | Post-MVP/approved |
| Support | Community/email | Email | Priority email | Priority + implementation |

## Metering

- Active unit = operational unit not archived/retired during billing day.
- Usage is sampled daily; P0 may bill end-of-cycle maximum active units.
- Deletion cannot erase historical usage.
- Trial maximum 50 active units unless support approves.
- Downgrade blocked while usage exceeds destination limits unless units are archived or overage accepted.
- Entitlements are enforced server-side; hiding UI is not authorization.

## Billing states

`trialing → active → past_due → restricted → canceled`

- `past_due`: grace period and notices; no data loss.
- `restricted`: safe read/export and resident payment continuity; creation/automation restrictions.
- `canceled`: export window and retention policy; financial/legal history is not silently deleted.

## Image correction

Any image showing $49 Starter, $129 Growth, $279 Pro, different allowances, “unlimited” without conditions, SOC 2, or other claims is illustrative only. Public copy/code must use this file.
