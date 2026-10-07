import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RentalInquiryForm } from "./inquiry-form";

const PUBLIC_ID = "81000000-0000-4000-8000-000000000081";
const fetchMock = vi.fn();
const okay = (body: unknown, status = 202) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function fill() {
  fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Jamie" } });
  fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Renter" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "jamie@example.com" } });
  fireEvent.change(screen.getByLabelText("Question about this rental"), {
    target: { value: "Is water included in the monthly rent?" },
  });
}

describe("public rental inquiry form", () => {
  it("retries an ambiguous response with the same body and idempotency key", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("network interrupted"))
      .mockResolvedValueOnce(okay({ accepted: true }));
    render(<RentalInquiryForm publicId={PUBLIC_ID} />);
    fill();

    fireEvent.click(screen.getByRole("button", { name: "Email my question" }));
    await screen.findByText("Confirm the previous submission");
    expect(screen.getByLabelText("Email")).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Retry same question" }));
    await screen.findByText("Check your email");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].body).toBe(fetchMock.mock.calls[0][1].body);
    expect(fetchMock.mock.calls[1][1].headers["idempotency-key"])
      .toBe(fetchMock.mock.calls[0][1].headers["idempotency-key"]);
  });

  it("does not ask for screening or sensitive identity data", () => {
    render(<RentalInquiryForm publicId={PUBLIC_ID} />);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Question about this rental")).toBeInTheDocument();
    expect(screen.queryByLabelText(/social security|income|credit|date of birth|government id/i)).toBeNull();
    expect(screen.getByText(/Do not include Social Security numbers/i)).toBeInTheDocument();
  });
});
