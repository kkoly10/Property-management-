import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RentalTourForm } from "./tour-form";

const PUBLIC_ID = "81000000-0000-4000-8000-000000000081";
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
const okay = (body: unknown, status = 202) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", mocks.fetch);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function fill() {
  fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Jamie" } });
  fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Visitor" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "jamie@example.com" } });
  fireEvent.change(screen.getByLabelText("Preferred time 1"), { target: { value: "2026-11-10T18:00" } });
}

describe("rental tour request form", () => {
  it("retries an ambiguous submission with the exact same payload and key", async () => {
    mocks.fetch
      .mockResolvedValueOnce(okay({ error: "upstream timeout" }, 503))
      .mockResolvedValueOnce(okay({ accepted: true }));

    render(<RentalTourForm publicId={PUBLIC_ID} timeZone="America/New_York" />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Request a tour" }));

    await screen.findByText(/Confirm the previous submission/);
    expect(screen.getByLabelText("Preferred time 1")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Retry same tour request" }));

    await screen.findByText("Check your email");
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.fetch.mock.calls[1][1].body).toBe(mocks.fetch.mock.calls[0][1].body);
    expect(mocks.fetch.mock.calls[1][1].headers["idempotency-key"])
      .toBe(mocks.fetch.mock.calls[0][1].headers["idempotency-key"]);
  });

  it("names the rental time zone without implying approval", () => {
    render(<RentalTourForm publicId={PUBLIC_ID} timeZone="America/New_York" />);
    expect(screen.getByText("America/New_York")).toBeInTheDocument();
    expect(screen.getByText(/does not confirm a time/i)).toBeInTheDocument();
    expect(screen.queryByText(/approved|qualified|screened/i)).not.toBeInTheDocument();
  });
});
