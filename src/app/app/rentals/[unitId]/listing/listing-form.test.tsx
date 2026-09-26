import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ storage: { from: () => ({ uploadToSignedUrl: vi.fn() }) } }),
}));

import { RentalListingForm } from "./listing-form";
import type { ListingPhotoOption, RentalListingRow } from "@/lib/data/rental-listings";

const ORG = "91000000-0000-4000-8000-000000000091";
const UNIT = "92000000-0000-4000-8000-000000000092";
const LISTING = "93000000-0000-4000-8000-000000000093";
const PUBLIC = "94000000-0000-4000-8000-000000000094";
const VERSION = "95000000-0000-4000-8000-000000000095";
const DOCUMENT = "96000000-0000-4000-8000-000000000096";

const okay = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const listing: RentalListingRow = {
  id: LISTING, public_id: PUBLIC, organization_id: ORG, property_id: "97000000-0000-4000-8000-000000000097",
  unit_id: UNIT, title: "Basement apartment",
  summary: "A private basement apartment with a separate entrance and driveway parking.",
  rent_amount_minor: 135000, currency_code: "USD", available_on: "2026-10-01",
  lease_term_text: "12 months", pets_text: "Ask about pets",
  utilities_text: "Water included", parking_text: "One driveway space",
  status: "draft", visibility: "unlisted", version: 2, published_at: null,
};
const photo: ListingPhotoOption = {
  versionId: VERSION, documentId: DOCUMENT, status: "clean", originalFilename: "basement.jpg",
  mimeType: "image/jpeg", uploadedAt: "2026-09-26T00:00:00Z",
  altText: "Private basement entrance", sortOrder: 0, attached: true,
};

function mount(initialListing: RentalListingRow | null = listing, initialPhotos = [photo]) {
  return render(<RentalListingForm
    organizationId={ORG} unitId={UNIT} unitName="Basement apartment" currencyCode="USD"
    initialListing={initialListing} initialPhotos={initialPhotos}
    shareOrigin="https://rent.crecyos.com" disabled={false}
  />);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", mocks.fetch);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("shareable listing recovery", () => {
  it("retries an ambiguous draft save with the same payload and idempotency key", async () => {
    mocks.fetch
      .mockResolvedValueOnce(okay({ error: "upstream timeout" }, 502))
      .mockResolvedValueOnce(okay({
        listingId: LISTING, publicId: PUBLIC, status: "draft", visibility: "unlisted", version: 1, photoCount: 0,
      }));
    mount(null, []);
    fireEvent.change(screen.getByLabelText("Monthly rent (USD)"), { target: { value: "1350.00" } });
    fireEvent.change(screen.getByLabelText("Available on"), { target: { value: "2026-10-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText(/Confirm the previous operation before editing/);
    expect(screen.getByLabelText("Listing title")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText(/Listing draft saved/);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.fetch.mock.calls[1][1].body).toBe(mocks.fetch.mock.calls[0][1].body);
    expect(mocks.fetch.mock.calls[1][1].headers["idempotency-key"])
      .toBe(mocks.fetch.mock.calls[0][1].headers["idempotency-key"]);
  });
  it("retries an ambiguous publish with the same payload and idempotency key", async () => {
    mocks.fetch
      .mockResolvedValueOnce(okay({ error: "worker timeout" }, 502))
      .mockResolvedValueOnce(okay({
        listingId: LISTING, publicId: PUBLIC, status: "published", visibility: "unlisted", version: 3,
      }));
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Publish share link" }));
    await screen.findByText(/Confirm the previous operation before editing/);
    expect(screen.getByLabelText("Listing title")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Publish share link" }));
    await screen.findByText(/Listing published as unlisted/);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.fetch.mock.calls[1][1].body).toBe(mocks.fetch.mock.calls[0][1].body);
    expect(mocks.fetch.mock.calls[1][1].headers["idempotency-key"])
      .toBe(mocks.fetch.mock.calls[0][1].headers["idempotency-key"]);
  });

  it("keeps the listing explicitly unlisted and shareable", () => {
    mount();
    expect(screen.getByText("Unlisted / shareable")).toBeInTheDocument();
    expect(screen.getByDisplayValue("https://rent.crecyos.com/l/" + PUBLIC)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /marketplace|discover/i })).not.toBeInTheDocument();
  });
});
