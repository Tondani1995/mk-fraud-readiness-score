/**
 * Browser-side Meta helpers.
 *
 * Three eligibility layers are kept deliberately separate:
 *
 *   1. Meta enablement  -- Pixel ID configured AND marketing consent given.
 *   2. Browser Pixel    -- (1) AND the CURRENT route is allowlisted AND fbq exists.
 *   3. Server / CAPI    -- (1) only. The route never gates the server copy.
 *
 * Layer 2 must be evaluated at call time against the live pathname, not merely at the
 * moment the Pixel script was inserted. `fbevents.js` attaches the current document URL to
 * every event it sends, so once the script has loaded on a public page a client-side
 * navigation into /score/* would otherwise let a later `fbq` call transmit an
 * identifier-bearing URL. The component unmounting does not remove the `fbq` global.
 *
 * Every function here is fail-open: if the Pixel is absent, blocked, unconsented or throws,
 * the caller continues unaffected. Meta tracking must never stop an assessment completing.
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

export type MetaConversionResult = { browser: boolean; server: boolean };

declare global {
    interface Window {
        fbq?: ((...args: unknown[]) => void) & { callMethod?: (...args: unknown[]) => void; queue?: unknown[] };
        _fbq?: unknown;
    }
}

function currentPath(): string {
    if (typeof window === "undefined") return "";
    return typeof window.location?.pathname === "string" ? window.location.pathname : "";
}

function fbq(): ((...args: unknown[]) => void) | undefined {
    if (typeof window === "undefined") return undefined;
    return typeof window.fbq === "function" ? window.fbq : undefined;
}

/**
 * Layer 1. Meta is configured for this site and the visitor has opted in to advertising
 * measurement. Carries no judgement about the current route.
 */
export function isMetaEnabled(): boolean {
    if (!META_PIXEL_ID) return false;
    if (typeof window === "undefined") return false;
    return hasMarketingConsent();
}

/**
 * Layer 2. The browser Pixel may transmit right now. Re-checked on every call against the
 * live pathname, because `fbq` outlives the component that inserted it.
 */
export function isBrowserPixelEventAllowed(pathname?: string): boolean {
    if (!isMetaEnabled()) return false;
    if (!isMetaTrackablePath(pathname ?? currentPath())) return false;
    return typeof fbq() === "function";
}

/**
 * Sends a browser Pixel event, but only from an allowlisted route. On a protected route
 * this is a no-op and the caller's server copy carries the conversion instead.
 */
export function trackMetaEvent(
    eventName: string,
    params: MetaParams,
    eventId: string,
    kind: "track" | "trackCustom" = "track",
    pathname?: string
): boolean {
    if (!isBrowserPixelEventAllowed(pathname)) return false;
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
 * Layer 3. Posts the server copy to our own relay. Deliberately NOT route-gated: a
 * conversion that happens on the assessment itself still counts, it simply travels without
 * its URL. Only an allowlisted path is forwarded; anything else is omitted and the relay
 * falls back to the public landing URL.
 *
 * Fire-and-forget: the promise is swallowed so a CAPI outage cannot surface as an unhandled
 * rejection or block the navigation that follows a start or completion.
 */
export function sendMetaServerCopy(eventName: string, eventId: string, sourcePath?: string): boolean {
    if (!isMetaEnabled()) return false;

    const path = sourcePath ?? currentPath();
    const safePath = isMetaTrackablePath(path) ? path : undefined;

    try {
        const body = JSON.stringify(safePath ? { eventName, eventId, sourcePath: safePath } : { eventName, eventId });
        // keepalive lets the request survive the navigation that follows a start/completion.
        void fetch(META_CAPI_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            keepalive: true,
        }).catch(() => undefined);
        return true;
    } catch {
        // No Meta send is worth an exception on the customer's completion path.
        return false;
    }
}

/**
 * Fires one logical conversion. The browser and server gates are evaluated independently,
 * so a protected route suppresses the browser copy WITHOUT suppressing the server copy.
 *
 * When both fire they share one opaque event ID and Meta collapses them into a single
 * conversion. When only the server fires -- every completion on /score/* -- that server
 * event is itself the conversion; there is no browser twin to deduplicate against, and no
 * public bridge page is manufactured just to produce one.
 *
 * `scope` is a first-party correlation key used only to keep the event ID stable across
 * retries. It is never transmitted.
 */
export function trackMetaConversion(
    eventName: typeof META_EVENT_ASSESSMENT_START | typeof META_EVENT_LEAD,
    params: MetaParams,
    options: { scope?: string; sourcePath?: string } = {}
): MetaConversionResult {
    const none: MetaConversionResult = { browser: false, server: false };
    if (!isMetaEnabled()) return none;

    const scope = options.scope ?? "";
    if (scope && hasSentEvent(eventName, scope)) return none;

    const eventId = scope ? stableEventId(eventName, scope) : createOpaqueEventId();
    const sourcePath = options.sourcePath ?? currentPath();
    const kind = eventName === META_EVENT_LEAD ? "track" : "trackCustom";

    const browser = trackMetaEvent(eventName, params, eventId, kind, sourcePath);
    const server = sendMetaServerCopy(eventName, eventId, sourcePath);

    if (scope) markEventSent(eventName, scope);
    return { browser, server };
}
