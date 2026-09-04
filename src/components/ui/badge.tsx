import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold", {
  variants: {
    variant: {
      default: "border-transparent bg-secondary text-secondary-foreground",
      neutral: "border-border bg-muted text-muted-foreground",
      success: "border-[#abefc6] bg-[#ecfdf3] text-success",
      warning: "border-[#fedf89] bg-[#fffaeb] text-warning",
      info: "border-[#b2ddff] bg-[#eff8ff] text-info",
      destructive: "border-destructive/30 bg-destructive/10 text-destructive",
    },
  },
  defaultVariants: { variant: "default" },
});

function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
