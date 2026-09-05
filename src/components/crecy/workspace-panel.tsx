import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function WorkspacePanel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  const hasHeader = title || description || actions;

  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-panel)]",
        className,
      )}
    >
      {hasHeader ? (
        <header className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div className="min-w-0">
            {title ? <h2 className="text-[0.9375rem] font-semibold tracking-[-0.01em]">{title}</h2> : null}
            {description ? <div className="mt-1 text-sm leading-6 text-muted-foreground">{description}</div> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cn(bodyClassName)}>{children}</div>
    </section>
  );
}
