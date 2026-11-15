import crypto from 'node:crypto';
import { createGateway, generateText, Output } from 'ai';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { SNAPSHOT_PRIMARY_MODEL } from '@/lib/reports/ai-model-policy';
import { MODEL_PRICES } from '@/lib/reports/revised/live/accounting';
import { reviewDatabaseConfig, reviewStoreKind } from './database-config';
import type { SnapshotBrief } from './snapshot-brief';

/**
 * The Snapshot's AI narrative for the revised review (owner direction, 15 November 2026), with the previous Snapshot's
 * controls: one small model call per finished review, cached against its answers; strict checks (only the brief's own
 * figures, no assurance or protection claims, no ranking language, no em dashes, word limits); and a narrative written
 * from the data whenever the call fails or a check does not pass, so the page never waits on it or breaks.
 */
export const REVISED_SNAPSHOT_NARRATIVE_VERSION = 'revised-snapshot-narrative-1.0';

export type SnapshotNarrative = {
  headline: string;
  diagnosis: string;
  strength: string;
  signals: { title: string; text: string }[];
  implication: string;
  source: 'ai' | 'data';
};

const schema = z.object({
  headline: z.string().min(10).max(120),
  diagnosis: z.string().min(40).max(560),
  strength: z.string().min(20).max(360),
  signals: z.array(z.object({ title: z.string().min(4).max(70), text: z.string().min(20).max(300) })).length(3),
  implication: z.string().min(40).max(460)
});

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const LIMITS: Record<string, number> = { headline: 16, diagnosis: 70, strength: 45, implication: 60, signalTitle: 9, signalText: 40 };
const BANNED = /\b(guarantee[sd]?|assur(?:e|ed|ance)|certif(?:y|ied|ication)|compliant|compliance with|fully protected|protected against|no risk|risk[- ]free|ranked?|ranking|best[- ]in[- ]class|world[- ]class|industry[- ]leading|will (?:be|get) defrauded|you will lose|verified|audited|tested and)\b/i;

/** Every number a narrative may state: the brief's own figures. */
function allowedNumbers(b: SnapshotBrief): Set<number> {
  const n = new Set<number>([1, 2, 3]);
  const add = (v: number | null | undefined) => { if (typeof v === 'number' && Number.isFinite(v)) n.add(v); };
  if (b.score) { add(b.score.percent); add(b.score.counted); add(b.score.applicable); add(b.score.gapScenarios); }
  add(b.scenariosInPlace); add(b.unknown); add(b.controlsAsked); add(b.gapsReported); add(b.inPlaceReported); add(b.areasWithGaps); add(b.areas.length);
  for (const a of b.areas) { add(a.gaps); add(a.inPlace); add(a.unknown); }
  if (b.strongest) add(b.strongest.inPlace);
  return n;
}

/** The checks every narrative must pass before a customer sees it; returns the problems found. */
export function checkNarrative(n: Omit<SnapshotNarrative, 'source'>, brief: SnapshotBrief): string[] {
  const problems: string[] = [];
  const parsed = schema.safeParse(n);
  if (!parsed.success) return ['schema'];
  const parts: [string, string, number][] = [
    ['headline', n.headline, LIMITS.headline], ['diagnosis', n.diagnosis, LIMITS.diagnosis], ['strength', n.strength, LIMITS.strength],
    ['implication', n.implication, LIMITS.implication],
    ...n.signals.flatMap((s, i) => [[`signal${i}.title`, s.title, LIMITS.signalTitle], [`signal${i}.text`, s.text, LIMITS.signalText]] as [string, string, number][])
  ];
  const allowed = allowedNumbers(brief);
  for (const [field, text, limit] of parts) {
    if (words(text) > limit) problems.push(`${field}: too long`);
    if (/—/.test(text)) problems.push(`${field}: em dash`);
    if (BANNED.test(text)) problems.push(`${field}: claim not allowed (${text.match(BANNED)![0]})`);
    for (const m of text.matchAll(/\b\d+(?:[.,]\d+)?\b/g)) {
      const v = Number(m[0].replace(',', '.'));
      if (!allowed.has(v)) problems.push(`${field}: figure ${m[0]} is not in the results`);
    }
  }
  return problems;
}

/** The narrative written from the data: always available, always within the checks. */
export function dataNarrative(b: SnapshotBrief): SnapshotNarrative {
  const top = b.areas.filter((a) => a.gaps > 0).slice(0, 3);
  const s = b.score;
  const headline = !s
    ? 'Your answers so far leave too much open for a score'
    : s.percent < 40
      ? 'Many core fraud controls are reported as missing'
      : s.percent < 70
        ? 'Core controls are partly in place, with material gaps'
        : 'Most core controls are in place, with gaps to close';
  const diagnosis = s
    ? `Your answers report a core-control gap in ${s.gapScenarios} of the ${s.counted} fraud scenarios counted, across ${b.areasWithGaps} of the ${b.areas.length} areas assessed. The score of ${s.percent}% shows how far the controls you reported in place cover those scenarios.`
    : `Of the questions asked so far, ${b.unknown} were answered "I don't know", so too few scenarios have every core answer known to calculate a score.`;
  const strength = b.strongest
    ? `${b.strongest.name} is your strongest area, with ${b.strongest.inPlace} controls reported in place. That is a base the rest of the control environment can build on.`
    : 'Few controls were reported fully in place, so the report starts from the controls that matter most.';
  const signals = (top.length ? top : b.areas.slice(0, 3)).map((a) => ({
    title: a.name,
    text: a.gaps
      ? `${a.gaps} ${a.gaps === 1 ? 'control is' : 'controls are'} reported as a gap here${a.gapTitles[0] ? `, including: ${a.gapTitles[0].replace(/\.$/, '')}` : ''}.`
      : `No gaps were reported in this area.`
  }));
  while (signals.length < 3) signals.push({ title: 'Open questions', text: `${b.unknown} questions were answered "I don't know" and stay open until they are answered.` });
  const implication = 'Gaps in core controls are the routes fraud most often takes, and each one left open widens the window for a loss to go unnoticed. Closing them in the right order, with a named owner for each, is a management decision, and the report sets out that order.';
  return { headline, diagnosis, strength, signals, implication, source: 'data' };
}

function gatewayModel(requestOidcToken?: string | null) {
  const token = requestOidcToken?.trim() || process.env.AI_GATEWAY_API_KEY?.trim() || process.env.VERCEL_AI_GATEWAY_API_KEY?.trim() || process.env.VERCEL_OIDC_TOKEN?.trim();
  if (!token) return null;
  const oidc = Boolean(requestOidcToken?.trim()) || (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_AI_GATEWAY_API_KEY);
  return createGateway({ apiKey: token, ...(oidc ? { headers: { 'ai-gateway-auth-method': 'oidc' } } : {}) })(SNAPSHOT_PRIMARY_MODEL);
}

const SYSTEM = [
  'You write the short narrative at the top of an MK Fraud Insights Fraud Readiness Snapshot. MK is an independent South African fraud risk advisory practice.',
  'Write for a CFO or chief risk officer: calm, expert and specific. The aim is that management understands what its own answers show and why acting on them matters, so that ordering the report is the obvious next step.',
  'Use only the facts and figures in the brief. Do not invent figures, losses, incidents, regulations or consequences for this organisation. Every number you write must appear in the brief.',
  'These are the organisation’s own answers; nothing has been tested. Never say the organisation is assured, compliant, certified, verified, protected or at no risk, and never rank or compare it with others.',
  'British spelling. No em dashes. No exclamation marks. No slogans or clipped fragments. Return only the requested object.'
].join(' ');

const db = () => {
  if (reviewStoreKind() !== 'database') return null;
  const c = reviewDatabaseConfig();
  return createClient(c.url, c.serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }) as any;
};

const digest = (b: SnapshotBrief) => crypto.createHash('sha256').update(JSON.stringify({ v: REVISED_SNAPSHOT_NARRATIVE_VERSION, b })).digest('hex');

/**
 * The narrative for a finished review: the cached one for these exact answers, or one model call (checked), or the data
 * narrative. Never throws.
 */
export async function snapshotNarrative(sessionId: string, brief: SnapshotBrief, options: { requestOidcToken?: string | null; generate?: boolean } = {}): Promise<SnapshotNarrative> {
  const key = digest(brief);
  const client = db();
  try {
    if (client) {
      const { data } = await client.rpc('review_snapshot_narrative', { p_session_id: sessionId, p_brief_digest: key });
      if (data?.narrative) return data.narrative as SnapshotNarrative;
    }
  } catch { /* the cache is an optimisation */ }
  if (options.generate === false) return dataNarrative(brief);

  let narrative: SnapshotNarrative = dataNarrative(brief);
  let usage: unknown = null;
  let status = 'data';
  const model = gatewayModel(options.requestOidcToken);
  if (model) {
    try {
      const response = await generateText({
        model,
        system: SYSTEM,
        prompt: `Write the Snapshot narrative for this brief. headline: up to ${LIMITS.headline} words. diagnosis: up to ${LIMITS.diagnosis} words. strength: up to ${LIMITS.strength} words, about what is reported in place. signals: exactly 3, each a short title (an area or theme, up to ${LIMITS.signalTitle} words) and up to ${LIMITS.signalText} words on what was reported there. implication: up to ${LIMITS.implication} words on why it matters to management now.\n\nBRIEF\n${JSON.stringify({ ...brief, areas: brief.areas.slice(0, 8).map((a) => ({ ...a, gapTitles: a.gapTitles.slice(0, 4) })) })}`,
        output: Output.object({ schema, name: 'mk_revised_snapshot_narrative' }),
        maxOutputTokens: 2000,
        maxRetries: 0,
        providerOptions: { openai: { reasoningEffort: 'minimal' }, gateway: { tags: ['feature:mk-fraud-readiness-snapshot', 'stage:revised-narrative'] } },
        abortSignal: AbortSignal.timeout(30_000)
      });
      usage = response.usage;
      const candidate = { ...response.output, headline: response.output.headline.replace(/—/g, ':') };
      const problems = checkNarrative(candidate, brief);
      if (problems.length === 0) { narrative = { ...candidate, source: 'ai' }; status = 'ai'; }
      else { status = 'checks_failed'; console.warn('revised_snapshot_narrative_checks_failed', { problems: problems.slice(0, 5) }); }
    } catch (error) {
      status = 'call_failed';
      console.warn('revised_snapshot_narrative_call_failed', { message: error instanceof Error ? error.message.slice(0, 160) : 'unknown' });
    }
  }
  try {
    if (client && status !== 'call_failed') {
      const u = usage as { inputTokens?: number; outputTokens?: number } | null;
      const p = MODEL_PRICES[SNAPSHOT_PRIMARY_MODEL];
      const cost = u && p ? (Number(u.inputTokens ?? 0) * p.input + Number(u.outputTokens ?? 0) * p.output) : null;
      await client.rpc('review_record_snapshot_narrative', { p: { sessionId, briefDigest: key, narrative, status, model: SNAPSHOT_PRIMARY_MODEL, version: REVISED_SNAPSHOT_NARRATIVE_VERSION, usage, costUsd: cost } });
    }
  } catch { /* a narrative that could not be cached is still shown */ }
  return narrative;
}
