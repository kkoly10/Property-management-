import { redirect } from "next/navigation";
import { getRentalWorkspace } from "@/lib/data/homeowner-rentals";
import { RentalOverview } from "@/components/app/rental-overview";
export const dynamic = "force-dynamic";
export default async function RentalsPage() {
  const workspace = await getRentalWorkspace();
  if (workspace.mode === "unavailable") redirect("/app");
  return <RentalOverview workspace={workspace} />;
}
