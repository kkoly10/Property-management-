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
        /**
         * A 40x40 target carrying a 16px glyph, with the extra 24px pulled back out by a negative
         * margin so nothing around it moves.
         *
         * A bare 16x16 button fails WCAG 2.2 SC 2.5.8 (24x24 minimum) and no exception covers it:
         * these sit beside field labels rather than inside a sentence, so the Inline exception does
         * not apply, and on the organization form three of them appear close enough that the
         * Spacing exception — no two 24px circles centred on the targets may intersect — cannot be
         * relied on either.
         *
         * The obvious alternative, a transparent `::before` overlay, enlarges the real hit area but
         * leaves `getBoundingClientRect()` and every automated target-size check reporting 16x16.
         * A fix that no test can see is a fix that silently rots. Sizing the box and cancelling it
         * with `-m-3` keeps the measured rect honest and the layout identical: 40px box minus 24px
         * of negative margin is the same 16px footprint the glyph had before.
         *
         * 40 rather than the 44 of SC 2.5.5 (AAA) because the neighbour is usually a `<label>`,
         * which is itself a control — a larger box would start swallowing taps meant for the field.
         */
        className={cn("inline-flex h-10 w-10 -m-3 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40", className)}
      >
        <CircleHelp className="h-3.5 w-3.5" />
      </button>
    </TooltipTrigger>
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>;
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, InfoHint };
