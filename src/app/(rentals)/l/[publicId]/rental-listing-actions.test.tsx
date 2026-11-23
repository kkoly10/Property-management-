import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { RentalListingActions } from "./rental-listing-actions";

afterEach(cleanup);

it("preserves a question draft while the renter looks at the tour and application forms", () => {
  render(<RentalListingActions publicId="81000000-0000-4000-8000-000000000081"
    timeZone="America/New_York" availableOn="2026-12-01" latestMoveInOn="2027-11-22" />);

  const question = screen.getByRole("tab", { name: "Question" });
  expect(question).toHaveAttribute("aria-selected", "true");
  const draft = "Is water included in the rent?";
  fireEvent.change(screen.getByLabelText("Question about this rental"), { target: { value: draft } });

  for (const name of ["Tour", "Apply"]) {
    const tab = screen.getByRole("tab", { name });
    fireEvent.mouseDown(tab, { button: 0 });
    expect(tab).toHaveAttribute("aria-selected", "true");
    expect(question).toHaveAttribute("aria-selected", "false");
  }

  fireEvent.mouseDown(question, { button: 0 });
  expect(question).toHaveAttribute("aria-selected", "true");
  expect(screen.getByLabelText("Question about this rental")).toHaveValue(draft);
});
