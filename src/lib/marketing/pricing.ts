import { GROWTH_TRIAL_DAYS } from "@/lib/billing/trial";

/**
 * The canonical price books, transcribed from file 11, which is founder-approved and explicitly
 * overrides any generated mock.
 *
 * File 11 §7 exists because generated marketing images showed a $49 Starter, a $129 Growth, a $279 Pro
 * and different unit allowances. None of those are real. A test parses the spec's own tables and
 * asserts every number here matches, so the public pricing page cannot drift from the authority — and
 * cannot be "corrected" toward a mock by someone who saw one.
 */
export type PlanCode = "free" | "starter" | "growth" | "pro";
export type PriceBook = "US" | "CA" | "MX";
export type BillingPeriod = "monthly" | "annual";

export type PlanPrice = {
  /** Minor units, so no float ever touches a displayed price. */
  monthlyMinor: number;
  annualMinor: number;
  includedUnits: number;
};

export type CountryPricing = {
  code: PriceBook;
  label: string;
  currency: string;
  /** The symbol file 11 itself uses, e.g. "C$" — not a locale guess. */
  symbol: string;
  /** Minor units per major unit. All three books are 100. */
  minorPerMajor: number;
  plans: Record<PlanCode, PlanPrice>;
  /** Per additional active unit per month above the Pro allowance, in minor units. */
  overageMinor: number;
};

export const PLAN_ORDER: PlanCode[] = ["free", "starter", "growth", "pro"];

export const PLAN_LABELS: Record<PlanCode, string> = {
  free: "Free",
  starter: "Starter",
  growth: "Growth",
  pro: "Pro",
};

export const PRICE_BOOKS: Record<PriceBook, CountryPricing> = {
  US: {
    code: "US",
    label: "United States",
    currency: "USD",
    symbol: "$",
    minorPerMajor: 100,
    plans: {
      free: { monthlyMinor: 0, annualMinor: 0, includedUnits: 1 },
      starter: { monthlyMinor: 1_500, annualMinor: 15_000, includedUnits: 10 },
      growth: { monthlyMinor: 4_900, annualMinor: 49_000, includedUnits: 50 },
      pro: { monthlyMinor: 12_900, annualMinor: 129_000, includedUnits: 150 },
    },
    overageMinor: 75,
  },
  CA: {
    code: "CA",
    label: "Canada",
    currency: "CAD",
    symbol: "C$",
    minorPerMajor: 100,
    plans: {
      free: { monthlyMinor: 0, annualMinor: 0, includedUnits: 1 },
      starter: { monthlyMinor: 1_900, annualMinor: 19_000, includedUnits: 10 },
      growth: { monthlyMinor: 6_900, annualMinor: 69_000, includedUnits: 50 },
      pro: { monthlyMinor: 16_900, annualMinor: 169_000, includedUnits: 150 },
    },
    overageMinor: 100,
  },
  MX: {
    code: "MX",
    label: "Mexico",
    currency: "MXN",
    symbol: "MX$",
    minorPerMajor: 100,
    plans: {
      free: { monthlyMinor: 0, annualMinor: 0, includedUnits: 1 },
      starter: { monthlyMinor: 29_900, annualMinor: 299_000, includedUnits: 10 },
      growth: { monthlyMinor: 79_900, annualMinor: 799_000, includedUnits: 50 },
      pro: { monthlyMinor: 179_900, annualMinor: 1_799_000, includedUnits: 150 },
    },
    overageMinor: 1_200,
  },
};

/** Above this, file 11 says a custom agreement rather than a listed plan. */
export const CUSTOM_AGREEMENT_UNITS = 500;

export const GROWTH_TRIAL_COPY = `${GROWTH_TRIAL_DAYS}-day Growth trial, no card required`;

/**
 * Format a minor-unit price the way the spec writes it: whole units where the amount is whole, which
 * every listed price is. Money is never converted at runtime — file 11 §1: localized price books, not
 * runtime FX.
 */
export function formatPrice(country: CountryPricing, minor: number): string {
  const major = minor / country.minorPerMajor;
  const digits = Number.isInteger(major) ? 0 : 2;
  return `${country.symbol}${major.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/** Annual billing is approximately ten monthly payments (file 11 §1) — stated, never implied. */
export function annualSavingLabel(plan: PlanPrice): string | null {
  if (plan.monthlyMinor === 0) return null;
  const twelveMonths = plan.monthlyMinor * 12;
  if (plan.annualMinor >= twelveMonths) return null;
  const monthsSaved = Math.round((twelveMonths - plan.annualMinor) / plan.monthlyMinor);
  return `${monthsSaved} months free`;
}

export type EntitlementRow = { capability: string; values: Record<PlanCode, string> };

/**
 * The comparison table, transcribed from file 11 §3. Every cell is the spec's own wording; nothing is
 * upgraded, softened, or invented, and nothing that file 18 prohibits appears here.
 */
export const ENTITLEMENTS: EntitlementRow[] = [
  { capability: "Active units", values: { free: "1", starter: "10", growth: "50", pro: "150 + metered" } },
  { capability: "Staff users", values: { free: "1", starter: "2", growth: "5", pro: "Unlimited fair use" } },
  { capability: "Resident portal", values: { free: "Yes", starter: "Yes", growth: "Yes", pro: "Yes" } },
  { capability: "Online payments", values: { free: "After verification", starter: "Yes", growth: "Yes", pro: "Yes" } },
  { capability: "Manual payment recording", values: { free: "Yes", starter: "Yes", growth: "Yes", pro: "Yes" } },
  { capability: "Maintenance requests", values: { free: "Basic", starter: "Full", growth: "Full + automations", pro: "Full + advanced controls" } },
  { capability: "Documents", values: { free: "1 GB", starter: "5 GB", growth: "25 GB", pro: "100 GB" } },
  { capability: "Existing lease upload", values: { free: "Yes", starter: "Yes", growth: "Yes", pro: "Yes" } },
  { capability: "Bulk import wizard", values: { free: "No", starter: "Basic CSV", growth: "Full import + mapping", pro: "Full + assisted migration" } },
  { capability: "Financial ledger", values: { free: "Yes", starter: "Yes", growth: "Yes", pro: "Yes" } },
  { capability: "Reconciliation workspace", values: { free: "No", starter: "Basic", growth: "Full", pro: "Full + advanced exports" } },
  { capability: "Owner portal", values: { free: "No", starter: "No", growth: "Standard", pro: "Advanced" } },
  { capability: "Ownership interests", values: { free: "No", starter: "No", growth: "Basic", pro: "Advanced / multiple interests" } },
  { capability: "Owner approvals", values: { free: "No", starter: "No", growth: "Basic", pro: "Thresholds and workflows" } },
  { capability: "Branding", values: { free: "Crecy", starter: "Crecy", growth: "Co-branded", pro: "Advanced branding" } },
  { capability: "Support", values: { free: "Community / email", starter: "Email", growth: "Priority email", pro: "Priority + implementation assistance" } },
];

/**
 * The payment disclosure, from file 11 §1 and file 18 §2.
 *
 * All four sentences are load-bearing: operators pay Crecy for software and rent moves separately;
 * Crecy takes no cut of rent in P0; processing charges are the operator's under connected-account
 * terms; and Crecy does not hold the money. Softening any of them would be a pricing claim we cannot
 * support.
 */
export const PAYMENT_DISCLOSURE = [
  "Crecy subscription billing is separate from rent collection.",
  "Crecy charges no transaction or application fee on resident rent.",
  "Payments are processed through eligible operators' connected payment accounts, and the provider's processing charges are the operator's responsibility under connected-account terms.",
  "Crecy does not hold resident rent in the direct-charge model.",
] as const;
