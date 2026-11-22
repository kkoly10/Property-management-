import { z } from "zod";

const newPassword = z.string().min(10, "Use at least 10 characters.");

export const signupSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: newPassword,
  customerPath: z.enum(["property_manager", "self_managing"]).default("property_manager"),
});

export const passwordRecoveryRequestSchema = z.object({
  email: z.email("Enter a valid email address."),
});

export const passwordResetSchema = z.object({
  flowId: z.uuid(),
  password: newPassword,
  confirmPassword: z.string(),
}).refine(({ password, confirmPassword }) => password === confirmPassword, {
  path: ["confirmPassword"],
  message: "The passwords do not match.",
});

export const loginSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
  next: z.string().optional(),
});

/**
 * A passwordless sign-in request.
 *
 * Invited residents and owners are created by the invitation route with no password at all, so a
 * password-only sign-in left them with no way into the portal once their one-time magic link expired
 * — and there is no reset route either. This is the entry point that makes a 72-hour invitation link
 * actually redeemable for 72 hours.
 */
export const signInLinkSchema = z.object({
  email: z.email("Enter a valid email address."),
  next: z.string().optional(),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type SignInLinkInput = z.infer<typeof signInLinkSchema>;
