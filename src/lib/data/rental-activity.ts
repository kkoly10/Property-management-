import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const targetSchema = z.object({
  kind: z.enum(["inquiry", "tour", "application", "agreement"]),
  label: z.string().min(1).max(80),
  reference: z.string().regex(/^(INQ|TOUR|APP)-[A-Z0-9]{6,24}$/).nullable(),
  targetId: z.uuid().nullable(),
});

const activitySchema = z.object({
  unitId: z.uuid(),
  events: z.array(targetSchema.extend({ id: z.uuid(), occurredAt: z.iso.datetime({ offset: true }) })).max(15),
  nextAction: targetSchema.nullable(),
});

export type RentalActivityTarget = z.infer<typeof targetSchema>;

export function rentalActivityHref(unitId: string, target: RentalActivityTarget): string {
  if (target.kind === "agreement") return target.targetId ? `/app/agreements/${target.targetId}` : "/app/agreements";
  const sections = { inquiry: "inquiries", tour: "tours", application: "applications" };
  const section = `/app/rentals/${unitId}/${sections[target.kind]}`;
  return target.reference ? `${section}#${target.kind}-${target.reference}` : section;
}

export async function getRentalUnitActivity(organizationId: string, unitId: string) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_rental_unit_activity", { p_organization_id: organizationId, p_unit_id: unitId });
    if (error?.code === "P0002" || error?.code === "42501") return { mode: "unavailable" } as const;
    const parsed = activitySchema.safeParse(data);
    if (error || !parsed.success || parsed.data.unitId !== unitId) return { mode: "error" } as const;
    return { mode: "ready", ...parsed.data } as const;
  } catch {
    return { mode: "error" } as const;
  }
}
