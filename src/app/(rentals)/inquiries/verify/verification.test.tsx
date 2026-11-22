import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { InquiryVerification } from "./verification";

const fetchMock = vi.fn();
const token = "a".repeat(64);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  window.history.replaceState(null, "", "/inquiries/verify#token=" + token);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("rental inquiry verification", () => {
  it("does not verify on page load and consumes the fragment only on explicit action", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      verified: true,
      inquiryReference: "INQ-ABC123",
      status: "open",
    }), { status: 200, headers: { "content-type": "application/json" } }));

    render(<InquiryVerification />);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("#token=" + token);

    fireEvent.click(screen.getByRole("button", { name: "Verify my email" }));
    await screen.findByText("Your question is verified");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe("");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ token });
  });

  it("keeps the token in memory for a retry after a temporary failure", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({
        verified: false,
        message: "Verification is temporarily unavailable.",
      }), { status: 503, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        verified: true,
        inquiryReference: "INQ-ABC123",
        status: "open",
      }), { status: 200, headers: { "content-type": "application/json" } }));

    render(<InquiryVerification />);
    fireEvent.click(screen.getByRole("button", { name: "Verify my email" }));
    await screen.findByText("Verification is temporarily unavailable.");
    expect(window.location.hash).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Verify my email" }));
    await screen.findByText("Your question is verified");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ token });
  });
});
