import type { MetadataRoute } from "next";
import { absoluteUrl, SITE_URL } from "@/lib/website/site";
import { loadPublishedInsights } from "@/lib/website/insights/repository";

export const revalidate = 3600;

const staticRoutes: MetadataRoute.Sitemap = [
  { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
  { url: absoluteUrl("/fraud-readiness"), changeFrequency: "weekly", priority: 0.95 },
  { url: absoluteUrl("/fraud-readiness/advisory"), changeFrequency: "monthly", priority: 0.8 },
  { url: absoluteUrl("/services"), changeFrequency: "monthly", priority: 0.9 },
  { url: absoluteUrl("/insights"), changeFrequency: "weekly", priority: 0.9 },
  { url: absoluteUrl("/about"), changeFrequency: "monthly", priority: 0.8 },
  { url: absoluteUrl("/industries"), changeFrequency: "monthly", priority: 0.8 },
  { url: absoluteUrl("/contact"), changeFrequency: "monthly", priority: 0.8 },
  { url: absoluteUrl("/privacy-policy"), changeFrequency: "yearly", priority: 0.3 },
  { url: absoluteUrl("/terms-of-use"), changeFrequency: "yearly", priority: 0.3 },
  { url: absoluteUrl("/fraud-readiness-assessment-terms"), changeFrequency: "yearly", priority: 0.3 },
];

function dateFromContent(value?: string | null) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const insights = await loadPublishedInsights();
  const seenInsightSlugs = new Set<string>();

  const insightRoutes: MetadataRoute.Sitemap = insights
    .filter((insight) => {
      const slug = insight.slug?.trim();
      if (!slug || seenInsightSlugs.has(slug)) return false;
      seenInsightSlugs.add(slug);
      return true;
    })
    .map((insight) => {
      const lastModified = dateFromContent(insight.updatedAt || insight.publishedAt || insight.createdAt);
      return {
        url: absoluteUrl(`/insights/${insight.slug.trim()}`),
        ...(lastModified ? { lastModified } : {}),
        changeFrequency: "monthly",
        priority: 0.7,
      };
    });

  return [...staticRoutes, ...insightRoutes];
}
