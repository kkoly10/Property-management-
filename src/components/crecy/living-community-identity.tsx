import type { ReactNode } from "react";
import { Home } from "lucide-react";
import { cn } from "@/lib/utils";

export function LivingCommunityIdentity({
  title,
  subtitle,
  media,
  badge,
  action,
  compact = false,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  media?: ReactNode;
  badge?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  if (compact) {
    return (
      <section className={cn("flex min-w-0 items-center gap-3", className)}>
        <div className="flex h-12 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[0.8rem] bg-secondary text-secondary-foreground">
          {media ?? <Home aria-hidden="true" className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-sm font-semibold tracking-[-0.01em]">{title}</h2>
            {badge}
          </div>
          {subtitle ? <div className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</div> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </section>
    );
  }

  return (
    <section
      className={cn(
        "relative isolate min-h-56 overflow-hidden rounded-[1.15rem] bg-[#0b3427] text-white shadow-[0_20px_50px_rgba(12,35,28,0.16)] sm:min-h-64",
        className,
      )}
    >
      <div className="absolute inset-0">
        {media ?? (
          <div className="h-full w-full bg-[radial-gradient(circle_at_72%_20%,rgba(255,255,255,.16),transparent_34%),linear-gradient(135deg,#087f55_0%,#064e3b_100%)]" />
        )}
      </div>
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,18,14,.03)_20%,rgba(4,18,14,.78)_100%)]" />
      <div className="relative flex min-h-56 flex-col justify-end p-5 sm:min-h-64 sm:p-7">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            {badge ? <div className="mb-3">{badge}</div> : null}
            <h2 className="text-2xl font-semibold tracking-[-0.035em] sm:text-[1.75rem]">{title}</h2>
            {subtitle ? <div className="mt-1.5 text-sm text-white/78">{subtitle}</div> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      </div>
    </section>
  );
}
