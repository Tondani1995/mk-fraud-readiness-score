"use client";

import {
    BookOpen,
    TrendingUp,
    Shield,
    AlertTriangle,
    Calendar,
    ArrowRight,
    ExternalLink,
    Linkedin,
    FileText,
    Clock,
    Tag,
} from "lucide-react";
import { Button } from "@/components/website/ui/button";
import { useState } from "react";
import Wrapper from "@/components/website/Wrapper";
import Link from "next/link";
import LatestInsightsSection from "@/components/website/insights/LatestInsightsSection";

export default function Insights() {
    const [activeCategory, setActiveCategory] = useState("all");
    const [hoveredCard, setHoveredCard] = useState<number | null>(null);

    const categories = [
        { id: "all", label: "All Insights", icon: BookOpen },
        { id: "fraud-trends", label: "Fraud Trends", icon: TrendingUp },
        { id: "controls", label: "Controls & Strategy", icon: Shield },
        { id: "case-studies", label: "Case Studies", icon: FileText },
    ];

    const insights = [
        {
            category: "fraud-trends",
            title: "The Rise of Social Engineering in Non-Financial Sectors",
            excerpt:
                "Understanding how fraud patterns from banking are now affecting retail, logistics, and public sector organizations across South Africa.",
            date: "January 15, 2026",
            readTime: "5 min read",
            type: "Article",
        },
        {
            category: "controls",
            title: "Building Fraud Controls That Don't Slow Your Business",
            excerpt:
                "A practical guide to embedding fraud prevention in daily operations without creating bureaucratic friction.",
            date: "January 10, 2026",
            readTime: "7 min read",
            type: "Guide",
        },
        {
            category: "case-studies",
            title: "How a Retail Organization Reduced Procurement Fraud by 60%",
            excerpt:
                "Real-world case study showing how simplified controls and better accountability transformed fraud outcomes.",
            date: "January 5, 2026",
            readTime: "8 min read",
            type: "Case Study",
        },
        {
            category: "fraud-trends",
            title: "Account Takeover Patterns in Loyalty Programmes",
            excerpt:
                "Analysis of how fraudsters exploit weak identity controls in customer benefit schemes.",
            date: "December 28, 2025",
            readTime: "6 min read",
            type: "Analysis",
        },
        {
            category: "controls",
            title: "Third-Party Fraud Risk: What Your Vendor Due Diligence Misses",
            excerpt:
                "Beyond paperwork compliance: how to identify real fraud risks in your supplier relationships.",
            date: "December 20, 2025",
            readTime: "5 min read",
            type: "Article",
        },
        {
            category: "fraud-trends",
            title: "Internal Fraud Red Flags Often Hidden in Plain Sight",
            excerpt:
                "Behavioral indicators and process anomalies that signal potential internal fraud before it becomes a major loss.",
            date: "December 15, 2025",
            readTime: "6 min read",
            type: "Guide",
        },
    ];

    const filteredInsights = activeCategory === "all"
        ? insights
        : insights.filter((insight) => insight.category === activeCategory);

    const featuredInsight = {
        title: "2026 Fraud Risk Outlook: What Non-Financial Sectors Need to Know",
        excerpt:
            "Our comprehensive analysis of emerging fraud trends, control gaps, and strategic priorities for South African organizations outside the financial sector.",
        date: "January 20, 2026",
        readTime: "12 min read",
    };

    const categoryLabel = (id: string) => categories.find((c) => c.id === id)?.label ?? "";

    return (
        <Wrapper>
            <div className="bg-white">
                <section className="relative overflow-hidden bg-[#001030]">
                    <div className="absolute inset-0">
                        <div className="absolute -left-24 -top-24 h-[520px] w-[520px] rounded-full bg-white/5 blur-3xl" />
                        <div className="absolute -right-28 -bottom-28 h-[640px] w-[640px] rounded-full bg-[#1d3658]/20 blur-3xl" />
                        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:56px_56px]" />
                    </div>

                    <div className="relative mx-auto max-w-7xl px-6 py-24 lg:px-8 lg:py-32">
                        <div className="mx-auto max-w-3xl text-center">
                            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-2.5 shadow-sm backdrop-blur">
                                <BookOpen className="h-4 w-4 text-white" />
                                <span className="text-sm font-bold uppercase tracking-wide text-white">
                                    Knowledge hub
                                </span>
                            </div>

                            <h1 className="mt-6 text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl lg:text-5xl">
                                Fraud Risk{" "}
                                <span className="relative inline-block">
                                    <span className="relative z-10 text-[#c8d6ff]">Insights</span>
                                    <span className="absolute -bottom-2 left-0 h-3 w-full bg-white/10 blur-sm" />
                                </span>
                            </h1>

                            <p className="mt-6 leading-relaxed text-slate-200">
                                Practical guidance, fraud trends, and real-world strategies for organisations
                                managing fraud risk in non-financial sectors.
                            </p>

                            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                                <Link href="#featured" className="w-full sm:w-auto">
                                    <Button className="w-full rounded-xl bg-white px-8 py-6 text-base font-semibold text-[#001030] shadow-lg transition-all duration-300 hover:scale-[1.02] hover:bg-slate-100">
                                        Explore featured report
                                        <ArrowRight className="ml-2 h-5 w-5" />
                                    </Button>
                                </Link>
                                <Link href="#latest" className="w-full sm:w-auto">
                                    <Button
                                        variant="outline"
                                        className="w-full rounded-xl border-2 border-white/25 bg-transparent px-8 py-6 text-base font-semibold text-white transition-all duration-300 hover:border-white/40 hover:bg-white/5"
                                    >
                                        Browse latest
                                        <ArrowRight className="ml-2 h-5 w-5" />
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    </div>
                </section>

                <section id="featured" className="relative -mt-16 overflow-hidden">
                    <div className="mx-auto max-w-7xl px-6 lg:px-8">
                        <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white">
                            <div className="absolute inset-0 bg-[radial-gradient(900px_500px_at_18%_20%,rgba(29,54,88,0.10),transparent_60%)]" />
                            <div className="absolute inset-0 bg-[linear-gradient(to_right,#0b12240a_1px,transparent_1px),linear-gradient(to_bottom,#0b12240a_1px,transparent_1px)] bg-[size:56px_56px]" />

                            <div className="relative grid grid-cols-1 gap-10 p-8 lg:grid-cols-12 lg:gap-12 lg:p-12">
                                <div className="lg:col-span-7">
                                    <div className="inline-flex items-center gap-2 rounded-full border border-[#1d3658]/15 bg-white px-4 py-2 shadow-sm">
                                        <AlertTriangle className="h-4 w-4 text-[#1d3658]" />
                                        <span className="text-sm font-bold uppercase tracking-wide text-[#001030]">
                                            Featured report
                                        </span>
                                    </div>

                                    <h2 className="mt-5 text-2xl font-bold leading-tight text-[#001030] lg:text-3xl">
                                        {featuredInsight.title}
                                    </h2>

                                    <p className="mt-4 leading-relaxed text-slate-600">
                                        {featuredInsight.excerpt}
                                    </p>

                                    <div className="mt-6 flex flex-wrap items-center gap-4 text-sm text-slate-600">
                                        <div className="flex items-center gap-2">
                                            <Calendar className="h-4 w-4" />
                                            <span>{featuredInsight.date}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Clock className="h-4 w-4" />
                                            <span>{featuredInsight.readTime}</span>
                                        </div>
                                    </div>

                                    <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                                        <Link href={"/contact"}>
                                            <Button className="group rounded-xl bg-[#001030] px-8 py-6 text-base font-semibold text-white shadow-lg transition-all duration-300 hover:scale-[1.02] hover:bg-[#0b1b44]">
                                                <span className="flex items-center gap-2">
                                                    Read full report
                                                    <ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
                                                </span>
                                            </Button>
                                        </Link>
                                        <Link href={"/contact"}>
                                            <Button
                                                variant="outline"
                                                className="rounded-xl border-2 border-[#1d3658]/25 bg-white px-8 py-6 text-base font-semibold text-[#001030] transition-all duration-300 hover:border-[#1d3658]/45 hover:bg-[#1d3658]/5"
                                            >
                                                Download PDF
                                                <ExternalLink className="ml-2 h-5 w-5" />
                                            </Button>
                                        </Link>
                                    </div>
                                </div>

                                <div className="lg:col-span-5">
                                    <div className="relative h-full overflow-hidden rounded-3xl border border-slate-200 bg-white p-7 shadow-sm lg:p-8">
                                        <div
                                            className="absolute inset-0 opacity-70"
                                            style={{
                                                background:
                                                    "linear-gradient(135deg, rgba(29,54,88,0.08) 0%, rgba(0,16,48,0.05) 55%, rgba(64,80,80,0.04) 100%)",
                                            }}
                                        />
                                        <div className="relative">
                                            <div className="flex items-start justify-between">
                                                <div>
                                                    <p className="text-sm font-bold uppercase tracking-wide text-slate-600">
                                                        Inside the report
                                                    </p>
                                                    <p className="mt-2 text-xl font-bold text-[#001030]">
                                                        What you&apos;ll learn
                                                    </p>
                                                </div>
                                                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-[#1d3658]/15">
                                                    <Tag className="h-6 w-6 text-[#1d3658]" />
                                                </div>
                                            </div>

                                            <div className="mt-6 space-y-4">
                                                {[
                                                    "Emerging fraud vectors",
                                                    "Control effectiveness gaps",
                                                    "Strategic recommendations",
                                                ].map((item, idx) => (
                                                    <div
                                                        key={item}
                                                        className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4"
                                                    >
                                                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-[#001030]">
                                                            <span className="text-sm font-bold text-white">{idx + 1}</span>
                                                        </div>
                                                        <span className="text-sm font-semibold text-[#001030]">{item}</span>
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
                                                <p className="text-sm font-bold text-[#001030]">Best for</p>
                                                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                                                    Risk owners, operations leaders, and compliance teams who need practical
                                                    next steps.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <LatestInsightsSection />

                <section className="relative overflow-hidden bg-[#001030]">
                    <div className="absolute inset-0">
                        {/* <div className="absolute -left-28 -bottom-28 h-[640px] w-[640px] rounded-full bg-white/5 blur-3xl" /> */}
                        <div className="absolute -right-24 -top-24 h-[520px] w-[520px] rounded-full bg-[#1d3658]/20 blur-3xl" />
                        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:56px_56px]" />
                    </div>

                    <div className="relative mx-auto max-w-7xl px-6 py-24 lg:px-8 lg:py-32">
                        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12">
                            <div className="lg:col-span-7">
                                <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-2.5 shadow-sm backdrop-blur">
                                    <Linkedin className="h-4 w-4 text-white" />
                                    <span className="text-sm font-bold uppercase tracking-wide text-white">
                                        Stay connected
                                    </span>
                                </div>

                                <h2 className="mt-6 text-3xl font-bold leading-tight text-white sm:text-4xl">
                                    Follow us on LinkedIn for the latest insights
                                </h2>

                                <p className="mt-5 leading-relaxed text-slate-200">
                                    Get fraud risk updates and practical guidance delivered directly to your feed.
                                </p>

                                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                                    <Button className="rounded-xl bg-white px-8 py-6 text-base font-semibold text-[#001030] shadow-lg transition-all duration-300 hover:scale-[1.02] hover:bg-slate-100">
                                        <span className="flex items-center gap-2">
                                            <Linkedin className="h-5 w-5" />
                                            Follow on LinkedIn
                                            <ExternalLink className="h-4 w-4" />
                                        </span>
                                    </Button>
                                    <Link href="/contact" className="w-full sm:w-auto">
                                        <Button
                                            variant="outline"
                                            className="w-full rounded-xl border-2 border-white/25 bg-transparent px-8 py-6 text-base font-semibold text-white transition-all duration-300 hover:border-white/40 hover:bg-white/5"
                                        >
                                            Book a call
                                            <ArrowRight className="ml-2 h-5 w-5" />
                                        </Button>
                                    </Link>
                                </div>
                            </div>

                            <div className="lg:col-span-5">
                                <div className="grid grid-cols-2 gap-4">
                                    {[
                                        { number: "50+", label: "Articles published" },
                                        { number: "15k+", label: "Monthly readers" },
                                        { number: "100+", label: "Patterns analysed" },
                                        { number: "25+", label: "Case studies" },
                                    ].map((stat) => (
                                        <div
                                            key={stat.label}
                                            className="rounded-3xl border border-white/12 bg-white/5 p-6 text-center backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/8"
                                        >
                                            <div className="text-4xl font-bold text-white">{stat.number}</div>
                                            <div className="mt-2 text-sm font-semibold text-slate-200">{stat.label}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="mt-14 overflow-hidden rounded-3xl border border-white/12 bg-white/5 p-8 backdrop-blur">
                            <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12">
                                <div className="lg:col-span-8">
                                    <p className="text-sm font-bold uppercase tracking-wide text-slate-200">
                                        Ready to get started?
                                    </p>
                                    <h3 className="mt-3 text-2xl font-bold leading-tight text-white lg:text-3xl">
                                        Experience the difference of practitioner-led fraud prevention
                                    </h3>
                                    <p className="mt-3 text-slate-200">
                                        See how our real-world approach transforms fraud risk management into a strategic
                                        advantage.
                                    </p>
                                </div>

                                <div className="lg:col-span-4">
                                    <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                                        <Link href="/contact" className="w-full">
                                            <Button className="w-full rounded-xl bg-white px-8 py-6 text-base font-semibold text-[#001030] shadow-lg transition-all duration-300 hover:scale-[1.02] hover:bg-slate-100">
                                                Book your consultation
                                                <ArrowRight className="ml-2 h-5 w-5" />
                                            </Button>
                                        </Link>
                                        <Button
                                            variant="outline"
                                            className="w-full rounded-xl border-2 border-white/25 bg-transparent px-8 py-6 text-base font-semibold text-white transition-all duration-300 hover:border-white/40 hover:bg-white/5"
                                        >
                                            View case studies
                                            <ArrowRight className="ml-2 h-5 w-5" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </Wrapper>
    );
}
