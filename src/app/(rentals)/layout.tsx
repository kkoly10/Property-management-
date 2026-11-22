import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";

export default function RentalsPublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f7f8fb]">
      <header className="border-b bg-white">
        <div className="mx-auto flex min-h-16 max-w-[1180px] items-center justify-between gap-4 px-5 py-3 lg:px-8">
          <Link href="/" aria-label="Crecy rentals home"><Wordmark className="max-w-[118px]" /></Link>
          <p className="text-xs font-medium text-muted-foreground">Rental shared through Crecy</p>
        </div>
      </header>
      <main>{children}</main>
      <footer className="border-t bg-white">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-3 px-5 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <p>Crecy connects rental listings to the management relationship that follows.</p>
          <Link href="/landlords" className="font-semibold text-primary hover:underline">Manage your own rental with Crecy</Link>
        </div>
      </footer>
    </div>
  );
}
