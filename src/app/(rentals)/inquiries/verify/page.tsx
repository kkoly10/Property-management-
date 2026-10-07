import type { Metadata } from "next";
import { InquiryVerification } from "./verification";

export const metadata: Metadata = {
  title: "Verify your rental question · Crecy",
  description: "Verify the email address used for a rental inquiry.",
  robots: { index: false, follow: false, noarchive: true },
};

export default function VerifyRentalInquiryPage() {
  return (
    <div className="mx-auto max-w-xl px-5 py-16 sm:py-24">
      <p className="text-sm font-semibold text-primary">Rental inquiry</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">Verify your email</h1>
      <p className="mt-4 text-base leading-7 text-muted-foreground">
        Verification sends your question to the landlord&apos;s Crecy workspace. It does not reserve the rental,
        approve an application, or guarantee a response.
      </p>
      <div className="mt-8">
        <InquiryVerification />
      </div>
    </div>
  );
}
