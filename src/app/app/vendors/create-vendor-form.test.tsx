import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreateVendorForm } from "./create-vendor-form";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

const ORG = "10000000-0000-4000-8000-000000000001";
const keysUsed: string[] = [];

function mockFetch(ok: boolean) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    keysUsed.push(new Headers(init?.headers).get("idempotency-key") ?? "");
    return { ok, json: async () => (ok ? { vendorId: "v1" } : { error: "The vendor could not be added." }) } as Response;
  });
}

async function submitWith(name: string) {
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: name } });
  fireEvent.click(screen.getByRole("button", { name: /add vendor/i }));
}

// This project does not enable RTL auto-cleanup, so renders would otherwise accumulate across
// tests and every query would match several mounted forms.
afterEach(() => { cleanup(); keysUsed.length = 0; vi.restoreAllMocks(); });

describe("CreateVendorForm idempotency key lifecycle", () => {
  it("does not reuse the key of a failed attempt", async () => {
    // The invariant that matters: a retry after a failure must be a NEW request. Reusing the key means
    // the retry is judged against the failed attempt's stored record rather than being attempted.
    vi.stubGlobal("fetch", mockFetch(false));
    render(<CreateVendorForm organizationId={ORG} disabled={false} />);

    await submitWith("Northside Plumbing");
    await waitFor(() => expect(screen.getByText("The vendor could not be added.")).toBeInTheDocument());
    await submitWith("Northside Plumbing");
    await waitFor(() => expect(keysUsed).toHaveLength(2));

    expect(keysUsed[0]).not.toBe("");
    expect(keysUsed[1]).not.toBe(keysUsed[0]);
  });

  it("sends a fresh key for a second, different vendor", async () => {
    vi.stubGlobal("fetch", mockFetch(true));
    render(<CreateVendorForm organizationId={ORG} disabled={false} />);

    await submitWith("Northside Plumbing");
    await waitFor(() => expect(keysUsed).toHaveLength(1));
    await submitWith("Southside Electric");
    await waitFor(() => expect(keysUsed).toHaveLength(2));

    expect(keysUsed[1]).not.toBe(keysUsed[0]);
  });

  it("omits optional fields rather than sending empty strings", async () => {
    // "" is not an email address, and the zod schema treats these as optional rather than nullable.
    const fetchMock = mockFetch(true);
    vi.stubGlobal("fetch", fetchMock);
    render(<CreateVendorForm organizationId={ORG} disabled={false} />);

    await submitWith("Northside Plumbing");
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ organizationId: ORG, displayName: "Northside Plumbing" });
  });

  it("associates the phone format rule with its input", () => {
    render(<CreateVendorForm organizationId={ORG} disabled={false} />);
    expect(screen.getByLabelText(/Phone/)).toHaveAccessibleDescription(/E\.164 format/);
  });
});
