import { z } from "zod";

export const conversationKind = z.enum(["inquiry", "tour"]);
export const conversationReference = z.string().trim().toUpperCase().regex(/^(INQ|TOUR)-[0-9A-F]{12}$/);
export const conversationToken = z.string().regex(/^[a-f0-9]{64}$/);
export const conversationMessageInput = z.object({
  body: z.string().trim().min(1).max(2000),
  operation: z.uuid(),
});
export const prospectTourReference = z.string().regex(/^TOUR-[0-9A-F]{12}$/);
export const prospectTourState = z.object({
  version: z.number().int().positive(),
  status: z.enum(["requested", "confirmed", "cancelled"]),
  timeZone: z.string().min(1).max(80),
  confirmedStartAt: z.iso.datetime({ offset: true }).nullable(),
  meetingLocation: z.string().nullable(),
  canManage: z.boolean(),
  changePending: z.boolean(),
  preferences: z.array(z.iso.datetime({ offset: true })).max(3),
});
export type ProspectTourState = z.infer<typeof prospectTourState>;

export const conversationState = z.object({
  reference: conversationReference,
  canReply: z.boolean(),
  originalQuestion: z.string().nullable(),
  tour: prospectTourState.optional(),
  messages: z.array(z.object({
    id: z.uuid(), author: z.enum(["landlord", "renter"]), body: z.string(), createdAt: z.string(),
  })).max(100),
});

export type RentalConversationState = z.infer<typeof conversationState>;
