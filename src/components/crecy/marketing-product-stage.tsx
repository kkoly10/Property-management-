import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function MarketingProductStage({
  label,
  meta,
  children,
  className,
  chrome = "browser",
}: {
  label: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  chrome?: "browser" | "device" | "none";
}) {
  return (
    <figure className={cn("relative", className)}>
      <div className="mb-3 flex items-end justify-between gap-4 px-1">
        <figcaption className="text-sm font-semibold tracking-[-0.01em] text-foreground">{label}</figcaption>
        {meta ? <div className="text-xs text-muted-foreground">{meta}</div> : null}
      </div>
      <div
        className={cn(
          "overflow-hidden border bg-card",
          chrome === "browser" && "rounded-[1rem] shadow-[0_28px_70px_rgba(16,24,40,0.10)]",
          chrome === "device" && "rounded-[1.35rem] shadow-[0_24px_60px_rgba(16,24,40,0.13)]",
          chrome === "none" && "rounded-xl",
        )}
      >
        {chrome === "browser" ? (
          <div className="flex h-9 items-center gap-1.5 border-b bg-[#fbfbfc] px-4" aria-hidden="true">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff6b61]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#f7bf43]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#5acb69]" />
            <span className="ml-3 h-4 w-36 rounded-full bg-[#eef0f3]" />
          </div>
        ) : null}
        {children}
      </div>
    </figure>
  );
}
