/**
 * Meta Conversions API client (server only).
 *
 * Credentials are read from server-side environment variables and are never logged, echoed
 * or returned to the browser. When they are absent the client reports `skipped` and the
 * caller carries on -- an unconfigured or failing CAPI must never affect the assessment.
 *
 * The payload is built here, not received: only the allowlisted content parameters and the
 * minimum technical attribution fields (fbp, fbc, user agent, IP) are ever sent. There is no
 * code path that attaches an email, phone, name, address, external_id, score, Snapshot ID,
 * assessment ID, order ID or answer.
 */

import { serverEventParams, type MetaServerEvent } from "@/lib/website/meta/events";

const GRAPH_API_VERSION = "v21.0";
const REQUEST_TIMEOUT_MS = 2500;

export type MetaCapiResult =
    | { ok: true; status: "sent" }
    | { ok: false; status: "skipped_not_configured" | "failed"; error?: string };

export type MetaServerEventInput = {
    eventName: MetaServerEvent;
    eventId: string;
    eventSourceUrl: string;
    /** Meta browser cookies, forwarded verbatim as attribution signals only. */
    fbp?: string | null;
    fbc?: string | null;
    clientUserAgent?: string | null;
    clientIpAddress?: string | null;
};

function datasetId(): string {
    return process.env.META_DATASET_ID?.trim() || "";
}

function accessToken(): string {
    return process.env.META_CAPI_ACCESS_TOKEN?.trim() || "";
}

export function isMetaCapiConfigured(): boolean {
    return Boolean(datasetId() && accessToken());
}

/**
 * Builds the exact request body sent to Meta. Exported so tests can assert on the payload
 * without performing a network call.
 */
export function buildMetaEventPayload(input: MetaServerEventInput, now: number = Date.now()) {
    const userData: Record<string, string> = {};
    // Technical attribution only. No identity fields, hashed or otherwise.
    if (input.fbp) userData.fbp = input.fbp;
    if (input.fbc) userData.fbc = input.fbc;
    if (input.clientUserAgent) userData.client_user_agent = input.clientUserAgent;
    if (input.clientIpAddress) userData.client_ip_address = input.clientIpAddress;

    return {
        data: [
            {
                event_name: input.eventName,
                event_time: Math.floor(now / 1000),
                event_id: input.eventId,
                event_source_url: input.eventSourceUrl,
                action_source: "website",
                user_data: userData,
                custom_data: serverEventParams(input.eventName),
            },
        ],
    };
}

/**
 * Sends one server event. Never throws and never rejects: all failures are returned as a
 * result so the calling route can respond successfully regardless of Meta's availability.
 */
export async function sendMetaServerEvent(input: MetaServerEventInput): Promise<MetaCapiResult> {
    const dataset = datasetId();
    const token = accessToken();
    if (!dataset || !token) return { ok: false, status: "skipped_not_configured" };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(
            `https://graph.facebook.com/${GRAPH_API_VERSION}/${encodeURIComponent(dataset)}/events`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    // The token travels in the Authorization header, never in the URL, so it
                    // cannot be captured by proxy or server access logs.
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(buildMetaEventPayload(input)),
                signal: controller.signal,
            }
        );

        if (!response.ok) {
            // Status only. Meta error bodies can echo request content, so they are not logged.
            return { ok: false, status: "failed", error: `meta_capi_http_${response.status}` };
        }
        return { ok: true, status: "sent" };
    } catch (error) {
        const reason = error instanceof Error && error.name === "AbortError" ? "timeout" : "network";
        return { ok: false, status: "failed", error: `meta_capi_${reason}` };
    } finally {
        clearTimeout(timeout);
    }
}
