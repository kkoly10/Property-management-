import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TourVerification } from "./verification";

const TOKEN = "a".repeat(64);
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", mocks.fetch);
  window.history.replaceState(null, "", `/tours/verify#token=${TOKEN}`);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("tour verification", () => {
  it("never verifies from GET alone", async () => {
    render(<TourVerification />);
    expect(await screen.findByRole("button", { name: "Verify my email" })).toBeEnabled();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("");
  });

  it("verifies only after the visitor explicitly submits", async () => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({
      verified: true, tourReference: "TOUR-ABC123", status: "requested",
    }), { status: 200, headers: { "content-type": "application/json" } }));
    render(<TourVerification />);
    fireEvent.click(await screen.findByRole("button", { name: "Verify my email" }));
    await screen.findByText(/Your tour request is verified/);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toEqual({ token: TOKEN });
    expect(screen.getByText(/not confirmed until the landlord confirms one/i)).toBeInTheDocument();
  });
});
