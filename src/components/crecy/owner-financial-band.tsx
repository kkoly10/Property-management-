import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type OwnerFinancialMetric = {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  tone?: "primary" | "finance" | "muted";
};

const tones = {
  primary: "text-foreground",
  finance: "text-[var(--finance-accent)]",
  muted: "text-muted-foreground",
} as const;

/**
 * Owner-specific financial summary.
 *
 * The Owner portal should read like a private financial report, not a dashboard
 * made of four interchangeable SaaS cards. Primary figures share one continuous
 * band and are separated by hairlines rather than separate containers.
 */
export function OwnerFinancialBand({
  metrics,
  period,
  className,
}: {
  metrics: OwnerFinancialMetric[];
  period?: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label="Owner financial summary"
      className={cn(
        "relative overflow-hidden rounded-[1rem] border bg-card",
        "before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-[var(--finance-accent)]",
        className,
      )}
    >
      {period ? (
        <div className="border-b px-6 py-3 text-xs font-medium text-muted-foreground">{period}</div>
      ) : null}
      <div className="grid sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric, index) => (
          <div
            key={index}
            className={cn(
              "px-6 py-5",
              index > 0 && "border-t sm:border-t-0 sm:border-l",
              index > 1 && "sm:border-t xl:border-t-0",
            )}
          >
            <div className="text-xs font-medium text-muted-foreground">{metric.label}</div>
            <div
              data-financial-value
              className={cn(
                "mt-2 text-[1.85rem] font-semibold leading-none tracking-[-0.04em]",
                tones[metric.tone ?? "primary"],
              )}
            >
              {metric.value}
            </div>
            {metric.detail ? <div className="mt-2 text-xs leading-5 text-muted-foreground">{metric.detail}</div> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
