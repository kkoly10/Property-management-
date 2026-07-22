import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ResidentPaymentRetryContext, ResidentPaymentSessionOption } from "@/lib/data/finance";
import { ResidentPaymentForm } from "./resident-payment-form";

const option: ResidentPaymentSessionOption = {
  tenancyId: "10000000-0000-4000-8000-000000000001",
  organizationId: "20000000-0000-4000-8000-000000000002",
  organizationName: "Crecy Test",
  propertyName: "Maple Court",
  unitCode: "101",
  currencyCode: "USD",
  connectionStatus: "enabled",
  availableMethods: ["card", "bank"],
  charges: [{ chargeId: "30000000-0000-4000-8000-000000000003", description: "Monthly rent", dueDate: "2026-08-01", amountMinor: 100000, remainingMinor: 30000 }],
};

const retry: ResidentPaymentRetryContext = {
  paymentId: "40000000-0000-4000-8000-000000000004",
  publicReference: "PAY-FAILED0001",
  tenancyId: option.tenancyId,
  amountMinor: 50000,
  currencyCode: "USD",
  method: "bank",
  failureCode: "checkout_session_expired",
  failedAt: "2026-07-22T12:00:00Z",
  allocations: [{ chargeId: option.charges[0].chargeId, amountMinor: 50000 }],
};

describe("ResidentPaymentForm retry", () => {
  it("prefills a new attempt without exceeding the charge amount still available", () => {
    render(<ResidentPaymentForm options={[option]} retry={retry} disabled={false} />);

    expect(screen.getByLabelText("Payment amount (USD)")).toHaveValue("300.00");
    expect(screen.getByLabelText("Apply")).toHaveValue("300.00");
    expect(screen.getByRole("radio", { name: /bank account/i })).toBeChecked();
    expect(screen.getByText("$300.00 / $300.00")).toBeInTheDocument();
  });
});
