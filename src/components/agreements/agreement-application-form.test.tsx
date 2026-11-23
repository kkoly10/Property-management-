import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AgreementIssueForm } from "./agreement-forms";

vi.mock("@/lib/agreements/actions", () => ({
  issueAgreementAction: vi.fn(), issueApplicationAgreementAction: vi.fn(),
  closeAgreementAction: vi.fn(), signAgreementAction: vi.fn(),
}));
vi.mock("@/lib/agreements/filing-actions", () => ({ fileAgreementAction: vi.fn() }));

const unitId = "10000000-0000-4000-8000-000000000001";
const propertyId = "20000000-0000-4000-8000-000000000002";
const organizationId = "30000000-0000-4000-8000-000000000003";
const applicationId = "40000000-0000-4000-8000-000000000004";
const setupId = "50000000-0000-4000-8000-000000000005";
const agreementId = "60000000-0000-4000-8000-000000000006";
const versionId = "70000000-0000-4000-8000-000000000007";
const otherUnit = "80000000-0000-4000-8000-000000000008";

afterEach(cleanup);

it("pins the prepared rental and displays the applicant without editable signer fields", () => {
  const file = { title: "Selected PDF", filename: "lease.pdf", version: 1, propertyId, unitId, id: versionId };
  const { container } = render(<AgreementIssueForm organizationId={organizationId} agreementId={agreementId} options={{
    mfaVerified: true, units: [{ id: unitId, propertyId, code: "101", property: "Fixture rental" }],
    documents: [file, { ...file, id: otherUnit, unitId: otherUnit, title: "Other rental PDF" }],
  }} application={{
    applicationId, setupId, unitId, applicationVersion: 3, setupRevision: 9, agreementId: null,
    name: "Verified Applicant", email: "verified@example.test",
    terms: { startDate: "2027-02-01", endDate: "2028-01-31", rentAmount: "1500", rentFrequency: "monthly",
      firstChargeDueDate: "2027-02-01", openingBalance: "0", currency: "USD" },
  }} />);

  expect(screen.getByText("Verified Applicant · verified@example.test")).toBeInTheDocument();
  expect(screen.queryByLabelText("Renter email addresses")).toBeNull();
  expect(screen.queryByLabelText("Rental")).toBeNull();
  const select = screen.getByLabelText("Agreement PDF version");
  expect(screen.queryByRole("option", { name: /Other rental PDF/ })).toBeNull();
  fireEvent.change(select, { target: { value: versionId } });
  const form = container.querySelector("form");
  expect(form).not.toBeNull();
  const values = new FormData(form!);
  expect(values.get("applicationId")).toBe(applicationId);
  expect(values.get("applicationVersion")).toBe("3");
  expect(values.get("setupId")).toBe(setupId);
  expect(values.get("setupRevision")).toBe("9");
  expect(values.get("versionId")).toBe(versionId);
  expect(values.has("emails")).toBe(false);
  expect(values.has("unitId")).toBe(false);
});
