import type { AdvisoryEvidenceModel } from '@/lib/reports/evidence-model/types';
import { assembleComprehensive } from '@/lib/reports/comprehensive/assembly';
import { buildComprehensiveManagementModel } from '@/lib/reports/comprehensive/management-model';
import { renderComprehensiveManagementReportHtml } from '@/lib/reports/comprehensive/render-comprehensive-html';
import type { RevisedAnalysis } from './evidence-model';
import { revisedComprehensiveScenarioFacts } from './comprehensive-input';

/**
 * FICTIONAL INTEGRATION PROTOTYPE. The Comprehensive report from the revised evidence model, through the unchanged
 * assembly, management model and renderer.
 *
 * One gap in the existing management model is exposed by the richer input and closed here on the model's output, not
 * in the protected file: payroll, cash and stock findings have no control programme in the existing table (MFRS
 * produced almost none), so they render as raw family codes with the question "What does this capability require?".
 * The programmes below give them the same kind of title and management question as the others.
 */
const MISSING_PROGRAMMES: Record<string, { title: string; managementQuestion: string }> = {
  'PROG-PAYROLL_INTEGRITY': { title: 'Payroll integrity', managementQuestion: 'Could pay be redirected, inflated or paid to someone who does not work here?' },
  'PROG-CASH_CUSTODY': { title: 'Cash custody', managementQuestion: 'Could cash be taken before or after it is recorded without anyone noticing?' },
  'PROG-STOCK_ASSET_CUSTODY': { title: 'Stock and asset custody', managementQuestion: 'Could stock or assets leave, or be written off, without a record that someone checks?' }
};

function patchProgrammes<T>(value: T): T {
  if (Array.isArray(value)) return value.map(patchProgrammes) as unknown as T;
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = patchProgrammes(v);
  const id = String(out.programmeId ?? out.themeId ?? '').replace(/^EXP-/, '');
  if (MISSING_PROGRAMMES[id] && typeof out.title === 'string') Object.assign(out, MISSING_PROGRAMMES[id]);
  return out as T;
}

export function buildRevisedComprehensive(input: {
  evidence: AdvisoryEvidenceModel;
  analysis: RevisedAnalysis;
  domains: { name: string; score: number; band: string }[];
  organisationName: string;
  assessmentReference: string;
  score: number;
  maturity: string;
}) {
  const scenarioFacts = revisedComprehensiveScenarioFacts(input.evidence, input.analysis);
  const assembly = assembleComprehensive(input.evidence, { scenarioFacts, domains: input.domains });
  const model = patchProgrammes(buildComprehensiveManagementModel(assembly));
  const html = renderComprehensiveManagementReportHtml({
    model, organisationName: input.organisationName, assessmentReference: input.assessmentReference, score: input.score, maturity: input.maturity,
    domains: input.domains.map((d) => ({ title: d.name, score: d.score, band: d.band })), commentary: {}
  });
  return { assembly, model, html };
}
