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

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const living = isLivingSurface(classifyHost(requestHeaders.get("host")));
  const surface = living ? "living" : "os";
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
        { url: `/api/brand/icon?surface=${surface}&size=16`, type: "image/png", sizes: "16x16" },
        { url: `/api/brand/icon?surface=${surface}&size=32`, type: "image/png", sizes: "32x32" },
        { url: `/api/brand/icon?surface=${surface}&size=48`, type: "image/png", sizes: "48x48" },
        { url: `/api/brand/icon?surface=${surface}&size=64`, type: "image/png", sizes: "64x64" },
      ],
      shortcut: [{ url: svgIcon, type: "image/svg+xml" }],
      apple: [
        {
          url: `/api/brand/icon?surface=${surface}&size=180`,
          type: "image/png",
          sizes: "180x180",
        },
      ],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
