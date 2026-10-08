import { z } from "zod";
import { rentalInquiryLocales } from "@/lib/validation/rental-inquiry";

export const rentalTourLocalTimeSchema = z.string()
  .trim()
  .regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$/);

export const submitRentalTourSchema = z.object({
  publicId: z.uuid(),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.email().trim().max(320),
  preferences: z.array(rentalTourLocalTimeSchema).min(1).max(3),
  locale: z.enum(rentalInquiryLocales).default("en-US"),
}).strict().superRefine((value, context) => {
  if (new Set(value.preferences).size !== value.preferences.length) {
    context.addIssue({ code: "custom", path: ["preferences"], message: "Choose distinct tour times." });
  }
});

export const verifyRentalTourSchema = z.object({
  token: z.string().trim().toLowerCase().regex(/^[0-9a-f]{64}$/),
}).strict();

export const confirmRentalTourSchema = z.object({
  organizationId: z.uuid(),
  tourRequestId: z.uuid(),
  expectedVersion: z.number().int().min(1),
  preferencePosition: z.number().int().min(0).max(2),
  meetingLocation: z.string().trim().min(3).max(500),
}).strict();
