import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-12 text-center", className)}>
      {Icon ? (
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
          <Icon aria-hidden="true" className="h-5 w-5" />
        </span>
      ) : null}
      <h2 className={cn("text-base font-semibold", Icon && "mt-4")}>{title}</h2>
      {description ? <div className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{description}</div> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
