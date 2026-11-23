import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AgreementSummary } from "@/lib/data/rental-agreements";

const data = vi.hoisted(() => ({ agreement: vi.fn(), delivery: vi.fn() }));
vi.mock("@/lib/data/rental-agreements", () => ({
  getRentalAgreement: data.agreement, getAgreementInvitationDelivery: data.delivery,
  getAgreementFiling: vi.fn(), getAgreementIssueOptions: vi.fn(), listRentalAgreements: vi.fn(),
}));
vi.mock("@/lib/data/signatures", () => ({ resolveEsignConsent: () => null }));
vi.mock("./agreement-forms", () => ({
  AgreementCloseForm: () => null, AgreementFilingForm: () => null,
  AgreementIssueForm: () => null, AgreementSignatureForm: () => null,
}));

import { AgreementDetail } from "./agreement-pages";

const agreementId = "85000000-0000-4000-8000-000000000085";
const organizationId = "86000000-0000-4000-8000-000000000086";
const sourceVersionId = "88000000-0000-4000-8000-000000000088";
const unitId = "8a000000-0000-4000-8000-00000000008a";
const applicationId = "8b000000-0000-4000-8000-00000000008b";
const agreement: AgreementSummary = {
  agreementId, sourceVersionId, title: "Fixture agreement", propertyLabel: "Fixture property", unitLabel: "Fixture unit",
  sourceSha256: "a".repeat(64), issuedAt: "2026-11-23T12:00:00Z", expiresAt: "2026-12-06T12:00:00Z",
  requiredCount: 2, signedCount: 0, myCapacity: "landlord", iSigned: false, applicationLinked: true, status: "open",
};

beforeEach(() => {
  vi.resetAllMocks();
  data.agreement.mockResolvedValue({ mode: "ready", organizationId, agreement });
});
afterEach(cleanup);

it.each([
  ["queued", "Queued"],
  ["accepted", "Accepted by email provider"],
  ["delivered", "Delivered to mail server"],
  ["delayed", "Delayed"],
  ["failed", "Failed"],
])("reports %s in the exact operator agreement", async (state, label) => {
  data.delivery.mockResolvedValue({ agreementId, state, reissue: null });
  render(await AgreementDetail({ surface: "operator", agreementId }));
  expect(data.delivery).toHaveBeenCalledWith(organizationId, agreementId);
  expect(screen.getByText(label)).toBeVisible();
});

it("keeps the operator page usable when the rollout has no delivery projection", async () => {
  data.delivery.mockResolvedValue(null);
  render(await AgreementDetail({ surface: "operator", agreementId }));
  expect(screen.getByText("Status unavailable")).toBeVisible();
  expect(screen.getByText("Awaiting signatures · 0 of 2 signed")).toBeVisible();
});

it("links an expired invitation to its exact authorized signing setup", async () => {
  data.agreement.mockResolvedValue({ mode: "ready", organizationId, agreement: { ...agreement, status: "expired" } });
  data.delivery.mockResolvedValue({ agreementId, state: "failed", reissue: { unitId, applicationId } });
  render(await AgreementDetail({ surface: "operator", agreementId }));
  expect(screen.getByRole("link", { name: "Return to application signing" }))
    .toHaveAttribute("href", `/app/rentals/${unitId}/applications/${applicationId}/agreement`);
});

it("withholds operator delivery metadata and gives the renter an expiry recovery step", async () => {
  data.agreement.mockResolvedValue({ mode: "ready", organizationId: null,
    agreement: { ...agreement, myCapacity: "lessee", status: "expired" } });
  render(await AgreementDetail({ surface: "participant", agreementId }));
  expect(data.delivery).not.toHaveBeenCalled();
  expect(screen.queryByText("Email delivery")).toBeNull();
  expect(screen.getByText("Contact your landlord for a new signing invitation.")).toBeVisible();
});
