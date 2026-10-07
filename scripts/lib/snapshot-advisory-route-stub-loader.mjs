// Resolve hook for scripts/snapshot-advisory-notification-tests.mjs only.
//
// Lets the real Snapshot Advisory route run provider-free and database-free: the modules that
// would reach Supabase, the Snapshot token store, the RC1 freeze switch or the email provider are
// replaced with in-memory stubs that read their behaviour from globalThis.__mkSnapshotAdvisoryTest.
// Everything else — the route, the notification queue, the claim/dispatch lifecycle, the message
// template and the recipient rules — is the real source. Chain it after ts-relative-resolve-loader.

const realAssessmentEvents = new URL('../../src/lib/analytics/assessment-events.ts?real', import.meta.url).href;

const STUBS = {
  '@/lib/supabase/server': `
    export const createSupabaseServiceClient = () => globalThis.__mkSnapshotAdvisoryTest.db;
  `,
  '@/lib/rc1/operation-freeze': `
    export async function getRc1OperationFreezeResponse() { return null; }
  `,
  '@/lib/respondent/tokens': `
    export async function validateSnapshotToken(input) { return globalThis.__mkSnapshotAdvisoryTest.validateSnapshotToken(input); }
  `,
  '@/lib/snapshot/free-snapshot': `
    export async function loadFreeSnapshotByReference() { return globalThis.__mkSnapshotAdvisoryTest.snapshot; }
  `,
  '@/lib/notifications/email-provider': `
    export function getEmailProviderMode() { return globalThis.__mkSnapshotAdvisoryTest.providerMode; }
    export async function sendEmail(input) { return globalThis.__mkSnapshotAdvisoryTest.sendEmail(input); }
  `,
  '@/lib/analytics/assessment-events': `
    export { sanitiseEventMetadata } from ${JSON.stringify(realAssessmentEvents)};
    export async function trackAssessmentEvent(input) { globalThis.__mkSnapshotAdvisoryTest.events.push(input); return { ok: true }; }
  `
};

export async function resolve(specifier, context, nextResolve) {
  if (Object.prototype.hasOwnProperty.call(STUBS, specifier)) {
    return { url: `data:text/javascript,${encodeURIComponent(STUBS[specifier])}`, shortCircuit: true };
  }
  // next ships CommonJS entry points without an ESM exports map; Next's bundler resolves this
  // extensionless, Node's ESM resolver needs the file name.
  if (specifier === 'next/server') return nextResolve('next/server.js', context);
  return nextResolve(specifier, context);
}
