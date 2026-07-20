import { z } from "zod";

const optionalNumber = <Schema extends z.ZodType>(schema: Schema) =>
  z.preprocess((value) => value === "" || value === null ? undefined : value, schema.optional());

export const propertySchema = z.object({
  accountingBookId: z.uuid("Choose an accounting book."),
  name: z.string().trim().min(1, "Enter a property name.").max(160),
  propertyType: z.enum(["single_family", "multifamily", "mixed_use", "student_housing", "other_residential"]),
  addressLine1: z.string().trim().min(1, "Enter the street address.").max(200),
  addressLine2: z.string().trim().max(200).optional(),
  locality: z.string().trim().max(120).optional(),
  subdivisionCode: z.string().trim().max(20).optional(),
  postalCode: z.string().trim().max(20).optional(),
  countryCode: z.enum(["US", "CA", "MX"]),
  timeZone: z.string().trim().min(1, "Choose a time zone.").max(80),
  idempotencyKey: z.uuid(),
});

export const unitSchema = z.object({
  organizationId: z.uuid(),
  propertyId: z.uuid(),
  unitCode: z.string().trim().min(1, "Enter a unit code.").max(80),
  unitType: z.string().trim().max(80).optional(),
  bedrooms: optionalNumber(z.coerce.number().min(0).max(99)),
  bathrooms: optionalNumber(z.coerce.number().min(0).max(99)),
  squareFeet: optionalNumber(z.coerce.number().int().min(0).max(10_000_000)),
  idempotencyKey: z.uuid(),
});

export type PropertyInput = z.infer<typeof propertySchema>;
export type UnitInput = z.infer<typeof unitSchema>;
