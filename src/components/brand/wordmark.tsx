import { cn } from "@/lib/utils";
import {
  CRECY_LIVING_GREEN,
  CRECY_PURPLE,
  CrecyIconTile,
  CrecyMonogramGlyph,
  CrecyWordmarkGlyph,
} from "@/components/brand/crecy-art";

export type CrecyProduct = "OS" | "Living" | "Owner";

function isLiving(product?: CrecyProduct) {
  return product === "Living";
}

/**
 * Compact Crecy identity.
 *
 * This is the approved CY monogram derived from the custom Crecy wordmark.
 * It replaces the earlier architectural/building placeholder mark.
 */
export function CrecyMark({
  className,
  title,
  product,
  tile = false,
}: {
  className?: string;
  title?: string;
  product?: CrecyProduct;
  tile?: boolean;
}) {
  const living = isLiving(product);
  if (tile) {
    return (
      <CrecyIconTile
        living={living}
        title={title}
        className={cn("h-8 w-8 shrink-0", className)}
      />
    );
  }

  return (
    <span
      className={cn(living ? "text-[#01A065]" : "text-[#3A37EB]", className)}
      style={{ color: living ? CRECY_LIVING_GREEN : CRECY_PURPLE }}
    >
      <CrecyMonogramGlyph title={title} className="h-8 w-8 shrink-0" />
    </span>
  );
}

/**
 * Canonical Crecy wordmark.
 *
 * Purple belongs to crecyos.com and every *.crecyos.com surface.
 * Green belongs to crecyliving.com and community *.crecyliving.com surfaces.
 * Product context is conveyed by the surface/domain, not by bolting generic
 * suffix typography onto the approved wordmark.
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
  const living = isLiving(product);
  const label = product === "Living" ? "Crecy Living" : product === "Owner" ? "Crecy Owner" : "Crecy";

  if (markOnly) {
    return <CrecyMark product={product} title={label} tile className={className} />;
  }

  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center",
        living ? "text-[#01A065]" : "text-[#3A37EB]",
        className,
      )}
      style={{ color: living ? CRECY_LIVING_GREEN : CRECY_PURPLE }}
      aria-label={label}
    >
      <CrecyWordmarkGlyph className="h-[1.85rem] w-auto max-w-[9.5rem] sm:h-8" />
    </span>
  );
}
