import "server-only";

import { z } from "zod";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const checklistSchema = z.strictObject({
  tenancyId: z.uuid(),
  propertyName: z.string(),
  unitCode: z.string(),
  startOn: z.iso.date(),
  state: z.enum(["unplanned", "planned", "no_show", "handed_over"]),
  appointmentOn: z.iso.date().nullable(),
  handedOverOn: z.iso.date().nullable(),
});
const checklistResult = z.object({ items: z.array(checklistSchema).max(8) });

export type ResidentMoveIn = z.infer<typeof checklistSchema>;

export async function getResidentMoveInChecklist(agreementId?: string): Promise<ResidentMoveIn[]> {
  if (!getPublicSupabaseConfig()) return [];
  if (agreementId !== undefined && !z.uuid().safeParse(agreementId).success) return [];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_resident_move_in_checklist", { p_agreement_id: agreementId ?? null });
    const parsed = checklistResult.safeParse(data);
    return !error && parsed.success ? parsed.data.items : [];
  } catch {
    // Existing resident home and agreement access stay usable during the schema rollout.
    return [];
  }
}
