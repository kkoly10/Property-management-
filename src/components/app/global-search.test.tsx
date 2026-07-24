import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GlobalSearch } from "@/components/app/global-search";

describe("GlobalSearch", () => {
  it("focuses from the documented shortcuts without hijacking slash in another field", () => {
    render(<><input aria-label="Another field" /><GlobalSearch /></>);
    const search = screen.getByLabelText("Search your workspace");
    const other = screen.getByLabelText("Another field");

    fireEvent.keyDown(window, { key: "/" });
    expect(search).toHaveFocus();

    other.focus();
    fireEvent.keyDown(other, { key: "/" });
    expect(other).toHaveFocus();

    fireEvent.keyDown(other, { key: "k", ctrlKey: true });
    expect(search).toHaveFocus();
  });
});
