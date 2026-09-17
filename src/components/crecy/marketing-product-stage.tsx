import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function MarketingProductStage({
  label,
  meta,
  children,
  className,
  chrome = "browser",
}: {
  label?: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  chrome?: "browser" | "device" | "none";
}) {
  // `min-w-0` matters here: this figure is usually a grid item, and a grid item defaults to
  // `min-width: auto`, so it is sized by the intrinsic width of the widest table inside it rather
  // than by its column. Without it a 640px register made /product render 694px wide on a 390px
  // phone instead of scrolling the table. It only permits shrinking — where the content already
  // fits, nothing moves.
  return (
    <figure className={cn("relative min-w-0 max-w-full", className)}>
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
      {label || meta ? (
        <figcaption className="mt-3 flex flex-col gap-1 px-1 text-xs leading-5 text-muted-foreground sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
          {label ? <span className="font-medium text-foreground">{label}</span> : null}
          {meta ? <span>{meta}</span> : null}
        </figcaption>
      ) : null}
    </figure>
  );
}
