import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date in YYYY-MM-DD format.");

const ownerStatementContextSchema = z.object({
  organizationId: z.uuid(),
  accountingBookId: z.uuid(),
  ownerEntityId: z.uuid(),
  propertyId: z.uuid(),
  periodStart: isoDate,
  periodEnd: isoDate,
}).superRefine((statement, context) => {
  const start = new Date(`${statement.periodStart}T00:00:00Z`);
  const end = new Date(`${statement.periodEnd}T00:00:00Z`);
  if (
    Number.isNaN(start.getTime())
    || Number.isNaN(end.getTime())
    || start.toISOString().slice(0, 10) !== statement.periodStart
    || end.toISOString().slice(0, 10) !== statement.periodEnd
  ) {
    context.addIssue({ code: "custom", path: ["periodStart"], message: "Enter a valid statement period." });
    return;
  }
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  if (days < 0) {
    context.addIssue({ code: "custom", path: ["periodEnd"], message: "The period must end on or after it starts." });
  } else if (days > 370) {
    context.addIssue({ code: "custom", path: ["periodEnd"], message: "A statement period cannot exceed 371 days." });
  }
});

export const ownerStatementDraftSchema = ownerStatementContextSchema;

export const finalizeOwnerStatementSchema = ownerStatementContextSchema.and(z.object({
  expectedCalculationHash: z.string().regex(/^[0-9a-f]{64}$/, "Recalculate the statement before finalizing it."),
  correctionReason: z.string().trim().min(3).max(500).optional(),
}));

export type OwnerStatementDraftInput = z.infer<typeof ownerStatementDraftSchema>;
export type FinalizeOwnerStatementInput = z.infer<typeof finalizeOwnerStatementSchema>;
