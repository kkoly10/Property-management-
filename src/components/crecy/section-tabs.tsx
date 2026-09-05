import Link from "next/link";
import { cn } from "@/lib/utils";

export type SectionTab = {
  label: string;
  href: string;
  value: string;
  count?: number;
};

export function SectionTabs({
  tabs,
  active,
  ariaLabel = "Sections",
  className,
}: {
  tabs: SectionTab[];
  active: string;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <nav aria-label={ariaLabel} className={cn("overflow-x-auto border-b", className)}>
      <div className="flex min-w-max gap-6">
        {tabs.map((tab) => {
          const selected = tab.value === active;
          return (
            <Link
              key={tab.value}
              href={tab.href}
              aria-current={selected ? "page" : undefined}
              className={cn(
                "relative flex items-center gap-2 py-3 text-sm font-medium transition-colors",
                selected ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
              {tab.count != null ? (
                <span className={cn(
                  "rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
                  selected ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground",
                )}>
                  {tab.count}
                </span>
              ) : null}
              {selected ? <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-primary" /> : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
