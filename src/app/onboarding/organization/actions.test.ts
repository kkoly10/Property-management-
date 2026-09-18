import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The consent gate in the organization-creation action.
 *
 * The protection under test is the one that survives a release: the page renders a binding, the
 * operator ticks the box, and then the artifacts change underneath them. Publishing Terms 1.0.1 is
 * exactly that event — a browser left open on the 1.0.0 screen still holds the old binding, and
 * accepting it would record that this operator agreed to text they were never shown.
 *
 * These drive the real action against the real registry; only the Supabase and navigation edges are
 * stubbed, and the stale case never reaches them.
 */
const rpc = vi.fn();
const getUser = vi.fn();
const setActiveOrganization = vi.fn();
const redirect = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser } }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));
vi.mock("@/lib/organization/actions", () => ({ setActiveOrganization }));
vi.mock("next/navigation", () => ({ redirect }));

const { createOrganizationAction } = await import("./actions");
const { buildConsentBinding, listArchivedLegalDocuments, resolveOrganizationConsent } = await import("@/lib/legal/registry");

const formWith = (consentVersion: string) => {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    displayName: "Maple Court Management",
    slug: "maple-court",
    customerPath: "property_manager",
    headquartersCountryCode: "US",
    defaultLocale: "en-US",
    defaultTimeZone: "America/New_York",
    acceptedTerms: "on",
    consentVersion,
    idempotencyKey: "3f1c0b3e-6a5d-4d64-9f1e-2a8b7c6d5e40",
  })) form.set(key, value);
  return form;
};

const currentBinding = () => {
  const resolution = resolveOrganizationConsent({ requirePublished: true });
  if (!resolution.ok) throw new Error(`the published documents did not resolve: ${resolution.reason}`);
  return resolution.binding.version;
};

const saved = { ...process.env };
beforeEach(() => {
  // Production, so the action must bind to PUBLISHED artifacts. Testing the gate in a relaxed
  // environment would prove nothing about the environment that matters.
  process.env.CRECY_DEPLOYMENT_ENV = "production";
  delete process.env.VERCEL_ENV;
  getUser.mockResolvedValue({ data: { user: { id: "8ac1a6f0-6d5a-4c3a-9a8b-1d2e3f4a5b6c" } }, error: null });
  rpc.mockResolvedValue({ data: { organizationId: "b2c3d4e5-6f70-4812-9a3b-4c5d6e7f8091" }, error: null });
});
afterEach(() => {
  process.env = { ...saved };
  vi.clearAllMocks();
});

describe("createOrganizationAction consent binding", () => {
  it("refuses a binding from the superseded artifacts and never reaches the database", async () => {
    const stale = buildConsentBinding(listArchivedLegalDocuments()).version;
    expect(stale, "the archived binding is not distinguishable from the current one").not.toBe(currentBinding());

    const state = await createOrganizationAction({ status: "idle" }, formWith(stale));

    expect(state.status).toBe("error");
    expect(state.message).toMatch(/changed while you were on this page/i);
    // Decisive: the refusal happens before any write, so a stale acceptance cannot create a workspace
    // and then be noticed afterwards.
    expect(rpc).not.toHaveBeenCalled();
    expect(setActiveOrganization).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("records the binding the server resolved for itself, not one supplied by the browser", async () => {
    await createOrganizationAction({ status: "idle" }, formWith(currentBinding()));

    expect(rpc).toHaveBeenCalledTimes(1);
    const [command, args] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(command).toBe("create_organization_as_actor");
    // The version persisted on the consent record is the one the registry produced, at the corrected
    // versions, and never a literal.
    expect(args.p_terms_version).toBe(currentBinding());
    expect(args.p_terms_version).toMatch(/^operator_terms@1\.0\.1\+privacy_notice@1\.0\.1#[0-9a-f]{16}$/);
    expect(args.p_terms_version).not.toBe("2026-07-20");
    expect(redirect).toHaveBeenCalledWith("/onboarding/entity");
  });

  it("rejects a version that names the right documents but the wrong content", async () => {
    // A tampered composite hash: the label still reads 1.0.1, so only the exact-match comparison
    // catches it.
    const forged = currentBinding().replace(/#[0-9a-f]{16}$/, "#0123456789abcdef");
    const state = await createOrganizationAction({ status: "idle" }, formWith(forged));

    expect(state.status).toBe("error");
    expect(state.message).toMatch(/changed while you were on this page/i);
    expect(rpc).not.toHaveBeenCalled();
  });
});
