import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  context,
  actions,
  meta,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  context?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between", className)}>
      <div className="min-w-0 max-w-3xl">
        {context ? <div className="mb-2 text-sm font-medium text-muted-foreground">{context}</div> : null}
        <h1 className="text-[1.875rem] font-semibold leading-[1.12] tracking-[-0.035em] text-foreground sm:text-[2.125rem]">
          {title}
        </h1>
        {description ? (
          <div className="mt-2.5 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-[0.9375rem]">
            {description}
          </div>
        ) : null}
        {meta ? <div className="mt-3 text-xs text-muted-foreground">{meta}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
