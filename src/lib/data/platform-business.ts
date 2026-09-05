import "server-only";

import { getPublicSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/**
 * The founder's view of the whole business.
 *
 * Deliberately separate from platform-support.ts: that module answers "what is happening inside THIS
 * customer" and every one of its reads is gated on an active support session for one organization.
 * This one aggregates across all of them and is gated on being a platform ADMIN at AAL2 instead. The
 * two should not learn to share a fetcher, or the session requirement will eventually be relaxed to
 * suit whichever call site is more convenient.
 */
export type MoneyByCurrency = Record<string, number>;
export type CountsByKey = Record<string, number>;

export type TrialEndingSoon = { organizationId: string; displayName: string; planCode: string | null; trialEndsAt: string | null };

export type BusinessOverview = {
  generatedAt: string | null;
  customers: { total: number; byStatus: CountsByKey; newLast7Days: number; newLast30Days: number };
  plans: { mix: { planCode: string; status: string; count: number }[]; trialsEndingSoon: TrialEndingSoon[] };
  portfolio: { properties: number; units: number; activeTenancies: number; activeStaff: number };
  money: {
    chargesByStatus: CountsByKey;
    paymentsByStatus: CountsByKey;
    billedMinorByCurrency: MoneyByCurrency;
    collectedMinorByCurrency: MoneyByCurrency;
    outstandingMinorByCurrency: MoneyByCurrency;
  };
  operations: {
    notificationJobsByStatus: CountsByKey;
    documentsQuarantined: number;
    documentsRejected: number;
    chargeRunsByState: CountsByKey;
    lastCompletedChargeRunAt: string | null;
    openSupportSessions: number;
  };
};

export type BusinessOverviewState =
  | { mode: "setup"; overview: BusinessOverview }
  | { mode: "ready"; overview: BusinessOverview }
  | { mode: "forbidden" }
  | { mode: "mfa_required" }
  | { mode: "error"; requestId: string };

const n = (v: unknown) => Number(v ?? 0);
const s = (v: unknown) => (v == null ? null : String(v));

/** Every value arrives as untyped jsonb, so coerce explicitly rather than trusting the shape. */
function counts(raw: unknown): CountsByKey {
  const out: CountsByKey = {};
  for (const [key, value] of Object.entries((raw ?? {}) as Record<string, unknown>)) out[key] = n(value);
  return out;
}

function normalize(raw: unknown): BusinessOverview {
  const r = (raw ?? {}) as Record<string, unknown>;
  const customers = (r.customers ?? {}) as Record<string, unknown>;
  const plans = (r.plans ?? {}) as Record<string, unknown>;
  const portfolio = (r.portfolio ?? {}) as Record<string, unknown>;
  const money = (r.money ?? {}) as Record<string, unknown>;
  const operations = (r.operations ?? {}) as Record<string, unknown>;
  return {
    generatedAt: s(r.generatedAt),
    customers: {
      total: n(customers.total),
      byStatus: counts(customers.byStatus),
      newLast7Days: n(customers.newLast7Days),
      newLast30Days: n(customers.newLast30Days),
    },
    plans: {
      mix: (((plans.mix as unknown[]) ?? []) as Record<string, unknown>[]).map((row) => ({
        planCode: String(row.planCode ?? ""),
        status: String(row.status ?? ""),
        count: n(row.count),
      })),
      trialsEndingSoon: (((plans.trialsEndingSoon as unknown[]) ?? []) as Record<string, unknown>[]).map((row) => ({
        organizationId: String(row.organizationId ?? ""),
        displayName: String(row.displayName ?? ""),
        planCode: s(row.planCode),
        trialEndsAt: s(row.trialEndsAt),
      })),
    },
    portfolio: {
      properties: n(portfolio.properties),
      units: n(portfolio.units),
      activeTenancies: n(portfolio.activeTenancies),
      activeStaff: n(portfolio.activeStaff),
    },
    money: {
      chargesByStatus: counts(money.chargesByStatus),
      paymentsByStatus: counts(money.paymentsByStatus),
      billedMinorByCurrency: counts(money.billedMinorByCurrency),
      collectedMinorByCurrency: counts(money.collectedMinorByCurrency),
      outstandingMinorByCurrency: counts(money.outstandingMinorByCurrency),
    },
    operations: {
      notificationJobsByStatus: counts(operations.notificationJobsByStatus),
      documentsQuarantined: n(operations.documentsQuarantined),
      documentsRejected: n(operations.documentsRejected),
      chargeRunsByState: counts(operations.chargeRunsByState),
      lastCompletedChargeRunAt: s(operations.lastCompletedChargeRunAt),
      openSupportSessions: n(operations.openSupportSessions),
    },
  };
}

/** Renders the whole console with no backend, exactly as every other fetcher's preview does. */
const previewOverview: BusinessOverview = normalize({
  generatedAt: "2026-09-05T05:00:00.000Z",
  customers: { total: 12, byStatus: { active: 9, trial: 3 }, newLast7Days: 2, newLast30Days: 5 },
  plans: {
    mix: [{ planCode: "growth", status: "active", count: 7 }, { planCode: "growth", status: "trialing", count: 3 }, { planCode: "pro", status: "active", count: 2 }],
    trialsEndingSoon: [{ organizationId: "20000000-0000-4000-8000-000000000002", displayName: "Northstar Property Group", planCode: "growth", trialEndsAt: "2026-09-12T00:00:00.000Z" }],
  },
  portfolio: { properties: 46, units: 512, activeTenancies: 471, activeStaff: 38 },
  money: {
    chargesByStatus: { open: 120, paid: 890, partially_paid: 14 },
    paymentsByStatus: { succeeded: 884, pending: 6, failed: 3 },
    billedMinorByCurrency: { USD: 128_400_000 },
    collectedMinorByCurrency: { USD: 121_950_000 },
    outstandingMinorByCurrency: { USD: 6_450_000 },
  },
  operations: {
    notificationJobsByStatus: { sent: 2140, queued: 3 },
    documentsQuarantined: 1,
    documentsRejected: 0,
    chargeRunsByState: { completed: 96 },
    lastCompletedChargeRunAt: "2026-09-05T05:00:29.000Z",
    openSupportSessions: 0,
  },
});

export async function getBusinessOverview(): Promise<BusinessOverviewState> {
  if (!getPublicSupabaseConfig()) return { mode: "setup", overview: previewOverview };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("platform_business_overview");
    if (error) {
      // The database is the authority on both gates; these only decide which explanation to render.
      if (error.message.includes("MFA_STEP_UP_REQUIRED")) return { mode: "mfa_required" };
      if (error.message.includes("NOT_PLATFORM_ADMIN") || error.message.includes("AUTHENTICATION_REQUIRED")) return { mode: "forbidden" };
      throw error;
    }
    return { mode: "ready", overview: normalize(data) };
  } catch {
    return { mode: "error", requestId: crypto.randomUUID() };
  }
}
