import type { Metadata } from "next";
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
