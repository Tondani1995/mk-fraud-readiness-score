import { NextResponse } from "next/server";

import { isMetaServerEvent } from "@/lib/website/meta/events";
import { isOpaqueEventId } from "@/lib/website/meta/event-id";
import { safeEventSourceUrl, META_LANDING_PATH } from "@/lib/website/meta/routes";
import { sendMetaServerEvent, isMetaCapiConfigured } from "@/lib/server/meta/capi";
import { SITE_URL } from "@/lib/website/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * First-party relay for the Meta Conversions API.
 *
 * The browser posts only an event name and an opaque event ID. Everything else -- the
 * source URL, the content parameters, the attribution cookies -- is derived here from
 * values this route already holds, so the browser cannot cause anything unexpected to be
 * forwarded to Meta.
 *
 * The response is always 204. Meta's availability is not the customer's problem, and a
 * distinguishable error would let a caller probe whether CAPI is configured.
 */
export async function POST(request: Request) {
    const noContent = new NextResponse(null, { status: 204 });

    try {
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object") return noContent;

        const { eventName, eventId, sourcePath } = body as Record<string, unknown>;

        // Only the two declared conversions may be relayed, and only with an ID of the
        // opaque shape this application mints.
        if (!isMetaServerEvent(eventName)) return noContent;
        if (!isOpaqueEventId(eventId)) return noContent;
        if (!isMetaCapiConfigured()) return noContent;

        // Re-normalised server-side even though the browser already filtered it: a path that
        // is not on the public allowlist collapses to the landing page and never travels.
        const requestedPath = typeof sourcePath === "string" ? sourcePath : META_LANDING_PATH;
        const eventSourceUrl = safeEventSourceUrl(requestedPath, SITE_URL);

        const cookieHeader = request.headers.get("cookie") ?? "";
        const readCookie = (name: string) => {
            const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
            return match ? decodeURIComponent(match[1]) : null;
        };

        // x-forwarded-for is a list; the client address is the first entry.
        const forwardedFor = request.headers.get("x-forwarded-for") ?? "";
        const clientIpAddress = forwardedFor.split(",")[0]?.trim() || null;

        await sendMetaServerEvent({
            eventName,
            eventId,
            eventSourceUrl,
            fbp: readCookie("_fbp"),
            fbc: readCookie("_fbc"),
            clientUserAgent: request.headers.get("user-agent"),
            clientIpAddress,
        });
    } catch {
        // Deliberately silent. A relay failure must never become a customer-visible error.
    }

    return noContent;
}
