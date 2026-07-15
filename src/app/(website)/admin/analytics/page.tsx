import Wrapper from "@/components/website/Wrapper";
import Link from "next/link";
import {
    Activity,
    ArrowLeft,
    BarChart3,
    ChartColumnIncreasing,
    Mail,
    Sparkles,
    Users,
} from "lucide-react";

import { Button } from "@/components/website/ui/button";
import { getAnalyticsDashboardData } from "@/lib/website/analytics/ga4";

const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

const metricIcons = {
    Sessions: Activity,
    Users: Users,
    "Contact Forms": Mail,
    "Conversion Rate": ChartColumnIncreasing,
} as const;

export const dynamic = "force-dynamic";

export default async function AdminAnalyticsPage() {
    const dashboard = await getAnalyticsDashboardData();
    const isGaConnected = Boolean(measurementId);
    const isLiveReporting = dashboard.connected && !dashboard.error;

    return (
        <Wrapper>
            <main className="bg-white">
                <section className="relative overflow-hidden bg-gradient-to-br from-[#001030] via-[#1d3658] to-[#0b1b33]">
                    <div className="absolute inset-0">
                        <div className="absolute left-0 top-0 h-[540px] w-[540px] rounded-full bg-white/10 blur-3xl" />
                        <div className="absolute right-0 bottom-0 h-[520px] w-[520px] rounded-full bg-white/5 blur-3xl" />
                    </div>
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:52px_52px]" />

                    <div className="relative mx-auto max-w-7xl px-6 py-14 lg:px-8">
                        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                            <div>
                                <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white/90">
                                    {isLiveReporting
                                        ? "GA4 Reporting Live"
                                        : isGaConnected
                                            ? "GA4 Tracking Live"
                                            : "Analytics Setup Needed"}
                                </p>
                                <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl">
                                    Analytics Dashboard
                                </h1>
                                <p className="mt-2 max-w-2xl text-base leading-relaxed text-white/80">
                                    {isLiveReporting
                                        ? "Live GA4 website data is now feeding this dashboard. The cards below show sessions, users, top pages, traffic channels, and contact form conversions from your real property."
                                        : isGaConnected
                                            ? "GA4 tracking is installed on the site. If the live reporting cards below are empty, double-check the property access and give Google Analytics a little time to populate data."
                                            : "Add your GA4 Measurement ID and reporting credentials to turn this dashboard on."}
                                </p>
                            </div>

                            <div className="flex flex-col gap-3 sm:flex-row">
                                <Link href="/admin/insights">
                                    <Button
                                        variant="outline"
                                        className="h-12 rounded-lg border-white/25 bg-white/10 px-5 text-white hover:bg-white/15"
                                    >
                                        <ArrowLeft className="mr-2 h-4 w-4" />
                                        Back to Insights
                                    </Button>
                                </Link>

                                <Button className="h-12 rounded-lg bg-white px-6 text-[#1d3658] hover:bg-slate-100">
                                    <BarChart3 className="mr-2 h-5 w-5" />
                                    {isLiveReporting
                                        ? "Live Reporting"
                                        : isGaConnected
                                            ? "Tracking Connected"
                                            : "Setup Needed"}
                                </Button>
                            </div>
                        </div>
                    </div>

                    <div className="absolute bottom-0 left-0 h-px w-full bg-white/15" />
                </section>

                <section className="relative overflow-hidden bg-gradient-to-br from-white via-slate-50 to-white py-14">
                    <div className="pointer-events-none absolute inset-0 -z-10">
                        <div className="absolute left-0 top-10 h-[520px] w-[520px] rounded-full bg-[#1d3658]/8 blur-3xl" />
                        <div className="absolute right-0 bottom-0 h-[560px] w-[560px] rounded-full bg-[#001030]/6 blur-3xl" />
                        <div className="absolute inset-0 bg-[linear-gradient(to_right,#0b122005_1px,transparent_1px),linear-gradient(to_bottom,#0b122005_1px,transparent_1px)] bg-[size:44px_44px]" />
                    </div>

                    <div className="mx-auto max-w-7xl px-6 lg:px-8">
                        <div className="mb-8 rounded-3xl border border-[#1d3658]/15 bg-white/80 p-5 shadow-sm backdrop-blur">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                <div>
                                    <p className="text-sm font-semibold text-[#001030]">
                                        {isLiveReporting
                                            ? "GA4 is collecting and reporting live data"
                                            : isGaConnected
                                                ? "GA4 is collecting data"
                                                : "GA4 setup is incomplete"}
                                    </p>
                                    <p className="mt-1 text-sm text-slate-600">
                                        {isLiveReporting
                                            ? "This dashboard is reading real numbers from your GA4 property for the last 30 days."
                                            : dashboard.error || "Tracking is on, but live reporting is not available yet."}
                                    </p>
                                </div>
                                <div className="inline-flex items-center gap-2 rounded-full bg-[#1d3658]/8 px-4 py-2 text-xs font-semibold text-[#1d3658]">
                                    <Sparkles className="h-4 w-4" />
                                    {isGaConnected
                                        ? `Measurement ID: ${measurementId}`
                                        : "Waiting for GA4 Measurement ID"}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
                            {dashboard.metrics.length ? (
                                dashboard.metrics.map((metric) => {
                                    const Icon =
                                        metricIcons[metric.label as keyof typeof metricIcons] || Activity;

                                    return (
                                        <div
                                            key={metric.label}
                                            className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-xl"
                                        >
                                            <div className="flex items-start justify-between gap-4">
                                                <div>
                                                    <p className="text-sm font-semibold text-slate-500">
                                                        {metric.label}
                                                    </p>
                                                    <p className="mt-3 text-3xl font-semibold tracking-tight text-[#001030]">
                                                        {metric.value}
                                                    </p>
                                                </div>
                                                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#1d3658]/10">
                                                    <Icon className="h-6 w-6 text-[#1d3658]" />
                                                </div>
                                            </div>

                                            <div className="mt-4 flex items-center gap-2 text-sm">
                                                <span
                                                    className={`font-semibold ${metric.change.startsWith("-")
                                                            ? "text-rose-600"
                                                            : "text-emerald-600"
                                                        }`}
                                                >
                                                    {metric.change}
                                                </span>
                                                <span className="text-slate-500">{metric.note}</span>
                                            </div>

                                            <div className="mt-6 flex h-16 items-end gap-2">
                                                {metric.bars.map((bar, index) => (
                                                    <div
                                                        key={`${metric.label}-${index}`}
                                                        className="flex-1 rounded-t-xl bg-gradient-to-t from-[#001030] to-[#7ca2c4]"
                                                        style={{ height: `${bar}%` }}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="md:col-span-2 xl:col-span-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
                                    <p className="text-lg font-semibold text-[#001030]">
                                        Live metrics are not available yet
                                    </p>
                                    <p className="mt-2 text-sm leading-relaxed text-slate-600">
                                        The dashboard is ready, but Google Analytics has not returned report data yet. Double-check the property access, service-account setup, and give GA4 a little time to populate.
                                    </p>
                                </div>
                            )}
                        </div>

                        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-12">
                            <div className="lg:col-span-5">
                                <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
                                    <p className="text-sm font-semibold uppercase tracking-wide text-[#1d3658]">
                                        Traffic Channels
                                    </p>
                                    <h2 className="mt-2 text-2xl font-semibold leading-tight text-[#001030]">
                                        Acquisition mix
                                    </h2>

                                    <div className="mt-6 space-y-4">
                                        {dashboard.channels.length ? (
                                            dashboard.channels.map((channel) => (
                                                <div key={channel.label}>
                                                    <div className="mb-2 flex items-center justify-between gap-4">
                                                        <p className="text-sm font-semibold text-[#001030]">
                                                            {channel.label}
                                                        </p>
                                                        <div className="flex items-center gap-3 text-sm">
                                                            <span className="text-slate-500">{channel.share}%</span>
                                                            <span className="font-semibold text-[#1d3658]">
                                                                {channel.sessions}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="h-3 rounded-full bg-slate-100">
                                                        <div
                                                            className={`h-3 rounded-full ${channel.tone}`}
                                                            style={{ width: `${channel.share}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <p className="text-sm leading-relaxed text-slate-600">
                                                Channel data will appear here once GA4 reporting starts returning acquisition data for your property.
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="lg:col-span-7">
                                <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
                                    <div className="flex items-center justify-between gap-4">
                                        <div>
                                            <p className="text-sm font-semibold uppercase tracking-wide text-[#1d3658]">
                                                Top Pages
                                            </p>
                                            <h2 className="mt-2 text-2xl font-semibold leading-tight text-[#001030]">
                                                Most visited pages
                                            </h2>
                                        </div>
                                        <div className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600">
                                            Last 30 days
                                        </div>
                                    </div>

                                    <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
                                        <div className="grid grid-cols-[1.4fr_0.8fr_0.8fr] gap-4 bg-slate-50 px-5 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                            <span>Page</span>
                                            <span>Views</span>
                                            <span>Users</span>
                                        </div>

                                        {dashboard.topPages.length ? (
                                            dashboard.topPages.map((page) => (
                                                <div
                                                    key={page.page}
                                                    className="grid grid-cols-[1.4fr_0.8fr_0.8fr] gap-4 border-t border-slate-200 px-5 py-4 text-sm"
                                                >
                                                    <div>
                                                        <p className="font-semibold text-[#001030]">{page.label}</p>
                                                        <p className="mt-1 font-mono text-xs text-slate-500">
                                                            {page.page}
                                                        </p>
                                                    </div>
                                                    <p className="font-semibold text-slate-700">{page.views}</p>
                                                    <p className="font-semibold text-[#1d3658]">{page.users}</p>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="border-t border-slate-200 px-5 py-5 text-sm text-slate-600">
                                                Top pages will appear here once GA4 has enough pageview data to report.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-12">
                            <div className="lg:col-span-7">
                                <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
                                    <p className="text-sm font-semibold uppercase tracking-wide text-[#1d3658]">
                                        Conversion Events
                                    </p>
                                    <h2 className="mt-2 text-2xl font-semibold leading-tight text-[#001030]">
                                        Contact form performance
                                    </h2>

                                    <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                                        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#1d3658]/10">
                                                    <Mail className="h-5 w-5 text-[#1d3658]" />
                                                </div>
                                                <p className="text-2xl font-semibold text-[#001030]">
                                                    {dashboard.contactForms}
                                                </p>
                                            </div>
                                            <p className="mt-4 font-semibold text-[#001030]">
                                                Contact Form Submissions
                                            </p>
                                            <p className="mt-2 text-sm leading-relaxed text-slate-600">
                                                Based on the GA4 `generate_lead` event fired after successful form submissions.
                                            </p>
                                        </div>

                                        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#1d3658]/10">
                                                    <ChartColumnIncreasing className="h-5 w-5 text-[#1d3658]" />
                                                </div>
                                                <p className="text-2xl font-semibold text-[#001030]">
                                                    {dashboard.contactFormsChange}
                                                </p>
                                            </div>
                                            <p className="mt-4 font-semibold text-[#001030]">
                                                Submission Trend
                                            </p>
                                            <p className="mt-2 text-sm leading-relaxed text-slate-600">
                                                Change compared with the previous 30-day period, so you can quickly see if enquiries are moving up or down.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="lg:col-span-5">
                                <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
                                    <p className="text-sm font-semibold uppercase tracking-wide text-[#1d3658]">
                                        Live Analytics Setup
                                    </p>
                                    <h2 className="mt-2 text-2xl font-semibold leading-tight text-[#001030]">
                                        Connected property details
                                    </h2>

                                    <div className="mt-6 space-y-4">
                                        {[
                                            `GA4 Measurement ID: ${measurementId || "Not connected"}`,
                                            `GA4 Property ID: ${dashboard.propertyId || "Not configured"}`,
                                            `Tracked domain: ${siteUrl || "Not configured"}`,
                                            "Live metrics: sessions, users, channels, top pages, contact forms",
                                            dashboard.fetchedAt
                                                ? `Last GA4 fetch: ${new Date(dashboard.fetchedAt).toLocaleString("en-US", {
                                                    dateStyle: "medium",
                                                    timeStyle: "short",
                                                })}`
                                                : "Live fetch pending: check credentials or wait for GA data",
                                        ].map((item) => (
                                            <div
                                                key={item}
                                                className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4"
                                            >
                                                <span className="h-2.5 w-2.5 rounded-full bg-[#1d3658]" />
                                                <span className="font-medium text-slate-700">{item}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </main>
        </Wrapper>
    );
}
