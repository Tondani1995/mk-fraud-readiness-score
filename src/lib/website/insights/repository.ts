import staticInsightsJson from '@/content/insights.json';
import { hasMongoConfiguration, connectDB } from '@/lib/website/mongodb';
import Insight from '@/lib/website/models/Insight';

export type WebsiteInsight = {
  _id: string;
  title: string;
  slug: string;
  excerpt: string;
  content?: string;
  tags?: string[];
  status?: 'draft' | 'published';
  author?: string;
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string | null;
  readTime?: string;
};

const staticInsights = staticInsightsJson as unknown as WebsiteInsight[];

function newestFirst(a: WebsiteInsight, b: WebsiteInsight) {
  return new Date(b.publishedAt || b.updatedAt || b.createdAt || 0).getTime()
    - new Date(a.publishedAt || a.updatedAt || a.createdAt || 0).getTime();
}

function asPlainInsights(value: unknown): WebsiteInsight[] {
  return JSON.parse(JSON.stringify(value)) as WebsiteInsight[];
}

export function getStaticPublishedInsights() {
  return staticInsights
    .filter((insight) => insight.status === 'published')
    .sort(newestFirst);
}

export async function loadPublishedInsights(): Promise<WebsiteInsight[]> {
  if (hasMongoConfiguration()) {
    try {
      await connectDB();
      const insights = await Insight.find({ status: 'published' })
        .sort({ publishedAt: -1, createdAt: -1 })
        .lean();
      return asPlainInsights(insights);
    } catch {
      // The committed public snapshot keeps website routes available while the
      // optional content database is unavailable or not configured.
    }
  }

  return getStaticPublishedInsights();
}

export async function loadPublishedInsightBySlug(slug: string): Promise<WebsiteInsight | null> {
  if (hasMongoConfiguration()) {
    try {
      await connectDB();
      const insight = await Insight.findOne({ slug, status: 'published' }).lean();
      if (insight) return asPlainInsights([insight])[0] ?? null;
    } catch {
      // Fall through to the exact public-content snapshot captured at migration.
    }
  }

  return getStaticPublishedInsights().find((insight) => insight.slug === slug) ?? null;
}
