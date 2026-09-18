import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssignVendorForm } from "./assign-vendor-form";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

const ORG = "10000000-0000-4000-8000-000000000001";
const REQUEST = "20000000-0000-4000-8000-000000000001";
const EXISTING = { vendorId: "30000000-0000-4000-8000-000000000001", displayName: "Ready Fix Plumbing", email: null, phoneE164: null, status: "active" };

type Call = { url: string; body: Record<string, unknown> };

/**
 * One mock for both routes, because the thing under test is what survives BETWEEN them: the vendor is
 * created by one request and the work order by another, and the operator's half-filled form has to
 * live across that boundary.
 */
function mockFetch(vendorOutcomes: boolean[]) {
  const calls: Call[] = [];
  let vendorAttempt = 0;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: JSON.parse((init?.body as string) ?? "{}") });
    if (url === "/api/v1/vendors") {
      const ok = vendorOutcomes[vendorAttempt++] ?? true;
      return {
        ok,
        json: async () => ok
          ? { vendorId: "30000000-0000-4000-8000-0000000000ff", displayName: "Northside Plumbing" }
          : { error: "The vendor could not be added." },
      } as Response;
    }
    return { ok: true, json: async () => ({ workOrderId: "wo1", publicReference: "WO-1001", status: "assigned", ownerApprovalStatus: null }) } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

function fillWorkOrder() {
  fireEvent.change(screen.getByLabelText("Official priority"), { target: { value: "high" } });
  fireEvent.change(screen.getByLabelText("Scope of work"), { target: { value: "Diagnose and repair the kitchen sink leak." } });
  fireEvent.change(screen.getByLabelText(/Estimated cost/), { target: { value: "250.50" } });
  fireEvent.change(screen.getByLabelText("Currency"), { target: { value: "CAD" } });
  fireEvent.click(screen.getByLabelText(/Require owner approval/));
}

function fillVendor() {
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Northside Plumbing" } });
  fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: "dispatch@example.com" } });
  fireEvent.change(screen.getByLabelText(/^Phone/), { target: { value: "+14045551234" } });
}

function expectWorkOrderDraftIntact() {
  expect(screen.getByLabelText("Official priority")).toHaveValue("high");
  expect(screen.getByLabelText("Scope of work")).toHaveValue("Diagnose and repair the kitchen sink leak.");
  expect(screen.getByLabelText(/Estimated cost/)).toHaveValue("250.50");
  expect(screen.getByLabelText("Currency")).toHaveValue("CAD");
  expect(screen.getByLabelText(/Require owner approval/)).toBeChecked();
}

// This project does not enable RTL auto-cleanup, so renders would otherwise accumulate across tests
// and every query would match several mounted forms.
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("AssignVendorForm contextual vendor creation", () => {
  it("carries the work-order draft through a failed creation and the retry that succeeds", async () => {
    // The journey this exists for: a brand-new organization, a first maintenance request, and no
    // vendor to assign. Losing the scope and cost on the way to creating one is the defect.
    const calls = mockFetch([false, true]);
    render(<AssignVendorForm maintenanceRequestId={REQUEST} organizationId={ORG} vendors={[]} disabled={false} />);

    expect(screen.queryByRole("combobox", { name: "Vendor" })).toBeNull();
    expect(screen.getByText(/No vendors yet/)).toBeInTheDocument();

    fillWorkOrder();
    fillVendor();
    fireEvent.click(screen.getByRole("button", { name: /add vendor/i }));

    await waitFor(() => expect(screen.getByText("The vendor could not be added.")).toBeInTheDocument());
    expectWorkOrderDraftIntact();
    // The vendor fields are not cleared either: retrying should not mean retyping.
    expect(screen.getByLabelText("Name")).toHaveValue("Northside Plumbing");
    expect(screen.getByLabelText(/^Email/)).toHaveValue("dispatch@example.com");
    expect(screen.getByLabelText(/^Phone/)).toHaveValue("+14045551234");

    fireEvent.click(screen.getByRole("button", { name: /add vendor/i }));

    const select = await screen.findByRole("combobox", { name: "Vendor" });
    expect(select).toHaveValue("30000000-0000-4000-8000-0000000000ff");
    expect(screen.queryByText("New vendor")).toBeNull();
    expectWorkOrderDraftIntact();

    fireEvent.click(screen.getByRole("button", { name: /create work order/i }));
    await waitFor(() => expect(screen.getByText(/Work order WO-1001 created/)).toBeInTheDocument());

    const workOrder = calls.find((call) => call.url === "/api/v1/work-orders");
    expect(workOrder?.body).toMatchObject({
      organizationId: ORG,
      maintenanceRequestId: REQUEST,
      vendorId: "30000000-0000-4000-8000-0000000000ff",
      scope: "Diagnose and repair the kitchen sink leak.",
      officialPriority: "high",
      estimatedCostMinor: 25050,
      currencyCode: "CAD",
      ownerApprovalRequired: true,
    });
  });

  it("does not create a vendor until the vendor form is submitted", async () => {
    const calls = mockFetch([true]);
    render(<AssignVendorForm maintenanceRequestId={REQUEST} organizationId={ORG} vendors={[]} disabled={false} />);

    fillVendor();
    expect(calls).toHaveLength(0);
  });

  it("offers contextual creation when vendors already exist and selects the new one", async () => {
    mockFetch([true]);
    render(<AssignVendorForm maintenanceRequestId={REQUEST} organizationId={ORG} vendors={[EXISTING]} disabled={false} />);

    expect(screen.getByRole("combobox", { name: "Vendor" })).toHaveValue(EXISTING.vendorId);
    expect(screen.queryByText("New vendor")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /add vendor/i }));
    fillVendor();
    fireEvent.click(screen.getByRole("button", { name: /add vendor/i }));

    await waitFor(() => expect(screen.getByRole("combobox", { name: "Vendor" })).toHaveValue("30000000-0000-4000-8000-0000000000ff"));
    // The vendor already on file is still assignable — creation adds, it does not replace.
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toContain("Ready Fix Plumbing");
  });

  it("moves focus to the field that holds the answer, at each end of the detour", async () => {
    // Opening the panel and closing it are both focus moves. Leaving the caret wherever the collapsed
    // panel used to be means a keyboard operator has to hunt for the form they just asked for, and
    // then hunt again for the selection that was just made on their behalf.
    mockFetch([true]);
    render(<AssignVendorForm maintenanceRequestId={REQUEST} organizationId={ORG} vendors={[EXISTING]} disabled={false} />);

    fireEvent.click(screen.getByRole("button", { name: /add vendor/i }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Name")));

    fillVendor();
    fireEvent.click(screen.getByRole("button", { name: /add vendor/i }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("combobox", { name: "Vendor" })));
  });

  it("treats Enter inside a vendor field as adding the vendor, not creating the work order", async () => {
    const calls = mockFetch([true]);
    render(<AssignVendorForm maintenanceRequestId={REQUEST} organizationId={ORG} vendors={[]} disabled={false} />);

    fillWorkOrder();
    fillVendor();
    fireEvent.keyDown(screen.getByLabelText("Name"), { key: "Enter" });

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].url).toBe("/api/v1/vendors");
  });

  it("labels and describes the contextual vendor fields", () => {
    mockFetch([true]);
    render(<AssignVendorForm maintenanceRequestId={REQUEST} organizationId={ORG} vendors={[]} disabled={false} />);

    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Phone/)).toHaveAccessibleDescription(/E\.164 format/);
  });
});
