"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Calendar, Clock, Tag } from "lucide-react";

import { Button } from "@/components/website/ui/button";

type Insight = {
    _id: string;
    title: string;
    slug: string;
    excerpt: string;
    tags?: string[];
    status?: "draft" | "published";
    createdAt?: string;
    updatedAt?: string;
    readTime?: string;
};

function formatDate(iso?: string) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-ZA", {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

function estimateReadTime(text: string) {
    const words = (text || "").trim().split(/\s+/).filter(Boolean).length;
    const minutes = Math.max(1, Math.round(words / 200));
    return `${minutes} min read`;
}

export default function LatestInsightsSection({
    title = "Browse insights by category",
    subtitle = "Select a category to filter content. New posts are added regularly.",
    limit,
}: {
    title?: string;
    subtitle?: string;
    limit?: number;
}) {
    const [items, setItems] = useState<Insight[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [activeCategory, setActiveCategory] = useState<string>("all");
    const [hoveredCard, setHoveredCard] = useState<number | null>(null);

    useEffect(() => {
        let alive = true;

        async function load() {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch("/api/insights", { cache: "no-store" });
                if (!res.ok) throw new Error("Failed to load insights");
                const data = await res.json();

                const list: Insight[] = Array.isArray(data)
                    ? data
                    : Array.isArray(data?.data)
                        ? data.data
                        : Array.isArray(data?.insights)
                            ? data.insights
                            : [];

                const published = list
                    .filter((p) => !p.status || p.status === "published")
                    .sort((a, b) => {
                        const da = new Date(a.updatedAt || a.createdAt || 0).getTime();
                        const db = new Date(b.updatedAt || b.createdAt || 0).getTime();
                        return db - da;
                    });

                const finalList = typeof limit === "number" ? published.slice(0, limit) : published;
                if (alive) setItems(finalList);
            } catch (e: any) {
                if (alive) setError(e?.message || "Something went wrong");
            } finally {
                if (alive) setLoading(false);
            }
        }

        load();
        return () => {
            alive = false;
        };
    }, [limit]);

    const categories = useMemo(() => {
        const tagSet = new Set<string>();
        for (const it of items) {
            (it.tags || []).forEach((t) => tagSet.add(String(t)));
        }

        const dynamic = Array.from(tagSet)
            .slice(0, 8)
            .map((t) => ({ id: t.toLowerCase(), label: t, tag: t }));

        return [{ id: "all", label: "All" }, ...dynamic];
    }, [items]);

    const filteredInsights = useMemo(() => {
        if (activeCategory === "all") return items;
        const selected = categories.find((c) => c.id === activeCategory);
        if (!selected || !("tag" in selected)) return items;
        return items.filter((it) => (it.tags || []).includes((selected as any).tag));
    }, [items, activeCategory, categories]);

    return (
        <section id="latest" className="relative overflow-hidden bg-white">
            <div className="absolute inset-0 -z-10">
                <div className="absolute -left-24 top-24 h-[480px] w-[480px] rounded-full bg-[#1d3658]/8 blur-3xl" />
                <div className="absolute -right-24 bottom-0 h-[520px] w-[520px] rounded-full bg-slate-900/5 blur-3xl" />
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#0b12240a_1px,transparent_1px),linear-gradient(to_bottom,#0b12240a_1px,transparent_1px)] bg-[size:56px_56px]" />
            </div>

            <div className="mx-auto max-w-7xl px-6 py-24 lg:px-8 lg:py-32">
                <div className="mx-auto mb-10 max-w-4xl text-center">
                    <div className="inline-flex items-center gap-2 rounded-full border border-[#1d3658]/15 bg-white px-5 py-2.5 shadow-sm">
                        <span className="flex h-2 w-2 rounded-full bg-[#1d3658]" />
                        <span className="text-sm font-semibold uppercase tracking-wide text-[#001030]">
                            Latest
                        </span>
                    </div>
                    <h2 className="mt-6 text-3xl font-bold leading-tight tracking-tight text-[#001030] sm:text-4xl lg:text-5xl">
                        {title}
                    </h2>
                    <p className="mt-4 text-slate-600">{subtitle}</p>
                </div>

                {/* Category pills */}
                <div className="mb-10 flex flex-wrap items-center justify-center gap-3">
                    {categories.map((category) => {
                        const isActive = activeCategory === category.id;
                        return (
                            <button
                                key={category.id}
                                onClick={() => setActiveCategory(category.id)}
                                className={`group flex items-center gap-2 rounded-full border px-6 py-3 font-semibold text-sm transition-all duration-300 ${isActive
                                        ? "border-[#001030] bg-[#001030] text-white shadow-lg"
                                        : "border-slate-200 bg-white text-slate-700 hover:border-[#1d3658]/40 hover:bg-slate-50"
                                    }`}
                            >
                                <Tag className="h-5 w-5" />
                                <span>{category.label}</span>
                            </button>
                        );
                    })}
                </div>

                {/* State */}
                {loading ? (
                    <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div
                                key={i}
                                className="h-[260px] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg"
                            >
                                <div className="h-full animate-pulse">
                                    <div className="h-24 bg-slate-100" />
                                    <div className="p-6 space-y-3">
                                        <div className="h-4 w-2/3 rounded bg-slate-100" />
                                        <div className="h-4 w-full rounded bg-slate-100" />
                                        <div className="h-4 w-5/6 rounded bg-slate-100" />
                                        <div className="mt-6 h-10 w-full rounded-xl bg-slate-100" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : error ? (
                    <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-red-200 bg-red-50 p-5 text-center text-sm text-red-700">
                        {error}
                    </div>
                ) : filteredInsights.length === 0 ? (
                    <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white p-8 text-center">
                        <p className="text-sm font-semibold text-[#001030]">No insights found.</p>
                        <p className="mt-2 text-sm text-slate-600">
                            Add a new post from the admin dashboard, then it will appear here.
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
                        {filteredInsights.map((insight, index) => {
                            const isHovered = hoveredCard === index;
                            const date = formatDate(insight.updatedAt || insight.createdAt);
                            const readTime =
                                insight.readTime || estimateReadTime(`${insight.title} ${insight.excerpt}`);

                            return (
                                <article
                                    key={insight._id || insight.slug}
                                    className="group relative"
                                    onMouseEnter={() => setHoveredCard(index)}
                                    onMouseLeave={() => setHoveredCard(null)}
                                >
                                    <div
                                        className={`absolute -inset-1 rounded-3xl bg-[#1d3658]/15 opacity-0 blur-xl transition-all duration-500 ${isHovered ? "opacity-100" : ""
                                            }`}
                                    />

                                    <div
                                        className={`relative h-full overflow-hidden rounded-3xl border bg-white shadow-lg transition-all duration-500 ${isHovered
                                                ? "scale-[1.03] border-[#1d3658]/20 shadow-2xl"
                                                : "border-slate-200"
                                            }`}
                                    >
                                        <div className="border-b border-slate-200 bg-white px-5 pt-5 pb-3">
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1">
                                                    <span className="text-xs font-bold text-[#001030]">Insight</span>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    {(insight.tags || []).slice(0, 1).map((t) => (
                                                        <div key={t} className="rounded-full bg-[#1d3658]/10 px-2">
                                                            <span className="text-xs font-semibold text-[#1d3658]">{t}</span>
                                                        </div>
                                                    ))}
                                                    <Tag className="h-4 w-4 text-slate-400" />
                                                </div>
                                            </div>

                                            <h3 className="mt-4 text-lg font-semibold leading-tight text-[#001030] transition-colors duration-300 group-hover:text-[#1d3658] line-clamp-2">
                                                {insight.title}
                                            </h3>
                                        </div>

                                        <div className="p-5">
                                            <p className="mb-5 line-clamp-3 text-sm leading-relaxed text-slate-600">
                                                {insight.excerpt}
                                            </p>

                                            <div className="flex items-center gap-4 border-t border-slate-200 pt-4 text-xs text-slate-500">
                                                {date ? (
                                                    <div className="flex items-center gap-1">
                                                        <Calendar className="h-3 w-3" />
                                                        <span>{date}</span>
                                                    </div>
                                                ) : null}
                                                {/* <div className="flex items-center gap-1">
                                                    <Clock className="h-3 w-3" />
                                                    <span>{readTime}</span>
                                                </div> */}
                                            </div>

                                            <div className="mt-5">
                                                <Link href={`/insights/${insight.slug}`}>
                                                    <Button className="w-full rounded-xl bg-[#001030] py-6 text-white shadow-md transition-all duration-300 hover:bg-[#0b1b44]">
                                                        Read
                                                        <ArrowRight className="ml-2 h-4 w-4" />
                                                    </Button>
                                                </Link>
                                            </div>
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                )}
            </div>
        </section>
    );
}
