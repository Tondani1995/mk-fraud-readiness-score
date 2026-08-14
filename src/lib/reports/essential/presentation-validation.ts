/**
 * Deterministic presentation validation.
 *
 * Guards the product contract the analytical validators cannot see: that the
 * report reads as a professional advisory document rather than an engineering
 * artefact or a wall of prose. Layout passing is not the same as the page being
 * readable, so density is checked here as well.
 */
import type { EssentialReportPresentationModel } from './presentation-model';

export const ESSENTIAL_PRESENTATION_VALIDATION_VERSION = 'mk-essential-presentation-validation-v1';

export type PresentationIssueCode =
  | 'NO_INTERNAL_LANGUAGE'
  | 'NO_RAW_INTERNAL_IDS'
  | 'NO_EMPTY_PAGE'
  | 'VALID_SCORE_PROFILE'
  | 'VALID_EXHIBIT_SOURCE_REFS'
  | 'VALID_EXPOSURE_COUNT'
  | 'SCENARIO_PRIMARY_OWNERSHIP'
  | 'NO_SCENARIO_BLEED'
  | 'ROADMAP_STAGE_COMPLETENESS'
  | 'REPORT_BASIS_ONCE'
  | 'CUSTOMER_WORD_ENVELOPE'
  | 'PAGE_DENSITY';

export interface PresentationIssue { code: PresentationIssueCode; message: string }

export interface EssentialPresentationValidation {
  ok: boolean;
  version: typeof ESSENTIAL_PRESENTATION_VALIDATION_VERSION;
  customerWordCount: number;
  pageCount: number;
  issues: PresentationIssue[];
}

/** Engineering vocabulary that must never appear on a customer page. */
const INTERNAL_LANGUAGE = [
  /\bbounded\b/i, /\bsection engine\b/i, /\bslot(s)?\b/i, /\bowner preview\b/i, /\bowner review\b/i,
  /\bdeterministic\b/i, /\bfact pack\b/i, /\bsupabase\b/i, /\bproduction\b/i, /\bdeployment\b/i,
  /\bcommercial qa\b/i, /\bnarrative mode\b/i, /\bAI\b/, /\bprompt\b/i, /\bclaim ref\b/i
];

/** Internal identifiers that must stay in the private record. */
const INTERNAL_IDS = [
  /\bFACT-\d+/i, /\bCLAIM-\d+/i, /\bDOMAIN-D\d+/i, /\bSCENARIO-\d{3}/i, /\bFINDING-\d{3}/i,
  /\bROADMAP-\d{3}/i, /\bCONTROL-\d{3}/i, /\bMF-D\d+-Q\d+/i, /\bRA-D\d+-Q\d+/i, /\bCI-D\d+-Q\d+/i,
  /\bD\d+-Q\d+/i, /\bSYNTH-[A-Z_]+/, /\bEX-[A-Z-]+/
];

function customerSurfaces(model: EssentialReportPresentationModel): string[] {
  const out: string[] = [model.cover.centralJudgement, model.conclusion, model.reportBasis];
  out.push(...model.domainProfile.rows.map((r) => `${r.title} ${r.band}`));
  out.push(model.readinessScore.strongest.title, model.readinessScore.weakest.title, model.readinessScore.maturity);
  for (const c of model.materialContrasts?.contrasts ?? []) out.push(c.strongerTitle, c.weakerTitle, c.interpretation);
  for (const r of model.diagnosis.rows) out.push(r.pattern, r.whyItMatters, ...r.signals.map((s) => s.title));
  if (model.diagnosis.interpretation) out.push(model.diagnosis.interpretation);
  for (const r of model.exposures?.rows ?? []) out.push(r.exposure, r.whyItMatters, r.interruptionPoint);
  for (const s of model.scenarios?.scenarios ?? []) out.push(s.title, s.entryPoint, s.controlBreak, s.howItUnfolds, s.immediateInterruption, ...s.warningIndicators);
  if (model.scenarios) out.push(model.scenarios.assuranceNote);
  for (const r of model.priorities.rows) out.push(r.outcome, r.whyNow, r.accountableRole, r.betterLooksLike);
  for (const st of model.roadmap.stages) { out.push(st.stage, st.primaryOutcome); for (const a of st.actions) out.push(a.action, a.owner, ...a.dependsOn); }
  if (model.roadmap.interpretation) out.push(model.roadmap.interpretation);
  for (const r of model.dashboard.rows) out.push(r.measure, r.current, r.expectation);
  for (const p of model.pages) { out.push(p.question, p.heading); if (p.commentary) out.push(p.commentary); }
  return out.filter(Boolean);
}

function words(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

export function validateEssentialPresentation(model: EssentialReportPresentationModel): EssentialPresentationValidation {
  const issues: PresentationIssue[] = [];
  const surfaces = customerSurfaces(model);
  const allText = surfaces.join('\n');
  const customerWordCount = surfaces.reduce((sum, text) => sum + words(text), 0);

  for (const pattern of INTERNAL_LANGUAGE) {
    const hit = surfaces.find((text) => pattern.test(text));
    if (hit) issues.push({ code: 'NO_INTERNAL_LANGUAGE', message: `Customer surface contains engineering language matching ${pattern}: "${hit.slice(0, 90)}"` });
  }
  for (const pattern of INTERNAL_IDS) {
    const hit = surfaces.find((text) => pattern.test(text));
    if (hit) issues.push({ code: 'NO_RAW_INTERNAL_IDS', message: `Customer surface exposes an internal identifier matching ${pattern}: "${hit.slice(0, 90)}"` });
  }

  // Every non-cover page must carry a heading and at least one exhibit or commentary.
  for (const page of model.pages) {
    if (page.kind === 'cover') continue;
    if (!page.heading || (!page.exhibitIds.length && !page.commentary)) {
      issues.push({ code: 'NO_EMPTY_PAGE', message: `Page ${page.page} (${page.kind}) carries neither an exhibit nor commentary.` });
    }
  }

  if (!(model.readinessScore.score >= 0 && model.readinessScore.score <= 100) || !model.readinessScore.maturity) {
    issues.push({ code: 'VALID_SCORE_PROFILE', message: 'Readiness score or maturity is missing or out of range.' });
  }
  if (model.domainProfile.rows.length === 0) {
    issues.push({ code: 'VALID_SCORE_PROFILE', message: 'Domain profile contains no rows.' });
  }
  const unsorted = model.domainProfile.rows.some((row, index, all) => index > 0 && row.score < all[index - 1]!.score);
  if (unsorted) issues.push({ code: 'VALID_SCORE_PROFILE', message: 'Domain profile is not ordered weakest first.' });

  const exhibits = [model.readinessScore, model.domainProfile, model.diagnosis, model.priorities, model.roadmap, model.dashboard,
    ...(model.materialContrasts ? [model.materialContrasts] : []), ...(model.exposures ? [model.exposures] : []), ...(model.scenarios ? [model.scenarios] : [])];
  for (const exhibit of exhibits) {
    if (!exhibit.sourceRefs.length) issues.push({ code: 'VALID_EXHIBIT_SOURCE_REFS', message: `Exhibit ${exhibit.exhibitId} carries no source references.` });
  }

  if (model.exposures && (model.exposures.rows.length < 1 || model.exposures.rows.length > 5)) {
    issues.push({ code: 'VALID_EXPOSURE_COUNT', message: `Priority exposure count ${model.exposures.rows.length} is outside the supported range.` });
  }

  // Each scenario owns one family, and no family appears twice.
  const families = (model.scenarios?.scenarios ?? []).map((s) => s.family).filter(Boolean);
  if (new Set(families).size !== families.length) {
    issues.push({ code: 'SCENARIO_PRIMARY_OWNERSHIP', message: 'Two scenarios claim the same primary content family.' });
  }
  // Bleed: a scenario re-stating another scenario's control break verbatim.
  const breaks = (model.scenarios?.scenarios ?? []).map((s) => s.controlBreak.toLowerCase().trim()).filter(Boolean);
  if (new Set(breaks).size !== breaks.length) {
    issues.push({ code: 'NO_SCENARIO_BLEED', message: 'Two scenarios describe the same control break.' });
  }

  for (const stage of model.roadmap.stages) {
    if (!stage.primaryOutcome || stage.actions.length === 0) {
      issues.push({ code: 'ROADMAP_STAGE_COMPLETENESS', message: `Roadmap stage "${stage.stage}" has no outcome or no actions.` });
    }
  }

  const basisOccurrences = (allText.match(/has not independently tested/gi) ?? []).length;
  if (basisOccurrences !== 1) {
    issues.push({ code: 'REPORT_BASIS_ONCE', message: `The assurance boundary appears ${basisOccurrences} times; it must appear exactly once.` });
  }

  if (customerWordCount < 900 || customerWordCount > 2600) {
    issues.push({ code: 'CUSTOMER_WORD_ENVELOPE', message: `Customer word count ${customerWordCount} is outside the 900-2,600 envelope for Essential.` });
  }

  // Density: a page whose only content is continuous prose is a wall of text.
  for (const page of model.pages) {
    if (page.kind === 'cover') continue;
    const commentaryWords = words(page.commentary ?? '');
    if (!page.exhibitIds.length && commentaryWords > 220) {
      issues.push({ code: 'PAGE_DENSITY', message: `Page ${page.page} is ${commentaryWords} words of prose with no analytical exhibit.` });
    }
  }

  return {
    ok: issues.length === 0,
    version: ESSENTIAL_PRESENTATION_VALIDATION_VERSION,
    customerWordCount,
    pageCount: model.pages.length,
    issues
  };
}
