import fs from 'node:fs/promises';
import path from 'node:path';

import { classifyAssuranceLanguage } from './validation';
import { classifyNarrativeRecoveryIssue } from './validation-severity';
import { MAX_FULL_REGENERATIONS, recoveryDecision, type NarrativeRecoveryBudget } from './recovery-policy';
import { parseBlueprintMarkdown, validateBlueprintTextManuscript, type ParsedBlueprintMarkdown, type TextFirstValidationReport } from './blueprint-text';
import type { NarrativeFactPack } from './fact-pack';
import type { ReportBlueprint, WholeManuscriptWriterContext } from './report-blueprint';
import type { WholeManuscriptTextResult, WholeManuscriptWriter, WholeManuscriptRepairInput } from './manuscript';

export interface WholeManuscriptRecoveryValidation {
  parsed: ParsedBlueprintMarkdown;
  validation: TextFirstValidationReport;
}

export interface WholeManuscriptRecoveryInput {
  writer: WholeManuscriptWriter;
  context: WholeManuscriptWriterContext;
  blueprint: ReportBlueprint;
  factPack: NarrativeFactPack;
  initialResult: WholeManuscriptTextResult;
  attemptIdentity: string;
  diagnosticsRootDirectory: string;
  regenerate?: () => Promise<WholeManuscriptTextResult>;
  escalateQuality?: () => Promise<WholeManuscriptTextResult>;
  runCoherence?: boolean;
}

export interface WholeManuscriptRecoveryResult {
  markdown: string;
  parsed: ParsedBlueprintMarkdown;
  validation: TextFirstValidationReport;
  writerMetadata: WholeManuscriptTextResult['writerMetadata'];
  recovery: NarrativeRecoveryBudget;
  repairRecords: Array<{ attempt: number; scope: string; path: string; code: string; matchedPhrase?: string }>;
  rejectedCandidateDirectories: string[];
  coherenceUsed: boolean;
}

export class WholeManuscriptRecoveryError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'WholeManuscriptRecoveryError';
    this.code = code;
    this.details = details;
  }
}

function safe(value: unknown): unknown {
  if (typeof value === 'string') {
    return value
      .replace(/(AI_GATEWAY_API_KEY|OPENAI_API_KEY|VERCEL_AI_GATEWAY_API_KEY)\s*=\s*[^\s,;]+/gi, '$1=<REDACTED>')
      .replace(/\bsk-[A-Za-z0-9_-]{20,}\b/g, '<REDACTED_VENDOR_KEY>');
  }
  if (Array.isArray(value)) return value.map(safe);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, safe(child)]));
  return value;
}

export async function persistWholeManuscriptRejectedCandidate(input: {
  rootDirectory: string;
  attemptIdentity: string;
  candidate: WholeManuscriptTextResult;
  parsed: ParsedBlueprintMarkdown;
  validation: TextFirstValidationReport;
  failurePaths: string[];
  matchedPhrases: string[];
  recovery: NarrativeRecoveryBudget;
  sequence: number;
}): Promise<string> {
  const directory = path.join(input.rootDirectory, 'failed-attempts', `${input.attemptIdentity}-${String(input.sequence).padStart(2, '0')}`);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, 'customer-manuscript.md'), `${input.candidate.markdown.trim()}\n`);
  await fs.writeFile(path.join(directory, 'parsed-candidate.json'), `${JSON.stringify(safe(input.parsed), null, 2)}\n`);
  await fs.writeFile(path.join(directory, 'blueprint-identity.json'), `${JSON.stringify(safe({ schemaVersion: input.candidate.blueprint.schemaVersion, bibleVersion: input.candidate.blueprint.bibleVersion, reportTier: input.candidate.blueprint.reportTier, organisation: input.candidate.blueprint.organisation, assessmentReference: input.candidate.blueprint.assessmentPosition.reference, headings: input.parsed.chapters.flatMap((chapter) => [chapter.title, ...chapter.sections.flatMap((section) => [section.title, ...section.subsections.map((subsection) => subsection.title)])]) }), null, 2)}\n`);
  await fs.writeFile(path.join(directory, 'validation-report.json'), `${JSON.stringify(safe(input.validation), null, 2)}\n`);
  await fs.writeFile(path.join(directory, 'failure-paths.json'), `${JSON.stringify(safe({ failurePaths: input.failurePaths, matchedPhrases: input.matchedPhrases }), null, 2)}\n`);
  await fs.writeFile(path.join(directory, 'recovery-accounting.json'), `${JSON.stringify(safe(input.recovery), null, 2)}\n`);
  await fs.writeFile(path.join(directory, 'diagnostic-metadata.json'), `${JSON.stringify(safe({ attemptIdentity: input.attemptIdentity, model: input.candidate.writerMetadata.model, provider: input.candidate.writerMetadata.provider, writerMetadata: input.candidate.writerMetadata, customerDeliverable: false, apiKeysPersisted: false }), null, 2)}\n`);
  return directory;
}

function validationFor(markdown: string, blueprint: ReportBlueprint, factPack: NarrativeFactPack): WholeManuscriptRecoveryValidation {
  const parsed = parseBlueprintMarkdown(markdown, blueprint);
  return { parsed, validation: validateBlueprintTextManuscript(parsed, blueprint, factPack) };
}

function sectionForPath(parsed: ParsedBlueprintMarkdown, blueprint: ReportBlueprint, pathValue: string): { section: ReportBlueprint['chapters'][number]['sections'][number]; subsection?: ReportBlueprint['chapters'][number]['sections'][number]['optionalSubsections'][number]; targetText: string; permittedClaimRefs: string[]; chapterTitle: string; sectionTitle: string; subsectionTitle?: string; paragraphIndex: number; surrounding: string } | null {
  const match = pathValue.match(/^([^\.]+)\.(?:paragraphs|subsections\[[^\]]+\]\.paragraphs)\[(\d+)\]/);
  if (!match) return null;
  const identity = match[1]!;
  const paragraphIndex = Number(match[2]);
  for (const chapter of blueprint.chapters) {
    for (const section of chapter.sections) {
      if (section.sectionId === identity) {
        const parsedSection = parsed.chapters.find((item) => item.chapterId === chapter.chapterId)?.sections.find((item) => item.sectionId === section.sectionId);
        const block = parsedSection?.paragraphs[paragraphIndex];
        if (!block) return null;
        return { section, targetText: block.text, permittedClaimRefs: block.permittedClaimRefs, chapterTitle: chapter.title, sectionTitle: section.title, paragraphIndex, surrounding: parsedSection.paragraphs.map((item) => item.text).slice(Math.max(0, paragraphIndex - 1), paragraphIndex + 2).join('\n\n') };
      }
      const subsection = section.optionalSubsections.find((item) => item.subsectionId === identity);
      if (subsection) {
        const parsedSection = parsed.chapters.find((item) => item.chapterId === chapter.chapterId)?.sections.find((item) => item.sectionId === section.sectionId);
        const parsedSubsection = parsedSection?.subsections.find((item) => item.subsectionId === subsection.subsectionId);
        const block = parsedSubsection?.paragraphs[paragraphIndex];
        if (!block) return null;
        return { section, subsection, targetText: block.text, permittedClaimRefs: block.permittedClaimRefs, chapterTitle: chapter.title, sectionTitle: section.title, subsectionTitle: subsection.title, paragraphIndex, surrounding: parsedSubsection.paragraphs.map((item) => item.text).slice(Math.max(0, paragraphIndex - 1), paragraphIndex + 2).join('\n\n') };
      }
    }
  }
  return null;
}

function escapeRegex(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function proseRegex(value: string): RegExp { return new RegExp(value.trim().split(/\s+/).map(escapeRegex).join('\\s+'), 'g'); }

function replaceTargetBlock(markdown: string, title: string, level: 2 | 3, targetText: string, repairedText: string): string {
  if (/^#{1,3}\s/m.test(repairedText) || /^\s*(?:[-*+]\s|\d+[.)]\s|```)/m.test(repairedText)) throw new WholeManuscriptRecoveryError('repair_output_malformed', 'Targeted repair returned a heading, list or code block instead of prose.');
  const heading = new RegExp(`^${'#'.repeat(level)}[ \\t]+${escapeRegex(title)}[ \\t]*$`, 'm');
  const headingMatch = heading.exec(markdown);
  if (!headingMatch || headingMatch.index === undefined) throw new WholeManuscriptRecoveryError('repair_target_missing', `Repair target heading ${title} was not found.`);
  const bodyStart = headingMatch.index + headingMatch[0].length;
  const nextHeading = /^#{1,3}[ \t]+.+$/gm;
  nextHeading.lastIndex = bodyStart;
  const next = nextHeading.exec(markdown);
  const bodyEnd = next?.index ?? markdown.length;
  const body = markdown.slice(bodyStart, bodyEnd);
  const matcher = proseRegex(targetText);
  const matches = [...body.matchAll(matcher)];
  if (matches.length !== 1 || matches[0]?.index === undefined) throw new WholeManuscriptRecoveryError('repair_target_ambiguous', `Expected exactly one repair target block under ${title}; received ${matches.length}.`);
  const match = matches[0];
  const start = bodyStart + match.index;
  const end = start + match[0].length;
  return `${markdown.slice(0, start)}${repairedText.trim()}${markdown.slice(end)}`;
}

function localAssuranceEligible(validation: TextFirstValidationReport, parsed: ParsedBlueprintMarkdown): boolean {
  return parsed.ok && validation.hardTruth.issues.length > 0 && validation.hardTruth.issues.every((issue) => issue.code === 'assurance_claim');
}

function matchedPhraseFor(targetText: string, code: string): string | undefined {
  if (code !== 'assurance_claim') return undefined;
  return classifyAssuranceLanguage(targetText)?.matched;
}

function combineRecovery(previous: NarrativeRecoveryBudget, next: NarrativeRecoveryBudget, increment: Partial<NarrativeRecoveryBudget> = {}): NarrativeRecoveryBudget {
  return {
    initialGenerationCount: previous.initialGenerationCount,
    targetedRepairCount: previous.targetedRepairCount + next.targetedRepairCount + (increment.targetedRepairCount ?? 0),
    fullRegenerationCount: previous.fullRegenerationCount + next.fullRegenerationCount + (increment.fullRegenerationCount ?? 0),
    qualityEscalationCount: previous.qualityEscalationCount + next.qualityEscalationCount + (increment.qualityEscalationCount ?? 0),
    coherenceCount: previous.coherenceCount + next.coherenceCount + (increment.coherenceCount ?? 0),
    technicalFallbackCount: previous.technicalFallbackCount + next.technicalFallbackCount,
    truncationContinuationCount: previous.truncationContinuationCount + next.truncationContinuationCount,
    totalCalls: previous.totalCalls + next.totalCalls,
    totalTokens: previous.totalTokens + next.totalTokens,
    totalProviderCostMicros: previous.totalProviderCostMicros + next.totalProviderCostMicros
  };
}

function sumOptional(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined && b === undefined) return undefined;
  return (a ?? 0) + (b ?? 0);
}

function sumRawCosts(a: string | number | undefined, b: string | number | undefined): string | number | undefined {
  if (a === undefined && b === undefined) return undefined;
  const left = typeof a === 'number' ? a : Number(a ?? 0);
  const right = typeof b === 'number' ? b : Number(b ?? 0);
  if (Number.isFinite(left) && Number.isFinite(right)) return left + right;
  return [a, b].filter((value) => value !== undefined).join(' + ');
}

function aggregateWriterMetadata(previous: WholeManuscriptTextResult['writerMetadata'], next: WholeManuscriptTextResult['writerMetadata'], recovery: NarrativeRecoveryBudget): WholeManuscriptTextResult['writerMetadata'] {
  return {
    ...next,
    inputTokens: sumOptional(previous.inputTokens, next.inputTokens),
    outputTokens: sumOptional(previous.outputTokens, next.outputTokens),
    totalTokens: sumOptional(previous.totalTokens, next.totalTokens),
    providerCostMicros: sumOptional(previous.providerCostMicros, next.providerCostMicros),
    providerCostRaw: sumRawCosts(previous.providerCostRaw, next.providerCostRaw),
    recovery
  };
}

export async function recoverWholeManuscript(input: WholeManuscriptRecoveryInput): Promise<WholeManuscriptRecoveryResult> {
  let candidate = input.initialResult;
  let checked = validationFor(candidate.markdown, input.blueprint, input.factPack);
  let recovery = candidate.writerMetadata.recovery;
  let sequence = 0;
  const rejectedCandidateDirectories: string[] = [];
  const repairRecords: WholeManuscriptRecoveryResult['repairRecords'] = [];

  while (true) {
    const hardIssues = checked.validation.hardTruth.issues;
    const qualityFailure = checked.validation.quality.status === 'QUALITY_FAILURE';
    if (checked.parsed.ok && checked.validation.ok && !qualityFailure) {
      if (input.runCoherence) {
        if (recovery.coherenceCount >= 1) throw new WholeManuscriptRecoveryError('coherence_budget_exhausted', 'The coherence budget is already exhausted.');
        const coherent = await input.writer.coherencePass({ context: input.context, blueprint: input.blueprint, previousMarkdown: candidate.markdown });
        const before = recovery;
        candidate = { ...candidate, markdown: coherent.markdown, writerMetadata: aggregateWriterMetadata(candidate.writerMetadata, coherent.writerMetadata, combineRecovery(before, coherent.writerMetadata.recovery)) };
        recovery = candidate.writerMetadata.recovery;
        checked = validationFor(candidate.markdown, input.blueprint, input.factPack);
        if (!checked.parsed.ok || !checked.validation.ok || checked.validation.quality.status === 'QUALITY_FAILURE') {
          sequence += 1;
          rejectedCandidateDirectories.push(await persistWholeManuscriptRejectedCandidate({ rootDirectory: input.diagnosticsRootDirectory, attemptIdentity: input.attemptIdentity, candidate, parsed: checked.parsed, validation: checked.validation, failurePaths: checked.validation.hardTruth.issues.map((issue) => issue.path), matchedPhrases: [], recovery, sequence }));
          throw new WholeManuscriptRecoveryError('coherence_validation_failed', 'The bounded coherence pass failed final text validation.', { validation: checked.validation });
        }
      }
      return { markdown: candidate.markdown, parsed: checked.parsed, validation: checked.validation, writerMetadata: candidate.writerMetadata, recovery, repairRecords, rejectedCandidateDirectories, coherenceUsed: Boolean(input.runCoherence) };
    }

    const targetIssue = hardIssues[0];
    const target = targetIssue ? sectionForPath(checked.parsed, input.blueprint, targetIssue.path) : null;
    const localEligible = Boolean(target && targetIssue && localAssuranceEligible(checked.validation, checked.parsed));
    const issueCode = targetIssue?.code ?? (qualityFailure ? 'repetition' : 'malformed_manuscript');
    const classified = classifyNarrativeRecoveryIssue({ code: issueCode, localSemanticEligible: localEligible });
    sequence += 1;
    rejectedCandidateDirectories.push(await persistWholeManuscriptRejectedCandidate({ rootDirectory: input.diagnosticsRootDirectory, attemptIdentity: input.attemptIdentity, candidate, parsed: checked.parsed, validation: checked.validation, failurePaths: hardIssues.map((issue) => issue.path), matchedPhrases: target && targetIssue ? [matchedPhraseFor(target.targetText, targetIssue.code)].filter((value): value is string => Boolean(value)) : [], recovery, sequence }));

    const decision = recoveryDecision({ budget: recovery, issueSeverity: classified.severity === 'HARD_TRUTH_FAILURE' ? 'HARD_TRUTH_FAILURE' : classified.severity === 'QUALITY_FAILURE' ? 'QUALITY_FAILURE' : 'REPAIRABLE_SEMANTIC_FAILURE', issueScope: recovery.targetedRepairCount === 0 ? 'block' : recovery.targetedRepairCount === 1 ? 'adjacent' : recovery.targetedRepairCount === 2 ? 'subsection' : 'section', fullGenerationRejected: classified.severity !== 'QUALITY_FAILURE' });
    if (decision.action === 'TARGETED_REPAIR') {
      if (!target || !targetIssue) throw new WholeManuscriptRecoveryError('repair_target_unavailable', 'A repairable validation issue did not resolve to a deterministic Blueprint prose block.');
      const scope = decision.scope as WholeManuscriptRepairInput['scope'];
      const repair = await input.writer.repairBlock({
        context: input.context,
        blueprint: input.blueprint,
        previousMarkdown: candidate.markdown,
        scope,
        sectionId: target.section.sectionId,
        subsectionId: target.subsection?.subsectionId,
        failingPath: targetIssue.path,
        validationCode: targetIssue.code,
        matchedPhrase: matchedPhraseFor(target.targetText, targetIssue.code),
        targetText: target.targetText,
        surroundingProse: scope === 'block' ? target.targetText : target.surrounding,
        permittedFacts: input.factPack.facts.filter((fact) => target.permittedClaimRefs.includes(fact.id)),
        permittedClaimRefs: target.permittedClaimRefs,
        requiredManagementTakeaway: target.subsection?.requiredManagementTakeaway ?? target.section.requiredManagementTakeaway,
        assuranceBoundary: input.context.boundaries.assurance
      });
      const level = target.subsection ? 3 : 2;
      const replacedMarkdown = replaceTargetBlock(candidate.markdown, target.subsection?.title ?? target.section.title, level, target.targetText, repair.repairedText);
      const before = recovery;
      recovery = combineRecovery(before, repair.writerMetadata.recovery);
      repairRecords.push({ attempt: recovery.targetedRepairCount, scope, path: targetIssue.path, code: targetIssue.code, matchedPhrase: matchedPhraseFor(target.targetText, targetIssue.code) });
      candidate = { ...candidate, markdown: replacedMarkdown, writerMetadata: aggregateWriterMetadata(candidate.writerMetadata, repair.writerMetadata, recovery) };
      checked = validationFor(candidate.markdown, input.blueprint, input.factPack);
      continue;
    }
    if (decision.action === 'QUALITY_ESCALATION' && input.escalateQuality) {
      const escalated = await input.escalateQuality();
      const before = recovery;
      recovery = combineRecovery(before, escalated.writerMetadata.recovery, { qualityEscalationCount: 1 });
      candidate = { ...escalated, writerMetadata: aggregateWriterMetadata(candidate.writerMetadata, escalated.writerMetadata, recovery) };
      checked = validationFor(candidate.markdown, input.blueprint, input.factPack);
      continue;
    }
    if (decision.action === 'FULL_REGENERATION' && input.regenerate && recovery.fullRegenerationCount < MAX_FULL_REGENERATIONS) {
      const regenerated = await input.regenerate();
      const before = recovery;
      recovery = combineRecovery(before, regenerated.writerMetadata.recovery, { fullRegenerationCount: 1 });
      candidate = { ...regenerated, writerMetadata: aggregateWriterMetadata(candidate.writerMetadata, regenerated.writerMetadata, recovery) };
      checked = validationFor(candidate.markdown, input.blueprint, input.factPack);
      continue;
    }
    throw new WholeManuscriptRecoveryError('human_review_required', 'Whole-manuscript recovery cannot continue under the approved bounded policy.', { decision, classified, validation: checked.validation, recovery });
  }
}
