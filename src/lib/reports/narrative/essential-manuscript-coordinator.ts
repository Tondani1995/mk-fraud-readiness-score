import type { NarrativeFactPack } from './fact-pack';
import type { WholeManuscriptWriter, WholeManuscriptTextResult } from './manuscript';
import { buildNarrativeStoryPlan, assertNarrativeStoryPlan } from './story-plan';
import { buildReportBlueprint, buildWholeManuscriptContext, type ReportBlueprint } from './report-blueprint';
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

export class EssentialManuscriptError extends Error {
  readonly stage: string;

  constructor(stage: string, message: string) {
    super(message);
    this.name = 'EssentialManuscriptError';
    this.stage = stage;
  }
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

  let manuscript: WholeManuscriptTextResult;
  try {
    manuscript = await writer.writeManuscript({ context, factPack, blueprint });
  } catch (error) {
    throw new EssentialManuscriptError('write_manuscript', error instanceof Error ? error.message : 'The manuscript writer failed.');
  }

  // The blueprint the writer echoes back is the one it actually wrote against. Parsing
  // against anything else would risk attaching prose to the wrong node.
  const authoritativeBlueprint = manuscript.blueprint ?? blueprint;

  const narrative = parseBlueprintMarkdown(manuscript.markdown, authoritativeBlueprint);
  if (!narrative.ok) {
    // Structural ambiguity fails closed rather than guessing which node prose belongs to.
    throw new EssentialManuscriptError(
      'parse_manuscript',
      `The manuscript could not be resolved against the blueprint (${narrative.errors.map((issue) => `${issue.code}:${issue.path}`).join(', ')}).`
    );
  }

  const report = validateBlueprintTextManuscript(narrative, authoritativeBlueprint, factPack);
  assertBlueprintTextValidation(report);

  return { narrative, blueprint: authoritativeBlueprint, manuscript };
}
