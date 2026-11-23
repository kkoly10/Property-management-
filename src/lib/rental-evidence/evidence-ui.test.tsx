import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApplicationEvidence } from "@/app/(rentals)/applications/evidence/application-evidence";
import { EvidenceReview } from "@/app/app/rentals/[unitId]/applications/[applicationId]/evidence/review";
import type { EvidencePacket } from "@/lib/validation/rental-evidence";

const reference = "APP-1234ABCDEF90";
const scope = { organizationId: "a1000000-0000-4000-8000-000000000001", unitId: "a2000000-0000-4000-8000-000000000002",
  applicationId: "a3000000-0000-4000-8000-000000000003" };
const packet = {
  status: "draft", version: 3, bound: true,
  requirements: { requirementsVersion: scope.applicationId, criteriaText: "Show proof of income.",
    requiredDocumentTypes: ["income_evidence"], acceptedAlternatives: "Income letter" },
  currentRequirementsVersion: scope.applicationId,
  noticeVersion: "approved-1", noticeText: "Share the requested documents with the assigned reviewer.",
  noticeSha256: "a".repeat(64), consented: null, allowedDocumentTypes: ["income_evidence"], allowScore: true,
  score: null, scoreSource: null, scoreObservedOn: null, alternativeDocumentTypes: [], requestedDocumentTypes: [], files: [],
} satisfies EvidencePacket;

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("private applicant workspace", () => {
  it("captures exact notice acceptance before the file controls become available", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json(packet))
      .mockResolvedValueOnce(Response.json({ ...packet, version: 4, consented: true, score: 705 }));
    vi.stubGlobal("fetch", fetch);
    render(<ApplicationEvidence reference={reference} returnTo={`/applications/evidence?ref=${reference}`} />);
    expect(await screen.findByText(packet.noticeText)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Upload document" })).toBeNull();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /agree to share/i }));
    fireEvent.change(screen.getByLabelText(/Self-reported credit score/), { target: { value: "705" } });
    fireEvent.change(screen.getByLabelText("Score source (optional)"), { target: { value: "credit_bureau" } });
    fireEvent.change(screen.getByLabelText("Score date (optional)"), { target: { value: "2026-01-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByRole("button", { name: "Upload document" })).toBeVisible();
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toMatchObject({ action: "save", reference, version: 3,
      score: 705, scoreSource: "credit_bureau", scoreObservedOn: "2026-01-01",
      noticeVersion: packet.noticeVersion, noticeSha256: packet.noticeSha256 });
  });

  it("requires the applicant to acknowledge changed listing criteria before submitting the original packet", async () => {
    const changed = { ...packet, currentRequirementsVersion: scope.unitId, consented: true };
    const fetch = vi.fn().mockResolvedValueOnce(Response.json(changed))
      .mockResolvedValueOnce(Response.json({ ...changed, status: "submitted", version: 4 }));
    vi.stubGlobal("fetch", fetch);
    render(<ApplicationEvidence reference={reference} returnTo={`/applications/evidence?ref=${reference}`} />);
    expect(await screen.findByText(/requirements shown here still apply/)).toBeVisible();
    const submit = screen.getByRole("button", { name: "Submit for landlord review" });
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /understand the listing has changed/i }));
    fireEvent.click(submit);
    expect(await screen.findByText("Your packet is submitted for landlord review.")).toBeVisible();
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toMatchObject({ action: "submit", reference,
      acknowledgeRequirementsChange: true, currentRequirementsVersion: scope.unitId });
  });

  it("updates scan status automatically without erasing a score draft or acknowledging changed criteria", async () => {
    vi.useFakeTimers();
    const file = { id: scope.unitId, documentType: "income_evidence", sizeBytes: 85 };
    const pending = { ...packet, consented: true, currentRequirementsVersion: scope.unitId,
      files: [{ ...file, status: "quarantined" }] };
    const fetch = vi.fn().mockResolvedValueOnce(Response.json(pending)).mockResolvedValueOnce(Response.json({
      ...pending, currentRequirementsVersion: scope.organizationId, files: [{ ...file, status: "clean" }],
    }));
    vi.stubGlobal("fetch", fetch);
    await act(async () => { render(<ApplicationEvidence reference={reference} returnTo={`/applications/evidence?ref=${reference}`} />); });
    const score = screen.getByLabelText(/Self-reported credit score/);
    const acknowledgment = screen.getByRole("checkbox", { name: /understand the listing has changed/i });
    fireEvent.change(score, { target: { value: "703" } });
    fireEvent.click(acknowledgment);
    expect(screen.getByText(/this page updates automatically/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Submit for landlord review" })).toBeDisabled();
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(screen.getByText("All uploaded files are ready.")).toBeVisible();
    expect(score).toHaveValue(703);
    expect(acknowledgment).not.toBeChecked();
    expect(screen.getByRole("link", { name: "Download" })).toBeVisible();
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("requires a manual category checklist before selecting and keeps credit adverse action gated", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ ...packet,
      status: "submitted", score: 705, consented: true }))
      .mockResolvedValueOnce(Response.json({ status: "selected", version: 4 }));
    vi.stubGlobal("fetch", fetch);
    render(<EvidenceReview scope={scope} />);
    await screen.findByText("Self-reported credit score 705 (unverified)");
    expect(screen.queryByRole("button", { name: "Record decline" })).toBeNull();
    const choose = screen.getByRole("button", { name: "Select for lease preparation" });
    expect(choose).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Proof of income" }));
    fireEvent.click(choose);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Selected for lease preparation"));
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ ...scope, version: 3, action: "select", documentTypes: ["income_evidence"] });
  });
});
