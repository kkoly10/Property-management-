import type { Metadata } from "next";
import { ApplicationVerification } from "./verification";

export const metadata: Metadata = {
  title: "Verify your rental application · Crecy",
  description: "Verify the email address associated with your rental application.",
  robots: { index: false, follow: false, noarchive: true },
};

export default function VerifyApplicationPage() {
  return (
    <div className="mx-auto max-w-xl px-5 py-16 sm:py-24">
      <p className="text-sm font-semibold text-primary">Rental application</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">Verify your email</h1>
      <p className="mt-4 text-base leading-7 text-muted-foreground">
        Verification shares your application with the landlord and gives you private
        access to its status. It does not reserve the rental or approve an application.
      </p>
      <div className="mt-8"><ApplicationVerification /></div>
    </div>
  );
}
