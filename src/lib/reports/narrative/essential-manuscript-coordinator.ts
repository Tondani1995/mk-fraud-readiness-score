import type { NarrativeFactPack } from './fact-pack';
import type { WholeManuscriptWriter, WholeManuscriptTextResult } from './manuscript';
import { buildNarrativeStoryPlan, assertNarrativeStoryPlan } from './story-plan';
import { buildReportBlueprint, buildWholeManuscriptContext, type ReportBlueprint } from './report-blueprint';
import { buildManuscriptStructuralDiagnostics, type ManuscriptStructuralDiagnostics } from './manuscript-diagnostics';
import {
  parseBlueprintMarkdown,
  validateBlueprintTextManuscript,
  assertBlueprintTextValidation,
  type ParsedBlueprintMarkdown
} from './blueprint-text';

/**
 * The Essential production narrative path.
 *
 * Essential manual fulfilment used to call preparePremiumReportNarrative, which the v1.1
 * release boundary closed unconditionally, so no Essential report could be produced at
 * all. Every part needed to replace it already existed -- blueprint, story plan, whole
 * manuscript writer, parser, validator, recovery -- but nothing composed them at runtime.
 * This is that composition and nothing more.
 *
 * It deliberately owns no analytical judgement. The blueprint decides what must be
 * written and in what order, the writer produces prose against it, and the existing
 * validator decides whether that prose is acceptable. Scores, findings, risks, controls,
 * roadmap actions and evidence remain the deterministic pipeline's, and nothing here
 * reads a number back out of provider prose.
 */
export interface EssentialManuscriptResult {
  narrative: ParsedBlueprintMarkdown;
  blueprint: ReportBlueprint;
  manuscript: WholeManuscriptTextResult;
}

/**
 * What the attempt actually did, kept whether it succeeded or threw.
 *
 * A paid Mahlori generation consumed a provider call and left no record of it: the
 * writer's accounting rides on the returned result, so a throw discarded the call count,
 * tokens, cost, finish reason and the parse errors that explain the failure. Two calls
 * were spent before gateway billing revealed them. These diagnostics travel on the error
 * as well as the result so the next failure is explicable without buying another one.
 */
export interface EssentialManuscriptDiagnostics {
  stage: string;
  requestedModel?: string;
  requestedProvider?: string;
  dispatchOccurred: boolean;
  generationId?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  providerCostMicros?: number;
  finishReason?: string;
  providerFinishReason?: string;
  providerCalls?: number;
  parseOk?: boolean;
  parseErrors?: Array<{ code: string; path: string }>;
  validationCode?: string;
  /** Heading-level evidence for a manuscript that would not bind. */
  structural?: ManuscriptStructuralDiagnostics;
}

export class EssentialManuscriptError extends Error {
  readonly stage: string;
  readonly diagnostics: EssentialManuscriptDiagnostics;

  constructor(stage: string, message: string, diagnostics?: Partial<EssentialManuscriptDiagnostics>) {
    super(message);
    this.name = 'EssentialManuscriptError';
    this.stage = stage;
    this.diagnostics = { stage, dispatchOccurred: false, ...diagnostics };
  }
}

function diagnosticsFrom(stage: string, writer: { provider?: string; model?: string }, manuscript?: { writerMetadata?: any }): EssentialManuscriptDiagnostics {
  const meta = manuscript?.writerMetadata ?? {};
  return {
    stage,
    requestedProvider: writer.provider,
    requestedModel: writer.model,
    dispatchOccurred: Boolean(manuscript),
    generationId: meta.generationId ?? meta.responseId,
    inputTokens: meta.inputTokens,
    outputTokens: meta.outputTokens,
    totalTokens: meta.totalTokens,
    providerCostMicros: meta.providerCostMicros,
    finishReason: meta.finishReason,
    providerFinishReason: meta.providerFinishReason,
    providerCalls: meta.recovery?.totalCalls
  };
}

export async function composeEssentialManuscript(input: {
  factPack: NarrativeFactPack;
  writer: WholeManuscriptWriter;
}): Promise<EssentialManuscriptResult> {
  const { factPack, writer } = input;

  const plan = buildNarrativeStoryPlan(factPack);
  assertNarrativeStoryPlan(plan, factPack);

  const blueprint = buildReportBlueprint(factPack, plan);
  const context = buildWholeManuscriptContext(factPack, blueprint);

  const writerIdentity = writer as unknown as { provider?: string; model?: string };
  let manuscript: WholeManuscriptTextResult;
  try {
    manuscript = await writer.writeManuscript({ context, factPack, blueprint });
  } catch (error) {
    // The writer may already have dispatched -- and been billed -- before throwing, so the
    // failure is recorded as a dispatch of unknown outcome rather than as no call at all.
    throw new EssentialManuscriptError(
      'write_manuscript',
      error instanceof Error ? error.message : 'The manuscript writer failed.',
      { ...diagnosticsFrom('write_manuscript', writerIdentity), dispatchOccurred: true }
    );
  }

  // The blueprint the writer echoes back is the one it actually wrote against. Parsing
  // against anything else would risk attaching prose to the wrong node.
  const authoritativeBlueprint = manuscript.blueprint ?? blueprint;

  const narrative = parseBlueprintMarkdown(manuscript.markdown, authoritativeBlueprint);
  if (!narrative.ok) {
    // Structural ambiguity fails closed rather than guessing which node prose belongs to.
    throw new EssentialManuscriptError(
      'parse_manuscript',
      `The manuscript could not be resolved against the blueprint (${narrative.errors.map((issue) => `${issue.code}:${issue.path}`).join(', ')}).`,
      {
        ...diagnosticsFrom('parse_manuscript', writerIdentity, manuscript),
        parseOk: false,
        parseErrors: narrative.errors.map((issue) => ({ code: issue.code, path: issue.path })),
        structural: buildManuscriptStructuralDiagnostics({
          markdown: manuscript.markdown, blueprint: authoritativeBlueprint, parsed: narrative
        })
      }
    );
  }

  const report = validateBlueprintTextManuscript(narrative, authoritativeBlueprint, factPack);
  try {
    assertBlueprintTextValidation(report);
  } catch (error) {
    throw new EssentialManuscriptError(
      'validate_manuscript',
      error instanceof Error ? error.message : 'The manuscript failed validation.',
      { ...diagnosticsFrom('validate_manuscript', writerIdentity, manuscript), parseOk: true, validationCode: (report as any)?.issues?.[0]?.code }
    );
  }

  return { narrative, blueprint: authoritativeBlueprint, manuscript };
}
