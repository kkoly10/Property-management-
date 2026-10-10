import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RentalSetupForm } from "./rental-setup-form";
import { rentalFixture } from "@/lib/validation/homeowner-rental.fixture";
import type { RentalWorkspace } from "@/lib/data/homeowner-rentals";
const { replace, refresh } = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));
const key = "b1000000-0000-4000-8000-000000000001";
const workspace: RentalWorkspace = { mode: "ready", actorId: "actor-a",
  organization: { organizationId: rentalFixture.organizationId, displayName: "Home rental", slug: "home", roleCode: "org_owner", customerPath: "self_managing", defaultTimeZone: "America/New_York", headquartersCountryCode: "US" },
  properties: [], books: [], units: [], occupiedUnitIds: [],
};
const storageKey = `crecy:rental-setup:actor-a:${rentalFixture.organizationId}`;
beforeEach(() => { sessionStorage.clear(); vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function fillNew() {
  for (const [label, value] of [["Street address", "123 Example Street"], ["City", "Example City"], ["State or province", "VA"], ["Postal code", "22000"], ["Your full legal name or business name", "Example Homeowner"], ["Rental name, such as Basement apartment", "Basement"]]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
  for (const name of ["entrance", "kitchen", "bathroom", "laundry"]) fireEvent.change(screen.getByLabelText(`${name} access`), { target: { value: "private" } });
}
describe("guided homeowner setup", () => {
  it("reviews the actual form and submits a validated rental before navigating", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ unitId: key }) });
    vi.stubGlobal("fetch", fetcher);
    render(<RentalSetupForm workspace={workspace} />);
    fillNew();
    fireEvent.click(screen.getByRole("button", { name: "Review rental setup" }));
    expect(screen.getByRole("heading", { name: "Review before creating" })).toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Create my rental" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/app/rentals/${key}`));
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body.organizationId).toBe(rentalFixture.organizationId);
    expect(body.space.name).toBe("Basement");
    expect(body.property.timeZone).toBe("America/New_York");
    expect(sessionStorage.getItem(storageKey)).toBeNull();
  });
  it("reuses the exact payload and operation key after an unconfirmed response and remount", async () => {
    sessionStorage.setItem(storageKey, JSON.stringify({ key, payload: rentalFixture }));
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: false, status: 502, json: async () => ({ error: "Unconfirmed result" }) })
      .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ unitId: key }) });
    vi.stubGlobal("fetch", fetcher);
    const first = render(<RentalSetupForm workspace={workspace} />);
    fireEvent.click(screen.getByRole("button", { name: "Resume pending setup" }));
    fireEvent.click(screen.getByRole("button", { name: "Retry the same request" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Unconfirmed result"));
    expect(screen.getByRole("button", { name: "Edit details" })).toBeDisabled();
    first.unmount();
    render(<RentalSetupForm workspace={workspace} />);
    fireEvent.click(screen.getByRole("button", { name: "Resume pending setup" }));
    fireEvent.click(screen.getByRole("button", { name: "Retry the same request" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(fetcher.mock.calls[0][1]).toEqual(fetcher.mock.calls[1][1]);
    expect(fetcher.mock.calls[1][1].headers["idempotency-key"]).toBe(key);
  });
  it("does not resume another actor's saved request", () => {
    sessionStorage.setItem(storageKey, JSON.stringify({ key, payload: rentalFixture }));
    render(<RentalSetupForm workspace={{ ...workspace, actorId: "actor-b" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Resume pending setup" }));
    expect(screen.getByRole("alert")).toHaveTextContent("No pending request");
    expect(screen.queryByRole("heading", { name: "Review before creating" })).not.toBeInTheDocument();
  });
  it("lets a known validation or plan rejection be edited without inventing a successful result", async () => {
    sessionStorage.setItem(storageKey, JSON.stringify({ key, payload: rentalFixture }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 422, json: async () => ({ error: "Plan limit" }) }));
    render(<RentalSetupForm workspace={workspace} />);
    fireEvent.click(screen.getByRole("button", { name: "Resume pending setup" }));
    fireEvent.click(screen.getByRole("button", { name: "Retry the same request" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Edit details" })).toBeEnabled());
    expect(sessionStorage.getItem(storageKey)).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });
});
