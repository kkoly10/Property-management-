import "server-only";

import { createClient } from "@/lib/supabase/server";
import { paymentExportOptionsSchema, type PaymentExportProperty } from "@/lib/validation/payment-exports";

export async function getPaymentExportProperties(organizationId: string | null): Promise<PaymentExportProperty[]> {
  if (!organizationId) return [];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_operator_payment_export_options", { p_organization_id: organizationId });
    if (error) return [];
    const options = paymentExportOptionsSchema.safeParse(data);
    return options.success && options.data.organizationId === organizationId ? options.data.properties : [];
  } catch {
    return [];
  }
}
