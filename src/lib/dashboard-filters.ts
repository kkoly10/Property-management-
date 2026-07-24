import { z } from "zod";

export type DashboardFilters = {
  propertyId?: string;
  accountingBookId?: string;
  fromDate: string;
  toDate: string;
};

export type DashboardFilterParseResult = {
  filters: DashboardFilters;
  invalid: boolean;
};

type SearchValue = string | string[] | undefined;

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
});

function first(value: SearchValue) {
  return Array.isArray(value) ? value[0] : value;
}

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function defaultDashboardFilters(now = new Date()): DashboardFilters {
  const to = new Date(now);
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - 29);
  return { fromDate: isoDay(from), toDate: isoDay(to) };
}

export function parseDashboardFilters(
  values: Record<string, SearchValue>,
  now = new Date(),
): DashboardFilterParseResult {
  const defaults = defaultDashboardFilters(now);
  const rawPropertyId = first(values.propertyId);
  const rawBookId = first(values.bookId);
  const rawFromDate = first(values.from);
  const rawToDate = first(values.to);
  const parsed = z.object({
    propertyId: uuid.optional(),
    accountingBookId: uuid.optional(),
    fromDate: isoDate,
    toDate: isoDate,
  }).safeParse({
    propertyId: rawPropertyId || undefined,
    accountingBookId: rawBookId || undefined,
    fromDate: rawFromDate || defaults.fromDate,
    toDate: rawToDate || defaults.toDate,
  });

  if (!parsed.success) return { filters: defaults, invalid: true };

  const from = new Date(`${parsed.data.fromDate}T00:00:00.000Z`);
  const to = new Date(`${parsed.data.toDate}T00:00:00.000Z`);
  const today = new Date(`${isoDay(now)}T00:00:00.000Z`);
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000);
  if (from > to || to > today || days > 366) return { filters: defaults, invalid: true };

  return { filters: parsed.data, invalid: false };
}
