import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const services = vi.hoisted(() => ({ workspace: vi.fn(), worklist: vi.fn(), intake: vi.fn(), evidenceEnabled: vi.fn() }));
vi.mock("@/lib/data/rental-applications", () => ({ getRentalApplicationWorkspace: services.workspace }));
vi.mock("@/lib/rental-evidence/http", () => ({
  rentalEvidenceWorklist: services.worklist,
  getRentalEvidenceIntakeStatus: services.intake,
  rentalEvidenceEnabled: services.evidenceEnabled,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), notFound: vi.fn(), redirect: vi.fn() }));

import RentalApplicationsPage from "./page";

const unitId = "10000000-0000-4000-8000-000000000001";
const organizationId = "20000000-0000-4000-8000-000000000002";
const applicationId = "30000000-0000-4000-8000-000000000003";
const item = {
  id: applicationId, publicReference: "APP-A712C3DE9901",
  firstName: "Jamie", lastName: "Applicant", email: "jamie@example.test", desiredMoveInOn: "2026-12-01",
  leaseTermText: "", applicantNote: "", rentAmountMinor: 150000, currencyCode: "USD",
  status: "submitted", createdAt: "2026-11-23T14:30:00Z", version: 2,
};
const workspace = { mode: "ready", unitId, organizationId, unitName: "Example rental", items: [item] };
const renderPage = async () => render(await RentalApplicationsPage({ params: Promise.resolve({ unitId }) }));

beforeEach(() => {
  vi.resetAllMocks();
  services.workspace.mockResolvedValue(workspace);
  services.evidenceEnabled.mockReturnValue(true);
  services.intake.mockResolvedValue("no_policy");
});
afterEach(cleanup);

it.each([
  ["draft", "Waiting for applicant documents", false],
  ["submitted", "Private review pending", true],
  ["changes_requested", "Waiting for applicant changes", true],
  ["selected", "Selected for lease preparation", true],
])("shows the exact %s stage in the landlord list", async (status, label, canReview) => {
  services.worklist.mockResolvedValue(new Map([[applicationId, { applicationId, reviewer: true, status }]]));
  await renderPage();
  expect(screen.getByText(label)).toBeVisible();
  expect(Boolean(screen.queryByRole("link", { name: "Review private documents" }))).toBe(canReview);
  expect(screen.queryByText("Submitted for review")).not.toBeInTheDocument();
});

it("labels a declined application and keeps the review closed", async () => {
  services.workspace.mockResolvedValue({ ...workspace, items: [{ ...item, status: "closed" }] });
  services.worklist.mockResolvedValue(new Map([[applicationId, { applicationId, reviewer: true, status: "declined" }]]));
  await renderPage();
  expect(screen.getByText("Declined")).toBeVisible();
  expect(screen.queryByRole("link", { name: "Review private documents" })).not.toBeInTheDocument();
});

it("does not misreport an application as ready when the evidence progress query fails", async () => {
  services.worklist.mockResolvedValue(null);
  await renderPage();
  expect(screen.getByRole("alert")).toHaveTextContent("Application progress could not be loaded.");
  expect(screen.queryByText("Submitted for review")).not.toBeInTheDocument();
});

it.each([
  ["no_policy", "Contact only", /approved policy for this property/],
  ["intake_paused", "Contact only", /intake is paused/],
  ["private_uploads", "Private uploads", /after email verification and sign-in/],
])("shows the saved intake mode when the status is %s", async (status, label, copy) => {
  services.worklist.mockResolvedValue(new Map());
  services.intake.mockResolvedValue(status);
  await renderPage();
  expect(screen.getByRole("region", { name: "Application intake" })).toHaveTextContent(label);
  expect(screen.getByText(copy)).toBeVisible();
});
