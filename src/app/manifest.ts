import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Crecy",
    short_name: "Crecy",
    description: "A clear operating system for every rental relationship.",
    start_url: "/",
    display: "standalone",
    background_color: "#F8FAFC",
    theme_color: "#4F46E5",
    icons: [
      {
        src: "/brand/favicon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/brand/favicon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
