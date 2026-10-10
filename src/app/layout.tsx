import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Inter } from "next/font/google";
import { classifyHost, isLivingSurface } from "@/lib/runtime/host";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

function visualSurface(host: string | null) {
  const classification = classifyHost(host);
  if (isLivingSurface(classification)) return "living" as const;
  if (classification.kind === "owner") return "owner" as const;
  return "os" as const;
}

/**
 * `viewport-fit=cover` is the switch that makes `env(safe-area-inset-*)` mean anything.
 *
 * Without it the default is `viewport-fit=auto`: the browser letterboxes the page inside the safe
 * area itself, so every inset reports `0px` and any `max(x, env(safe-area-inset-bottom))` in the
 * stylesheet silently collapses to `x`. Crecy Living's bottom tab bar was already written against
 * those variables and was therefore inert — its padding resolved to a flat `.6rem` and the tab row
 * sat in the iPhone home-indicator gesture area. Turning `cover` on hands the insets real values and
 * hands us responsibility for the edges, which is why the shells below pad by the insets.
 *
 * Deliberately absent: `maximumScale` and `userScalable`. Pinning either is the usual shortcut for
 * iOS's zoom-on-focus behaviour, and it fails WCAG 1.4.4 Resize Text for everyone who needs to zoom.
 * The supported fix is a 16px font on the control, which the input primitives already carry.
 *
 * This is the static `viewport` object rather than `generateViewport` on purpose. A per-surface
 * `themeColor` would need `headers()`, and viewport cannot be streamed — a request-time viewport
 * blocks the document. Surface colour stays with the web manifest, where it costs nothing.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const surface = visualSurface(requestHeaders.get("host"));
  const living = surface === "living";
  const svgIcon = living ? "/brand/favicon-living.svg" : "/brand/favicon-os.svg";

  return {
    applicationName: living ? "Crecy Living" : "Crecy",
    title: {
      default: living ? "Crecy Living" : "Crecy",
      template: living ? "%s · Crecy Living" : "%s · Crecy",
    },
    description: "A clear operating system for every rental relationship.",
    manifest: "/manifest.webmanifest",
    icons: {
      icon: [
        { url: svgIcon, type: "image/svg+xml", sizes: "any" },
        { url: `/api/brand/icon?surface=${living ? "living" : "os"}&size=16`, type: "image/png", sizes: "16x16" },
        { url: `/api/brand/icon?surface=${living ? "living" : "os"}&size=32`, type: "image/png", sizes: "32x32" },
        { url: `/api/brand/icon?surface=${living ? "living" : "os"}&size=48`, type: "image/png", sizes: "48x48" },
        { url: `/api/brand/icon?surface=${living ? "living" : "os"}&size=64`, type: "image/png", sizes: "64x64" },
      ],
      shortcut: [{ url: svgIcon, type: "image/svg+xml" }],
      apple: [
        {
          url: `/api/brand/icon?surface=${living ? "living" : "os"}&size=180`,
          type: "image/png",
          sizes: "180x180",
        },
      ],
    },
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const requestHeaders = await headers();
  const surface = visualSurface(requestHeaders.get("host"));

  return (
    <html lang="en" className={inter.variable} data-crecy-surface={surface}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
