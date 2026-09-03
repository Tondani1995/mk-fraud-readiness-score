/**
 * Opaque event IDs for browser/server deduplication.
 *
 * Meta collapses a browser event and a server event into one logical conversion when the
 * event name and event ID match. The ID is random and carries no meaning: it is never
 * derived from an assessment reference, Snapshot ID, order ID or email, so possessing the
 * ID reveals nothing about the customer.
 *
 * Replay protection is separate from ID generation. The ID minted for a given completion is
 * remembered first-party, so a retry, refresh or double-submit re-sends the SAME ID and
 * Meta deduplicates it into the single conversion that already exists.
 */

const EVENT_ID_STORAGE_PREFIX = "mk_fraud_meta_event_id:";

/** Matches the opaque IDs this module mints; used by the server relay to reject junk. */
export const OPAQUE_EVENT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function randomHex(length: number): string {
    const bytes = new Uint8Array(length);
    const cryptoRef = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
    if (cryptoRef && typeof cryptoRef.getRandomValues === "function") {
        cryptoRef.getRandomValues(bytes);
    } else {
        for (let index = 0; index < length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
    }
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Mints a fresh opaque event ID. Random only -- never a hash of a customer identifier. */
export function createOpaqueEventId(): string {
    const cryptoRef = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
    if (cryptoRef && typeof cryptoRef.randomUUID === "function") {
        return cryptoRef.randomUUID();
    }
    const hex = randomHex(16);
    return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        `4${hex.slice(13, 16)}`,
        ((parseInt(hex.slice(16, 17), 16) & 0x3) | 0x8).toString(16) + hex.slice(17, 20),
        hex.slice(20, 32),
    ].join("-");
}

export function isOpaqueEventId(value: unknown): value is string {
    return typeof value === "string" && OPAQUE_EVENT_ID_RE.test(value);
}

/**
 * Returns the event ID for a logical occurrence, minting one on first call and reusing it
 * on every later call. `scope` is a first-party correlation key (an assessment reference)
 * that stays in this browser -- it is used to look the ID up and is never sent to Meta.
 */
export function stableEventId(eventName: string, scope: string): string {
    const fallback = createOpaqueEventId();
    if (typeof window === "undefined" || !scope) return fallback;

    const key = `${EVENT_ID_STORAGE_PREFIX}${eventName}:${scope}`;
    try {
        const existing = window.localStorage.getItem(key);
        if (isOpaqueEventId(existing)) return existing;
        window.localStorage.setItem(key, fallback);
    } catch {
        // Without storage we cannot suppress a replay locally; Meta still deduplicates the
        // browser and server copies of this send against each other.
    }
    return fallback;
}

/**
 * True when this browser has already completed a send for this logical occurrence.
 * Used to skip re-firing entirely on a refresh, in addition to Meta's own deduplication.
 */
export function hasSentEvent(eventName: string, scope: string): boolean {
    if (typeof window === "undefined" || !scope) return false;
    try {
        return window.localStorage.getItem(`${EVENT_ID_STORAGE_PREFIX}${eventName}:${scope}:sent`) === "1";
    } catch {
        return false;
    }
}

export function markEventSent(eventName: string, scope: string): void {
    if (typeof window === "undefined" || !scope) return;
    try {
        window.localStorage.setItem(`${EVENT_ID_STORAGE_PREFIX}${eventName}:${scope}:sent`, "1");
    } catch {
        // Best effort only.
    }
}
