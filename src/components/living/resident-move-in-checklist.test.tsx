import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { ResidentMoveIn } from "@/lib/data/resident-move-in";
import { ResidentMoveInChecklist } from "./resident-move-in-checklist";

const fixture: ResidentMoveIn = {
  tenancyId: "85000000-0000-4000-8000-000000000085",
  propertyName: "Fixture rental",
  unitCode: "Garden",
  startOn: "2090-01-03",
  state: "planned",
  appointmentOn: "2090-01-05",
  handedOverOn: null,
};

afterEach(cleanup);

it("keeps the tenancy start and property team's appointment date distinct", () => {
  render(<ResidentMoveInChecklist moveIn={fixture} canMessage />);
  expect(screen.getByRole("region", { name: "Move-in checklist" })).toBeVisible();
  expect(screen.getByText("Tenancy starts").nextElementSibling?.firstElementChild).toHaveAttribute("datetime", "2090-01-03");
  expect(screen.getByText("Move-in appointment").nextElementSibling?.firstElementChild).toHaveAttribute("datetime", "2090-01-05");
  expect(screen.getByRole("link", { name: "Message your property team" })).toHaveAttribute("href", "/messages");
});

it("gives the named signer a preparation checklist when an appointment is still pending", () => {
  render(<ResidentMoveInChecklist moveIn={{ ...fixture, state: "unplanned", appointmentOn: null }} />);
  expect(screen.getByText("Waiting for a date")).toBeVisible();
  expect(screen.getByRole("list")).toBeVisible();
  expect(screen.queryByRole("link", { name: "Message your property team" })).toBeNull();
});

it("prompts rescheduling after a missed appointment and switches to follow-up after handover", () => {
  const { rerender } = render(<ResidentMoveInChecklist moveIn={{ ...fixture, state: "no_show" }} />);
  expect(screen.getByText("Previous appointment")).toBeVisible();
  expect(screen.getByText(/Contact your property team to reschedule/)).toBeVisible();
  rerender(<ResidentMoveInChecklist moveIn={{ ...fixture, state: "handed_over", appointmentOn: null, handedOverOn: "2090-01-07" }} />);
  expect(screen.getByText("Handover recorded").nextElementSibling?.firstElementChild).toHaveAttribute("datetime", "2090-01-07");
  expect(screen.queryByRole("list")).toBeNull();
});
