import { Check, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

const steps = [
  ["submitted", "Submitted"],
  ["reviewed", "Reviewed"],
  ["scheduled", "Scheduled"],
  ["being_repaired", "Being repaired"],
  ["waiting_for_confirmation", "Confirmation"],
  ["completed", "Completed"],
] as const;

export function LivingRequestProgress({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  if (status === "canceled") {
    return (
      <div className={cn("rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3", className)}>
        <p className="text-sm font-semibold text-destructive">Request canceled</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">The request is no longer moving through the maintenance workflow.</p>
      </div>
    );
  }

  const activeIndex = steps.findIndex(([value]) => value === status);
  if (activeIndex < 0) {
    return (
      <div className={cn("rounded-xl border bg-card px-4 py-3", className)}>
        <p className="text-sm font-semibold">Status update</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{status.replaceAll("_", " ")}</p>
      </div>
    );
  }

  return (
    <ol aria-label="Maintenance request progress" className={cn("grid gap-0 overflow-hidden rounded-xl border bg-card sm:grid-cols-6", className)}>
      {steps.map(([value, label], index) => {
        const complete = index < activeIndex;
        const active = index === activeIndex;
        return (
          <li
            key={value}
            aria-current={active ? "step" : undefined}
            className={cn(
              "relative grid grid-cols-[28px_minmax(0,1fr)] items-center gap-2 border-b px-3 py-3 text-xs last:border-b-0 sm:block sm:border-b-0 sm:border-l sm:px-3 sm:py-4 sm:first:border-l-0",
              active && "bg-[var(--brand-subtle)]",
            )}
          >
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-semibold sm:mx-auto",
                complete && "border-primary bg-primary text-primary-foreground",
                active && "border-primary text-primary",
                !complete && !active && "border-border-strong text-muted-foreground",
              )}
            >
              {complete ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : active ? <Circle aria-hidden="true" className="h-2.5 w-2.5 fill-current" /> : index + 1}
            </span>
            <span className={cn("font-medium sm:mt-2 sm:block sm:text-center", active ? "text-foreground" : "text-muted-foreground")}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
