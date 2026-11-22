import { z } from "zod";

export const spaceTypes = ["basement", "room", "apartment", "entire_home", "other"] as const;
export const spaceAccess = ["private", "shared", "none"] as const;
const label = z.string().trim().min(1).max(160);
const note = z.string().trim().max(500).default("");
const timeZone = z.string().trim().min(1).max(80).refine((value) => {
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(); return true; }
  catch { return false; }
}, "Choose a valid time zone.");
const newProperty = z.object({
  kind: z.literal("new"), accountingBookId: z.uuid().nullable(),
  legalName: z.string().trim().max(200).default(""),
  entityType: z.enum(["individual", "sole_proprietor", "company"]),
  name: label, addressLine1: z.string().trim().min(1).max(200),
  addressLine2: z.string().trim().max(200).default(""),
  locality: z.string().trim().min(1).max(100),
  subdivisionCode: z.string().trim().min(1).max(100),
  postalCode: z.string().trim().min(1).max(30),
  countryCode: z.enum(["US", "CA", "MX"]), timeZone,
}).strict().refine((value) => value.accountingBookId !== null || value.legalName.length > 0, {
  message: "Enter the name of the person or business operating this rental.", path: ["legalName"],
});
export const homeownerRentalSchema = z.object({
  organizationId: z.uuid(),
  property: z.union([
    z.object({ kind: z.literal("existing"), propertyId: z.uuid() }).strict(), newProperty,
  ]),
  space: z.object({
    name: z.string().trim().min(1).max(80), type: z.enum(spaceTypes),
    bedrooms: z.number().min(0).max(50).multipleOf(0.5).nullable(),
    bathrooms: z.number().min(0).max(50).multipleOf(0.5).nullable(),
    entrance: z.enum(spaceAccess), kitchen: z.enum(spaceAccess),
    bathroom: z.enum(spaceAccess), laundry: z.enum(spaceAccess),
    utilitiesNotes: note, parkingNotes: note,
  }).strict(),
}).strict();
export type HomeownerRentalInput = z.infer<typeof homeownerRentalSchema>;
export const rentalOperationKeySchema = z.uuid();
