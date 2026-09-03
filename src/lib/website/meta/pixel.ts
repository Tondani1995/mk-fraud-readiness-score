/**
 * Browser-side Meta Pixel helpers.
 *
 * Every function here is fail-open: if the Pixel is absent, blocked, unconsented or throws,
 * the caller continues unaffected. Meta tracking must never be able to stop a visitor
 * starting or completing an assessment.
 */

import { hasMarketingConsent } from "./consent";
import { isMetaTrackablePath } from "./routes";
import {
    META_EVENT_ASSESSMENT_START,
    META_EVENT_LEAD,
    sanitiseMetaParams,
    type MetaParams,
} from "./events";
import { createOpaqueEventId, stableEventId, hasSentEvent, markEventSent } from "./event-id";

export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || "";

/** Our own first-party relay. The browser never calls graph.facebook.com directly. */
export const META_CAPI_ENDPOINT = "/api/meta/events";

declare global {
    interface Window {
        fbq?: ((...args: unknown[]) => void) & { callMethod?: (...args: unknown[]) => void; queue?: unknown[] };
        _fbq?: unknown;
    }
}

/** The Pixel may run only with an ID configured and marketing consent given. */
export function isMetaPixelEnabled(): boolean {
    if (!META_PIXEL_ID) return false;
    if (typeof window === "undefined") return false;
    return hasMarketingConsent();
}

function fbq(): ((...args: unknown[]) => void) | undefined {
    if (typeof window === "undefined") return undefined;
    return typeof window.fbq === "function" ? window.fbq : undefined;
}

/**
 * Sends a browser Pixel event. `params` is rebuilt from the allowlist and `eventID` is the
 * opaque deduplication key shared with the server copy.
 */
export function trackMetaEvent(
    eventName: string,
    params: MetaParams,
    eventId: string,
    kind: "track" | "trackCustom" = "track"
): boolean {
    if (!isMetaPixelEnabled()) return false;
    const send = fbq();
    if (!send) return false;

    try {
        send(kind, eventName, sanitiseMetaParams(params), { eventID: eventId });
        return true;
    } catch {
        return false;
    }
}

/**
 * Posts the server copy of an event to our own relay. Fire-and-forget: the promise is
 * swallowed so a CAPI outage cannot surface as an unhandled rejection or block navigation.
 */
export function sendMetaServerCopy(eventName: string, eventId: string, sourcePath: string): void {
    if (!isMetaPixelEnabled()) return;

    // A conversion that happens on an identifier-bearing route (the assessment itself) still
    // counts, but its URL must never travel. Only an allowlisted path is forwarded; anything
    // else is omitted and the server falls back to the public landing URL.
    const safePath = isMetaTrackablePath(sourcePath) ? sourcePath : undefined;

    try {
        const body = JSON.stringify(safePath ? { eventName, eventId, sourcePath: safePath } : { eventName, eventId });
        // keepalive lets the request survive the navigation that follows a start/completion.
        void fetch(META_CAPI_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            keepalive: true,
        }).catch(() => undefined);
    } catch {
        // No Meta send is worth an exception on the customer's completion path.
    }
}

/**
 * Fires one logical conversion to both the browser Pixel and the Conversions API with a
 * single shared opaque event ID, so Meta records exactly one conversion.
 *
 * `scope` is a first-party correlation key used only to make the event ID stable across
 * retries. It is never transmitted.
 */
export function trackMetaConversion(
    eventName: typeof META_EVENT_ASSESSMENT_START | typeof META_EVENT_LEAD,
    params: MetaParams,
    options: { scope?: string; sourcePath?: string } = {}
): boolean {
    if (!isMetaPixelEnabled()) return false;

    const scope = options.scope ?? "";
    if (scope && hasSentEvent(eventName, scope)) return false;

    const eventId = scope ? stableEventId(eventName, scope) : createOpaqueEventId();
    const sourcePath = options.sourcePath
        ?? (typeof window !== "undefined" ? window.location.pathname : "");

    const kind = eventName === META_EVENT_LEAD ? "track" : "trackCustom";
    const browserSent = trackMetaEvent(eventName, params, eventId, kind);
    sendMetaServerCopy(eventName, eventId, sourcePath);

    if (scope) markEventSent(eventName, scope);
    return browserSent;
}
