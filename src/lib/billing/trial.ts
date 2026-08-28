/**
 * The Growth trial length, per file 11: "A 30-day no-card Growth trial is offered."
 *
 * The database has its own authority for this (`private.growth_trial_length()`), because it is the one
 * that actually provisions `trial_ends_at`. This constant is the application's copy for COPY — badges,
 * pricing, onboarding — and a test asserts the two agree, so the product cannot advertise one number
 * while provisioning another. It shipped at 14 in both places, which is half what the pricing authority
 * promises, for every workspace ever created.
 */
export const GROWTH_TRIAL_DAYS = 30;

/** "30 days", for interpolation into copy that should never hardcode the number. */
export const growthTrialLabel = `${GROWTH_TRIAL_DAYS} days`;
