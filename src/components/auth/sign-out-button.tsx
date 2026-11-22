import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/lib/auth/sign-out";

export function SignOutButton({ compact = false }: { compact?: boolean }) {
  return (
    <form action={signOutAction} className="shrink-0">
      <Button type="submit" size={compact ? "icon" : "sm"} variant={compact ? "ghost" : "outline"} aria-label="Sign out" title="Sign out">
        <LogOut aria-hidden className="h-[1.05rem] w-[1.05rem]" />
        {compact ? null : "Sign out"}
      </Button>
    </form>
  );
}
