import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkOrderActions } from "./work-order-actions";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
// The evidence upload path calls the browser storage client; the completion-gating tests never invoke
// it, so a minimal stub keeps the module importable.
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ storage: { from: () => ({ uploadToSignedUrl: async () => ({ error: null }) }) } }) }));

const ORG = "10000000-0000-4000-8000-000000000001";
const WO = "20000000-0000-4000-8000-000000000002";
const DOC = "30000000-0000-4000-8000-000000000003";

// A fetch stub whose scan-status verdict and transition capture are set per test.
function stubFetch(scanStatus: string, onTransition?: (body: unknown) => void) {
  return vi.fn(async (url: string | URL, init?: RequestInit) => {
    const href = String(url);
    if (href.includes("/documents/upload-grants")) return json({ uploadUrl: "https://x.test/u?token=t", grantId: "g", storagePath: "p" });
    if (href.includes("/documents/finalize")) return json({ documentId: DOC });
    if (href.includes("/documents/scan-status")) return json({ versions: [{ documentId: DOC, uploadStatus: scanStatus }] });
    if (href.includes("/transitions")) { onTransition?.(JSON.parse(String(init?.body))); return json({ workOrderId: WO, status: "completed", version: 3 }); }
    return json({});
  });
}
const json = (body: unknown, ok = true) => ({ ok, json: async () => body } as Response);

async function uploadOneEvidence() {
  const input = screen.getByLabelText("Completion evidence") as HTMLInputElement;
  Object.defineProperty(input, "files", { value: [new File(["x"], "repair.jpg", { type: "image/jpeg" })], configurable: true });
  fireEvent.click(screen.getByRole("button", { name: /upload evidence/i }));
  await waitFor(() => expect(screen.getByText("repair.jpg")).toBeInTheDocument());
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("WorkOrderActions completion evidence gating", () => {
  it("blocks completion while evidence is still scanning", async () => {
    vi.stubGlobal("fetch", stubFetch("quarantined"));
    render(<WorkOrderActions workOrderId={WO} organizationId={ORG} status="in_progress" version={2} disabled={false} />);
    fireEvent.change(screen.getByLabelText("Completion notes"), { target: { value: "Replaced the trap." } });
    await uploadOneEvidence();

    // Freshly uploaded evidence is scanning, so Mark complete must be disabled.
    const badge = within(screen.getByRole("listitem")).getByText("Scanning");
    expect(badge).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /mark complete/i })).toBeDisabled();
  });

  it("unblocks completion and sends only clean evidence once the scan clears", async () => {
    const transitions: unknown[] = [];
    vi.stubGlobal("fetch", stubFetch("clean", (body) => transitions.push(body)));
    render(<WorkOrderActions workOrderId={WO} organizationId={ORG} status="in_progress" version={2} disabled={false} />);
    fireEvent.change(screen.getByLabelText("Completion notes"), { target: { value: "Replaced the trap." } });
    await uploadOneEvidence();

    fireEvent.click(screen.getByRole("button", { name: /refresh scan status/i }));
    await waitFor(() => expect(screen.getByText("Ready")).toBeInTheDocument());

    const complete = screen.getByRole("button", { name: /mark complete/i });
    await waitFor(() => expect(complete).toBeEnabled());
    fireEvent.click(complete);
    await waitFor(() => expect(transitions).toHaveLength(1));
    expect((transitions[0] as { evidenceDocumentIds: string[] }).evidenceDocumentIds).toEqual([DOC]);
  });

  it("demands replacement of rejected evidence and refuses to complete", async () => {
    vi.stubGlobal("fetch", stubFetch("rejected"));
    render(<WorkOrderActions workOrderId={WO} organizationId={ORG} status="in_progress" version={2} disabled={false} />);
    fireEvent.change(screen.getByLabelText("Completion notes"), { target: { value: "Replaced the trap." } });
    await uploadOneEvidence();

    fireEvent.click(screen.getByRole("button", { name: /refresh scan status/i }));
    await waitFor(() => expect(screen.getByText("Rejected evidence must be replaced")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /mark complete/i })).toBeDisabled();

    // Removing the rejected file clears the block.
    fireEvent.click(screen.getByRole("button", { name: /remove repair\.jpg/i }));
    await waitFor(() => expect(screen.queryByText("repair.jpg")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: /mark complete/i })).toBeEnabled();
  });
});
