import { z } from "zod";

export const paidPlanSchema = z.enum(["starter", "growth", "pro"]);
export const billingIntervalSchema = z.enum(["month", "year"]);
export const billingCountrySchema = z.enum(["US", "CA", "MX"]);
export const billingWorkspaceInputSchema = z.strictObject({ organizationId: z.uuid() });
export const billingUsageSummarySchema = z.object({ sampled: z.number().int().nonnegative(), hasMore: z.boolean() });
export const checkoutInputSchema = billingWorkspaceInputSchema.extend({
  targetPlanCode: z.enum(["free", ...paidPlanSchema.options]),
  billingInterval: billingIntervalSchema,
  effectiveMode: z.literal("immediate").default("immediate"),
  confirmProratedUpgrade: z.literal(true).optional(),
});
export const freePlanResultSchema = z.object({ status: z.literal("free"), replayed: z.boolean() });

export const billingWorkspaceSchema = z.object({
  country: billingCountrySchema,
  plan: z.enum(["free", ...paidPlanSchema.options]),
  status: z.enum(["trialing", "trial_ended", "active", "past_due", "restricted", "canceled"]),
  trialEndsAt: z.string().nullable(),
  periodEndsAt: z.string().nullable(),
  checkoutPending: z.boolean(),
  pendingPlan: paidPlanSchema.nullable(),
  pendingInterval: billingIntervalSchema.nullable(),
  currentInterval: billingIntervalSchema.nullable().optional(),
  upgradePendingPlan: paidPlanSchema.nullable().optional(),
  hasSubscription: z.boolean(),
  cancelAtPeriodEnd: z.boolean(),
  portalAvailable: z.boolean(),
});

const reservedBillingAttemptSchema = z.object({
  attemptId: z.uuid(),
  customerId: z.string().regex(/^cus_[a-zA-Z0-9]+$/).nullable(),
});

export const checkoutReservationSchema = reservedBillingAttemptSchema.extend({
  sessionId: z.string().regex(/^cs_test_[a-zA-Z0-9]+$/).nullable(),
});

export const billingClaimSchema = reservedBillingAttemptSchema.extend({
  generation: z.string().regex(/^[1-9][0-9]*$/),
  priceId: z.string().regex(/^price_[a-zA-Z0-9]+$/),
  country: billingCountrySchema,
  plan: paidPlanSchema,
  interval: billingIntervalSchema,
  paidOnce: z.boolean().optional(),
  upgradePriceId: z.string().regex(/^price_[a-zA-Z0-9]+$/).nullable().optional(),
  upgradeInvoiceId: z.string().regex(/^in_[a-zA-Z0-9]+$/).nullable().optional(),
});

export const upgradeReservationSchema = reservedBillingAttemptSchema.extend({
  upgradeId: z.uuid(),
  customerId: z.string().regex(/^cus_[a-zA-Z0-9]+$/),
  subscriptionId: z.string().regex(/^sub_[a-zA-Z0-9]+$/),
  sourcePriceId: z.string().regex(/^price_[a-zA-Z0-9]+$/),
  invoiceId: z.string().regex(/^in_[a-zA-Z0-9]+$/).nullable(),
});

export type BillingCountry = z.infer<typeof billingCountrySchema>;
export type PaidPlan = z.infer<typeof paidPlanSchema>;
export type BillingInterval = z.infer<typeof billingIntervalSchema>;
export type BillingWorkspace = z.infer<typeof billingWorkspaceSchema>;
export type CheckoutReservation = z.infer<typeof checkoutReservationSchema>;
export type BillingClaim = z.infer<typeof billingClaimSchema>;
export type UpgradeReservation = z.infer<typeof upgradeReservationSchema>;
