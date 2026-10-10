import type { Metadata } from "next";
import { TourVerification } from "./verification";

export const metadata: Metadata = {
  title: "Verify your tour request · Crecy",
  description: "Verify the email address used for a rental tour request.",
  robots: { index: false, follow: false, noarchive: true },
};

export default function VerifyRentalTourPage() {
  return (
    <div className="mx-auto max-w-xl px-5 py-16 sm:py-24">
      <p className="text-sm font-semibold text-primary">Rental tour</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">Verify your email</h1>
      <p className="mt-4 text-base leading-7 text-muted-foreground">
        Verification shares your preferred times with the landlord. It does not confirm a tour,
        reserve the rental, or approve an application.
      </p>
      <div className="mt-8"><TourVerification /></div>
    </div>
  );
}
