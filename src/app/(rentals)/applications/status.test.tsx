import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApplicationStatus } from "./status";

const reference = "APP-ABCDEF123456";
const receipt = { applicationReference: reference, listingTitle: "Walkout apartment" };
const active = {
  ...receipt,
  firstName: "Jamie", lastName: "Applicant", email: "jamie@example.test",
  desiredMoveInOn: "2026-11-01", leaseTermText: "", applicantNote: "",
  rentAmountMinor: 150000, currencyCode: "USD", version: 2, evidenceAvailable: true,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("applicant progress", () => {
  it.each([
    ["evidence_pending", "Documents needed", "Continue to private documents"],
    ["submitted", "Submitted for review", "View private application documents"],
    ["changes_requested", "Changes requested", "Continue to private documents"],
    ["selected", "Selected for lease preparation", "View private application documents"],
    ["lease_preparation", "Lease preparation", "View private application documents"],
  ])("shows the %s stage and its actionable document link", async (status, label, action) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ...active, status })));
    render(<ApplicationStatus reference={reference} />);
    expect(await screen.findByText(label)).toBeVisible();
    expect(screen.getByRole("link", { name: action })).toHaveAttribute("href", `/applications/evidence?ref=${reference}`);
    expect(screen.getByRole("button", { name: "Withdraw my application" })).toBeVisible();
  });

  it.each(["declined", "closed"])("shows a %s receipt without resuming or withdrawing", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ...receipt, status })));
    render(<ApplicationStatus reference={reference} />);
    expect(await screen.findByText(`Application ${status}`)).toBeVisible();
    expect(screen.getByText(reference)).toBeVisible();
    expect(screen.queryByRole("link", { name: /private document/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /withdraw/ })).not.toBeInTheDocument();
  });

  it("shows the paused message rather than a dead document link", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ...active, status: "changes_requested", evidenceAvailable: false })));
    render(<ApplicationStatus reference={reference} />);
    expect(await screen.findByText(/Private document collection is paused/)).toBeVisible();
    expect(screen.queryByRole("link", { name: /private document/ })).not.toBeInTheDocument();
  });
});
