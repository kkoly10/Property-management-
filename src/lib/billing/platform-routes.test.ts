// @vitest-environment node
import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as checkout } from "@/app/api/v1/billing/subscription-changes/route";
import { POST as portal } from "@/app/api/v1/billing/portal/route";
import { POST as webhook } from "@/app/api/internal/providers/stripe-billing/webhook/route";
import { routeForHost } from "@/lib/runtime/host-routing";
import { getPlatformStripeConfig } from "./platform-stripe";

const fake = vi.hoisted(() => ({
  admin: vi.fn(), workspace: vi.fn(), context: vi.fn(), user: vi.fn(), assurance: vi.fn(),
  account: vi.fn(), price: vi.fn(), createCheckout: vi.fn(), retrieveCheckout: vi.fn(),
  portalConfig: vi.fn(), createPortal: vi.fn(), subscription: vi.fn(),
}));

vi.mock("@/lib/organization/context", () => ({ getOrganizationContext: fake.context }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: fake.user, mfa: { getAuthenticatorAssuranceLevel: fake.assurance } },
    rpc: fake.workspace,
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: fake.admin }) }));
vi.mock("./platform-stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./platform-stripe")>();
  return {
    ...actual,
    platformStripe: (config: Parameters<typeof actual.platformStripe>[0]) => {
      const stripe = actual.platformStripe(config);
      stripe.accounts.retrieve = fake.account;
      stripe.prices.retrieve = fake.price;
      stripe.checkout.sessions.create = fake.createCheckout;
      stripe.checkout.sessions.retrieve = fake.retrieveCheckout;
      stripe.billingPortal.configurations.retrieve = fake.portalConfig;
      stripe.billingPortal.sessions.create = fake.createPortal;
      stripe.subscriptions.retrieve = fake.subscription;
      return stripe;
    },
  };
});

const account = "acct_Saas";
const signingSecret = "whsec_BillingSynthetic";
const origin = "https://crecy-sandbox-test.vercel.app";
const organizationId = "90000000-0000-4000-8000-000000000001";
const otherOrganization = "90000000-0000-4000-8000-000000000002";
const actorId = "90000000-0000-4000-8000-000000000003";
const attemptId = "90000000-0000-4000-8000-000000000004";
const metadata = { crecy_billing_scope: "crecy_platform_saas", crecy_billing_attempt_id: attemptId };
const plan = { organizationId, targetPlanCode: "growth", billingInterval: "month" };
const session = {
  id: "cs_test_Synthetic", livemode: false, mode: "subscription", client_reference_id: attemptId,
  customer: null, metadata, status: "open", url: "https://checkout.stripe.com/c/pay/cs_test_Synthetic",
};
const sandbox = new Stripe("rk_test_Synthetic");
const options = {
  CRECY_SAAS_BILLING_MODE: "sandbox",
  CRECY_SAAS_STRIPE_ACCOUNT_ID: account,
  CRECY_SAAS_STRIPE_SECRET_KEY: "rk_test_Synthetic",
  CRECY_SAAS_STRIPE_WEBHOOK_SECRET: signingSecret,
  CRECY_SAAS_STRIPE_PORTAL_CONFIGURATION: "bpc_Synthetic",
  CRECY_SAAS_SANDBOX_SUPABASE_URL: "https://synthetic.example.invalid",
  NEXT_PUBLIC_SUPABASE_URL: "https://synthetic.example.invalid",
  CRECY_SAAS_STRIPE_PRICE_IDS: JSON.stringify({ "CA.growth.month": "price_Synthetic" }),
  CRECY_RENT_STRIPE_ACCOUNT_ID: "acct_Rent",
  STRIPE_SECRET_KEY: "sk_test_Rent",
  STRIPE_WEBHOOK_SECRET: "whsec_Rent",
  NEXT_PUBLIC_SITE_URL: origin,
  VERCEL_ENV: "preview",
};

function mutation(body: object = plan, from = origin) {
  return new Request(origin, {
    method: "POST",
    headers: { Origin: from, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function eventRequest(body: object = {}, secret = signingSecret) {
  const payload = JSON.stringify({
    id: "evt_Synthetic", type: "invoice.paid", api_version: sandbox.getApiField("version"), livemode: false,
    data: { object: { parent: { subscription_details: { subscription: "sub_Synthetic", metadata } } } }, ...body,
  });
  return new Request(origin, {
    method: "POST",
    headers: { "stripe-signature": sandbox.webhooks.generateTestHeaderString({ payload, secret }) },
    body: payload,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  for (const [name, value] of Object.entries(options)) vi.stubEnv(name, value);
  fake.context.mockResolvedValue({ state: "active", active: { organizationId } });
  fake.user.mockResolvedValue({ data: { user: { id: actorId } }, error: null });
  fake.assurance.mockResolvedValue({ data: { currentLevel: "aal2" }, error: null });
  fake.workspace.mockResolvedValue({
    data: { country: "CA", plan: "growth", status: "trialing", trialEndsAt: "2026-12-01T00:00:00Z", periodEndsAt: null,
      checkoutPending: false, pendingPlan: null, pendingInterval: null, hasSubscription: false, cancelAtPeriodEnd: false, portalAvailable: false },
    error: null,
  });
  fake.admin.mockImplementation(async (method: string) => ({
    data: {
      prepare_platform_billing_checkout: { attemptId, customerId: null, sessionId: null },
      record_platform_billing_checkout: true,
      prepare_platform_billing_portal: "cus_Synthetic",
      claim_platform_billing_event: { attemptId, generation: "4", priceId: "price_Synthetic", country: "CA", plan: "growth", interval: "month", customerId: null },
      apply_platform_billing_event: true,
    }[method],
    error: null,
  }));
  fake.account.mockResolvedValue({ id: account });
  fake.price.mockResolvedValue({
    id: "price_Synthetic", active: true, livemode: false, type: "recurring", billing_scheme: "per_unit",
    recurring: { usage_type: "licensed", interval: "month", interval_count: 1 }, unit_amount: 6900, currency: "cad",
  });
  fake.createCheckout.mockResolvedValue(session);
  fake.portalConfig.mockResolvedValue({
    id: "bpc_Synthetic", active: true, livemode: false,
    features: {
      invoice_history: { enabled: true }, payment_method_update: { enabled: true },
      subscription_update: { enabled: false }, subscription_cancel: { enabled: true, mode: "at_period_end" },
    },
  });
  fake.createPortal.mockResolvedValue({ livemode: false, customer: "cus_Synthetic", url: "https://billing.stripe.com/p/session/test_sample" });
  fake.subscription.mockResolvedValue({
    id: "sub_Synthetic", livemode: false, metadata, status: "active", customer: "cus_Synthetic",
    items: { has_more: false, data: [{ price: { id: "price_Synthetic" }, quantity: 1, current_period_start: 1700000000, current_period_end: 1702678400 }] },
    latest_invoice: { status: "open", livemode: false }, cancel_at_period_end: false,
  });
});

afterEach(() => vi.unstubAllEnvs());

describe("sandbox platform subscription routes", () => {
  it("fails closed when disabled, in production, or sharing Stripe secrets or account with rent", () => {
    for (const [name, value] of [
      ["CRECY_SAAS_BILLING_MODE", ""], ["VERCEL_ENV", "production"], ["CRECY_SAAS_STRIPE_ACCOUNT_ID", "acct_Rent"],
      ["CRECY_SAAS_STRIPE_SECRET_KEY", "rk_live_Live"], ["CRECY_SAAS_STRIPE_WEBHOOK_SECRET", "whsec_Rent"],
      ["CRECY_RENT_STRIPE_ACCOUNT_ID", ""],
      ["NEXT_PUBLIC_SITE_URL", "https://app.crecyos.com"],
      ["NEXT_PUBLIC_SUPABASE_URL", "https://another-project.example.invalid"],
    ]) {
      vi.stubEnv(name, value);
      expect(getPlatformStripeConfig()).toBeNull();
      vi.unstubAllEnvs();
      for (const [key, configured] of Object.entries(options)) vi.stubEnv(key, configured);
    }
    expect(routeForHost("owner.crecyos.com", "/api/v1/billing/portal").type).toBe("reject");
    expect(routeForHost(new URL(origin).host, "/api/v1/billing/portal").type).toBe("continue");
  });

  it("denies a cross-origin request, stale workspace, low MFA and unauthorized DB scope before Stripe calls", async () => {
    expect((await checkout(mutation(plan, "https://owner.crecyos.com"))).status).toBe(403);
    expect((await portal(mutation({ organizationId: otherOrganization }))).status).toBe(409);
    fake.assurance.mockResolvedValueOnce({ data: { currentLevel: "aal1" }, error: null });
    expect(await (await checkout(mutation())).json()).toMatchObject({ code: "MFA_REQUIRED" });
    fake.workspace.mockResolvedValueOnce({ error: { message: "BILLING_SCOPE_DENIED" } });
    expect((await checkout(mutation())).status).toBe(403);
    expect(fake.account).not.toHaveBeenCalled();
    expect(fake.admin).not.toHaveBeenCalled();
  });

  it("uses an approved localized price and the same durable key after an ambiguous Stripe result", async () => {
    fake.createCheckout.mockRejectedValueOnce(new Error("Synthetic acknowledgement loss"));
    expect((await checkout(mutation())).status).toBe(503);
    const response = await checkout(mutation());
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ status: "checkout", url: session.url });
    expect(fake.createCheckout).toHaveBeenCalledTimes(2);
    expect(fake.createCheckout.mock.calls[0]).toEqual(fake.createCheckout.mock.calls[1]);
    expect(fake.createCheckout).toHaveBeenCalledWith(expect.objectContaining({
      line_items: [{ price: "price_Synthetic", quantity: 1 }], subscription_data: { metadata },
      adaptive_pricing: { enabled: false }, success_url: origin + "/settings/billing",
    }), { idempotencyKey: "crecy-platform-subscription:" + attemptId });
    expect(fake.admin).toHaveBeenCalledWith("record_platform_billing_checkout", expect.objectContaining({ p_stripe_session_id: session.id }));
  });

  it("rejects price data that contradicts the Crecy price book before storing a Checkout attempt", async () => {
    fake.price.mockResolvedValueOnce({ ...await fake.price(), currency: "usd" });
    expect((await checkout(mutation())).status).toBe(503);
    expect(fake.admin).not.toHaveBeenCalled();
    expect(fake.createCheckout).not.toHaveBeenCalled();
  });

  it("selects Free with the local billing command and makes no provider calls", async () => {
    fake.admin.mockResolvedValueOnce({ data: { status: "free", replayed: false }, error: null });
    const response = await checkout(mutation({ ...plan, targetPlanCode: "free" }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ status: "free", replayed: false });
    expect(fake.admin).toHaveBeenCalledWith("choose_platform_free_plan", {
      p_actor_user_id: actorId, p_actor_aal: "aal2", p_organization_id: organizationId,
    });
    expect(fake.account).not.toHaveBeenCalled();
    expect(fake.createCheckout).not.toHaveBeenCalled();
    fake.admin.mockResolvedValueOnce({ error: { message: "BILLING_FREE_REVIEW_REQUIRED" } });
    expect((await checkout(mutation({ ...plan, targetPlanCode: "free" }))).status).toBe(409);
  });

  it("refuses a portal configuration with direct plan editing before creating a session", async () => {
    fake.portalConfig.mockResolvedValueOnce({
      id: "bpc_Synthetic", active: true, livemode: false, features: { subscription_update: { enabled: true } },
    });
    expect((await portal(mutation({ organizationId }))).status).toBe(503);
    expect(fake.createPortal).not.toHaveBeenCalled();
    expect((await portal(mutation({ organizationId }))).status).toBe(201);
    expect(fake.createPortal).toHaveBeenCalledWith({ customer: "cus_Synthetic", configuration: "bpc_Synthetic", return_url: origin + "/settings/billing" });
  });

  it("rejects rent, live, Connect and wrong API-version events before DB access", async () => {
    expect((await webhook(eventRequest({}, "whsec_Rent"))).status).toBe(400);
    expect((await webhook(eventRequest({ livemode: true }))).status).toBe(400);
    expect((await webhook(eventRequest({ account: "acct_Rent" }))).status).toBe(400);
    expect((await webhook(eventRequest({ api_version: "2025-03-31.basil" }))).status).toBe(400);
    expect(fake.admin).not.toHaveBeenCalled();
    expect(fake.subscription).not.toHaveBeenCalled();
  });

  it("applies current provider state, skips completed event replays and requests retry on superseded snapshots", async () => {
    expect((await webhook(eventRequest())).status).toBe(200);
    expect(fake.admin).toHaveBeenLastCalledWith("apply_platform_billing_event", expect.objectContaining({
      p_paid: false, p_provider_status: "active", p_attempt_id: attemptId, p_generation: "4",
    }));
    fake.admin.mockResolvedValueOnce({ data: null, error: null });
    expect((await webhook(eventRequest())).status).toBe(200);
    expect(fake.subscription).toHaveBeenCalledTimes(1);
    const claim = { attemptId, generation: "5", priceId: "price_Synthetic", country: "CA", plan: "growth", interval: "month", customerId: null };
    fake.admin.mockResolvedValueOnce({ data: claim, error: null }).mockResolvedValueOnce({ data: false, error: null });
    expect((await webhook(eventRequest())).status).toBe(503);
  });
});
