import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const services = vi.hoisted(() => ({ workspace: vi.fn(), activity: vi.fn() }));
vi.mock("@/lib/data/homeowner-rentals", () => ({ getRentalWorkspace: services.workspace }));
vi.mock("@/lib/data/rental-activity", async (load) => ({
  ...await load<typeof import("@/lib/data/rental-activity")>(),
  getRentalUnitActivity: services.activity,
}));

import RentalPage from "./page";

const unitId = "10000000-0000-4000-8000-000000000001";
const propertyId = "20000000-0000-4000-8000-000000000002";
const organizationId = "30000000-0000-4000-8000-000000000003";
const agreementId = "40000000-0000-4000-8000-000000000004";
const eventId = "50000000-0000-4000-8000-000000000005";
const eventDate = "2026-11-23T14:30:00Z";

beforeEach(() => {
  vi.resetAllMocks();
  services.workspace.mockResolvedValue({
    mode: "ready", organization: { organizationId },
    units: [{ id: unitId, property_id: propertyId, unit_code: "Test rental" }],
    properties: [{ id: propertyId, address_line1: "Fixture street", locality: "Fixture city", time_zone: "America/New_York" }],
    tenancies: [],
  });
});
afterEach(cleanup);

it("renders one next action with anchored scoped activity links and an accessible timestamp", async () => {
  services.activity.mockResolvedValue({
    mode: "ready", unitId, nextAction: { kind: "tour", label: "Review tour request", reference: "TOUR-38D398F569A0", targetId: null },
    events: [{
      id: eventId, label: "All parties signed", kind: "agreement", targetId: agreementId,
      reference: "APP-A712C3DE9901", occurredAt: eventDate,
    }],
  });
  const { container } = render(await RentalPage({ params: Promise.resolve({ unitId }) }));
  expect(services.activity).toHaveBeenCalledWith(organizationId, unitId);
  const panel = screen.getByRole("region", { name: "Rental activity" });
  expect(within(panel).getByRole("link", { name: "Review tour request" }))
    .toHaveAttribute("href", `/app/rentals/${unitId}/tours#tour-TOUR-38D398F569A0`);
  expect(within(panel).getByRole("link", { name: "All parties signed" }))
    .toHaveAttribute("href", `/app/agreements/${agreementId}`);
  expect(within(panel).getByText("APP-A712C3DE9901")).toBeVisible();
  expect(container.querySelector("time")).toHaveAttribute("datetime", eventDate);
});

it("keeps a denied timeline hidden and shows a recoverable error only when its read fails", async () => {
  services.activity.mockResolvedValueOnce({ mode: "unavailable" }).mockResolvedValueOnce({ mode: "error" });
  const { rerender } = render(await RentalPage({ params: Promise.resolve({ unitId }) }));
  expect(screen.queryByRole("region", { name: "Rental activity" })).toBeNull();
  rerender(await RentalPage({ params: Promise.resolve({ unitId }) }));
  expect(screen.getByRole("alert")).toHaveTextContent("Activity could not be loaded.");
});
