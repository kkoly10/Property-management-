import type { ReactNode } from "react";

/**
 * Layout primitives for the marketing pages.
 *
 * File 27 §6 is explicit about what the visual direction is NOT: no container around every paragraph,
 * restrained card use, no generic AI-SaaS gradient/glass, no fake enterprise chrome. So these are
 * spacing and typography helpers, not decorated boxes — content sits on the canvas and hierarchy comes
 * from type scale, hairlines and whitespace.
 */
export function Section({
  children,
  className = "",
  tone = "canvas",
}: {
  children: ReactNode;
  className?: string;
  tone?: "canvas" | "surface";
}) {
  return (
    <section className={tone === "surface" ? "bg-card" : "bg-background"}>
      {/* `className` lands on the padded container, not the band. It used to land on the outer element,
          which carries no padding — so every `!py-*` override a page passed was silently discarded and
          every section on every page rendered at the same height. */}
      <div className={`mx-auto max-w-[1280px] px-5 py-16 sm:py-20 lg:px-8 lg:py-24 ${className}`}>{children}</div>
    </section>
  );
}

/**
 * A small, quiet label. File 27 asks for "minimal eyebrow labels" — minimal in count and in voice, so
 * this is muted rather than accent-colored. Nine primary-colored eyebrows down one page read as nine
 * competing headlines.
 */
export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{children}</p>;
}

export function SectionHeading({
  eyebrow,
  title,
  lede,
  align = "left",
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
  align?: "left" | "center";
}) {
  return (
    <div className={`max-w-2xl ${align === "center" ? "mx-auto text-center" : ""}`}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h2 className={`text-3xl font-semibold tracking-[-0.035em] text-balance sm:text-[2.5rem] sm:leading-[1.1] ${eyebrow ? "mt-3" : ""}`}>
        {title}
      </h2>
      {lede ? <p className="mt-4 text-lg leading-8 text-muted-foreground text-pretty">{lede}</p> : null}
    </div>
  );
}

/**
 * A capability, described as a claim plus the mechanism behind it.
 *
 * The mechanism line is the point: file 18 forbids outcome claims we cannot evidence, so each item says
 * what the system DOES rather than what it will achieve for you. The hairline is what makes a grid of
 * these read as an editorial table rather than a drift of gray paragraphs — structure without a card.
 */
export function FeatureItem({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-t pt-5">
      <h3 className="text-[0.9375rem] font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{children}</p>
    </div>
  );
}

export function FeatureGrid({ children, columns = 3 }: { children: ReactNode; columns?: 2 | 3 }) {
  return (
    <div className={`mt-12 grid gap-x-10 gap-y-8 sm:grid-cols-2 ${columns === 3 ? "lg:grid-cols-3" : ""}`}>
      {children}
    </div>
  );
}

/**
 * A product composition: a real Crecy screen described structurally.
 *
 * File 27: "product imagery should come from real Crecy UI/demo compositions, not fabricated customer
 * evidence." These render the actual shapes of the product's screens with sample values, and every one
 * is labelled Sample data per file 18 §4 — so nothing here can be mistaken for a customer's numbers.
 */
export function ProductComposition({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <figure className={`overflow-hidden rounded-xl border bg-card shadow-sm ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b bg-muted/40 px-4 py-2.5">
        <span className="truncate text-xs font-medium text-muted-foreground">{label}</span>
        <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Sample data</span>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </figure>
  );
}

/**
 * A short list of statements with hairlines between them.
 *
 * The alternative that kept appearing — four bordered boxes in a two-column grid — is exactly the
 * "container around every paragraph" file 27 rules out, and it renders ragged when the statements are
 * different lengths, which they always are.
 */
export function StatementList({ items, columns = 2 }: { items: readonly string[]; columns?: 1 | 2 }) {
  return (
    <ul className={`mt-10 grid gap-x-10 ${columns === 2 ? "sm:grid-cols-2" : ""}`}>
      {items.map((item) => (
        <li key={item} className="border-t py-5 text-[0.9375rem] leading-7">{item}</li>
      ))}
    </ul>
  );
}
