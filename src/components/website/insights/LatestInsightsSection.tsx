"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ChevronRight } from "lucide-react";


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
        <section id="latest" className="scroll-mt-16 bg-white md:scroll-mt-20" aria-labelledby="latest-insights-heading">
            <div className="mx-auto w-full max-w-7xl px-5 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
                <div className="max-w-2xl">
                    <h2 id="latest-insights-heading" className="text-[1.75rem] font-semibold leading-tight tracking-tight text-[#001030] sm:text-4xl">
                        {title}
                    </h2>
                    <p className="mt-3 text-base leading-7 text-slate-600">{subtitle}</p>
                </div>

                {categories.length > 1 ? (
                    <TopicFilter
                        categories={categories}
                        activeCategory={activeCategory}
                        onSelect={setActiveCategory}
                    />
                ) : null}

                <div className="mt-6">
                {loading ? (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3" aria-busy="true">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="h-48 animate-pulse rounded-2xl border border-slate-200 bg-slate-50" />
                        ))}
                    </div>
                ) : error ? (
                    <div className="max-w-2xl rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
                        Insights could not be loaded just now. Please refresh the page.
                    </div>
                ) : filteredInsights.length === 0 ? (
                    <div className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-6">
                        <p className="text-sm font-semibold text-[#001030]">No insights in this topic yet.</p>
                    </div>
                ) : (
                    <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {filteredInsights.map((insight) => {
                            const date = formatDate(insight.updatedAt || insight.createdAt);
                            const tag = (insight.tags || [])[0];

                            return (
                                <li key={insight._id || insight.slug}>
                                    <Link
                                        href={`/insights/${insight.slug}`}
                                        className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 transition-colors hover:border-[#1d3658]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1d3658] sm:p-6"
                                    >
                                        {tag ? (
                                            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1d3658]">{tag}</span>
                                        ) : null}
                                        <h3 className="mt-2 text-lg font-semibold leading-snug text-[#001030] group-hover:text-[#1d3658]">
                                            {insight.title.replace(/:\s*$/, "")}
                                        </h3>
                                        <p className="mt-2 line-clamp-3 flex-1 text-sm leading-6 text-slate-600">{insight.excerpt}</p>
                                        <span className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
                                            <span>{date}</span>
                                            <span className="inline-flex items-center gap-1 font-semibold text-[#001030]">
                                                Read <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                                            </span>
                                        </span>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                )}
                </div>
            </div>
        </section>
    );
}

type TopicOption = { id: string; label: string };

/**
 * Topic filter. On narrow screens the chips scroll sideways inside their own row (never the page),
 * with an edge fade and a "Swipe for more" cue while further topics are out of view.
 */
function TopicFilter({
    categories,
    activeCategory,
    onSelect,
}: {
    categories: TopicOption[];
    activeCategory: string;
    onSelect: (id: string) => void;
}) {
    const scrollerRef = useRef<HTMLDivElement>(null);
    const [edges, setEdges] = useState({ start: false, end: false });

    const measure = useCallback(() => {
        const el = scrollerRef.current;
        if (!el) return;
        const overflow = el.scrollWidth - el.clientWidth > 2;
        setEdges({
            start: overflow && el.scrollLeft > 2,
            end: overflow && el.scrollLeft + el.clientWidth < el.scrollWidth - 2,
        });
    }, []);

    useEffect(() => {
        measure();
        window.addEventListener("resize", measure);
        return () => window.removeEventListener("resize", measure);
    }, [measure, categories.length]);

    return (
        <div className="mt-8">
            <div className="relative -mx-5 sm:mx-0">
                <div
                    ref={scrollerRef}
                    onScroll={measure}
                    role="group"
                    aria-label="Filter insights by topic"
                    className="overflow-x-auto overscroll-x-contain px-5 pb-1 [scrollbar-width:none] sm:px-0 [&::-webkit-scrollbar]:hidden"
                >
                    <div className="flex w-max gap-2 pr-10 sm:w-auto sm:flex-wrap sm:pr-0">
                        {categories.map((category) => {
                            const isActive = activeCategory === category.id;
                            return (
                                <button
                                    key={category.id}
                                    type="button"
                                    aria-pressed={isActive}
                                    onClick={() => onSelect(category.id)}
                                    className={`min-h-11 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors ${isActive
                                            ? "border-[#001030] bg-[#001030] text-white"
                                            : "border-slate-200 bg-white text-slate-700 hover:border-[#1d3658]/40"
                                        }`}
                                >
                                    {category.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
                <div
                    aria-hidden="true"
                    className={`pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-white to-transparent transition-opacity sm:hidden ${edges.start ? "opacity-100" : "opacity-0"}`}
                />
                <div
                    aria-hidden="true"
                    className={`pointer-events-none absolute inset-y-0 right-0 flex w-16 items-center justify-end bg-gradient-to-l from-white via-white/90 to-transparent pr-3 transition-opacity sm:hidden ${edges.end ? "opacity-100" : "opacity-0"}`}
                >
                    <ChevronRight className="h-5 w-5 text-[#1d3658]" />
                </div>
            </div>
            <p className={`mt-2 text-xs text-slate-500 sm:hidden ${edges.end || edges.start ? "" : "invisible"}`}>
                Swipe sideways for more topics
            </p>
        </div>
    );
}
