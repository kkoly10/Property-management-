import "server-only";

import type { DashboardFilters } from "@/lib/dashboard-filters";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type CurrencyCode = "USD" | "CAD" | "MXN";
export type DashboardMode = "setup" | "ready" | "error";

type DashboardPropertyFilter = {
  propertyId: string;
  name: string;
  accountingBookId: string;
  currencyCode: CurrencyCode;
};

type DashboardBookFilter = {
  accountingBookId: string;
  name: string;
  currencyCode: CurrencyCode;
};

type DashboardCurrencyMetric = {
  currencyCode: CurrencyCode;
  collectedMinor: number;
  overdueMinor: number;
};

type DashboardPropertyPerformance = {
  propertyId: string;
  propertyName: string;
  currencyCode: CurrencyCode;
  totalUnits: number | null;
  occupiedUnits: number | null;
  overdueMinor: number | null;
  openWorkOrders: number | null;
};

type DashboardAttentionItem = {
  kind: string;
  title: string;
  description: string;
  occurredAt: string;
  propertyId: string | null;
  currencyCode: CurrencyCode | null;
  amountMinor: number | null;
  href: string;
};

type DashboardActivityItem = {
  actionCode: string;
  resourceType: string;
  resourceId: string;
  actorType: string;
  occurredAt: string;
  propertyId: string;
  propertyName: string;
  href: string;
};

export type DashboardState = {
  mode: DashboardMode;
  organizationName: string;
  requestId?: string;
  scope: {
    organizationId: string | null;
    propertyId: string | null;
    accountingBookId: string | null;
    fromDate: string;
    toDate: string;
    cutoffAt: string | null;
    timeZone: string;
    propertyCount: number;
  };
  domains: { portfolio: boolean; finance: boolean; maintenance: boolean; owners: boolean };
  filters: { properties: DashboardPropertyFilter[]; books: DashboardBookFilter[] };
  metrics: {
    currency: DashboardCurrencyMetric[];
    totalUnits: number;
    occupiedUnits: number;
    openWorkOrders: number;
    expiringLeases: number;
    pendingOwnerApprovals: number;
    openReconciliationExceptions: number;
  };
  propertyPerformance: DashboardPropertyPerformance[];
  attention: DashboardAttentionItem[];
  activity: DashboardActivityItem[];
};

const currencies = new Set<CurrencyCode>(["USD", "CAD", "MXN"]);
const objects = (value: unknown, key: string) => {
  const record = value as Record<string, unknown> | null;
  return Array.isArray(record?.[key]) ? record[key] as unknown[] : [];
};
const stringOrNull = (value: unknown) => value == null ? null : String(value);
const currencyOrNull = (value: unknown) => currencies.has(value as CurrencyCode) ? value as CurrencyCode : null;

function emptyDashboard(filters: DashboardFilters, mode: DashboardMode, requestId?: string): DashboardState {
  return {
    mode,
    organizationName: "Crecy workspace",
    requestId,
    scope: {
      organizationId: null,
      propertyId: filters.propertyId ?? null,
      accountingBookId: filters.accountingBookId ?? null,
      fromDate: filters.fromDate,
      toDate: filters.toDate,
      cutoffAt: null,
      timeZone: "UTC",
      propertyCount: 0,
    },
    domains: { portfolio: false, finance: false, maintenance: false, owners: false },
    filters: { properties: [], books: [] },
    metrics: {
      currency: [],
      totalUnits: 0,
      occupiedUnits: 0,
      openWorkOrders: 0,
      expiringLeases: 0,
      pendingOwnerApprovals: 0,
      openReconciliationExceptions: 0,
    },
    propertyPerformance: [],
    attention: [],
    activity: [],
  };
}

function normalizeDashboard(data: unknown, filters: DashboardFilters): DashboardState {
  const root = data as Record<string, unknown>;
  const scope = root.scope as Record<string, unknown> | undefined;
  const domains = root.domains as Record<string, unknown> | undefined;
  const filterData = root.filters as Record<string, unknown> | undefined;
  const metrics = root.metrics as Record<string, unknown> | undefined;
  const organizationName = String(scope?.organizationName ?? "Crecy workspace");

  return {
    mode: "ready",
    organizationName,
    scope: {
      organizationId: stringOrNull(scope?.organizationId),
      propertyId: stringOrNull(scope?.propertyId),
      accountingBookId: stringOrNull(scope?.accountingBookId),
      fromDate: String(scope?.fromDate ?? filters.fromDate),
      toDate: String(scope?.toDate ?? filters.toDate),
      cutoffAt: stringOrNull(scope?.cutoffAt),
      timeZone: String(scope?.timeZone ?? "UTC"),
      propertyCount: Number(scope?.propertyCount ?? 0),
    },
    domains: {
      portfolio: Boolean(domains?.portfolio),
      finance: Boolean(domains?.finance),
      maintenance: Boolean(domains?.maintenance),
      owners: Boolean(domains?.owners),
    },
    filters: {
      properties: objects(filterData, "properties").flatMap((raw) => {
        const item = raw as Record<string, unknown>;
        const currencyCode = currencyOrNull(item.currencyCode);
        if (!currencyCode) return [];
        return [{
          propertyId: String(item.propertyId),
          name: String(item.name),
          accountingBookId: String(item.accountingBookId),
          currencyCode,
        }];
      }),
      books: objects(filterData, "books").flatMap((raw) => {
        const item = raw as Record<string, unknown>;
        const currencyCode = currencyOrNull(item.currencyCode);
        if (!currencyCode) return [];
        return [{
          accountingBookId: String(item.accountingBookId),
          name: String(item.name),
          currencyCode,
        }];
      }),
    },
    metrics: {
      currency: objects(metrics, "currency").flatMap((raw) => {
        const item = raw as Record<string, unknown>;
        const currencyCode = currencyOrNull(item.currencyCode);
        return currencyCode ? [{
          currencyCode,
          collectedMinor: Number(item.collectedMinor ?? 0),
          overdueMinor: Number(item.overdueMinor ?? 0),
        }] : [];
      }),
      totalUnits: Number(metrics?.totalUnits ?? 0),
      occupiedUnits: Number(metrics?.occupiedUnits ?? 0),
      openWorkOrders: Number(metrics?.openWorkOrders ?? 0),
      expiringLeases: Number(metrics?.expiringLeases ?? 0),
      pendingOwnerApprovals: Number(metrics?.pendingOwnerApprovals ?? 0),
      openReconciliationExceptions: Number(metrics?.openReconciliationExceptions ?? 0),
    },
    propertyPerformance: objects(root, "propertyPerformance").flatMap((raw) => {
      const item = raw as Record<string, unknown>;
      const currencyCode = currencyOrNull(item.currencyCode);
      if (!currencyCode) return [];
      return [{
        propertyId: String(item.propertyId),
        propertyName: String(item.propertyName),
        currencyCode,
        totalUnits: item.totalUnits == null ? null : Number(item.totalUnits),
        occupiedUnits: item.occupiedUnits == null ? null : Number(item.occupiedUnits),
        overdueMinor: item.overdueMinor == null ? null : Number(item.overdueMinor),
        openWorkOrders: item.openWorkOrders == null ? null : Number(item.openWorkOrders),
      }];
    }),
    attention: objects(root, "attention").map((raw) => {
      const item = raw as Record<string, unknown>;
      return {
        kind: String(item.kind),
        title: String(item.title),
        description: String(item.description),
        occurredAt: String(item.occurredAt),
        propertyId: stringOrNull(item.propertyId),
        currencyCode: currencyOrNull(item.currencyCode),
        amountMinor: item.amountMinor == null ? null : Number(item.amountMinor),
        href: String(item.href),
      };
    }),
    activity: objects(root, "activity").map((raw) => {
      const item = raw as Record<string, unknown>;
      return {
        actionCode: String(item.actionCode),
        resourceType: String(item.resourceType),
        resourceId: String(item.resourceId),
        actorType: String(item.actorType),
        occurredAt: String(item.occurredAt),
        propertyId: String(item.propertyId),
        propertyName: String(item.propertyName),
        href: String(item.href),
      };
    }),
  };
}

export async function getDashboardState(organizationId: string | null, filters: DashboardFilters): Promise<DashboardState> {
  if (!getPublicSupabaseConfig()) return emptyDashboard(filters, "setup");
  // Was `p_organization_id: null`, which drove the command centre into its own implicit branch:
  // `order by m.created_at, m.id limit 1`. Naming the active organization is what stops that.
  if (!organizationId) return emptyDashboard(filters, "error");

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_operator_command_center", {
      p_organization_id: organizationId,
      p_property_id: filters.propertyId ?? null,
      p_accounting_book_id: filters.accountingBookId ?? null,
      p_from_date: filters.fromDate,
      p_to_date: filters.toDate,
    });
    if (error || !data) throw error ?? new Error("Command center is unavailable.");
    return normalizeDashboard(data, filters);
  } catch {
    return emptyDashboard(filters, "error", crypto.randomUUID());
  }
}
