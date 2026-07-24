import { AppShell } from "@/components/app/app-shell";
import { getOperatorShellState } from "@/lib/data/dashboard";

export const dynamic = "force-dynamic";

export default async function OperatorLayout({ children }: { children: React.ReactNode }) {
  const shell = await getOperatorShellState();
  return <AppShell organizationName={shell.organizationName}>{children}</AppShell>;
}
