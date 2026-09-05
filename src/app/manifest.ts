import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { classifyHost, isLivingSurface } from "@/lib/runtime/host";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const requestHeaders = await headers();
  const living = isLivingSurface(classifyHost(requestHeaders.get("host")));
  const surface = living ? "living" : "os";
  const svgIcon = living ? "/brand/favicon-living.svg" : "/brand/favicon-os.svg";

  return {
    name: living ? "Crecy Living" : "Crecy",
    short_name: living ? "Crecy Living" : "Crecy",
    description: "A clear operating system for every rental relationship.",
    start_url: "/",
    display: "standalone",
    background_color: "#F8FAFC",
    theme_color: living ? "#01A065" : "#3A37EB",
    icons: [
      {
        src: svgIcon,
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: `/api/brand/icon?surface=${surface}&size=192`,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `/api/brand/icon?surface=${surface}&size=512`,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `/api/brand/icon?surface=${surface}&size=512`,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
