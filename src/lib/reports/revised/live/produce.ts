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
import { composeRevisedReportHtml, REVISED_COMPOSER_VERSION } from '../manuscript/compose';
import { renderPublicationPdf } from '../manuscript/render';
import { buildBibleWorkbook, BIBLE_WORKBOOK_VERSION } from '../manuscript/workbook-bible';
import type { RevisedOrderContext } from './order';

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

export const REVISED_LIVE_PIPELINE_VERSION = 'revised-live-pipeline-0.1';
/** One writing call, plus at most one repair call that returns the validator's exact issues to the writer. */
export const REVISED_PROVIDER_CALL_CEILING = 2;

const WRITER_SYSTEM = [
  'You are the MK Fraud Insights report writer. Follow the writer contract in the brief exactly. Your output is checked by an automatic validator; any breach of the format rules below rejects the whole manuscript.',
  '',
  'FORMAT RULES (mandatory):',
  '1. Start every planned section with its marker line `<!-- section: ID -->` and keep the planned order; then `# ` and a heading that states a claim.',
  '2. Inside a section, write one `## ` heading per planned unit, exactly as many units as the plan lists, each heading a claim.',
  '3. After EVERY paragraph, on its own line, write `<!-- refs: REF, REF -->` naming the Fact Pack refs the paragraph relies on. A paragraph without this line is rejected.',
  '4. Never type a number, count or percentage, in digits or in words. Insert every figure as a slot: `[[REF]]` for the value or `[[REF|w]]` for a number in words. Headings follow the same rule.',
  '5. Never write an internal reference in the prose: no FINDING-…, PATHWAY-…, THEME-…, PRIORITY-…, BLUEPRINT-…, DECISION-…, STAGE-…, MEASURE-…, POSITION-…, AREA-… and no question codes such as D6-P-09. Refs appear only inside `<!-- refs: -->` comments and `[[...]]` slots.',
  '6. Place each planned exhibit on its own line exactly as written in the plan, for example `[[exhibit:contents]]`.',
  '7. Only refs listed in the brief\'s "Facts (insert as slots)" table may appear inside [[ ]]. Theme, finding, pathway, priority, blueprint, decision, stage, measure, role, area, legal and position refs are NEVER slots: describe them in words and cite them only in the <!-- refs: --> comment. Write [[N-AREAS|w]], never "ten areas"; write a stage as "within the first ninety days" only if the brief gives that wording, otherwise "in the proposed first stage".',
  '9. Never rank or grade risks: no MK prioritisation method is approved. Do not write "matters most", "where it matters most", "most material", "material exposure", "highest priority", "high priority", "top priority", "critical risk", "most important risk", "the biggest risk" or "most serious". Say "the controls this report sets out first" instead.',
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

export class RevisedGenerationError extends Error {
  readonly code: 'answers_changed_since_binding' | 'provider_failed' | 'manuscript_rejected' | 'render_failed';
  readonly diagnostics: Record<string, unknown>;
  constructor(code: RevisedGenerationError['code'], message: string, diagnostics: Record<string, unknown> = {}) {
    super(message);
    this.name = 'RevisedGenerationError';
    this.code = code;
    this.diagnostics = diagnostics;
  }
}

export type ManuscriptWriter = (input: { system: string; prompt: string; model: string; fallbackModels: readonly string[]; effort?: 'low' }) => Promise<{
  text: string; provider: string | null; model: string | null; usage: Record<string, unknown> | null; latencyMs: number;
}>;

/** The production writer: one call through the Vercel AI Gateway (OIDC on Vercel, or AI_GATEWAY_API_KEY). */
export const gatewayManuscriptWriter: ManuscriptWriter = async ({ system, prompt, model, effort }) => {
  const { generateText } = await import('ai');
  const started = Date.now();
  const result: any = await generateText({
    model,
    system,
    prompt,
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(200_000),
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

export type RevisedArtefacts = {
  pdf: Buffer;
  workbook: { bytes: Buffer; sha256: string; fileName: string; mimeType: string; sheets: { name: string; rows: number; columns: number }[] } | null;
  manuscript: string;
  validation: ManuscriptValidation;
  factPack: RevisedFactPack;
  plan: RevisedStoryPlan;
  provenance: Record<string, unknown>;
  ai: { requestedModel: string; models: RevisedModelPlan; repairUsed: boolean; provider: string | null; model: string | null; usage: unknown; latencyMs: number; calls: number; firstPass: { pass: boolean; blocking: number; words: number | null } };
};

const dateLabel = (d: Date) => d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Johannesburg' });

export async function produceRevisedArtefacts(input: {
  order: RevisedOrderContext;
  reportReference: string;
  versionNumber: number;
  writer?: ManuscriptWriter;
  now?: Date;
}): Promise<RevisedArtefacts> {
  const { order } = input;
  const now = input.now ?? new Date();

  // 1. The bound answers, rebuilt from the stored log.
  const live = await replayStoredSession(order.binding.sessionId, order.binding.actionCount);
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

  // 3. One manuscript from the configured model. No fallback content.
  const models = revisedModelPlan();
  const writer = input.writer ?? gatewayManuscriptWriter;
  let written: Awaited<ReturnType<ManuscriptWriter>>;
  try {
    written = await writer({ system: WRITER_SYSTEM, prompt: brief, model: models.writer, fallbackModels: [] });
    written = { ...written, text: normaliseManuscriptLayout(written.text) };
  } catch (error) {
    throw new RevisedGenerationError('provider_failed', 'The AI manuscript service did not return a manuscript. Nothing was composed; retry generation.', {
      stage: 'writer', requestedModel: models.writer, models, providerCalls: 1,
      error: error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 300) : 'unknown'
    });
  }
  let calls = 1;
  let validation = validateManuscript(written.text, factPack, plan);
  const gate = lengthGateMode();
  let acceptance = accept(validation, product, gate);
  const firstPass = { pass: acceptance.pass, blocking: acceptance.issues.length, words: validation.stats?.words ?? null };
  if (!acceptance.pass && calls < REVISED_PROVIDER_CALL_CEILING) {
    // One repair: the same writer receives its manuscript and the validator's exact issues. Not a template fallback:
    // the writer still writes every word, and the result faces the same validator.
    let repaired: Awaited<ReturnType<ManuscriptWriter>>;
    const surgical = acceptance.issues.every((i) => i.line > 0) && acceptance.issues.length <= 60;
    try {
      if (surgical) {
        const { prompt, lines } = lineRepairPrompt(brief, written.text, acceptance);
        const reply = await writer({ system: WRITER_SYSTEM, prompt, model: models.repair, fallbackModels: [] });
        const patched = applyLineRepair(written.text, lines, reply.text);
        repaired = { ...reply, text: normaliseManuscriptLayout(patched ?? written.text) };
      } else {
        repaired = await writer({ system: WRITER_SYSTEM, prompt: repairPrompt(brief, written.text, acceptance), model: models.repair, fallbackModels: [] });
        repaired = { ...repaired, text: normaliseManuscriptLayout(repaired.text) };
      }
    } catch (error) {
      throw new RevisedGenerationError('provider_failed', 'The AI manuscript service did not return a repaired manuscript. Nothing was composed; retry generation.', {
        stage: 'repair', requestedModel: models.repair, models, providerCalls: 2, firstPass,
        error: error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 300) : 'unknown', rejectedManuscript: written.text
      });
    }
    calls += 1;
    const usage = { first: written.usage, repair: repaired.usage };
    written = { ...repaired, usage, latencyMs: written.latencyMs + repaired.latencyMs };
    validation = validateManuscript(written.text, factPack, plan);
    acceptance = accept(validation, product, gate);
  }
  const ai = { requestedModel: models.writer, models, repairUsed: calls > 1, provider: written.provider, model: written.model, usage: written.usage, latencyMs: written.latencyMs, calls, firstPass };
  if (!acceptance.pass) {
    throw new RevisedGenerationError('manuscript_rejected', 'The AI manuscript failed validation and was not composed. Retry generation.', {
      stage: 'manuscript_validation', ...ai,
      blocking: acceptance.issues.map((i) => `${i.code}@${i.section}:${i.line}`).slice(0, 30),
      words: validation.stats?.words ?? null,
      manuscriptSha256: crypto.createHash('sha256').update(written.text).digest('hex'),
      rejectedManuscript: written.text
    });
  }

  // 4. Composition and rendering in the MK publication system, labelled as a restricted test.
  let pdf: Buffer;
  try {
    const { html } = composeRevisedReportHtml({ md: written.text, fp: factPack, plan, dateLabel: dateLabel(now), prototype: true, restrictedNotice: RESTRICTED_TEST_LABEL });
    pdf = (await renderPublicationPdf(html)).pdf;
  } catch (error) {
    throw new RevisedGenerationError('render_failed', 'The PDF could not be rendered.', { stage: 'render', error: error instanceof Error ? error.message.slice(0, 300) : 'unknown' });
  }

  let workbook: RevisedArtefacts['workbook'] = null;
  if (product === 'comprehensive') {
    const built = await buildBibleWorkbook('comprehensive', report, factPack);
    workbook = {
      bytes: built.bytes, sha256: built.sha256, sheets: built.sheets,
      fileName: `${input.reportReference.replace(/[^A-Za-z0-9._-]+/g, '-')}-registers.xlsx`,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    };
  }

  const provenance = {
    pipeline: REVISED_LIVE_PIPELINE_VERSION,
    inputContract: `${STAGED_REPORT_INPUT_CONTRACT.name}@${STAGED_REPORT_INPUT_CONTRACT.version}`,
    inputDigest, logDigest: staged.lineage.logDigest, actionCount: order.binding.actionCount, sessionId: order.binding.sessionId,
    versions: { model: REVISED_REPORT_MODEL_VERSION, factPack: REVISED_FACT_PACK_VERSION, storyPlan: REVISED_STORY_PLAN_VERSION, validator: MANUSCRIPT_VALIDATOR_VERSION, composer: REVISED_COMPOSER_VERSION, workbook: BIBLE_WORKBOOK_VERSION },
    factPackSha256: factPack.sha256,
    manuscriptSha256: crypto.createHash('sha256').update(written.text).digest('hex'),
    pdfSha256: crypto.createHash('sha256').update(pdf).digest('hex'),
    workbookSha256: workbook?.sha256 ?? null,
    validation: { pass: validation.pass, words: validation.stats?.words ?? null, warnings: validation.issues.filter((i) => !i.blocking).map((i) => i.code) },
    lengthGate: { mode: gate, shortfall: acceptance.shortfall, releaseBlocker: acceptance.shortfall ? `Manuscript of ${acceptance.shortfall.words} words is below the ${acceptance.shortfall.minimum}-word minimum; not releasable to a customer.` : null },
    scoring: 'withheld: revised method not approved',
    restricted: RESTRICTED_TEST_LABEL,
    ai
  };
  return { pdf, workbook, manuscript: written.text, validation, factPack, plan, provenance, ai };
}
