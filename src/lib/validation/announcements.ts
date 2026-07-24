import { z } from "zod";

const localeSchema = z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/, "Choose a valid locale.");

export const createAnnouncementSchema = z.object({
  organizationId: z.uuid(),
  propertyId: z.uuid().nullable(),
  title: z.string().trim().min(1, "Add a title.").max(200, "Titles must be 200 characters or fewer."),
  bodyText: z.string().trim().min(1, "Add announcement details.").max(20_000, "Announcements must be 20,000 characters or fewer."),
  locale: localeSchema,
  audienceType: z.enum(["organization_residents", "property_residents", "selected_tenancies", "owners"]),
}).superRefine((value, context) => {
  if (value.audienceType === "organization_residents" && value.propertyId !== null) {
    context.addIssue({ code: "custom", path: ["propertyId"], message: "Organization announcements cannot be tied to one property." });
  }
  if (value.audienceType !== "organization_residents" && value.propertyId === null) {
    context.addIssue({ code: "custom", path: ["propertyId"], message: "Choose a property for this audience." });
  }
});
export const publishAnnouncementSchema = z.object({
  expectedVersion: z.number().int().positive(),
  selectedTenancyIds: z.array(z.uuid()).max(1_000, "Select no more than 1,000 tenancies in one announcement."),
});

export const cancelAnnouncementSchema = z.object({
  expectedVersion: z.number().int().positive(),
});
