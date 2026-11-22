import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RecordCostForm } from "./record-cost-form";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

const organizationId = "10000000-0000-4000-8000-000000000001";
const workOrderId = "20000000-0000-4000-8000-000000000002";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("requests owner review after finance posting requires approval", async () => {
  const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>()
    .mockResolvedValueOnce(Response.json({
      code: "WORK_ORDER_COST_APPROVAL_REQUIRED",
      error: "Request owner approval before posting.",
    }, { status: 422 }))
    .mockResolvedValueOnce(Response.json({ approvalStatus: "pending", approvalRound: 2 }));
  vi.stubGlobal("fetch", fetch);
  render(<RecordCostForm workOrderId={workOrderId} organizationId={organizationId}
    version={7} approvalOnly={false} defaultCurrencyCode="USD" suggestedAmountMinor={147500} disabled={false} />);

  fireEvent.click(screen.getByRole("button", { name: /post cost to ledger/i }));
  fireEvent.click(await screen.findByRole("button", { name: /request owner approval/i }));
  await waitFor(() => expect(screen.getByText("Owner review requested")).toBeInTheDocument());
  expect(screen.queryByText("Cost posted to the ledger")).toBeNull();
  const [post, review] = fetch.mock.calls;
  expect(post[0]).toBe(`/api/v1/work-orders/${workOrderId}/cost`);
  expect(review[0]).toBe(`/api/v1/work-orders/${workOrderId}/cost-approval`);
  expect(JSON.parse(String(review[1].body))).toMatchObject({ organizationId, expectedVersion: 7, amountMinor: 147500, currencyCode: "USD" });
  expect(new Headers(post[1].headers).get("idempotency-key")).not.toBe(new Headers(review[1].headers).get("idempotency-key"));
});

it("retries an unconfirmed owner approval request with the same key", async () => {
  const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>()
    .mockResolvedValueOnce(Response.json({ error: "Retry to confirm the approval request." }, { status: 502 }))
    .mockResolvedValueOnce(Response.json({ approvalStatus: "pending", approvalRound: 2 }));
  vi.stubGlobal("fetch", fetch);
  render(<RecordCostForm workOrderId={workOrderId} organizationId={organizationId}
    version={7} approvalOnly defaultCurrencyCode="USD" suggestedAmountMinor={147500} disabled={false} />);

  const request = screen.getByRole("button", { name: /request owner approval/i });
  fireEvent.click(request);
  await screen.findByText("Retry to confirm the approval request.");
  fireEvent.click(request);
  await screen.findByText("Owner review requested");
  const [first, retry] = fetch.mock.calls;
  const firstKey = new Headers(first[1].headers).get("idempotency-key");
  expect(firstKey).toBeTruthy();
  expect(new Headers(retry[1].headers).get("idempotency-key")).toBe(firstKey);
});
