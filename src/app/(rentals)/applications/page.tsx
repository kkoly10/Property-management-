import type { Metadata } from "next";
import { ApplicationStatus } from "./status";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "My rental application · Crecy",
  description: "Privately view or withdraw your verified rental application.",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function RentalApplicationStatusPage({
  searchParams,
}: { searchParams: Promise<{ ref?: string | string[] }> }) {
  const params = await searchParams;
  const reference = typeof params.ref === "string" && /^APP-[0-9A-F]{12}$/.test(params.ref)
    ? params.ref : "unavailable";
  return (
    <main className="mx-auto max-w-2xl px-5 py-12 sm:py-20">
      <p className="text-sm font-semibold text-primary">My rental application</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">Application status</h1>
      <ApplicationStatus key={reference} reference={reference} />
    </main>
  );
}
