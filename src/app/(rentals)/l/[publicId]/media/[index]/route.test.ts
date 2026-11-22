import { Blob as NodeBlob } from "node:buffer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPublicRentalListing, searchPublicRentalListings } from "@/lib/data/rental-listings";
import { routeForHost } from "@/lib/runtime/host-routing";
import { GET } from "./route";

const bindings = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  download: vi.fn(),
  signedUrl: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: bindings.rpc, storage: { from: bindings.from } }),
}));
vi.mock("@/lib/supabase/config", () => ({
  getPublicSupabaseConfig: () => ({ url: "https://fixture.example", publishableKey: "fixture" }),
}));

const publicId = "81000000-0000-4000-8000-000000000081";
const otherPublicId = "82000000-0000-4000-8000-000000000082";
const organizationId = "83000000-0000-4000-8000-000000000083";
const unitId = "84000000-0000-4000-8000-000000000084";
const documentVersionId = "85000000-0000-4000-8000-000000000085";
const photo = {
  documentVersionId, storageBucket: "private-documents",
  storagePath: `organizations/${organizationId}/unit/${unitId}/${documentVersionId}/private-original.png`,
  mimeType: "image/png", altText: "Kitchen",
};
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+1OR0AAAAASUVORK5CYII=",
  "base64",
);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const listing = {
  publicId, title: "Fixture rental", summary: "Synthetic listing description.",
  rentAmountMinor: 100000, currencyCode: "USD", availableOn: "2026-12-01",
  unitType: "basement", bedrooms: 1, bathrooms: 1, timeZone: "UTC",
  location: { locality: "Fixture City", subdivisionCode: "VA", countryCode: "US" },
  visibility: "unlisted", discoveredAt: "2026-11-22T12:00:00+00:00", photos: [photo],
};

function get(index = "0", id = publicId) {
  const url = `https://rent.crecyos.com/l/${id}/media/${index}`;
  return GET(new Request(url), { params: Promise.resolve({ publicId: id, index }) });
}

beforeEach(() => {
  vi.resetAllMocks();
  bindings.rpc.mockResolvedValue({ data: listing, error: null });
  bindings.from.mockReturnValue({ download: bindings.download, createSignedUrl: bindings.signedUrl });
  bindings.download.mockResolvedValue({ data: new NodeBlob([png], { type: "image/png" }), error: null });
});

describe("public rental listing photos", () => {
  it("uses opaque same-origin media links in listing and search projections", async () => {
    bindings.rpc.mockResolvedValueOnce({ data: { ...listing, photos: [{ ...photo, mimeType: "image/svg+xml" }, photo] } })
      .mockResolvedValueOnce({ data: { items: [{ ...listing, visibility: "discoverable", heroPhoto: photo }], nextCursor: null } });
    expect((await getPublicRentalListing(publicId))?.photos).toEqual([{
      mimeType: "image/png", altText: "Kitchen", url: `/l/${publicId}/media/1`,
    }]);
    const search = await searchPublicRentalListings({ limit: 12 });
    expect(search.items[0]?.heroPhoto).toEqual({ mimeType: "image/png", altText: "Kitchen", url: `/l/${publicId}/media/0` });
    expect(JSON.stringify(search)).not.toContain(photo.storagePath);
    expect(bindings.from).not.toHaveBeenCalled();
    expect(routeForHost("rent.crecyos.com", `/l/${publicId}/media/0`)).toEqual({ type: "continue" });
  });

  it("serves exactly the current approved photo without a redirect or cacheable response", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-length")).toBe(String(png.byteLength));
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("location")).toBeNull();
    expect(Buffer.from(await response.arrayBuffer())).toEqual(png);
    expect(bindings.rpc).toHaveBeenCalledWith("get_public_rental_listing", { p_public_id: publicId });
    expect(bindings.from).toHaveBeenCalledWith("private-documents");
    expect(bindings.download).toHaveBeenCalledWith(photo.storagePath);
    expect(bindings.signedUrl).not.toHaveBeenCalled();

    bindings.rpc.mockResolvedValueOnce({ data: null, error: null });
    const removed = await get();
    expect(removed.status).toBe(404);
    expect(removed.headers.get("cache-control")).toBe("private, no-store");
    expect(bindings.download).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid inputs, mismatched listings, and unexpected destinations before download", async () => {
    expect((await get("20")).status).toBe(404);
    expect((await get("00")).status).toBe(404);
    expect((await get("0", "not-a-uuid")).status).toBe(404);
    expect(bindings.rpc).not.toHaveBeenCalled();
    expect((await get("19")).status).toBe(404);
    for (const data of [
      { ...listing, publicId: otherPublicId },
      { ...listing, photos: [{ ...photo, storageBucket: "unrelated" }] },
      { ...listing, photos: [{ ...photo, storagePath: "unrelated-object.png" }] },
      { ...listing, photos: [{ ...photo, documentVersionId: otherPublicId }] },
      { ...listing, photos: [{ ...photo, mimeType: "image/svg+xml" }] },
    ]) {
      bindings.rpc.mockResolvedValueOnce({ data, error: null });
      expect((await get()).status).toBe(404);
    }
    expect(bindings.download).not.toHaveBeenCalled();
  });

  it("verifies the delivered image type and keeps upstream errors private", async () => {
    bindings.download.mockResolvedValueOnce({ data: new NodeBlob([jpeg], { type: "image/png" }), error: null });
    expect((await get()).status).toBe(404);

    bindings.rpc.mockResolvedValueOnce({ data: { ...listing, photos: [{ ...photo, mimeType: "image/jpeg" }] } });
    bindings.download.mockResolvedValueOnce({ data: new NodeBlob([jpeg], { type: "image/jpeg" }), error: null });
    expect((await get()).headers.get("content-type")).toBe("image/jpeg");

    bindings.download.mockResolvedValueOnce({ data: null, error: { message: photo.storagePath } });
    const unavailable = await get();
    expect(unavailable.status).toBe(404);
    expect(await unavailable.text()).toBe("");
  });
});
