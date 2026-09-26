import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { webcrypto } from "node:crypto";
const mocks = vi.hoisted(() => ({ refresh: vi.fn(), upload: vi.fn(), fetch: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ storage: { from: () => ({ uploadToSignedUrl: mocks.upload }) } }) }));
import { LeaseSetupForm } from "./lease-setup-form";
import { leaseFixture, activationFixture, leaseOrg, leaseUnit, agreementVersion, agreementDoc } from "@/lib/validation/homeowner-lease.fixture";
import type { LeaseSetupState } from "@/lib/homeowner/lease-state";
const okay = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const mount = (initial = leaseFixture()) => render(<LeaseSetupForm organizationId={leaseOrg} unitId={leaseUnit} initial={initial} disabled={false} />);
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("fetch", mocks.fetch); mocks.upload.mockResolvedValue({ error: null }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
async function review() {
  fireEvent.click(screen.getByRole("button", { name: "Save and review rental" }));
  await screen.findByRole("heading", { name: "Review before activation" });
}
function confirm() {
  fireEvent.click(screen.getByRole("checkbox", { name: /required parties have signed/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: /checked the opening balance/ }));
}
describe("signed rental recovery", () => {
  it("loads saved renter data and requires both confirmations before activation", async () => {
    mocks.fetch.mockResolvedValue(okay({ ...leaseFixture(), revision: 4 })); mount();
    expect(screen.getByLabelText("First name — renter 1")).toHaveValue("Jamie");
    await review();
    expect(screen.getByRole("button", { name: "Confirm and activate signed rental" })).toBeDisabled();
    confirm(); expect(screen.getByRole("button", { name: "Confirm and activate signed rental" })).toBeEnabled();
  });
  it("retains the same confirmed revision after a lost activation response", async () => {
    let attempts = 0; const activations: unknown[] = [];
    mocks.fetch.mockImplementation(async (url: string, init: RequestInit) => {
      if (url.endsWith("/activate")) { activations.push(JSON.parse(String(init.body))); if (++attempts === 1) throw new TypeError("Network interrupted"); return okay(activationFixture()); }
      return okay({ ...leaseFixture(), revision: 4 });
    });
    mount(); await review(); confirm(); fireEvent.click(screen.getByRole("button", { name: "Confirm and activate signed rental" }));
    const retry = await screen.findByRole("button", { name: "Retry same activation" });
    expect(screen.getByLabelText("Rent amount (USD)")).toBeDisabled();
    fireEvent.click(retry); await screen.findByRole("heading", { name: "Your signed rental is set up" });
    expect(activations).toHaveLength(2); expect(activations[1]).toEqual(activations[0]);
    expect(activations[0]).toMatchObject({ expectedRevision: 4 });
  });
  it("retries an ambiguous save without changing its identifier or payload", async () => {
    mocks.fetch.mockRejectedValueOnce(new TypeError("Save interrupted")).mockResolvedValueOnce(okay({ ...leaseFixture(), revision: 4 }));
    mount(); fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    fireEvent.click(await screen.findByRole("button", { name: "Retry same save" }));
    await screen.findByText("Draft saved. You can continue from another device.");
    expect(mocks.fetch.mock.calls[1][1].body).toBe(mocks.fetch.mock.calls[0][1].body);
    expect(mocks.fetch.mock.calls[1][1].headers["idempotency-key"]).toBe(mocks.fetch.mock.calls[0][1].headers["idempotency-key"]);
  });
  it("reloads the server revision rather than overwriting a competing tab", async () => {
    mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: "This setup changed in another tab." }), { status: 409 }))
      .mockResolvedValueOnce(okay({ ...leaseFixture(), revision: 8, draft: { ...leaseFixture().draft!, rentAmount: "1500" } }));
    mount(); fireEvent.click(screen.getByRole("button", { name: "Save draft" })); await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Load saved version" }));
    await waitFor(() => expect(screen.getByLabelText("Rent amount (USD)")).toHaveValue("1500"));
  });
  it("recovers a finalized upload saved on another device without transferring it again", async () => {
    const initial = leaseFixture(); initial.draft = { ...initial.draft!, documentVersionId: "", upload: { grantId: initial.setupId!, checksum: "a".repeat(64), filename: "signed.pdf", finalizeKey: initial.setupId! } };
    mocks.fetch.mockImplementation(async (url: string) => url.endsWith("/finalize") ? okay({ documentId: agreementDoc, versionId: agreementVersion }) : okay({ ...leaseFixture(), revision: 4 }));
    mount(initial); fireEvent.click(screen.getByRole("button", { name: "Finish upload verification" }));
    await screen.findByText(/Agreement received/); expect(mocks.upload).not.toHaveBeenCalled();
    expect(JSON.parse(mocks.fetch.mock.calls[1][1].body).draft.upload).toBeNull();
  });
  it("uses the updated draft revision for the post-upload save", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const revisions: number[] = []; let current: LeaseSetupState = leaseFixture();
    mocks.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith("upload-grants")) return okay({ grantId: current.setupId, uploadUrl: "https://local.example/storage/upload?token=test-token", storagePath: "test/agreement.pdf" });
      if (url.endsWith("/finalize")) return okay({ documentId: agreementDoc, versionId: agreementVersion });
      if (init?.method === "POST") { const body = JSON.parse(String(init.body)); revisions.push(body.expectedRevision); current = { ...current, revision: body.expectedRevision + 1, draft: body.draft }; }
      return okay(current);
    });
    mount(); const file = new File(["test bytes"], "signed.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "arrayBuffer", { value: async () => new TextEncoder().encode("test bytes").buffer });
    fireEvent.change(screen.getByLabelText("Upload a signed agreement"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Upload agreement securely" }));
    await screen.findByText(/Agreement received/); expect(revisions).toEqual([3, 4]);
    expect(mocks.upload).toHaveBeenCalledTimes(1);
  });
});
