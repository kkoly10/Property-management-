"use client";

import * as React from "react";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import { CircleHelp } from "lucide-react";
import { cn } from "@/lib/utils";

function TooltipProvider({ delayDuration = 200, ...props }: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider delayDuration={delayDuration} data-slot="tooltip-provider" {...props} />;
}

function Tooltip({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  // Self-contained: each Tooltip carries its own Provider so a single <Tooltip> works anywhere,
  // with no app-wide provider to wire up. Nesting Providers is supported by radix.
  return <TooltipProvider><TooltipPrimitive.Root data-slot="tooltip" {...props} /></TooltipProvider>;
}

function TooltipTrigger({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({ className, sideOffset = 6, children, ...props }: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      data-slot="tooltip-content"
      sideOffset={sideOffset}
      className={cn("z-50 max-w-xs rounded-md border bg-popover px-3 py-2 text-xs leading-5 text-popover-foreground shadow-md", className)}
      {...props}
    >
      {children}
    </TooltipPrimitive.Content>
  </TooltipPrimitive.Portal>;
}

/**
 * Inline "what is this?" affordance: a small help icon that reveals a sentence of guidance on hover
 * and keyboard focus. Use it next to a field label or a value whose meaning is not self-evident, so the
 * screen stays uncluttered but the explanation is one hover away.
 */
function InfoHint({ label, className }: { label: React.ReactNode; className?: string }) {
  return <Tooltip>
    <TooltipTrigger asChild>
      <button
        type="button"
        aria-label="More information"
        className={cn("inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40", className)}
      >
        <CircleHelp className="h-3.5 w-3.5" />
      </button>
    </TooltipTrigger>
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>;
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, InfoHint };
