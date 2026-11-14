import crypto from 'node:crypto';
import { canonicalDigest } from '@/lib/readiness-review/canonical';
import { buildStagedReportInput, STAGED_REPORT_INPUT_CONTRACT } from '@/lib/readiness-review/report-input';
import { replayStoredSession } from '@/lib/readiness-review/service';
import { RESTRICTED_TEST_LABEL } from '@/lib/readiness-review/commercial-environment';
import { NARRATIVE_FALLBACK_MODELS, PRIMARY_NARRATIVE_MODEL } from '@/lib/reports/ai-model-policy';
import { buildRevisedReport, REVISED_REPORT_MODEL_VERSION } from '../evidence-model';
import { positionStatements } from '../position';
import { buildRevisedFactPack, REVISED_FACT_PACK_VERSION, type RevisedFactPack } from '../manuscript/fact-pack';
import { buildRevisedStoryPlan, REVISED_STORY_PLAN_VERSION, type RevisedStoryPlan } from '../manuscript/story-plan';
import { renderWriterBrief } from '../manuscript/writer-brief';
import { validateManuscript, MANUSCRIPT_VALIDATOR_VERSION, type ManuscriptValidation } from '../manuscript/manuscript';
import { REVISED_COMPOSER_VERSION } from '../manuscript/compose';
import { layoutPublication, PUBLICATION_LAYOUT_VERSION, type LayoutRecord } from '../manuscript/layout';
import { buildBibleWorkbook, BIBLE_WORKBOOK_VERSION } from '../manuscript/workbook-bible';
import type { RevisedOrderContext } from './order';
import { AccountingRefusal, costFromUsage, MAX_OUTPUT_TOKENS, REVISED_ACCOUNTING_VERSION, worstCaseCostUsd, type CallAccounting } from './accounting';
import { CHECKPOINT_VERSION, resumeFrom, type ResumeMeta, type ResumeMode, type StoredCheckpoint } from './checkpoints';

/**
 * B5: one paid report for a revised assessment, from the stored answer log to PDF (and, for Comprehensive, the
 * workbook), following Reporting Bible v1.1: Fact Pack, Story Plan, writer brief, one AI manuscript through the
 * configured AI Gateway model, the manuscript validator, the MK publication composer and renderer.
 *
 * Fail-closed rules:
 *   - the report is rebuilt from the log exactly as bound (truncated to the bound position) and both digests must
 *     match the binding, so it can only reflect the answers the organisation submitted;
 *   - no score is calculated or shown: the revised method is unapproved (methodology-dispatch.ts);
 *   - one provider call per generation; a manuscript that fails validation is never composed and nothing is
 *     substituted for it (Bible 5.2: no template fallback); a retry is a new, separately recorded generation;
 *   - every artefact carries the restricted-test label.
 */

export const REVISED_LIVE_PIPELINE_VERSION = 'revised-live-pipeline-0.3';
/** One writing call, plus at most one repair call that returns the validator's exact issues to the writer. */
export const REVISED_PROVIDER_CALL_CEILING = 2;
/**
 * Deadline for one generation request, enforced end to end (independent review: the Comprehensive used 257 s of a
 * 300 s route). Measured from the start of the revised branch:
 *   - a paid call is started only if it leaves `reserveAfterWritingMs` for everything after it, and is aborted when its
 *     share runs out;
 *   - layout starts only with `minLayoutMs` left, and each render pass is given only the time remaining;
 *   - storage starts only with `minStoreMs` left.
 * A step that cannot fit stops the attempt before it starts, with a checkpoint to resume from, rather than being killed
 * by the platform part-way through. This is a deadline inside a synchronous request; it is not background fulfilment.
 */
export const REVISED_TIME_BUDGET = { totalMs: 270_000, reserveAfterWritingMs: 75_000, minWriterMs: 75_000, minRepairMs: 45_000, maxCallMs: 200_000, minLayoutMs: 45_000, minRenderPassMs: 10_000, minStoreMs: 20_000 } as const;
/** What an operator should do, by failure code (shown in the console and recorded with the attempt). */
export const REVISED_OPERATOR_GUIDANCE: Record<RevisedGenerationError['code'], string> = {
  answers_changed_since_binding: 'The stored answers no longer match the submitted assessment. Do not retry; investigate the binding.',
  provider_failed: 'The AI service returned an error. Retry generation; the call is counted in the order allowance.',
  provider_timeout: 'The AI service did not answer within the time available. Retry generation; the call is counted, and any stored draft is reused.',
  time_budget_exhausted: 'Not enough time remained for the next step. Retry generation; it resumes from the last stored checkpoint.',
  manuscript_rejected: 'The manuscript failed the report checks after its permitted repair. Retry generation, or review the recorded issues.',
  render_failed: 'The PDF could not be laid out. Retry generation; the stored validated manuscript is reused without an AI call.',
  publication_held: 'The PDF failed its publication checks and was not stored. Retry recomposes the stored manuscript without an AI call; if it is held again, the layout needs engineering attention.',
  call_ceiling_reached: 'This order has used its lifetime AI call allowance. Do not retry; ask MK to review the recorded attempts.',
  campaign_budget_missing: 'No approved test campaign budget is in force, so no AI call can be made. An owner must approve one.',
  campaign_budget_exhausted: 'The approved test campaign has used its call or cost allowance. Do not retry; ask the owner.',
  cost_not_bounded: 'The configured AI model has no recorded price, so its cost cannot be bounded and it is not called.',
  accounting_unavailable: 'The AI call ledger could not be reached, so no AI call was made. Retry when the review store is available.',
  history_unavailable: 'The generation history could not be read, so no AI call was made. Retry when the review store is available.',
  audit_unavailable: 'The audit package could not be stored, so no report was composed or finalised. Retry when the review store is available; the calls already made are counted.'
};

const WRITER_SYSTEM = [
  'You are the MK Fraud Insights report writer. Follow the writer contract in the brief exactly. Your output is checked by an automatic validator; any breach of the format rules below rejects the whole manuscript.',
  '',
  'FORMAT RULES (mandatory):',
  '1. Start every planned section with its marker line `<!-- section: ID -->` and keep the planned order; then `# ` and a heading that states a claim.',
  '2. Inside a section, write one `## ` heading per planned unit, exactly as many units as the plan lists, each heading a claim. A section with a single planned unit (for example one pathway) still has its own `## ` unit heading under the `# ` section heading.',
  '3. After EVERY paragraph, on its own line, write `<!-- refs: REF, REF -->` naming the Fact Pack refs the paragraph relies on. A paragraph without this line is rejected.',
  '4. Never type a number, count or percentage, in digits or in words. Insert every figure as a slot: `[[REF]]` for the value or `[[REF|w]]` for a number in words. Headings follow the same rule.',
  '5. Never write an internal reference in the prose: no FINDING-…, PATHWAY-…, THEME-…, PRIORITY-…, BLUEPRINT-…, DECISION-…, STAGE-…, MEASURE-…, POSITION-…, AREA-… and no question codes such as D6-P-09. Refs appear only inside `<!-- refs: -->` comments and `[[...]]` slots.',
  '6. Place each planned exhibit on its own line exactly as written in the plan, for example `[[exhibit:contents]]`.',
  '7. Only refs listed in the brief\'s "Facts (insert as slots)" table may appear inside [[ ]]. Theme, finding, pathway, priority, blueprint, decision, stage, measure, role, area, legal and position refs are NEVER slots: describe them in words and cite them only in the <!-- refs: --> comment. Write [[N-AREAS|w]], never "ten areas"; write a stage as "within the first ninety days" only if the brief gives that wording, otherwise "in the proposed first stage".',
  '9. Never rank or grade risks: no MK prioritisation method is approved. Do not write "matters most", "where it matters most", "most material", "material exposure", "highest priority", "high priority", "top priority", "critical risk", "most important risk", "the biggest risk" or "most serious". Say "the controls this report sets out first" instead.',
  '10. Never write "independently verified", "verified", "validated", "tested", "examined", "evidence-based" or "evidence-linked", even inside a recommendation: nothing in this report was tested. Describe a control instead, for example "checked by a second person who did not raise the request".',
  '11. Vary how recommendations open. Use "management should" at most five times and "the organisation should" at most five times in the whole manuscript; otherwise name the accountable role ("The chief financial officer should …") or state the action directly.',
  '12. The first paragraph of the executive section must contain [[T-SCENARIO-ACCOUNT]] exactly, as a sentence of its own. Do not restate those scenario counts in your own words anywhere in that section.',
  '8. Never use internal process words in the prose: not "fact pack", "story plan", "the engine", "recorded condition", "hard gate" or "the model". Say "the organisation\'s answers" or "this assessment" instead.',
  '',
  'LENGTH (mandatory): an Essential manuscript is 3,800 to 4,500 words and a Comprehensive manuscript 4,800 to 5,800 words. Give each finding three or four connected paragraphs (what the organisation reported, how fraud could exploit it in its operations, what good practice looks like, and what to do first), each theme two or three paragraphs, each pathway three paragraphs, and each priority, blueprint and decision at least two paragraphs. A short manuscript is rejected.',
  '',
  'EXAMPLE of the required shape (content illustrative only):',
  '<!-- section: ESS-EXEC -->',
  '# The controls that guard payments are in place, but the processes that feed them are not',
  '',
  'On its own answers, the organisation reports the core controls in place for [[N-REPORTED-HELD]] of the [[N-APPLY]] fraud scenarios that apply, and a core control reported as a gap in [[N-GAP]].',
  '<!-- refs: N-REPORTED-HELD, N-APPLY, N-GAP -->',
  '',
  'Write in South African English, in connected advisory paragraphs, with no em dashes. Never invent a fact, figure, owner, priority, control condition or assurance claim. Write the full length the plan sets.'
].join('\n');

/**
 * Lossless layout normalisation applied to every manuscript before validation: a `<!-- refs: ... -->` comment written
 * at the end of its paragraph's line is moved onto its own line, where the contract places it. No word, slot or ref is
 * added, removed or changed. Observed on the deployed model's output on 13 November 2026.
 */
export function normaliseManuscriptLayout(md: string): string {
  return md.replace(/^(.*\S)[ \t]*(<!--\s*refs:[^>]*-->)[ \t]*$/gm, '$1\n$2');
}

/**
 * Tiered model use for the revised writer (MK decision, 13 November 2026: keep cost down, so the stronger model is
 * used only where the cheaper one fails).
 *   - The manuscript is written by the primary model (MK_REPORT_AI_MODEL if it is a well-formed model ID, otherwise the
 *     policy's PRIMARY_NARRATIVE_MODEL). A malformed override is ignored and recorded, never sent to the gateway.
 *   - Only if the manuscript fails validation is a repair made, by the escalation model (MK_REPORT_AI_REPAIR_MODEL if
 *     well-formed, otherwise the policy's terra fallback), and a line-level repair sends and returns only the flagged
 *     lines, so the stronger model writes a few hundred tokens rather than the report.
 *   - Each call goes only to the model named: the gateway is not given a fallback order, so an outage fails (and can be
 *     retried) instead of silently routing to a more expensive model.
 * This departs, for the revised writer only, from the shared policy rule that quality failures never change the model.
 */
const MODEL_ID = /^[a-z0-9][a-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._:-]*$/;
export type RevisedModelPlan = { writer: string; repair: string; writerOverrideRejected: string | null; repairOverrideRejected: string | null };
export function revisedModelPlan(env: NodeJS.ProcessEnv = process.env): RevisedModelPlan {
  const pick = (raw: string | undefined, fallback: string) => {
    const value = raw?.trim();
    if (!value) return { model: fallback, rejected: null };
    return MODEL_ID.test(value) ? { model: value, rejected: null } : { model: fallback, rejected: value.slice(0, 120) };
  };
  const terra = NARRATIVE_FALLBACK_MODELS.find((m) => m.endsWith('-terra')) ?? NARRATIVE_FALLBACK_MODELS[0];
  const writer = pick(env.MK_REPORT_AI_MODEL, PRIMARY_NARRATIVE_MODEL);
  const repair = pick(env.MK_REPORT_AI_REPAIR_MODEL, terra);
  return { writer: writer.model, repair: repair.model, writerOverrideRejected: writer.rejected, repairOverrideRejected: repair.rejected };
}

/** Minimum words a manuscript must reach to be composed; well below the writer's targets, above a thin draft. */
export const MINIMUM_WORDS: Record<'essential' | 'comprehensive', number> = { essential: 3000, comprehensive: 3800 };

type Acceptance = { pass: boolean; issues: { code: string; section: string; line: number; detail: string }[] };
/**
 * Length gate. In the restricted test (MK direction, 13 November 2026) a manuscript that passes every Bible rule but
 * falls short of the minimum is composed and labelled, and the shortfall is recorded as a customer-release blocker.
 * Anywhere else the shortfall blocks composition.
 */
export function lengthGateMode(env: NodeJS.ProcessEnv = process.env): 'record' | 'block' {
  return env.MK_REVISED_COMMERCIAL_PATH === 'restricted-test' ? 'record' : 'block';
}

export function accept(validation: ManuscriptValidation, product: 'essential' | 'comprehensive', mode: 'record' | 'block' = 'block'): Acceptance & { shortfall: { words: number; minimum: number } | null } {
  const issues = validation.issues.filter((i) => i.blocking).map((i) => ({ code: i.code, section: i.section, line: i.line, detail: i.detail }));
  const words = Number(validation.stats?.words ?? 0);
  const shortfall = words < MINIMUM_WORDS[product] ? { words, minimum: MINIMUM_WORDS[product] } : null;
  if (shortfall && mode === 'block') issues.push({ code: 'TOO-SHORT', section: 'all', line: 0, detail: `The manuscript has ${words} words; it must have at least ${MINIMUM_WORDS[product]} and should reach the length the format rules set. Develop every unit to the paragraph counts given.` });
  return { pass: issues.length === 0, issues, shortfall };
}

/**
 * Surgical repair: only the lines the validator flagged are sent back, each with its problems, and the writer returns
 * a corrected replacement for each line. The rest of the manuscript is kept exactly as written, so length and
 * structure are preserved. Used when every issue is tied to a line; a length shortfall uses the full repair.
 */
export function lineRepairPrompt(brief: string, manuscript: string, acceptance: Acceptance): { prompt: string; lines: number[] } {
  const rows = manuscript.split('\n');
  const byLine = new Map<number, string[]>();
  // Heading issues are reported at the section marker; the line to correct is the heading that follows it.
  const target = (n: number) => {
    if (!/^<!--\s*section:/.test(rows[n - 1] ?? '')) return n;
    for (let k = n; k < rows.length; k++) if (/^#\s/.test(rows[k])) return k + 1;
    return n;
  };
  for (const i of acceptance.issues) if (i.line > 0) { const n = target(i.line); byLine.set(n, [...(byLine.get(n) ?? []), `${i.code}: ${i.detail}`]); }
  const lines = [...byLine.keys()].sort((a, b) => a - b);
  const items = lines.map((n) => `### LINE ${n}\nCurrent text:\n${rows[n - 1] ?? ''}\nProblems:\n${byLine.get(n)!.map((x) => `- ${x}`).join('\n')}`).join('\n\n');
  return {
    lines,
    prompt: `${brief}\n\n## Lines to correct\n\nThe manuscript passed every other check. Correct only these lines. Keep each line's meaning, length and Markdown prefix (#, ## or none). Use [[REF]] slots only for refs in the Facts table; describe themes, findings, stages and other items in words. Never type a count or figure; never write an internal identifier in prose.\n\n${items}\n\n## Output\n\nReturn only a JSON array, one object per line above: [{"line": <number>, "text": "<the corrected full line>"}].`
  };
}

export function applyLineRepair(manuscript: string, lines: number[], reply: string): string | null {
  const start = reply.indexOf('['); const end = reply.lastIndexOf(']');
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(reply.slice(start, end + 1)); } catch { return null; }
  if (!Array.isArray(parsed)) return null;
  const rows = manuscript.split('\n');
  for (const item of parsed as { line?: unknown; text?: unknown }[]) {
    const n = Number(item?.line);
    if (!lines.includes(n) || typeof item.text !== 'string' || item.text.includes('\n')) continue;
    // A corrected line keeps its kind: a heading stays a heading of the same level, prose stays prose.
    const level = (x: string) => (x.match(/^(#+)\s/)?.[1].length ?? 0);
    if (level(item.text) !== level(rows[n - 1] ?? '') || /^<!--/.test(item.text)) continue;
    rows[n - 1] = item.text;
  }
  return rows.join('\n');
}

function repairPrompt(brief: string, manuscript: string, acceptance: Acceptance): string {
  const issues = acceptance.issues.slice(0, 80)
    .map((i) => `- ${i.code} in section ${i.section}, line ${i.line}: ${i.detail}`).join('\n');
  return `${brief}\n\n## Your previous manuscript\n\n${manuscript}\n\n## The validator rejected it for these reasons\n\n${issues}\n\n## Task\n\nReturn the complete corrected manuscript, every planned section in order, fixing every issue above and keeping the format rules. Replace each typed figure with its [[REF]] slot, add the missing <!-- refs: --> line after each paragraph, and remove every internal reference from the prose. Return only the manuscript.`;
}

/** Where a retry starts, from the order's stored checkpoints (see checkpoints.ts). */
export type RevisedResumePoint = { stage: 'repair' | 'compose'; fromAttempt: string; manuscript: string; meta: ResumeMeta };

/** The Fact Pack's content digest, without its generation time: two attempts on the same bound input agree on it. */
export function factPackContentDigest(fp: RevisedFactPack): string {
  const { generatedAt: _g, sha256: _s, ...content } = fp as RevisedFactPack & { generatedAt?: string };
  void _g; void _s;
  return crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex');
}

export class RevisedGenerationError extends Error {
  readonly code: 'answers_changed_since_binding' | 'provider_failed' | 'provider_timeout' | 'time_budget_exhausted' | 'manuscript_rejected' | 'render_failed'
    | 'publication_held' | 'call_ceiling_reached' | 'campaign_budget_missing' | 'campaign_budget_exhausted' | 'cost_not_bounded' | 'accounting_unavailable'
    | 'history_unavailable' | 'audit_unavailable';
  readonly diagnostics: Record<string, unknown>;
  constructor(code: RevisedGenerationError['code'], message: string, diagnostics: Record<string, unknown> = {}) {
    super(message);
    this.name = 'RevisedGenerationError';
    this.code = code;
    this.diagnostics = diagnostics;
  }
}

export type ManuscriptWriter = (input: { system: string; prompt: string; model: string; fallbackModels: readonly string[]; effort?: 'low'; signal?: AbortSignal; maxOutputTokens?: number }) => Promise<{
  text: string; provider: string | null; model: string | null; usage: Record<string, unknown> | null; latencyMs: number;
}>;

/** The production writer: one call through the Vercel AI Gateway (OIDC on Vercel, or AI_GATEWAY_API_KEY). */
export const gatewayManuscriptWriter: ManuscriptWriter = async ({ system, prompt, model, effort, signal, maxOutputTokens }) => {
  const { generateText } = await import('ai');
  const started = Date.now();
  const result: any = await generateText({
    model,
    system,
    prompt,
    maxRetries: 0,
    // The cap bounds the cost reserved for the call; it is well above a full manuscript.
    maxOutputTokens: maxOutputTokens ?? MAX_OUTPUT_TOKENS.writer,
    abortSignal: signal ?? AbortSignal.timeout(REVISED_TIME_BUDGET.maxCallMs),
    // Only the named model, served by its own provider: no model fallback list is given to the gateway.
    providerOptions: { gateway: { only: [model.split('/')[0]] }, ...(effort ? { openai: { reasoningEffort: effort } } : {}) } as any
  });
  const routing = result?.providerMetadata?.gateway?.routing ?? null;
  return {
    text: String(result.text ?? ''),
    provider: routing?.resolvedProvider ?? routing?.finalProvider ?? null,
    model: result?.response?.modelId ?? model,
    usage: result.usage ?? null,
    latencyMs: Date.now() - started
  };
};

/** Publication gates every revised PDF must pass before it is stored (independent review of the corrective pass, F6). */
export type PublicationGates = {
  pass: boolean;
  /** Required: every section and unit heading located in the final PDF, and the contents page numbers (where the report has a contents page) checked against it after the layout converged. */
  required: { id: string; pass: boolean; detail: string }[];
  /** Advisory: recorded and shown to the operator; never described as verified when present. */
  advisory: { id: string; detail: string }[];
};
export function publicationGates(layout: LayoutRecord, hasContentsPage: boolean): PublicationGates {
  const missing = layout.missing.filter((m) => !m.startsWith('moved:'));
  const moved = layout.missing.filter((m) => m.startsWith('moved:'));
  const required = [
    { id: 'PG-HEADINGS', pass: missing.length === 0, detail: missing.length ? `${missing.length} heading(s) not found in the PDF: ${missing.slice(0, 5).join('; ')}` : 'Every section and unit heading found in the PDF' },
    { id: 'PG-CONVERGED', pass: moved.length === 0, detail: moved.length ? `Page map did not converge within the layout passes: ${moved.slice(0, 5).join('; ')}` : `Page map stable after ${layout.passes} pass(es)` },
    { id: 'PG-CONTENTS', pass: !hasContentsPage || layout.contentsComplete, detail: hasContentsPage ? (layout.contentsComplete ? 'Contents page numbers match the final PDF' : 'Contents page numbers not verified') : 'No contents page in this product' }
  ];
  const advisory = [
    ...(layout.sparsePages.length ? [{ id: 'PA-SPARSE', detail: `Near-empty page(s): ${layout.sparsePages.join(', ')}` }] : []),
    ...(layout.breakBefore.length ? [{ id: 'PA-BREAKS', detail: `${layout.breakBefore.length} heading(s) moved to a new page to avoid stranding` }] : [])
  ];
  return { pass: required.every((g) => g.pass), required, advisory };
}

export type RevisedArtefacts = {
  pdf: Buffer;
  workbook: { bytes: Buffer; sha256: string; fileName: string; mimeType: string; sheets: { name: string; rows: number; columns: number }[] } | null;
  manuscript: string;
  validation: ManuscriptValidation;
  factPack: RevisedFactPack;
  plan: RevisedStoryPlan;
  provenance: Record<string, unknown>;
  auditPackage: Record<string, unknown>;
  gates: PublicationGates;
  ai: { requestedModel: string; models: RevisedModelPlan; resumedFrom: 'repair' | 'compose' | null; repairUsed: boolean; provider: string | null; model: string | null; usage: unknown; latencyMs: number; calls: number; callIds: string[]; firstPass: { pass: boolean; blocking: number; words: number | null } };
};

/** Checkpoint hook supplied by the caller (manual-generation.ts), which knows the order, attempt and store. */
export type CheckpointWriter = (cp: { stage: 'drafted' | 'validated'; factPackDigest: string; manuscript: string; auditPackage: Record<string, unknown> }) => Promise<void>;

const dateLabel = (d: Date) => d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Johannesburg' });

export async function produceRevisedArtefacts(input: {
  order: RevisedOrderContext;
  reportReference: string;
  versionNumber: number;
  /** Required: every paid call is reserved here first. */
  accounting: CallAccounting;
  /** Required: the validated manuscript and its audit package are stored through this before anything is composed. */
  checkpoint: CheckpointWriter;
  writer?: ManuscriptWriter;
  now?: Date;
  /** Epoch ms by which the artefacts must be ready for storage and finalisation. */
  deadlineAt?: number;
  /** The order's stored checkpoints on this bound input; a retry resumes from the latest usable one on the same Fact Pack. */
  history: StoredCheckpoint[];
  /** 'fresh' for a new version (operator "Create New Version"): the writer drafts it and nothing stored is reused. */
  resumeMode?: ResumeMode;
  /** Test seam: the clock used for the deadline. */
  clock?: () => number;
  /** Test seam: the bound session replay (defaults to the review store). */
  replay?: typeof replayStoredSession;
  /** Test seam: the layout (defaults to the hosted multi-pass layout). */
  layout?: typeof layoutPublication;
}): Promise<RevisedArtefacts> {
  const { order } = input;
  const now = input.now ?? new Date();

  // 1. The bound answers, rebuilt from the stored log.
  const live = await (input.replay ?? replayStoredSession)(order.binding.sessionId, order.binding.actionCount);
  const staged = buildStagedReportInput(live);
  const inputDigest = canonicalDigest(staged);
  if (inputDigest !== order.binding.inputDigest || staged.lineage.logDigest !== order.binding.logDigest) {
    throw new RevisedGenerationError('answers_changed_since_binding', 'The stored answers no longer reproduce the bound report input. No report was produced.', {
      expectedInputDigest: order.binding.inputDigest, actualInputDigest: inputDigest,
      expectedLogDigest: order.binding.logDigest, actualLogDigest: staged.lineage.logDigest
    });
  }

  // 2. Analysis, Fact Pack and Story Plan. No figure: the revised method is unapproved.
  const report = buildRevisedReport(staged);
  const position = positionStatements(report, { score: null }).map((p) => p.key === 'calculated'
    ? { ...p, label: 'Score', value: 'Not issued', text: 'No score is calculated. The revised scoring method has not been approved by MK, so this report issues no score, maturity level or band.' }
    : p);
  const product = order.product;
  const factPack = buildRevisedFactPack({
    report, product, organisationName: order.organisationName, assessmentReference: order.assessmentReference,
    generatedAt: now.toISOString(), profile: staged.profile.map((p: any) => ({ id: p.id, label: p.label, value: p.value })), position,
    figure: { overall: null, areas: [], label: 'No score issued: the revised method is not approved by MK.' }
  });
  const plan = buildRevisedStoryPlan(factPack);
  const brief = renderWriterBrief(factPack, plan, { editionLabel: 'RESTRICTED TEST: answers entered through the test deployment; revised method not approved; no score issued.' });
  const fpDigest = factPackContentDigest(factPack);
  const versions = {
    pipeline: REVISED_LIVE_PIPELINE_VERSION, model: REVISED_REPORT_MODEL_VERSION, factPack: REVISED_FACT_PACK_VERSION, storyPlan: REVISED_STORY_PLAN_VERSION,
    validator: MANUSCRIPT_VALIDATOR_VERSION, composer: REVISED_COMPOSER_VERSION, layout: PUBLICATION_LAYOUT_VERSION, workbook: BIBLE_WORKBOOK_VERSION,
    accounting: REVISED_ACCOUNTING_VERSION, checkpoints: CHECKPOINT_VERSION
  };
  const boundInput = { inputContract: `${STAGED_REPORT_INPUT_CONTRACT.name}@${STAGED_REPORT_INPUT_CONTRACT.version}`, inputDigest, logDigest: staged.lineage.logDigest, actionCount: order.binding.actionCount, sessionId: order.binding.sessionId, orderReference: order.orderReference, assessmentReference: order.assessmentReference };

  // 3. The manuscript. Every paid call is reserved in the ledger before it is made and settled afterwards; a resumed
  // attempt starts from the last stored checkpoint on the same Fact Pack.
  const models = revisedModelPlan();
  const writer = input.writer ?? gatewayManuscriptWriter;
  const clock = input.clock ?? Date.now;
  const deadlineAt = input.deadlineAt ?? clock() + REVISED_TIME_BUDGET.totalMs;
  const resume: RevisedResumePoint | null = resumeFrom(input.history, fpDigest, input.resumeMode ?? 'resume');
  const callIds: string[] = [];
  let calls = 0;
  const REFUSAL_CODE = { order_ceiling_reached: 'call_ceiling_reached', campaign_budget_missing: 'campaign_budget_missing', campaign_calls_exhausted: 'campaign_budget_exhausted', campaign_cost_exhausted: 'campaign_budget_exhausted', cost_not_bounded: 'cost_not_bounded', accounting_unavailable: 'accounting_unavailable' } as const;
  const call = async (stage: 'writer' | 'repair', model: string, prompt: string, maxOutputTokens: number, minMs: number) => {
    const available = deadlineAt - clock() - REVISED_TIME_BUDGET.reserveAfterWritingMs;
    if (available < minMs) throw new RevisedGenerationError('time_budget_exhausted', REVISED_OPERATOR_GUIDANCE.time_budget_exhausted, { stage, calls, availableMs: Math.max(0, available), requiredMs: minMs });
    const reservedCostUsd = worstCaseCostUsd(model, WRITER_SYSTEM.length + prompt.length, maxOutputTokens);
    if (reservedCostUsd === null) throw new RevisedGenerationError('cost_not_bounded', REVISED_OPERATOR_GUIDANCE.cost_not_bounded, { stage, model, calls });
    let reservation;
    try {
      reservation = await input.accounting.reserve({ stage, model, maxOutputTokens, reservedCostUsd });
    } catch (error) {
      const reason = error instanceof AccountingRefusal ? error.reason : 'accounting_unavailable';
      const code = REFUSAL_CODE[reason];
      throw new RevisedGenerationError(code, REVISED_OPERATOR_GUIDANCE[code], { stage, model, calls, refusal: reason, ...(error instanceof AccountingRefusal ? { ledger: error.detail } : {}) });
    }
    callIds.push(reservation.callId);
    calls += 1;
    try {
      const out = await writer({ system: WRITER_SYSTEM, prompt, model, fallbackModels: [], signal: AbortSignal.timeout(Math.min(available, REVISED_TIME_BUDGET.maxCallMs)), maxOutputTokens });
      await input.accounting.settle(reservation.callId, 'succeeded', out.usage, costFromUsage(model, out.usage));
      return out;
    } catch (error) {
      const timeout = error instanceof Error && /abort|timeout/i.test(`${error.name} ${error.message}`);
      // The outcome of a failed or timed-out call is unknown to us: it stays charged at its worst case.
      await input.accounting.settle(reservation.callId, timeout ? 'indeterminate' : 'failed', null, null);
      throw new RevisedGenerationError(timeout ? 'provider_timeout' : 'provider_failed', timeout ? REVISED_OPERATOR_GUIDANCE.provider_timeout : REVISED_OPERATOR_GUIDANCE.provider_failed, {
        stage, models, calls, callIds, error: error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 300) : 'unknown'
      });
    }
  };

  let written: Awaited<ReturnType<ManuscriptWriter>>;
  if (resume) {
    written = { text: resume.manuscript, provider: resume.meta.provider, model: resume.meta.model, usage: null, latencyMs: 0 };
  } else {
    written = await call('writer', models.writer, brief, MAX_OUTPUT_TOKENS.writer, REVISED_TIME_BUDGET.minWriterMs);
    written = { ...written, text: normaliseManuscriptLayout(written.text) };
  }
  let validation = validateManuscript(written.text, factPack, plan);
  const gate = lengthGateMode();
  let acceptance = accept(validation, product, gate);
  const firstPass = resume?.meta.firstPass ?? { pass: acceptance.pass, blocking: acceptance.issues.length, words: validation.stats?.words ?? null };
  if (resume?.stage === 'compose' && !acceptance.pass) {
    // A validated manuscript that no longer passes on the rebuilt Fact Pack is never composed.
    throw new RevisedGenerationError('manuscript_rejected', REVISED_OPERATOR_GUIDANCE.manuscript_rejected, { stage: 'resume_validation', calls, blocking: acceptance.issues.map((i) => `${i.code}@${i.section}:${i.line}`).slice(0, 30) });
  }
  if (!acceptance.pass && calls < REVISED_PROVIDER_CALL_CEILING) {
    // Keep the draft so that a retry can repair it rather than write it again. A failure to store it costs only that
    // convenience; it is recorded and the attempt continues.
    if (!resume) {
      await input.checkpoint({ stage: 'drafted', factPackDigest: fpDigest, manuscript: written.text, auditPackage: { resumeMeta: { provider: written.provider, model: written.model, firstPass } } })
        .catch((error) => console.warn('revised_draft_checkpoint_not_stored', { message: error instanceof Error ? error.message : 'unknown' }));
    }
    // One repair: the same writer receives its manuscript and the validator's exact issues. Not a template fallback:
    // the writer still writes every word, and the result faces the same validator.
    const STRUCTURAL = new Set(['UNITS', 'STRUCTURE', 'HEADING-MISSING', 'EXHIBIT-MISSING']);
    const surgical = acceptance.issues.every((i) => i.line > 0 && !STRUCTURAL.has(i.code)) && acceptance.issues.length <= 60;
    let repaired: Awaited<ReturnType<ManuscriptWriter>>;
    if (surgical) {
      const { prompt, lines } = lineRepairPrompt(brief, written.text, acceptance);
      const reply = await call('repair', models.repair, prompt, MAX_OUTPUT_TOKENS.repairLines, REVISED_TIME_BUDGET.minRepairMs);
      repaired = { ...reply, text: normaliseManuscriptLayout(applyLineRepair(written.text, lines, reply.text) ?? written.text) };
    } else {
      const reply = await call('repair', models.repair, repairPrompt(brief, written.text, acceptance), MAX_OUTPUT_TOKENS.repairFull, REVISED_TIME_BUDGET.minRepairMs);
      repaired = { ...reply, text: normaliseManuscriptLayout(reply.text) };
    }
    written = { ...repaired, usage: { first: written.usage, repair: repaired.usage }, latencyMs: written.latencyMs + repaired.latencyMs };
    validation = validateManuscript(written.text, factPack, plan);
    acceptance = accept(validation, product, gate);
  }
  const ai = { requestedModel: models.writer, models, resumedFrom: resume?.stage ?? null, repairUsed: calls > 1 || resume?.stage === 'repair', provider: written.provider, model: written.model, usage: written.usage, latencyMs: written.latencyMs, calls, callIds, firstPass };
  if (!acceptance.pass) {
    throw new RevisedGenerationError('manuscript_rejected', 'The AI manuscript failed validation and was not composed. Retry generation.', {
      stage: 'manuscript_validation', ...ai,
      blocking: acceptance.issues.map((i) => `${i.code}@${i.section}:${i.line}`).slice(0, 30),
      words: validation.stats?.words ?? null,
      manuscriptSha256: crypto.createHash('sha256').update(written.text).digest('hex'),
      rejectedManuscript: written.text
    });
  }

  // 4. The audit package, stored before anything is composed (independent review F2). Without it no report is produced.
  const auditPackage: Record<string, unknown> = {
    schemaVersion: 'revised-audit-package-v2', versions, boundInput, manuscript: written.text, factPack, storyPlan: plan, writerBrief: brief,
    validation: { pass: validation.pass, stats: validation.stats ?? null, issues: validation.issues },
    ai: { models, calls, callIds, resumeMode: input.resumeMode ?? 'resume', resumedFrom: resume?.stage ?? null, resumedFromAttempt: resume?.fromAttempt ?? null, firstPass, provider: written.provider, model: written.model, usage: written.usage, latencyMs: written.latencyMs },
    resumeMeta: { provider: written.provider, model: written.model, firstPass },
    lengthGate: { mode: gate, shortfall: acceptance.shortfall }
  };
  // Every attempt stores its own validated checkpoint, including one resumed from an earlier attempt's manuscript.
  try {
    await input.checkpoint({ stage: 'validated', factPackDigest: fpDigest, manuscript: written.text, auditPackage });
  } catch (error) {
    throw new RevisedGenerationError('audit_unavailable', REVISED_OPERATOR_GUIDANCE.audit_unavailable, { stage: 'audit_checkpoint', ...ai, error: error instanceof Error ? error.message.slice(0, 300) : 'unknown' });
  }

  // 5. Composition and layout in the MK publication system, inside the request deadline, then the publication gates.
  const layoutAvailable = deadlineAt - clock();
  if (layoutAvailable < REVISED_TIME_BUDGET.minLayoutMs) throw new RevisedGenerationError('time_budget_exhausted', REVISED_OPERATOR_GUIDANCE.time_budget_exhausted, { stage: 'layout', calls, availableMs: Math.max(0, layoutAvailable), requiredMs: REVISED_TIME_BUDGET.minLayoutMs });
  let pdf: Buffer;
  let layout: LayoutRecord;
  try {
    ({ pdf, layout } = await (input.layout ?? layoutPublication)({ md: written.text, fp: factPack, plan, dateLabel: dateLabel(now), prototype: true, restrictedNotice: RESTRICTED_TEST_LABEL },
      { deadlineAt: deadlineAt - REVISED_TIME_BUDGET.minStoreMs, clock, minPassMs: REVISED_TIME_BUDGET.minRenderPassMs }));
  } catch (error) {
    throw new RevisedGenerationError('render_failed', REVISED_OPERATOR_GUIDANCE.render_failed, { stage: 'render', calls, callIds, resumable: 'compose', error: error instanceof Error ? error.message.slice(0, 300) : 'unknown' });
  }
  const hasContentsPage = plan.sections.some((s) => s.exhibits.includes('contents'));
  const gates = publicationGates(layout, hasContentsPage);
  if (!gates.pass) {
    throw new RevisedGenerationError('publication_held', REVISED_OPERATOR_GUIDANCE.publication_held, { stage: 'publication_gates', calls, callIds, resumable: 'compose', gates, layout: { passes: layout.passes, pages: layout.pages, missing: layout.missing } });
  }

  let workbook: RevisedArtefacts['workbook'] = null;
  if (product === 'comprehensive') {
    const built = await buildBibleWorkbook('comprehensive', report, factPack, { notice: 'RESTRICTED TEST. Answers were entered through the restricted test deployment. The revised method is not approved by MK, so no score, maturity level or band is issued. Control specifications, scenario structures and decision options are draft MK advisory content awaiting approval.' });
    workbook = {
      bytes: built.bytes, sha256: built.sha256, sheets: built.sheets,
      fileName: `${input.reportReference.replace(/[^A-Za-z0-9._-]+/g, '-')}-registers.xlsx`,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    };
  }

  const provenance = {
    pipeline: REVISED_LIVE_PIPELINE_VERSION, ...boundInput, versions,
    layout: { passes: layout.passes, pages: layout.pages, contentsComplete: layout.contentsComplete, missing: layout.missing, flowSections: layout.flowSections, breakBefore: layout.breakBefore, sparsePages: layout.sparsePages },
    publicationGates: gates,
    factPackSha256: factPack.sha256, factPackContentDigest: fpDigest,
    manuscriptSha256: crypto.createHash('sha256').update(written.text).digest('hex'),
    pdfSha256: crypto.createHash('sha256').update(pdf).digest('hex'),
    workbookSha256: workbook?.sha256 ?? null,
    validation: { pass: validation.pass, words: validation.stats?.words ?? null, warnings: validation.issues.filter((i) => !i.blocking).map((i) => i.code) },
    lengthGate: { mode: gate, shortfall: acceptance.shortfall, releaseBlocker: acceptance.shortfall ? `Manuscript of ${acceptance.shortfall.words} words is below the ${acceptance.shortfall.minimum}-word minimum; not releasable to a customer.` : null },
    scoring: 'withheld: revised method not approved',
    restricted: RESTRICTED_TEST_LABEL,
    ai
  };
  return { pdf, workbook, manuscript: written.text, validation, factPack, plan, provenance, ai, auditPackage: { ...auditPackage, provenance }, gates };
}
