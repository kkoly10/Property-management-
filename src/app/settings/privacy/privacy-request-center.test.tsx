import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PrivacyRequestCenter } from "./privacy-request-center";
import PrivacyRequestReceiptPage from "./[privacyRequestId]/page";

const getReceipt = vi.hoisted(() => vi.fn());
vi.mock("@/lib/data/privacy", () => ({ getPrivacyRequestReceipt: getReceipt }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
  notFound: () => { throw new Error("not found"); },
}));

const privacyRequestId = "10000000-0000-4000-8000-000000000001";
const params = Promise.resolve({ privacyRequestId });

afterEach(() => { cleanup(); vi.resetAllMocks(); vi.unstubAllGlobals(); });

it("reuses the original intake key when an acknowledgment is uncertain", async () => {
  const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>()
    .mockResolvedValueOnce(Response.json({ error: "Confirm the original request by retrying." }, { status: 502 }))
    .mockResolvedValueOnce(Response.json({ privacyRequestId }, { status: 201 }));
  vi.stubGlobal("fetch", fetch);
  render(<PrivacyRequestCenter authenticatorLevel="aal2" organizations={[]} items={[]} returnTo="/settings/privacy" disabled={false} />);
  const submit = screen.getByRole("button", { name: "Submit request" });
  fireEvent.click(submit);
  await screen.findByText("Confirm the original request by retrying.");
  fireEvent.click(submit);
  await waitFor(() => expect(screen.getByText(/Your request was recorded/)).toBeInTheDocument());
  const [first, retry] = fetch.mock.calls;
  const key = new Headers(first[1].headers).get("idempotency-key");
  expect(key).toBeTruthy();
  expect(new Headers(retry[1].headers).get("idempotency-key")).toBe(key);
});

it("returns the requester to the exact receipt after the authenticator check", async () => {
  getReceipt.mockResolvedValue({ status: "step_up_required" });
  render(await PrivacyRequestReceiptPage({ params }));
  const destination = screen.getByRole("link", { name: "Use your authenticator" }).getAttribute("href");
  expect(new URL(destination ?? "", "https://crecy.test").searchParams.get("returnTo"))
    .toBe(`/settings/privacy/${privacyRequestId}`);
  expect(screen.queryByText("Request reference")).toBeNull();
});

it("treats an inaccessible receipt as missing", async () => {
  getReceipt.mockResolvedValue({ status: "not_found" });
  await expect(PrivacyRequestReceiptPage({ params })).rejects.toThrow("not found");
});
