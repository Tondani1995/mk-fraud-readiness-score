import "server-only";

import { importPKCS8, SignJWT } from "jose";

const GA_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DATA_API_BASE_URL = "https://analyticsdata.googleapis.com/v1beta";

const propertyId = process.env.GA_PROPERTY_ID;
const clientEmail = process.env.GA_SERVICE_ACCOUNT_EMAIL;
const privateKey = process.env.GA_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");

type ReportRequest = {
    dateRanges?: Array<{ startDate: string; endDate: string }>;
    dimensions?: Array<{ name: string }>;
    metrics?: Array<{ name: string }>;
    limit?: string;
    orderBys?: Array<{
        metric?: { metricName: string };
        dimension?: { dimensionName: string; orderType?: "ALPHANUMERIC" | "CASE_INSENSITIVE_ALPHANUMERIC" | "NUMERIC" };
        desc?: boolean;
    }>;
    dimensionFilter?: {
        filter?: {
            fieldName: string;
            stringFilter?: {
                matchType?:
                    | "EXACT"
                    | "CONTAINS"
                    | "BEGINS_WITH"
                    | "ENDS_WITH"
                    | "FULL_REGEXP"
                    | "PARTIAL_REGEXP";
                value: string;
                caseSensitive?: boolean;
            };
        };
    };
};

type ReportRow = {
    dimensionValues?: Array<{ value?: string }>;
    metricValues?: Array<{ value?: string }>;
};

type ReportResponse = {
    rows?: ReportRow[];
};

type DashboardMetric = {
    label: string;
    value: string;
    change: string;
    note: string;
    bars: number[];
};

type DashboardChannel = {
    label: string;
    share: number;
    sessions: string;
    tone: string;
};

type DashboardPage = {
    page: string;
    label: string;
    views: string;
    users: string;
};

export type AnalyticsDashboardData = {
    connected: boolean;
    propertyId: string | null;
    metrics: DashboardMetric[];
    channels: DashboardChannel[];
    topPages: DashboardPage[];
    contactForms: string;
    contactFormsChange: string;
    fetchedAt: string | null;
    error?: string;
};

function hasReportingCredentials() {
    return Boolean(propertyId && clientEmail && privateKey);
}

async function getAccessToken() {
    if (!clientEmail || !privateKey) {
        throw new Error("Missing GA4 reporting credentials.");
    }

    const now = Math.floor(Date.now() / 1000);
    const key = await importPKCS8(privateKey, "RS256");
    const assertion = await new SignJWT({ scope: GA_SCOPE })
        .setProtectedHeader({ alg: "RS256", typ: "JWT" })
        .setIssuer(clientEmail)
        .setSubject(clientEmail)
        .setAudience(TOKEN_URL)
        .setIssuedAt(now)
        .setExpirationTime(now + 3600)
        .sign(key);

    const response = await fetch(TOKEN_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion,
        }),
        cache: "no-store",
    });

    if (!response.ok) {
        throw new Error("Unable to authenticate with Google Analytics.");
    }

    const payload = (await response.json()) as { access_token?: string };

    if (!payload.access_token) {
        throw new Error("Google Analytics access token was not returned.");
    }

    return payload.access_token;
}

async function runReport(body: ReportRequest, accessToken: string) {
    if (!propertyId) {
        throw new Error("Missing GA4 property ID.");
    }

    const response = await fetch(`${DATA_API_BASE_URL}/properties/${propertyId}:runReport`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        cache: "no-store",
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
            `Google Analytics report request failed (${response.status}): ${errorBody.slice(0, 160)}`
        );
    }

    return (await response.json()) as ReportResponse;
}

function getMetricValue(row: ReportRow | undefined, index = 0) {
    return Number(row?.metricValues?.[index]?.value || 0);
}

function formatNumber(value: number) {
    return new Intl.NumberFormat("en-US", {
        maximumFractionDigits: 0,
    }).format(value);
}

function formatPercent(value: number) {
    return `${value.toFixed(value >= 10 ? 1 : 2)}%`;
}

function formatChange(current: number, previous: number) {
    if (previous === 0) {
        if (current === 0) return "0.0%";
        return "+100.0%";
    }

    const delta = ((current - previous) / previous) * 100;
    return `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`;
}

function normalizeBars(values: number[]) {
    if (!values.length) {
        return [18, 26, 34, 42, 50, 58, 66, 74];
    }

    const max = Math.max(...values);

    if (max === 0) {
        return values.map(() => 18);
    }

    return values.map((value) => Math.max(18, Math.round((value / max) * 100)));
}

function sanitizePageLabel(title: string | undefined, path: string) {
    if (title && title !== "(not set)") {
        return title.split("|")[0]?.trim() || path;
    }

    if (path === "/") {
        return "Home";
    }

    const slug = path.split("/").filter(Boolean).pop();
    if (!slug) {
        return path;
    }

    return slug
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

export async function getAnalyticsDashboardData(): Promise<AnalyticsDashboardData> {
    if (!hasReportingCredentials()) {
        return {
            connected: false,
            propertyId: propertyId || null,
            metrics: [],
            channels: [],
            topPages: [],
            contactForms: "0",
            contactFormsChange: "0.0%",
            fetchedAt: null,
            error: "GA4 reporting credentials are not configured yet.",
        };
    }

    try {
        const accessToken = await getAccessToken();
        const [
            currentSummary,
            previousSummary,
            currentLeads,
            previousLeads,
            dailySummary,
            dailyLeads,
            channelReport,
            topPagesReport,
        ] = await Promise.all([
            runReport({
                dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
                metrics: [{ name: "sessions" }, { name: "totalUsers" }],
            }, accessToken),
            runReport({
                dateRanges: [{ startDate: "60daysAgo", endDate: "31daysAgo" }],
                metrics: [{ name: "sessions" }, { name: "totalUsers" }],
            }, accessToken),
            runReport({
                dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
                metrics: [{ name: "eventCount" }],
                dimensionFilter: {
                    filter: {
                        fieldName: "eventName",
                        stringFilter: {
                            matchType: "EXACT",
                            value: "generate_lead",
                        },
                    },
                },
            }, accessToken),
            runReport({
                dateRanges: [{ startDate: "60daysAgo", endDate: "31daysAgo" }],
                metrics: [{ name: "eventCount" }],
                dimensionFilter: {
                    filter: {
                        fieldName: "eventName",
                        stringFilter: {
                            matchType: "EXACT",
                            value: "generate_lead",
                        },
                    },
                },
            }, accessToken),
            runReport({
                dateRanges: [{ startDate: "14daysAgo", endDate: "today" }],
                dimensions: [{ name: "date" }],
                metrics: [{ name: "sessions" }, { name: "totalUsers" }],
                orderBys: [{ dimension: { dimensionName: "date", orderType: "NUMERIC" } }],
            }, accessToken),
            runReport({
                dateRanges: [{ startDate: "14daysAgo", endDate: "today" }],
                dimensions: [{ name: "date" }],
                metrics: [{ name: "eventCount" }],
                dimensionFilter: {
                    filter: {
                        fieldName: "eventName",
                        stringFilter: {
                            matchType: "EXACT",
                            value: "generate_lead",
                        },
                    },
                },
                orderBys: [{ dimension: { dimensionName: "date", orderType: "NUMERIC" } }],
            }, accessToken),
            runReport({
                dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
                dimensions: [{ name: "sessionDefaultChannelGroup" }],
                metrics: [{ name: "sessions" }],
                orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
                limit: "5",
            }, accessToken),
            runReport({
                dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
                dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
                metrics: [{ name: "screenPageViews" }, { name: "totalUsers" }],
                orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
                limit: "5",
            }, accessToken),
        ]);

        const currentSummaryRow = currentSummary.rows?.[0];
        const previousSummaryRow = previousSummary.rows?.[0];
        const currentLeadsRow = currentLeads.rows?.[0];
        const previousLeadsRow = previousLeads.rows?.[0];

        const sessions = getMetricValue(currentSummaryRow, 0);
        const previousSessions = getMetricValue(previousSummaryRow, 0);
        const users = getMetricValue(currentSummaryRow, 1);
        const previousUsers = getMetricValue(previousSummaryRow, 1);
        const leadCount = getMetricValue(currentLeadsRow, 0);
        const previousLeadCount = getMetricValue(previousLeadsRow, 0);
        const conversionRate = sessions > 0 ? (leadCount / sessions) * 100 : 0;
        const previousConversionRate =
            previousSessions > 0 ? (previousLeadCount / previousSessions) * 100 : 0;

        const leadMap = new Map<string, number>();
        for (const row of dailyLeads.rows || []) {
            const dayKey = row.dimensionValues?.[0]?.value || "";
            leadMap.set(dayKey, getMetricValue(row, 0));
        }

        const sessionSeries: number[] = [];
        const userSeries: number[] = [];
        const leadSeries: number[] = [];
        const conversionSeries: number[] = [];

        for (const row of dailySummary.rows || []) {
            const dayKey = row.dimensionValues?.[0]?.value || "";
            const daySessions = getMetricValue(row, 0);
            const dayUsers = getMetricValue(row, 1);
            const dayLeads = leadMap.get(dayKey) || 0;

            sessionSeries.push(daySessions);
            userSeries.push(dayUsers);
            leadSeries.push(dayLeads);
            conversionSeries.push(daySessions > 0 ? (dayLeads / daySessions) * 100 : 0);
        }

        const metrics: DashboardMetric[] = [
            {
                label: "Sessions",
                value: formatNumber(sessions),
                change: formatChange(sessions, previousSessions),
                note: "last 30 days",
                bars: normalizeBars(sessionSeries),
            },
            {
                label: "Users",
                value: formatNumber(users),
                change: formatChange(users, previousUsers),
                note: "last 30 days",
                bars: normalizeBars(userSeries),
            },
            {
                label: "Contact Forms",
                value: formatNumber(leadCount),
                change: formatChange(leadCount, previousLeadCount),
                note: "generate_lead events",
                bars: normalizeBars(leadSeries),
            },
            {
                label: "Conversion Rate",
                value: formatPercent(conversionRate),
                change: formatChange(conversionRate, previousConversionRate),
                note: "forms per session",
                bars: normalizeBars(conversionSeries),
            },
        ];

        const channelRows = (channelReport.rows || []).filter(
            (row) => row.dimensionValues?.[0]?.value && row.dimensionValues[0].value !== "(not set)"
        );
        const channelTotal = channelRows.reduce((total, row) => total + getMetricValue(row, 0), 0);
        const channelTones = [
            "bg-[#1d3658]",
            "bg-[#2f5f89]",
            "bg-[#4d7aa3]",
            "bg-[#7198bc]",
            "bg-[#9fb8cf]",
        ];

        const channels: DashboardChannel[] = channelRows.map((row, index) => {
            const channelSessions = getMetricValue(row, 0);

            return {
                label: row.dimensionValues?.[0]?.value || "Unknown",
                share: channelTotal > 0 ? Math.round((channelSessions / channelTotal) * 100) : 0,
                sessions: formatNumber(channelSessions),
                tone: channelTones[index] || channelTones[channelTones.length - 1],
            };
        });

        const topPages: DashboardPage[] = (topPagesReport.rows || [])
            .filter((row) => {
                const pagePath = row.dimensionValues?.[0]?.value;
                return Boolean(pagePath && pagePath.startsWith("/"));
            })
            .map((row) => {
                const pagePath = row.dimensionValues?.[0]?.value || "/";
                const pageTitle = row.dimensionValues?.[1]?.value;

                return {
                    page: pagePath,
                    label: sanitizePageLabel(pageTitle, pagePath),
                    views: formatNumber(getMetricValue(row, 0)),
                    users: formatNumber(getMetricValue(row, 1)),
                };
            });

        return {
            connected: true,
            propertyId: propertyId || null,
            metrics,
            channels,
            topPages,
            contactForms: formatNumber(leadCount),
            contactFormsChange: formatChange(leadCount, previousLeadCount),
            fetchedAt: new Date().toISOString(),
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown GA4 reporting error.";

        return {
            connected: false,
            propertyId: propertyId || null,
            metrics: [],
            channels: [],
            topPages: [],
            contactForms: "0",
            contactFormsChange: "0.0%",
            fetchedAt: null,
            error: message,
        };
    }
}
