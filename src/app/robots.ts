import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/website/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/login", "/score", "/api"],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
