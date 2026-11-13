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
export const REVISED_PROVIDER_CALL_CEILING = 1;

const WRITER_SYSTEM = 'You are the MK Fraud Insights report writer. Follow the writer contract in the brief exactly: write only the planned sections in order, in Markdown, with a claim heading for each section and unit, every paragraph followed by its <!-- refs: ... --> comment, every figure as a [[REF]] slot from the Fact Pack, and exhibits placed by name. Use South African English, connected advisory paragraphs and no em dashes. Never invent a fact, figure, owner, priority, control condition or assurance claim.';

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
  ai: { requestedModel: string; provider: string | null; model: string | null; usage: Record<string, unknown> | null; latencyMs: number; calls: number };
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
  const ai = { requestedModel: selection.requestedModel, provider: written.provider, model: written.model, usage: written.usage, latencyMs: written.latencyMs, calls: REVISED_PROVIDER_CALL_CEILING };
  const validation = validateManuscript(written.text, factPack, plan);
  if (!validation.pass) {
    throw new RevisedGenerationError('manuscript_rejected', 'The AI manuscript failed validation and was not composed. Retry generation.', {
      stage: 'manuscript_validation', ...ai,
      blocking: validation.issues.filter((i) => i.blocking).map((i) => `${i.code}@${i.section}:${i.line}`).slice(0, 30),
      words: validation.stats?.words ?? null,
      manuscriptSha256: crypto.createHash('sha256').update(written.text).digest('hex')
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
