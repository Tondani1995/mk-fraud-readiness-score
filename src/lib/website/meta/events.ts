/**
 * The complete Meta event vocabulary for MK Fraud Insights.
 *
 * Every parameter Meta may receive is declared here as a literal. There is no code path
 * that forwards caller-supplied data: `sanitiseMetaParams` rebuilds the payload from an
 * allowlist, so a score, Snapshot ID, assessment ID, answer or organisation detail cannot
 * reach Meta even if a future caller passes one in.
 */

/** Standard Meta event fired on the acquisition landing page. */
export const META_EVENT_VIEW_CONTENT = "ViewContent";
/** Standard Meta event representing a completed free assessment. The optimisation event. */
export const META_EVENT_LEAD = "Lead";
/** Custom Meta event representing a successfully created assessment session. */
export const META_EVENT_ASSESSMENT_START = "fraud_readiness_start";

/** The two logical conversions that are also sent server-side via the Conversions API. */
export const META_SERVER_EVENTS = [META_EVENT_ASSESSMENT_START, META_EVENT_LEAD] as const;
export type MetaServerEvent = typeof META_SERVER_EVENTS[number];

export function isMetaServerEvent(value: unknown): value is MetaServerEvent {
    return typeof value === "string" && (META_SERVER_EVENTS as readonly string[]).includes(value);
}

/** The only parameter keys Meta may ever receive from this application. */
export const ALLOWED_META_PARAM_KEYS: readonly string[] = ["content_name", "content_category"];

export type MetaParams = Record<string, string>;

export const VIEW_CONTENT_PARAMS: MetaParams = {
    content_name: "fraud_readiness",
    content_category: "organisational_assessment",
};

export const ASSESSMENT_START_PARAMS: MetaParams = {
    content_name: "fraud_readiness",
    content_category: "organisational_assessment",
};

export const LEAD_PARAMS: MetaParams = {
    content_name: "fraud_readiness_assessment",
    content_category: "organisational_assessment",
};

/** Values are constrained to the small closed set of literals declared above. */
const ALLOWED_PARAM_VALUES = new Set<string>([
    "fraud_readiness",
    "fraud_readiness_assessment",
    "organisational_assessment",
]);

/**
 * Rebuilds a Meta parameter object from the allowlist. Unknown keys and unknown values are
 * dropped rather than escaped, so the output is always one of the literal shapes above.
 */
export function sanitiseMetaParams(params: unknown): MetaParams {
    const safe: MetaParams = {};
    if (!params || typeof params !== "object") return safe;

    for (const key of ALLOWED_META_PARAM_KEYS) {
        const value = (params as Record<string, unknown>)[key];
        if (typeof value === "string" && ALLOWED_PARAM_VALUES.has(value)) {
            safe[key] = value;
        }
    }

    return safe;
}

/** Returns the canonical parameters for a server-side event, ignoring anything supplied. */
export function serverEventParams(eventName: MetaServerEvent): MetaParams {
    return eventName === META_EVENT_LEAD ? { ...LEAD_PARAMS } : { ...ASSESSMENT_START_PARAMS };
}
