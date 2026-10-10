import * as React from "react";
import { cn } from "@/lib/utils";

function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select data-slot="native-select" className={cn("h-11 w-full rounded-md border border-input bg-card px-3 py-2 text-base sm:h-10 sm:text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50", className)} {...props}>
      {children}
    </select>
  );
}

export { NativeSelect };
