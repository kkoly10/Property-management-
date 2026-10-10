import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationActions } from "./application-actions";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
const ORG = "10000000-0000-4000-8000-000000000001";
const APPLICATION = "20000000-0000-4000-8000-000000000002";
const UNIT = "30000000-0000-4000-8000-000000000003";
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", mocks.fetch);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function show(status: "submitted" | "lease_preparation") {
  render(<ApplicationActions organizationId={ORG} applicationId={APPLICATION}
    initialVersion={2} status={status} unitId={UNIT} />);
}

describe("rental application landlord action concurrency UX", () => {
  it("sends only one command for competing clicks before React commits busy state", async () => {
    let resolveRequest: (response: Response) => void = () => {};
    mocks.fetch.mockReturnValue(new Promise<Response>((resolve) => { resolveRequest = resolve; }));
    show("submitted");
    const prepare = screen.getByRole("button", { name: "Prepare lease" });
    const close = screen.getByRole("button", { name: "Close application" });
    act(() => {
      fireEvent.click(prepare);
      fireEvent.click(close);
      fireEvent.click(prepare);
    });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.fetch.mock.calls[0][0]).toBe("/api/v1/rental-applications/prepare");
    resolveRequest(response({ applicationId: APPLICATION, status: "lease_preparation",
      applicationVersion: 3, unitId: UNIT }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(`/app/rentals/${UNIT}/setup`));
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("prevents a new lease-setup navigation while closure outcome is ambiguous", async () => {
    mocks.fetch.mockResolvedValueOnce(response({ error: "upstream unavailable" }, 502))
      .mockResolvedValueOnce(response({ applicationId: APPLICATION, status: "closed", version: 3 }));
    show("lease_preparation");
    expect(screen.getByRole("link", { name: "Continue lease setup" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close application" }));
    await screen.findByText("Retry the same operation before changing anything else.");
    expect(screen.queryByRole("link", { name: "Continue lease setup" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue lease setup" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Close application" }));
    await waitFor(() => expect(screen.getByText("Closed")).toBeInTheDocument());
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.fetch.mock.calls[1][1].body).toEqual(mocks.fetch.mock.calls[0][1].body);
    expect(mocks.fetch.mock.calls[1][1].headers["idempotency-key"])
      .toBe(mocks.fetch.mock.calls[0][1].headers["idempotency-key"]);
  });

  it("disables lease preparation after an ambiguous close until the same close is resolved", async () => {
    mocks.fetch.mockResolvedValueOnce(response({ error: "upstream unavailable" }, 503))
      .mockResolvedValueOnce(response({ applicationId: APPLICATION, status: "closed", version: 3 }));
    show("submitted");
    fireEvent.click(screen.getByRole("button", { name: "Close application" }));
    await screen.findByText("Retry the same operation before changing anything else.");
    expect(screen.getByRole("button", { name: "Prepare lease" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Close application" }));
    await waitFor(() => expect(screen.getByText("Closed")).toBeInTheDocument());
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it("allows only a matching preparation retry after an ambiguous prepare", async () => {
    mocks.fetch.mockResolvedValueOnce(response({ error: "upstream unavailable" }, 502))
      .mockResolvedValueOnce(response({ applicationId: APPLICATION, status: "lease_preparation", applicationVersion: 3, unitId: UNIT }));
    show("submitted");
    fireEvent.click(screen.getByRole("button", { name: "Prepare lease" }));
    await screen.findByRole("button", { name: "Retry same preparation" });
    expect(screen.getByRole("button", { name: "Close application" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Retry same preparation" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(`/app/rentals/${UNIT}/setup`));
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.fetch.mock.calls[1][1].body).toBe(mocks.fetch.mock.calls[0][1].body);
    expect(mocks.fetch.mock.calls[1][1].headers["idempotency-key"])
      .toBe(mocks.fetch.mock.calls[0][1].headers["idempotency-key"]);
  });

  it("does not treat a successful HTTP status with a mismatched receipt as a confirmed lease", async () => {
    mocks.fetch.mockResolvedValueOnce(response({ applicationId: "wrong-id", status: "lease_preparation",
      applicationVersion: 3, unitId: UNIT }))
      .mockResolvedValueOnce(response({ applicationId: APPLICATION, status: "lease_preparation",
        applicationVersion: 3, unitId: UNIT }));
    show("submitted");
    fireEvent.click(screen.getByRole("button", { name: "Prepare lease" }));
    await screen.findByText("The operation receipt was incomplete. Retry the same operation.");
    expect(mocks.push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Close application" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Retry same preparation" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledTimes(1));
    expect(mocks.fetch.mock.calls[1][1].body).toBe(mocks.fetch.mock.calls[0][1].body);
    expect(mocks.fetch.mock.calls[1][1].headers["idempotency-key"])
      .toBe(mocks.fetch.mock.calls[0][1].headers["idempotency-key"]);
  });
});
