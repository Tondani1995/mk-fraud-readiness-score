/**
 * Route privacy for Meta.
 *
 * Meta must never be told which identifier-bearing page a visitor is on. Rather than
 * enumerate the routes to exclude (a denylist silently admits every route added later),
 * this module allowlists the small set of public marketing pages that carry no customer,
 * assessment, Snapshot, report or order identifier. Everything else -- the whole of
 * /score, every admin surface, every dynamic-id route -- is excluded by default.
 */

/** Public marketing pages with no identifier in the URL. */
export const META_TRACKABLE_PATHS: readonly string[] = [
    "/",
    "/home",
    "/about",
    "/services",
    "/industries",
    "/insights",
    "/contact",
    "/fraud-readiness",
    "/fraud-readiness/advisory",
    "/fraud-readiness-score",
    "/fraud-readiness-assessment-terms",
    "/privacy-policy",
    "/terms-of-use",
];

/** The landing page the Meta acquisition funnel points at. */
export const META_LANDING_PATH = "/fraud-readiness";

const TRACKABLE = new Set(META_TRACKABLE_PATHS);

/** Editorial slugs are lowercase kebab-case words; anything else is treated as an identifier. */
const SAFE_SLUG_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/**
 * Conservative identifier detection, applied as defence in depth on top of the allowlist.
 * Flags UUIDs, long hex/base64url tokens, long digit runs and anything unusually long.
 */
export function looksLikeIdentifier(segment: string): boolean {
    if (!segment) return false;
    if (segment.length > 40) return true;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) return true;
    if (/[0-9a-f]{12,}/i.test(segment)) return true;
    if (/\d{6,}/.test(segment)) return true;
    if (/^[A-Za-z0-9_-]{16,}$/.test(segment) && /\d/.test(segment) && /[A-Za-z]/.test(segment)) return true;
    if (/[A-Z]/.test(segment) && /\d/.test(segment)) return true;
    return false;
}

/** Strips query and hash, collapses a trailing slash, and lowercases the path. */
export function normalisePath(pathname: string): string {
    if (typeof pathname !== "string" || !pathname) return "";
    const withoutQuery = pathname.split(/[?#]/, 1)[0];
    const trimmed = withoutQuery.length > 1 ? withoutQuery.replace(/\/+$/, "") : withoutQuery;
    return (trimmed || "/").toLowerCase();
}

/**
 * True only for allowlisted public marketing pages. Returns false for every /score route,
 * every admin route, and any path carrying something that looks like an identifier.
 */
export function isMetaTrackablePath(pathname: string): boolean {
    const path = normalisePath(pathname);
    if (!path.startsWith("/")) return false;

    const segments = path.split("/").filter(Boolean);
    if (segments.some(looksLikeIdentifier)) return false;

    if (TRACKABLE.has(path)) return true;

    // Public editorial articles: /insights/<safe-slug> only, never deeper.
    if (segments.length === 2 && segments[0] === "insights" && SAFE_SLUG_RE.test(segments[1])) {
        return true;
    }

    return false;
}

/**
 * The only URL shape Meta may ever be given as an event source. Callers pass a path that
 * has already been through `isMetaTrackablePath`; anything else collapses to the landing
 * page so a rejected path can never leak through a server event.
 */
export function safeEventSourceUrl(pathname: string, origin: string): string {
    const path = isMetaTrackablePath(pathname) ? normalisePath(pathname) : META_LANDING_PATH;
    try {
        return new URL(path, origin).toString();
    } catch {
        return `https://www.mkfraud.co.za${path}`;
    }
}
