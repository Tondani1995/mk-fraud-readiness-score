import type { Metadata } from "next";
import Wrapper from "@/components/website/Wrapper";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
    ArrowLeft,
    ArrowRight,
    Calendar,
    Clock,
    Tag,
    User,
} from "lucide-react";

import { Button } from "@/components/website/ui/button";
import JsonLd from "@/components/website/JsonLd";
import {
    renderInsightRichText,
    stripInsightFormatting,
} from "@/lib/website/insights/richText";
import { absoluteUrl, buildPageMetadata, SITE_NAME } from "@/lib/website/site";
import {
    loadPublishedInsightBySlug,
    loadPublishedInsights,
    type WebsiteInsight,
} from "@/lib/website/insights/repository";

type Insight = WebsiteInsight;

function estimateReadTime(text: string) {
    const words = (text || "").trim().split(/\s+/).filter(Boolean).length;
    const minutes = Math.max(1, Math.round(words / 200));
    return `${minutes} min read`;
}

function formatDate(iso?: string) {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleDateString("en-ZA", {
        year: "numeric",
        month: "long",
        day: "numeric",
    });
}

function formatDateShort(iso?: string) {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleDateString("en-ZA", {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

async function getInsight(slug: string): Promise<Insight | null> {
    return loadPublishedInsightBySlug(slug);
}

async function getAllInsights(): Promise<Insight[]> {
    return loadPublishedInsights();
}

export async function generateMetadata({
    params,
}: {
    params: { slug: string };
}): Promise<Metadata> {
    const { slug } = params;
    const post = await getInsight(slug);

    if (!post || (post.status && post.status !== "published")) {
        return buildPageMetadata({
            title: "Insight Not Found",
            description: "This MK Fraud Insights article is not available.",
            path: "/insights",
        });
    }

    return buildPageMetadata({
        title: post.title,
        description: post.excerpt || `Read this fraud risk insight from ${SITE_NAME}.`,
        path: `/insights/${post.slug}`,
        type: "article",
    });
}

export default async function InsightDetailPage({
    params,
}: {
    params: { slug: string };
}) {
    const { slug } = params;

    if (!slug) notFound();

    const post = await getInsight(slug);

    if (!post) notFound();
    if (post.status && post.status !== "published") notFound();

    const all = await getAllInsights();
    const moreInsights = all
        .filter((item) => item?.slug && item.slug !== post.slug)
        .filter((item) => !item.status || item.status === "published")
        .sort((a, b) => {
            const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
            const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
            return dateB - dateA;
        })
        .slice(0, 3);

    const author = post.author || SITE_NAME;
    const date = formatDate(post.updatedAt || post.createdAt) || "";
    const readTime =
        post.readTime || estimateReadTime(stripInsightFormatting(post.content || ""));
    const tags = post.tags || [];
    const articleUrl = absoluteUrl(`/insights/${post.slug}`);
    const articleJsonLd = {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: post.title,
        description: post.excerpt,
        url: articleUrl,
        mainEntityOfPage: articleUrl,
        datePublished: post.publishedAt || post.createdAt || post.updatedAt,
        dateModified: post.updatedAt || post.publishedAt || post.createdAt,
        author: {
            "@type": "Organization",
            name: author,
        },
        publisher: {
            "@type": "Organization",
            name: SITE_NAME,
        },
        keywords: tags,
    };

    return (
        <Wrapper>
            <JsonLd data={articleJsonLd} />
            <main className="bg-white">
                <section className="relative overflow-hidden bg-gradient-to-br from-[#001030] via-[#1d3658] to-[#0b1b33]">
                    <div className="absolute inset-0">
                        <div className="absolute left-0 top-0 h-[560px] w-[560px] rounded-full bg-white/10 blur-3xl" />
                        <div className="absolute right-0 bottom-0 h-[520px] w-[520px] rounded-full bg-white/5 blur-3xl" />
                    </div>
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:52px_52px]" />

                    <div className="relative mx-auto max-w-7xl px-6 py-14 lg:px-8 lg:py-18">
                        <div className="mb-6 flex items-center justify-between gap-4">
                            <Link
                                href="/insights"
                                className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/15"
                            >
                                <ArrowLeft className="h-4 w-4" />
                                Back to Insights
                            </Link>
                        </div>

                        <div className="max-w-3xl">
                            <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white/90">
                                Insights
                            </p>

                            <h1 className="mt-5 text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
                                {post.title}
                            </h1>

                            <p className="mt-4 text-base leading-relaxed text-white/80 sm:text-lg">
                                {post.excerpt}
                            </p>

                            <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-white/80">
                                <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5">
                                    <User className="h-4 w-4" />
                                    {author}
                                </span>

                                {date ? (
                                    <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5">
                                        <Calendar className="h-4 w-4" />
                                        {date}
                                    </span>
                                ) : null}

                                <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5">
                                    <Clock className="h-4 w-4" />
                                    {readTime}
                                </span>
                            </div>

                            {tags.length ? (
                                <div className="mt-5 flex flex-wrap gap-2">
                                    {tags.map((tag) => (
                                        <span
                                            key={tag}
                                            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white/90"
                                        >
                                            <Tag className="h-3.5 w-3.5" />
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    </div>

                    <div className="absolute bottom-0 left-0 h-px w-full bg-white/15" />
                </section>

                <section className="relative overflow-hidden bg-gradient-to-br from-white via-slate-50 to-white">
                    <div className="pointer-events-none absolute inset-0 -z-10">
                        <div className="absolute left-0 top-10 h-[520px] w-[520px] rounded-full bg-[#1d3658]/8 blur-3xl" />
                        <div className="absolute right-0 bottom-0 h-[560px] w-[560px] rounded-full bg-[#001030]/6 blur-3xl" />
                        <div className="absolute inset-0 bg-[linear-gradient(to_right,#0b122005_1px,transparent_1px),linear-gradient(to_bottom,#0b122005_1px,transparent_1px)] bg-[size:44px_44px]" />
                    </div>

                    <div className="mx-auto max-w-7xl px-6 py-16 lg:px-8 lg:py-20">
                        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-start">
                            <article className="lg:col-span-8">
                                <div className="overflow-hidden rounded-3xl border-2 border-slate-200 bg-white shadow-2xl">
                                    <div className="p-7 sm:p-10">
                                        {renderInsightRichText(post.content || "")}
                                    </div>
                                    <div className="h-1 w-full bg-[#1d3658]/15" />
                                </div>

                                <div className="mt-8">
                                    <Link href="/insights">
                                        <Button className="h-12 rounded-2xl bg-[#001030] px-6 text-base font-semibold text-white shadow-lg transition hover:opacity-95">
                                            <span className="flex items-center gap-2">
                                                <ArrowLeft className="h-5 w-5" />
                                                Back to Insights
                                            </span>
                                        </Button>
                                    </Link>
                                </div>
                            </article>

                            <aside className="lg:col-span-4">
                                <div className="sticky top-8 space-y-6">
                                    <div className="overflow-hidden rounded-3xl border-2 border-slate-200 bg-white shadow-xl">
                                        <div className="border-b border-slate-200 bg-slate-50/60 px-7 py-6">
                                            <p className="text-sm font-semibold uppercase tracking-wide text-[#1d3658]">
                                                More insights
                                            </p>
                                            <p className="mt-1 text-sm text-slate-600">
                                                Continue reading related posts.
                                            </p>
                                        </div>

                                        <div className="space-y-4 p-6">
                                            {moreInsights.length === 0 ? (
                                                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                                                    <p className="text-sm font-semibold text-[#001030]">
                                                        No other insights yet.
                                                    </p>
                                                    <p className="mt-1 text-sm text-slate-600">
                                                        Add more posts from the admin dashboard.
                                                    </p>
                                                </div>
                                            ) : (
                                                moreInsights.map((item) => {
                                                    const shortDate = formatDateShort(
                                                        item.updatedAt || item.createdAt
                                                    );
                                                    const firstTag = (item.tags || [])[0];

                                                    return (
                                                        <Link
                                                            key={item._id || item.slug}
                                                            href={`/insights/${item.slug}`}
                                                            className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-[#1d3658]/30 hover:shadow-md"
                                                        >
                                                            <div className="flex items-start justify-between gap-3">
                                                                <p className="font-semibold leading-snug text-[#001030]">
                                                                    {item.title}
                                                                </p>
                                                                <ArrowRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
                                                            </div>

                                                            {item.excerpt ? (
                                                                <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate-600">
                                                                    {item.excerpt}
                                                                </p>
                                                            ) : null}

                                                            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                                                {shortDate ? (
                                                                    <span className="inline-flex items-center gap-1">
                                                                        <Calendar className="h-3 w-3" />
                                                                        {shortDate}
                                                                    </span>
                                                                ) : null}

                                                                {firstTag ? (
                                                                    <span className="inline-flex items-center gap-1 rounded-full bg-[#1d3658]/10 px-2 py-1 font-semibold text-[#1d3658]">
                                                                        <Tag className="h-3 w-3" />
                                                                        {firstTag}
                                                                    </span>
                                                                ) : null}
                                                            </div>
                                                        </Link>
                                                    );
                                                })
                                            )}
                                        </div>

                                        <div className="border-t border-slate-200 bg-white p-6">
                                            <Link href="/insights">
                                                <Button className="w-full rounded-2xl bg-[#001030] py-6 text-sm font-semibold text-white shadow-md transition hover:opacity-95">
                                                    Browse all insights
                                                    <ArrowRight className="ml-2 h-4 w-4" />
                                                </Button>
                                            </Link>
                                        </div>
                                    </div>
                                </div>
                            </aside>
                        </div>
                    </div>

                    <div className="absolute bottom-0 left-0 h-px w-full bg-[#1d3658]/15" />
                </section>
            </main>
        </Wrapper>
    );
}
