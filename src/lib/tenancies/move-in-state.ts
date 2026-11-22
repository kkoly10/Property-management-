import { z } from "zod";

export const moveInState = z.object({
  tenancyId: z.uuid(),
  status: z.enum(["scheduled", "active", "notice_given", "move_out_in_progress", "closed"]),
  localToday: z.iso.date(),
  startOn: z.iso.date(),
  endOn: z.iso.date().nullable(),
  canManage: z.boolean(),
  version: z.number().int().nonnegative(),
  state: z.enum(["unplanned", "planned", "no_show", "handed_over"]),
  plannedOn: z.iso.date().nullable(),
  handedOverOn: z.iso.date().nullable(),
  keysTransferred: z.number().int().nonnegative().nullable(),
  conditionReference: z.string().nullable(),
  events: z.array(z.object({
    action: z.enum(["plan", "no_show", "handover"]),
    date: z.iso.date(),
    version: z.number().int().positive(),
  })),
});

export type MoveInState = z.infer<typeof moveInState>;
