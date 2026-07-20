import { AppShell } from "@/components/app/app-shell";
import { getDashboardState } from "@/lib/data/dashboard";

export const dynamic = "force-dynamic";

export default async function OperatorLayout({ children }: { children: React.ReactNode }) {
  const dashboard = await getDashboardState();
  return <AppShell organizationName={dashboard.organizationName}>{children}</AppShell>;
}
