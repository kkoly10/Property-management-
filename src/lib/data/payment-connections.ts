import "server-only";

import { getPublicSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type PaymentConnectionStatus = "not_connected" | "pending" | "requirements_due" | "enabled" | "restricted" | "disabled";
export type PaymentConnectionItem = {
  organizationId: string;
  operatingEntityId: string;
  entityDisplayName: string;
  countryCode: "US" | "CA" | "MX";
  providerConnectionId: string | null;
  providerAccountReference: string | null;
  status: PaymentConnectionStatus;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  capabilities: Record<string, string>;
  requirements: {
    currentlyDue: string[];
    eventuallyDue: string[];
    pastDue: string[];
    pendingVerification: string[];
    disabledReason: string | null;
  };
  updatedAt: string | null;
};

type PaymentConnectionWorkspace = {
  mode: "setup" | "ready" | "error";
  authenticatorLevel: "aal1" | "aal2";
  items: PaymentConnectionItem[];
  requestId?: string;
};

const emptyRequirements: PaymentConnectionItem["requirements"] = {
  currentlyDue: [], eventuallyDue: [], pastDue: [], pendingVerification: [], disabledReason: null,
};

const previewItem: PaymentConnectionItem = {
  organizationId: "10000000-0000-4000-8000-000000000001",
  operatingEntityId: "20000000-0000-4000-8000-000000000002",
  entityDisplayName: "Crecy Demo LLC",
  countryCode: "US",
  providerConnectionId: null,
  providerAccountReference: null,
  status: "not_connected",
  chargesEnabled: false,
  payoutsEnabled: false,
  capabilities: {},
  requirements: emptyRequirements,
  updatedAt: null,
};

const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const country = (value: unknown): PaymentConnectionItem["countryCode"] | null => value === "US" || value === "CA" || value === "MX" ? value : null;
const status = (value: unknown): PaymentConnectionStatus | null => ["not_connected","pending","requirements_due","enabled","restricted","disabled"].includes(String(value)) ? value as PaymentConnectionStatus : null;

function normalizeItems(data: unknown): PaymentConnectionItem[] {
  const root = data as Record<string, unknown> | null;
  if (!root || !Array.isArray(root.items)) return [];
  return root.items.flatMap((raw) => {
    const item = raw as Record<string, unknown>;
    const itemCountry = country(item.countryCode);
    const itemStatus = status(item.status);
    if (!itemCountry || !itemStatus) return [];
    const requirements = item.requirements as Record<string, unknown> | null;
    const capabilities = item.capabilities && typeof item.capabilities === "object" && !Array.isArray(item.capabilities)
      ? Object.fromEntries(Object.entries(item.capabilities as Record<string, unknown>).map(([key, value]) => [key, String(value)]))
      : {};
    return [{
      organizationId: String(item.organizationId),
      operatingEntityId: String(item.operatingEntityId),
      entityDisplayName: String(item.entityDisplayName),
      countryCode: itemCountry,
      providerConnectionId: item.providerConnectionId ? String(item.providerConnectionId) : null,
      providerAccountReference: item.providerAccountReference ? String(item.providerAccountReference) : null,
      status: itemStatus,
      chargesEnabled: Boolean(item.chargesEnabled),
      payoutsEnabled: Boolean(item.payoutsEnabled),
      capabilities,
      requirements: {
        currentlyDue: strings(requirements?.currentlyDue),
        eventuallyDue: strings(requirements?.eventuallyDue),
        pastDue: strings(requirements?.pastDue),
        pendingVerification: strings(requirements?.pendingVerification),
        disabledReason: requirements?.disabledReason ? String(requirements.disabledReason) : null,
      },
      updatedAt: item.updatedAt ? String(item.updatedAt) : null,
    }];
  });
}

export async function getPaymentConnectionWorkspace(): Promise<PaymentConnectionWorkspace> {
  if (!getPublicSupabaseConfig()) return { mode: "setup", authenticatorLevel: "aal1", items: [previewItem] };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_payment_connection_settings");
    if (error || !data) throw error ?? new Error("Payment settings are unavailable.");
    const root = data as Record<string, unknown>;
    return {
      mode: "ready",
      authenticatorLevel: root.authenticatorLevel === "aal2" ? "aal2" : "aal1",
      items: normalizeItems(data),
    };
  } catch {
    return { mode: "error", authenticatorLevel: "aal1", items: [], requestId: crypto.randomUUID() };
  }
}
