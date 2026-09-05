import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const alertVariants = cva("relative grid w-full grid-cols-[auto_1fr] gap-x-3 rounded-lg border p-4 text-sm", {
  variants: {
    variant: {
      default: "bg-card text-card-foreground",
      info: "border-[#b2ddff] bg-[#eff8ff] text-[#1849a9]",
      warning: "border-[#fedf89] bg-[#fffaeb] text-[#93370d]",
      // Matches Badge's success palette so a confirmed state reads the same wherever it appears.
      success: "border-[#abefc6] bg-[#ecfdf3] text-success",
      destructive: "border-[#fecdca] bg-[#fef3f2] text-destructive",
    },
  },
  defaultVariants: { variant: "default" },
});

function Alert({ className, variant, ...props }: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return <div role="alert" data-slot="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="alert-title" className={cn("col-start-2 font-semibold", className)} {...props} />;
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="alert-description" className={cn("col-start-2 mt-1 leading-5", className)} {...props} />;
}

export { Alert, AlertTitle, AlertDescription };
