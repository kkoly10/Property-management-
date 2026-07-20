# Reference Image Manifest

Images define visual intent only. Written v4 behavior, pricing, permissions, finance, accessibility, and claims override pixels or text inside an image.

| File | Authority | Required use | Known corrections |
|---|---|---|---|
| `01_brand_system.png` | High visual authority | Wordmark-led identity, palette, typography hierarchy, component style, product naming | Use exact font decisions from file 16; no certification claims |
| `02_marketing_homepage.png` | Layout reference | Hero hierarchy, connected-surface storytelling, North America market section | Remove fake customer logos, traction, SOC 2, unsupported security/performance claims |
| `03_operator_command_center.png` | High screen reference | Operator information density, navigation, attention-first dashboard | Metrics are fictional; show comparisons only with data |
| `04_property_leasing_workspace.png` | High screen reference | Property header, tabs, unit/lease/resident/document layout | P0 records operator-supplied leases; no certified legal automation |
| `05_payments_reconciliation.png` | High screen reference | Payment table/detail drawer/timeline/reconciliation | Use connected-account context; labels must reflect authoritative provider state |
| `06_maintenance_command_center.png` | High screen reference | Status board, filters, schedule, detail drawer | Vendor contact may be internal P0; owner approval visibility role-scoped |
| `07_resident_home.png` | High screen reference | Mobile hierarchy, payment, receipts, maintenance, announcements, documents | Remove referral rewards from P0; no false immediate success for delayed methods |
| `08_owner_dashboard.png` | High screen reference | Read-heavy financial transparency and statements | No resident PII or automated payout implication |
| `09_vendor_workspace.png` | Post-pilot reference | Future invited-vendor mobile workspace | Vendor quote/approval goes to operator or authorized owner—not resident by default |
| `10_pricing_reference_illustrative_only.png` | Style only | Pricing-page layout and comparison structure | All prices, limits, SOC 2/security claims replaced by files 11 and 18 |

## Required implementation rule

Each screen implementation must cite its screen ID from `15_P0_SCREEN_AND_STATE_SPECIFICATIONS.md` in the PR description. A screenshot is not acceptance evidence without functional, permission, responsive, and state tests.

## Repository materialization note

The first repository upload preserves the eight existing PNG references under `docs/crecy-v4/design-references/legacy/`. Their embedded text is non-authoritative. The written screen contracts in file 15 remain sufficient for P0 implementation. The two additional post-package visual references are optional and do not block Gate 0.
