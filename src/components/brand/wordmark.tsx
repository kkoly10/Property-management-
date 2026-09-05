import { cn } from "@/lib/utils";

export type CrecyProduct = "OS" | "Living" | "Owner";

export function CrecyMark({
  className,
  title,
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 50 44"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={cn("h-7 w-8 shrink-0", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M8 38V23L15 18L20 22V38" />
        <path d="M17 38V12L25 6L33 12V38" />
        <path d="M31 38V20L38 16L42 19V38" />
        <path d="M12 38V27" opacity=".72" />
        <path d="M25 38V12" opacity=".72" />
        <path d="M36 38V24" opacity=".72" />
      </g>
    </svg>
  );
}

/**
 * Canonical Crecy brand lockup.
 *
 * The previous component was plain bold text, which meant every surface rendered
 * a generic framework-style wordmark. This component is now the single source of
 * truth for the Crecy mark + wordmark and optional product lockup.
 */
export function Wordmark({
  className,
  product,
  markOnly = false,
}: {
  className?: string;
  product?: CrecyProduct;
  markOnly?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-2 text-primary",
        className,
      )}
      aria-label={product ? `Crecy ${product}` : "Crecy"}
    >
      <CrecyMark className={markOnly ? "h-8 w-8" : undefined} />
      {markOnly ? null : (
        <>
          <span className="text-[1.35rem] font-semibold leading-none tracking-[-0.05em]">
            Crecy
          </span>
          {product ? (
            <>
              <span
                aria-hidden="true"
                className="mx-1 h-6 w-px shrink-0 bg-current opacity-20"
              />
              <span className="truncate text-sm font-medium tracking-[-0.015em] text-current opacity-90">
                {product}
              </span>
            </>
          ) : null}
        </>
      )}
    </span>
  );
}
