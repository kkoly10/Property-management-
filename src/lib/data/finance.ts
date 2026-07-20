import "server-only";

import { getPublicSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type ReceivableSummaryItem = {
  tenancyId: string;
  propertyName: string;
  unitCode: string;
  currencyCode: "USD" | "CAD" | "MXN";
  balanceMinor: number;
  nextDueDate: string | null;
  nextDueAmountMinor: number | null;
  nextDueStatus: string | null;
};

type SummaryResponse = { items?: Array<Record<string, unknown>> };

function normalizeItems(data: unknown): ReceivableSummaryItem[] {
  const response = (data ?? {}) as SummaryResponse;
  return (response.items ?? []).flatMap((item) => {
    const currency = item.currencyCode;
    if (currency !== "USD" && currency !== "CAD" && currency !== "MXN") return [];
    return [{
      tenancyId: String(item.tenancyId),
      propertyName: String(item.propertyName),
      unitCode: String(item.unitCode),
      currencyCode: currency,
      balanceMinor: Number(item.balanceMinor),
      nextDueDate: item.nextDueDate ? String(item.nextDueDate) : null,
      nextDueAmountMinor: item.nextDueAmountMinor === null || item.nextDueAmountMinor === undefined ? null : Number(item.nextDueAmountMinor),
      nextDueStatus: item.nextDueStatus ? String(item.nextDueStatus) : null,
    }];
  });
}

const previewItem: ReceivableSummaryItem = {
  tenancyId: "preview-tenancy",
  propertyName: "Maple Court",
  unitCode: "101",
  currencyCode: "USD",
  balanceMinor: 227500,
  nextDueDate: "2026-08-01",
  nextDueAmountMinor: 185000,
  nextDueStatus: "open",
};

export async function getOperatorReceivables(): Promise<{ mode: "setup" | "ready" | "error"; items: ReceivableSummaryItem[]; requestId?: string }> {
  if (!getPublicSupabaseConfig()) return { mode: "setup", items: [previewItem] };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_operator_receivables_summary");
    if (error) throw error;
    return { mode: "ready", items: normalizeItems(data) };
  } catch {
    return { mode: "error", items: [], requestId: crypto.randomUUID() };
  }
}

export async function getResidentBalance(): Promise<{ mode: "setup" | "ready" | "error"; items: ReceivableSummaryItem[]; requestId?: string }> {
  if (!getPublicSupabaseConfig()) return { mode: "setup", items: [previewItem] };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_resident_balance_summary");
    if (error) throw error;
    return { mode: "ready", items: normalizeItems(data) };
  } catch {
    return { mode: "error", items: [], requestId: crypto.randomUUID() };
  }
}
