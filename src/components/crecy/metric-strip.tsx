import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type MetricStripItem = {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  href?: string;
  emphasis?: "default" | "brand" | "finance" | "warning" | "danger";
};

const emphasisClasses: Record<NonNullable<MetricStripItem["emphasis"]>, string> = {
  default: "text-foreground",
  brand: "text-primary",
  finance: "text-[var(--finance-accent)]",
  warning: "text-warning",
  danger: "text-destructive",
};

function MetricContent({ item }: { item: MetricStripItem }) {
  return (
    <>
      <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
      <p
        data-financial-value
        className={cn(
          "mt-1.5 text-[1.65rem] font-semibold leading-none tracking-[-0.035em]",
          emphasisClasses[item.emphasis ?? "default"],
        )}
      >
        {item.value}
      </p>
      {item.detail ? <div className="mt-2 text-xs leading-5 text-muted-foreground">{item.detail}</div> : null}
    </>
  );
}

export function MetricStrip({
  items,
  className,
}: {
  items: MetricStripItem[];
  className?: string;
}) {
  return (
    <section
      aria-label="Summary metrics"
      className={cn(
        "grid overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-panel)] sm:grid-cols-2 xl:grid-cols-4",
        className,
      )}
    >
      {items.map((item, index) => {
        const classes = cn(
          "min-w-0 px-5 py-4 sm:px-6",
          index > 0 && "border-t sm:border-t-0 sm:border-l",
          index > 1 && "sm:border-t xl:border-t-0",
        );

        return item.href ? (
          <Link
            key={item.label}
            href={item.href}
            className={cn(classes, "transition-colors hover:bg-[var(--brand-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring")}
          >
            <MetricContent item={item} />
          </Link>
        ) : (
          <div key={item.label} className={classes}>
            <MetricContent item={item} />
          </div>
        );
      })}
    </section>
  );
}
