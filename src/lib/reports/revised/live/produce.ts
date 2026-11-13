import crypto from 'node:crypto';
import { canonicalDigest } from '@/lib/readiness-review/canonical';
import { buildStagedReportInput, STAGED_REPORT_INPUT_CONTRACT } from '@/lib/readiness-review/report-input';
import { replayStoredSession } from '@/lib/readiness-review/service';
import { RESTRICTED_TEST_LABEL } from '@/lib/readiness-review/commercial-environment';
import { selectNarrativeModel } from '@/lib/reports/ai-model-policy';
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
  '7. Never use internal process words in the prose: not "fact pack", "story plan", "the engine", "recorded condition", "hard gate" or "the model". Say "the organisation\'s answers" or "this assessment" instead.',
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

/** Minimum words a manuscript must reach to be composed; well below the writer's targets, above a thin draft. */
export const MINIMUM_WORDS: Record<'essential' | 'comprehensive', number> = { essential: 3000, comprehensive: 3800 };

type Acceptance = { pass: boolean; issues: { code: string; section: string; line: number; detail: string }[] };
function accept(validation: ManuscriptValidation, product: 'essential' | 'comprehensive'): Acceptance {
  const issues = validation.issues.filter((i) => i.blocking).map((i) => ({ code: i.code, section: i.section, line: i.line, detail: i.detail }));
  const words = Number(validation.stats?.words ?? 0);
  if (words < MINIMUM_WORDS[product]) issues.push({ code: 'TOO-SHORT', section: 'all', line: 0, detail: `The manuscript has ${words} words; it must have at least ${MINIMUM_WORDS[product]} and should reach the length the format rules set. Develop every unit to the paragraph counts given.` });
  return { pass: issues.length === 0, issues };
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

export type ManuscriptWriter = (input: { system: string; prompt: string; model: string; fallbackModels: readonly string[] }) => Promise<{
  text: string; provider: string | null; model: string | null; usage: Record<string, unknown> | null; latencyMs: number;
}>;

/** The production writer: one call through the Vercel AI Gateway (OIDC on Vercel, or AI_GATEWAY_API_KEY). */
export const gatewayManuscriptWriter: ManuscriptWriter = async ({ system, prompt, model, fallbackModels }) => {
  const { generateText } = await import('ai');
  const started = Date.now();
  const result: any = await generateText({
    model,
    system,
    prompt,
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(200_000),
    providerOptions: { gateway: { order: [model, ...fallbackModels] } } as any
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
  ai: { requestedModel: string; provider: string | null; model: string | null; usage: unknown; latencyMs: number; calls: number; firstPass: { pass: boolean; blocking: number; words: number | null } };
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
  const selection = selectNarrativeModel();
  const writer = input.writer ?? gatewayManuscriptWriter;
  let written: Awaited<ReturnType<ManuscriptWriter>>;
  try {
    written = await writer({ system: WRITER_SYSTEM, prompt: brief, model: selection.requestedModel, fallbackModels: selection.fallbackModels });
  } catch (error) {
    throw new RevisedGenerationError('provider_failed', 'The AI manuscript service did not return a manuscript. Nothing was composed; retry generation.', {
      stage: 'writer', requestedModel: selection.requestedModel, providerCalls: 1,
      error: error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 300) : 'unknown'
    });
  }
  let calls = 1;
  let validation = validateManuscript(written.text, factPack, plan);
  let acceptance = accept(validation, product);
  const firstPass = { pass: acceptance.pass, blocking: acceptance.issues.length, words: validation.stats?.words ?? null };
  if (!acceptance.pass && calls < REVISED_PROVIDER_CALL_CEILING) {
    // One repair: the same writer receives its manuscript and the validator's exact issues. Not a template fallback:
    // the writer still writes every word, and the result faces the same validator.
    let repaired: Awaited<ReturnType<ManuscriptWriter>>;
    try {
      repaired = await writer({ system: WRITER_SYSTEM, prompt: repairPrompt(brief, written.text, acceptance), model: selection.requestedModel, fallbackModels: selection.fallbackModels });
    } catch (error) {
      throw new RevisedGenerationError('provider_failed', 'The AI manuscript service did not return a repaired manuscript. Nothing was composed; retry generation.', {
        stage: 'repair', requestedModel: selection.requestedModel, providerCalls: 2, firstPass,
        error: error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 300) : 'unknown', rejectedManuscript: written.text
      });
    }
    calls += 1;
    const usage = { first: written.usage, repair: repaired.usage };
    written = { ...repaired, usage, latencyMs: written.latencyMs + repaired.latencyMs };
    validation = validateManuscript(written.text, factPack, plan);
    acceptance = accept(validation, product);
  }
  const ai = { requestedModel: selection.requestedModel, provider: written.provider, model: written.model, usage: written.usage, latencyMs: written.latencyMs, calls, firstPass };
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
    scoring: 'withheld: revised method not approved',
    restricted: RESTRICTED_TEST_LABEL,
    ai
  };
  return { pdf, workbook, manuscript: written.text, validation, factPack, plan, provenance, ai };
}
