import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../..");
const documentData = readFileSync(resolve(root, "src/lib/data/documents.ts"), "utf8");
const listingMigration = readFileSync(
  resolve(root, "supabase/migrations/20260926045852_shared_rental_listings.sql"), "utf8",
);
const publicPage = readFileSync(resolve(root, "src/app/(rentals)/l/[publicId]/page.tsx"), "utf8");

describe("homeowner listing boundary", () => {
  it("keeps listing media out of the operational document register", () => {
    expect(documentData).toContain('.neq("document_type", "rental_listing_photo")');
  });

  it("blocks listing media from recipient delivery at the database boundary", () => {
    expect(listingMigration).toContain("prevent_rental_listing_photo_delivery");
    expect(listingMigration).toContain("LISTING_PHOTO_NOT_DELIVERABLE");
  });

  it("keeps the unlisted public page non-indexable and free of direct address fields", () => {
    expect(publicPage).toContain("index: false");
    expect(publicPage).toContain("follow: false");
    expect(publicPage).not.toContain("address_line1");
    expect(publicPage).not.toContain("postal_code");
  });
});
