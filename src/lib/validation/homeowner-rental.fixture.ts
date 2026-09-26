import type { HomeownerRentalInput } from "./homeowner-rental";
export const rentalFixture: HomeownerRentalInput = {
  organizationId: "a1000000-0000-4000-8000-000000000001",
  property: { kind: "new", accountingBookId: null, legalName: "Example Homeowner", entityType: "individual",
    name: "Example home", addressLine1: "123 Example Street", addressLine2: "", locality: "Example City",
    subdivisionCode: "VA", postalCode: "22000", countryCode: "US", timeZone: "America/New_York" },
  space: { name: "Basement", type: "basement", bedrooms: 1, bathrooms: 1,
    entrance: "private", kitchen: "shared", bathroom: "private", laundry: "shared",
    utilitiesNotes: "Water included", parkingNotes: "" },
};
