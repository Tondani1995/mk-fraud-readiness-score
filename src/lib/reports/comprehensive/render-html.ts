import type { ComprehensiveDeliveryModel, ComprehensiveFindingView, EvidenceRequestPackItem, EvidenceValidationStatus } from './types';
import { buildComprehensiveProjection } from './projection';
import { renderE3EvidenceBar, renderE4SlopeChart, renderE7Options, exhibitCss } from '../exhibits';
import { buildCommercialProjection } from '../commercial-projection';
import { MK_CSS_VARIABLES } from '../design/tokens';

export const COMPREHENSIVE_REPORT_SECTIONS = [
  ['cover', 'Comprehensive fraud-readiness review', 'Engagement identity, reviewer and decision context.'],
  ['scope', 'Engagement scope', 'What was assessed, reviewed and excluded.'],
  ['conclusion', 'Executive conclusion', 'The decision-useful conclusion in plain language.'],
  ['position', 'Readiness and maturity position', 'Deterministic score and maturity results, clearly labelled.'],
  ['validation', 'Strategic themes and exposure', 'The deterministic themes that shape the target state.'],
  ['changes', 'Target-state operating model', 'Accountability, governance, monitoring and escalation requirements.'],
  ['findings', 'Priority findings and management implications', 'Bounded finding set with explicit management implications.'],
  ['gaps', 'Material evidence and information gaps', 'Open information items and limitations.'],
  ['risks', 'Risk register interpretation', 'Top risk pathways, not a full register dump.'],
  ['scenarios', 'Organisation-specific fraud scenarios', 'Plausible, evidence-linked scenarios with disclaimers.'],
  ['controls', 'Control-design assessment', 'Design decisions linked to the analytical universe.'],
  ['decisions', 'Leadership decisions', 'Decisions required, owners and consequence of delay.'],
  ['actions', 'Agreed action priorities', 'Reviewer and management action commitments.'],
  ['roadmap', '12-month implementation view', 'Sequenced 30/60/90 and later priorities.'],
  ['residual', 'Residual and uncertain matters', 'What remains uncertain and how to track it.'],
  ['reconciliation', 'Evidence and conclusion reconciliation', 'The supplied evidence and review records reconcile to one total.'],
  ['observations', 'Recorded review observations', 'Human observations, limitations and linked management response.'],
  ['effectiveness', 'Control ownership and effectiveness measures', 'What each owner must evidence before closure.'],
  ['options', 'Decision options and trade-offs', 'Distinct options, trade-offs and recommended next step.'],
  ['oversight', 'Management readiness scorecard and governance cadence', 'The operating rhythm for action ageing, management information and board challenge.'],
  ['methodology', 'Methodology and limitations', 'Basis, traceability and boundaries.'],
  ['signoff', 'Named reviewer and sign-off', 'Review identity, date and sign-off status.']
] as const;

const STATUS_LABEL: Record<EvidenceValidationStatus, string> = {
  NOT_REQUESTED: 'Evidence not supplied',
  REQUESTED: 'Evidence requested',
  RECEIVED: 'Artefact received',
  SELF_REPORTED: 'Recorded self-assessment',
  EVIDENCE_REVIEWED: 'Management review record',
  VALIDATED_SUPPORTED: 'Review note — stated scope recorded',
  NOT_SUPPORTED: 'Review note — limitation recorded',
  NOT_VALIDATED_INSUFFICIENT: 'Review note — further basis required',
  NOT_APPLICABLE: 'Outside stated scope',
  REVIEWER_JUDGEMENT: 'Reviewer judgement'
};

function esc(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function redactInternalReferences(value: string): string {
  return value
    .replace(/\bindependently validate\b/gi, 'obtain separately scoped assurance for')
    .replace(/\bevidence validation\b/gi, 'evidence review')
    .replace(/\bnot supported\b/gi, 'not demonstrated in the supplied record')
    .replace(/\bpartially supported\b/gi, 'partially demonstrated in the supplied record')
    .replace(/\bsupported for the stated scope\b/gi, 'recorded for the stated scope')
    .replace(/\bsupported\b/gi, 'demonstrated in the supplied record')
    .replace(/\binsufficient\b/gi, 'further basis required')
    .replace(/\bindependently validated\b/gi, 'independently checked')
    .replace(/\bvalidated\b/gi, 'checked')
    .replace(/\bevidence review\b/gi, 'management review')
    .replace(/\bindependent reviewer\b/gi, 'named reviewer')
    .replace(/\bself-reported\b/gi, 'recorded assessment')
    .replace(/\bD\d+[- ]Q\d+\b/g, '')
    .replace(/\b(?:ACT|F|MF|RISK|EVID|MD|DEC|CI|RA|SC|OBS)-[A-Z0-9-]+\b/g, '')
    .replace(/\bLinked analytical items:\s*/gi, 'Recorded analytical references retained in the register. ')
    .replace(/\b(?:evidence|finding|risk|control improvement|decision|management action|control_design|question):\s*/gi, '')
    .replace(/\b(?:ACT|F|MF|RISK|EVID|MD|DEC|CI|RA|SC|OBS)-(?=[\s.,;:]|$)/gi, '')
    .replace(/\b(?:finding|risk|control improvement|decision|management action|control_design|question)\s*[:#-]?\s*(?=[\s.,;:]|$)/gi, '')
    .replace(/\bR\s?([0-9][0-9,]*(?:\.\d{2})?)\b/g, 'R$1 (recorded in the supplied incident register)')
    .replace(/\s+([.,;:])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function short(value: unknown, fallback = ''): string {
  const text = String(value ?? '').trim();
  return esc(redactInternalReferences(text || fallback));
}

function humanDependency(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text || /^none$/i.test(text)) return 'No dependency recorded';
  return /\bACT-[A-Z0-9-]+\b/.test(text) ? 'Prerequisite roadmap action' : text;
}

function publicCompletionEvidence(value: unknown): string {
  const text = String(value ?? '').trim();
  return /linked analytical items:|\b(?:finding|risk|control improvement):/i.test(text)
    ? 'Recorded analytical references retained in the annotated register.'
    : text;
}

function publicDecisionOptions(review: ComprehensiveDeliveryModel['decisionReviews'][number] | undefined): string {
  if (!review?.optionDetails?.length) return 'Three options with cost, benefit and trade-off are retained in the annotated register.';
  return review.optionDetails.slice(0, 3).map((option, index) => `Option ${String.fromCharCode(65 + index)} — ${option.option}; cost/effort: ${option.cost}; benefit: ${option.benefit}; trade-off: ${option.tradeOff}; ${option.rejectionReason ? `rejection reason: ${option.rejectionReason}` : 'recommended option'}`).join(' | ');
}

function metricNumber(value: number | null | undefined): string {
  return value === null || value === undefined || Number.isNaN(Number(value)) ? 'Not scored' : String(Math.round(Number(value)));
}

function humanDate(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function lifecycleLabel(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return text.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const DECISION_CATEGORY_LABELS: Record<string, string> = {
  accountable_executive_mandate: 'Accountable executive mandate',
  risk_acceptance_or_remediation: 'Risk treatment decision',
  control_design_standard: 'Control design standard',
  funding_resource_allocation: 'Funding and resource allocation',
  independent_validation: 'Independent validation',
  sequencing_dependency: 'Sequencing and dependency',
  external_specialist_support: 'Specialist support decision',
  governance_reporting_cadence: 'Governance reporting cadence'
};

function decisionCategoryLabel(value: unknown): string {
  const text = String(value ?? '').trim();
  return DECISION_CATEGORY_LABELS[text] ?? lifecycleLabel(text);
}

function reviewerDisplayName(value: unknown): string {
  const text = String(value ?? '').trim();
  return /staging|uat/i.test(text) ? 'Named review lead' : text;
}

function reviewerDisplayRole(value: unknown): string {
  const text = String(value ?? '').trim();
  return !text || /^(reviewer|approver)$/i.test(text) ? 'Review lead' : lifecycleLabel(text);
}

function humanSubject(value: unknown): string {
  const text = String(value ?? '').trim();
  const prefix = text.match(/^(finding|risk|control_design|decision|management_action):/i)?.[1];
  return prefix ? lifecycleLabel(prefix) : text;
}

function statusPill(status: EvidenceValidationStatus): string {
  const tone = status === 'VALIDATED_SUPPORTED' ? 'validated' : status === 'NOT_VALIDATED_INSUFFICIENT' ? 'insufficient' : status === 'REVIEWER_JUDGEMENT' ? 'judgement' : status === 'EVIDENCE_REVIEWED' ? 'reviewed' : 'reported';
  return `<span class="status-pill ${tone}">${STATUS_LABEL[status]}</span>`;
}

function page(key: string, title: string, body: string, kicker = 'MK Fraud Readiness · Comprehensive'): string {
  return `<section class="page" data-section="${esc(key)}"><div class="kicker">${esc(kicker)}</div><h2>${esc(title)}</h2>${body}</section>`;
}

function field(label: string, value: unknown): string {
  const text = String(value ?? '').trim();
  return text ? `<div class="field"><div class="field-label">${esc(label)}</div><div class="field-value">${esc(redactInternalReferences(text))}</div></div>` : '';
}

function callout(label: string, body: string, tone = 'navy'): string {
  return `<div class="callout ${tone}"><div class="callout-label">${esc(label)}</div><p>${body}</p></div>`;
}

function list(items: unknown[], fallback = ''): string {
  if (items.length === 0) return fallback ? `<p class="muted">${esc(fallback)}</p>` : '';
  return `<ul>${items.map((item) => `<li>${short(item)}</li>`).join('')}</ul>`;
}

function evidenceBadgeRow(item: EvidenceRequestPackItem): string {
  return `<div class="evidence-row"><div><strong>${short(item.evidenceItem)}</strong><div>${short(item.linkedDomain)}</div><small>${short(item.actualArtefactsExamined.join('; '))}</small></div><div>${statusPill(item.validationStatus)}${item.whatEvidenceDemonstrated ? `<small>Demonstrated: ${short(item.whatEvidenceDemonstrated)}</small>` : ''}${item.whatEvidenceDidNotDemonstrate ? `<small>Limitation: ${short(item.whatEvidenceDidNotDemonstrate)}</small>` : ''}${item.reviewerConfidence ? `<small>Reviewer confidence: ${short(item.reviewerConfidence)}</small>` : ''}</div></div>`;
}

function findingCard(finding: ComprehensiveFindingView, index: number, compact = false): string {
  const details = compact
    ? `${field('Recorded response', finding.responseMeaning)}${field('Reviewer interpretation', finding.adjustedInterpretation ?? finding.reviewerObservation)}${field('Evidence limitation', finding.evidenceLimitation)}`
    : `${field('Domain', finding.domainName)}${field('Recorded response', finding.responseMeaning)}${field('Why it matters', finding.whyItMatters)}${field('Reviewer observation', finding.reviewerObservation)}${field('Reviewer interpretation', finding.adjustedInterpretation)}${field('Evidence limitation', finding.evidenceLimitation)}${field('Agreed owner / due date', [finding.agreedOwner, finding.agreedDueDate].filter(Boolean).join(' · '))}`;
  return `<article class="record"><div class="record-top"><span class="record-index">Finding ${index + 1}</span>${statusPill(finding.validationStatus)}</div><h3>${short(finding.title)}</h3><div class="record-grid">${details}</div></article>`;
}

function reportCss(): string {
  return `<style>
    :root { ${MK_CSS_VARIABLES} }
    @page { size: A4; margin: 15mm 14mm 17mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: var(--mk-ink); font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; line-height: 1.42; background: var(--mk-white); }
    .page { min-height: 250mm; page-break-after: always; position: relative; padding: 3mm 0 10mm; }
    .page:last-child { page-break-after: auto; }
    .cover { min-height: 250mm; display: flex; flex-direction: column; justify-content: space-between; page-break-after: always; }
    .cover-band { background: var(--mk-navy-700); color: white; padding: 16mm; min-height: 128mm; display: flex; flex-direction: column; justify-content: end; }
    .cover-band h1 { font-size: 34pt; line-height: 1.02; letter-spacing: -0.03em; margin: 0 0 8mm; max-width: 150mm; }
    .cover-band p { font-size: 15pt; max-width: 130mm; color: var(--mk-rule); margin: 0; }
    .cover-meta { padding: 12mm 16mm; border-left: 5px solid var(--mk-brass); background: var(--mk-neutral-bg); }
    .cover-meta .field { display: inline-block; width: 47%; vertical-align: top; margin-bottom: 7mm; }
    .kicker, .section-label, .callout-label, .field-label, .record-index { text-transform: uppercase; letter-spacing: .1em; font-size: 7.2pt; font-weight: 700; color: var(--mk-muted); }
    h2 { color: var(--mk-navy-700); font-size: 25pt; line-height: 1.08; letter-spacing: -.02em; margin: 2mm 0 7mm; }
    h3 { color: var(--mk-navy-700); font-size: 14pt; line-height: 1.15; margin: 2mm 0 4mm; }
    p { margin: 0 0 4mm; }
    ul { margin: 2mm 0 4mm 5mm; padding-left: 5mm; }
    li { margin: 1.8mm 0; }
    .lede { font-size: 15pt; line-height: 1.3; color: var(--mk-navy-500); max-width: 160mm; }
    .muted, small { color: var(--mk-muted); }
    .callout { padding: 6mm; margin: 5mm 0; border-left: 4px solid var(--mk-brass); background: var(--mk-neutral-bg); }
    .callout.navy { border-left-color: var(--mk-navy-700); }
    .callout.amber { background: var(--mk-major-bg); border-left-color: var(--mk-brass); }
    .callout.red { background: var(--mk-critical-bg); border-left-color: var(--mk-critical); }
    .callout.green { background: var(--mk-confirmed-bg); border-left-color: var(--mk-confirmed); }
    .callout p { margin: 2mm 0 0; font-size: 12pt; }
    .field { margin: 0 0 4mm; }
    .field-label { margin-bottom: 1mm; }
    .field-value { color: var(--mk-ink); }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; }
    .metric-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4mm; margin: 7mm 0; }
    .metric { border-top: 3px solid var(--mk-navy-700); padding: 4mm; background: var(--mk-neutral-bg); min-height: 30mm; }
    .metric strong { display: block; color: var(--mk-navy-700); font-size: 22pt; line-height: 1; margin: 2mm 0; }
    .metric span { color: var(--mk-muted); font-size: 8.5pt; }
    .status-pill { display: inline-block; padding: 1.4mm 2.4mm; border-radius: 999px; font-size: 7pt; font-weight: 700; letter-spacing: .04em; color: var(--mk-white); background: var(--mk-muted); white-space: nowrap; }
    .status-pill.validated { background: var(--mk-confirmed); } .status-pill.reviewed { background: var(--mk-navy-500); } .status-pill.insufficient { background: var(--mk-critical); } .status-pill.judgement { background: var(--mk-navy-500); } .status-pill.reported { background: var(--mk-muted); }
    .evidence-row { display: grid; grid-template-columns: 1.2fr 1fr; gap: 6mm; padding: 4mm 0; border-bottom: 1px solid var(--mk-rule); }
    .evidence-row small { display: block; margin-top: 1.5mm; }
    .record { border: 1px solid var(--mk-rule); border-left: 4px solid var(--mk-navy-700); padding: 5mm; margin: 4mm 0; break-inside: avoid; }
    .page[data-section="decisions"] .record { break-inside: auto; page-break-inside: auto; padding: 2.5mm; margin: 2mm 0; }
    .page[data-section="decisions"] .record-grid { gap: 2mm 5mm; margin-top: 2mm; }
    .page[data-section="decisions"] .field { margin-bottom: 1.5mm; }
    .page[data-section="decisions"] .field-value { font-size: 9pt; line-height: 1.25; }
    .page[data-section="controls"] .table, .page[data-section="observations"] .table { font-size: 8pt; line-height: 1.18; }
    .page[data-section="controls"] .table th, .page[data-section="observations"] .table th { padding: 1.8mm; }
    .page[data-section="controls"] .table td, .page[data-section="observations"] .table td { padding: 1.8mm; }
    .record-top { display: flex; justify-content: space-between; align-items: center; gap: 4mm; }
    .record-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm 7mm; margin-top: 4mm; }
    .table { width: 100%; border-collapse: collapse; font-size: 8.8pt; margin: 4mm 0; }
    .table th { text-align: left; color: var(--mk-white); background: var(--mk-navy-700); padding: 2.5mm; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .05em; }
    .table td { border-bottom: 1px solid var(--mk-rule); padding: 2.5mm; vertical-align: top; }
    .table tr:nth-child(even) td { background: var(--mk-neutral-bg); }
    .bar { display: flex; height: 8mm; margin: 5mm 0 2mm; background: var(--mk-rule); }
    .bar > span { display: block; height: 100%; }
    .legend { display: flex; gap: 5mm; font-size: 8pt; flex-wrap: wrap; }
    .legend span::before { content: ''; display: inline-block; width: 3mm; height: 3mm; margin-right: 1.5mm; background: var(--mk-muted); }
    .legend .ok::before { background: var(--mk-confirmed); } .legend .gap::before { background: var(--mk-critical); } .legend .review::before { background: var(--mk-navy-500); } .legend .judgement::before { background: var(--mk-navy-500); }
    .footer-note { position: absolute; bottom: 0; left: 0; right: 0; border-top: 1px solid var(--mk-rule); padding-top: 2mm; font-size: 7.5pt; color: var(--mk-muted); }
    .confidential { color: var(--mk-critical); font-weight: 700; }
    .avoid-break { break-inside: avoid; }
    .page-break { page-break-before: always; }
  </style>`;
}

export function renderComprehensiveReportHtml(model: ComprehensiveDeliveryModel): string {
  const { analytical, validationSummary: summary } = model;
  const score = analytical.score;
  const projection = buildComprehensiveProjection(model);
  const commercialProjection = buildCommercialProjection({ tier: 'Comprehensive', organisationName: analytical.organisationName, assessmentReference: analytical.assessmentReference, score: score.overallScore, maturity: score.finalMaturity, model: analytical.evidenceModel, reviewer: model.reviewerInput });
  const sharedExhibitContext = { projection: commercialProjection, source: 'Kestrel assessment, persisted reviewer record and reconciled evidence register.' };
  const sharedE3 = renderE3EvidenceBar(sharedExhibitContext).html;
  const sharedE4 = renderE4SlopeChart({ ...sharedExhibitContext, slope: projection.findings.slice(0, 6).map((finding, index) => ({ label: `Priority ${index + 1}`, score: Math.max(0, Math.min(100, finding.materialityScore)) })) }).html;
  const decisionOptions = model.leadershipDecisions.slice(0, 4).flatMap((decision) => {
    const review = model.decisionReviews.find((candidate) => candidate.decisionId === decision.id);
    return (review?.optionDetails ?? []).slice(0, 3).map((option, index) => ({
      id: `${decision.id}-${index + 1}`,
      title: `${decision.decisionRequired} · ${option.option}`,
      decision: review?.reviewerRecommendation ?? decision.recommendedDecision,
      owner: review?.owner ?? decision.accountableExecutive,
      timing: review?.targetDate ?? decision.deadline,
      tradeOff: option.tradeOff,
      cost: option.cost,
      benefit: option.benefit,
      rejectionReason: option.rejectionReason,
      recommendation: review?.reviewerRecommendation ?? decision.recommendedDecision,
      rationale: review?.recommendationRationale
    }));
  });
  const sharedE7 = renderE7Options({ ...sharedExhibitContext, options: decisionOptions }).html;
  // The main PDF is the L2 executive storyline. The annotated register retains the complete
  // deterministic universe, so bounded narrative depth is deliberate and keeps the paid report
  // inside the bible's 34–38 page architecture when a live assessment is materially larger than a
  // fixture.
  const topFindings = projection.findings.slice(0, 4);
  const topRisks = projection.risks.slice(0, 3);
  const topScenarios = projection.scenarios.slice(0, 2);
  const topControls = projection.controlActions.slice(0, 5);
  const topDecisions = model.leadershipDecisions.slice(0, 4);
  const topObservations = model.reviewerInput.observations.slice(0, 3);
  const unresolved = projection.evidenceItems.filter((item) => ['SELF_REPORTED', 'NOT_REQUESTED', 'REQUESTED', 'RECEIVED', 'NOT_VALIDATED_INSUFFICIENT', 'NOT_SUPPORTED'].includes(item.validationStatus));
  const reviewer = model.reviewerInput.reviewer;
  const displayReviewerName = reviewerDisplayName(reviewer.name);
  const displayReviewerRole = reviewerDisplayRole(reviewer.role);
  const generated = humanDate(analytical.generatedAt ?? reviewer.reviewDate);
  const conclusion = summary.validatedSupported > 0
    ? `The recorded assessment provides the baseline for the target-state design. Review notes are bounded to the supplied records; ${summary.unresolved} evidence item(s) remain open and should be closed before management relies on operating effectiveness.`
    : 'The recorded assessment provides the baseline for the target-state design. The supplied review record does not establish operating effectiveness, so management should close the priority information gaps before relying on the control position.';

  const pages = [
    `<section class="cover"><div class="cover-band"><div class="kicker" style="color:var(--mk-rule)">MK Fraud Readiness</div><h1>Comprehensive fraud-readiness review</h1><p>Strategic fraud-risk analysis and target-state control blueprint.</p></div><div class="cover-meta">${field('Organisation', analytical.organisationName)}${field('Named reviewer', `${displayReviewerName} · ${displayReviewerRole}`)}${field('Review date', humanDate(reviewer.reviewDate))}<p class="confidential">Confidential · decision support, not a legal opinion or certification</p></div><div class="footer-note">Prepared ${esc(generated)} · Comprehensive deliverable</div></section>`,
    page('scope', 'The review scope is bounded by recorded information', `<p class="lede">This product uses the recorded analytical universe and management review record to interpret exposure, design the target control environment and sequence the 12-month response.</p><div class="two-col"><div>${field('Included', 'Deterministic score and maturity; material findings; risk register; control actions; evidence requirements; scenarios; contradictions; roadmap; review observations; management decisions.')}</div><div>${field('Not included', 'A re-score, legal opinion, investigation, independent operating-effectiveness validation, certification programme, or conclusion beyond the information supplied.')}</div></div>${callout('Reading rule', 'The recorded assessment answer is never overwritten by narrative. Review notes remain bounded to the named record, population and period; they do not establish independent assurance.', 'navy')}`),
    page('conclusion', 'The target state turns diagnosis into management action', `<p class="lede">${esc(conclusion)}</p><div class="metric-grid"><div class="metric"><span>Deterministic readiness</span><strong>${metricNumber(score.overallScore)}</strong><span>${score.overallScore === null ? '' : '/ 100 · '}${esc(score.finalMaturity ?? 'Not scored')}</span></div><div class="metric"><span>Review notes in scope</span><strong>${summary.validatedSupported}</strong><span>of ${summary.totalEvidenceItems} records</span></div><div class="metric"><span>Open information items</span><strong>${summary.unresolved}</strong><span>items requiring action</span></div><div class="metric"><span>Decisions required</span><strong>${model.managementDecisions.length}</strong><span>management / board items</span></div></div>${callout('Board implication', model.managementDecisions[0]?.decision ?? 'Confirm owners, proof requirements and oversight cadence for the priority matters.', 'amber')}`),
    page('position', 'The recorded position remains separate from the target state', `<div class="two-col"><div>${field('Overall score', score.overallScore === null ? 'Not scored' : `${metricNumber(score.overallScore)} / 100`)}${field('Calculated maturity', score.calculatedMaturity)}${field('Final maturity', score.finalMaturity)}${field('Exposure position', score.exposureScore === null ? 'Not scored' : `${metricNumber(score.exposureScore)} / 100 · ${score.exposureBand ?? 'Not scored'}`)}</div><div>${field('Coverage', `${Math.round(score.coveragePct)}%`)}${field('Not applicable rate', `${Math.round(score.nARatePct)}%`)}${field('Critical / major gaps', `${score.criticalGapCount} / ${score.majorGapCount}`)}${field('Maturity constraint', score.capApplied ? score.capReason : 'No cap recorded')}</div></div>${callout('Interpretation boundary', 'These metrics are deterministic outputs from the locked assessment run. They are not changed by review notes; the target-state design and implementation response are presented separately.', 'navy')}`),
    page('validation', 'Strategic themes and exposure', `<p class="lede">The deterministic position identifies the themes that need management attention. The exhibit below keeps the score, exposure and target-state response in one traceable view.</p>${sharedE3}<div style="margin-top:8mm">${projection.evidenceItems.slice(0, 5).map(evidenceBadgeRow).join('')}</div>`),
    page('movement', 'The target operating model connects owners, forums and escalation', `<p class="lede">The deterministic readiness position remains locked. The Comprehensive value is the operating model that converts the position into accountability, monitoring, investigation, assurance and escalation.</p>${sharedE4}`),
    page('changes', 'Management rhythm is the bridge from diagnosis to operation', `<div class="two-col">${field('Board / Audit Committee', 'Review material fraud exposure, unresolved information items, accepted residual risk and overdue decisions at each formal checkpoint.')}${field('Executive accountability', 'The accountable executive owns the target control outcome, funding and cross-functional dependencies.')}${field('Management forum', 'A monthly fraud-risk forum reviews exceptions, action ageing, detection signals and control-operation proof.')}${field('Monitoring and detection', 'Control owners maintain complete populations, exception thresholds, alert ageing and recurring management information.')}${field('Incident and investigation', 'Escalate credible indicators through the agreed incident route, preserve records and assign investigation ownership.')}${field('Independent assurance', 'Treat independent assurance as a separately scoped route; this product does not claim that operating effectiveness has been independently validated.')}${field('Escalation and cadence', 'Escalate overdue critical actions, incomplete populations and repeated control exceptions to the accountable executive and oversight forum.')}${field('Traceability', 'Detailed owners, dependencies, measures and source references remain in the annotated register.')}</div>`),
    page('findings', 'Priority findings require evidence-backed action', `<p class="lede">The report shows the highest-materiality decision items and keeps review notes distinct from the recorded assessment. The full finding universe remains in the annotated register.</p>${topFindings.map((finding, index) => findingCard(finding, index, true)).join('')}`),
    page('gaps', 'Open information gaps limit reliance', unresolved.length > 0 ? `${callout('Reliance limitation', `${unresolved.length} item(s) remain recorded or require further basis. These are information gaps that limit reliance, not conclusions about misconduct. The highest-priority four are shown here; the full set remains in the annotated register.`, 'red')}${unresolved.slice(0, 4).map((item) => `<article class="record"><div class="record-top"><span class="record-index">${short(item.priority)} priority</span>${statusPill(item.validationStatus)}</div><h3>${short(item.evidenceItem)}</h3><div class="record-grid">${field('What MK wants to inspect', item.whatMKWantsToInspect)}${field('Why it matters', item.whyItMatters)}${field('Acceptable examples', item.acceptableExamples.join('; '))}${field('Review note', item.reviewerNote)}</div></article>`).join('')}` : callout('No open information gap', 'The supplied review set has a closed information request pack. Continue to monitor the operating scope and record freshness.', 'green')),
    page('risks', 'Risk pathways show where exposure may persist', `<p class="lede">Risk rating remains deterministic. The reviewer assurance layer is shown beside it and does not recalculate priority, likelihood or impact.</p><table class="table"><thead><tr><th>Risk pathway</th><th>Deterministic position</th><th>Reviewer interpretation</th><th>Target</th></tr></thead><tbody>${topRisks.map((risk) => { const review = model.riskReviews.find((candidate) => candidate.riskId === risk.id); return `<tr><td><strong>${short(risk.title)}</strong><br>${short(risk.riskStatement)}</td><td>${short(risk.priority)} · ${short(risk.likelihood)} / ${short(risk.impact)}<br>${short(risk.assessmentConfidence)}</td><td>${short(review?.reviewerInterpretation)}<br>${short(review?.assuranceStatement)}<br>${short(review?.limitation)}<br>Confidence: ${short(review?.reviewerConfidence)}</td><td>${short(risk.targetPeriod)}</td></tr>`; }).join('')}</tbody></table>`),
    page('scenarios', 'Plausible pathways show how controls may be bypassed', `<p class="lede">These are plausible scenarios linked to the recorded analytical universe. They are not allegations and do not evidence that an event occurred.</p>${topScenarios.map((scenario) => `<article class="record"><div class="record-top"><span class="record-index">${short(lifecycleLabel(scenario.scenarioType))}</span><span class="status-pill judgement">Plausible scenario</span></div><h3>${short(scenario.title)}</h3><div class="record-grid">${field('Confirmed operating context', scenario.confirmedOperatingContext.join('; '))}${field('Entry point', scenario.entryPoint)}${field('Mechanism', scenario.fraudSequence)}${field('Control bypassed', scenario.controlsExpected.join('; '))}${field('Concealment', scenario.concealmentMechanism)}${field('Consequence', [scenario.financialImpact, scenario.operationalImpact, ...scenario.likelyImpact].join('; '))}${field('Early warning indicators', scenario.earlyWarningIndicators.join('; '))}${field('Immediate containment', scenario.immediateContainment)}${field('Long-term response', scenario.longerTermResponse)}${field('Traceability', 'Detailed references are retained in the annotated register.')}${field('Disclaimer', scenario.disclaimer)}</div></article>`).join('')}`),
    page('controls', 'Control design must show how operation will be evidenced', `<p class="lede">The report shows five target control blueprints; the complete deterministic design remains in the annotated register. Review critique is shown beside, and does not mutate, the design.</p><table class="table"><thead><tr><th>Control objective</th><th>Recorded state</th><th>Human design critique</th><th>Target / owner</th></tr></thead><tbody>${topControls.map((control) => { const review = model.controlDesignReviews.find((candidate) => candidate.controlId === control.id); return `<tr><td><strong>${short(control.controlObjective)}</strong></td><td>${short(control.currentState)}<br>${short(control.controlDesign)}</td><td>${short(review?.designAssessment)}<br>${short(review?.designGapLimitation)}<br>${short(review?.recommendedAdjustment)}</td><td>${short(control.targetState)}<br>${short(control.accountableExecutive)} · ${short(control.targetPeriod)}</td></tr>`; }).join('')}</tbody></table>`),
    page('decisions', 'Leadership must choose owners and trade-offs', `<p class="lede">The Comprehensive product moves from diagnosis to decisions with traceable ownership. Each priority choice carries three options, cost/effort, benefit, trade-off and the MK recommendation.</p>${topDecisions.map((decision) => { const review = model.decisionReviews.find((candidate) => candidate.decisionId === decision.id); return `<article class="record"><div class="record-top"><span class="record-index">${esc(decisionCategoryLabel(decision.decisionCategory))}</span><span class="status-pill judgement">Decision required</span></div><h3>${short(decision.decisionRequired)}</h3><div class="record-grid">${field('Why now', decision.whyNow)}${field('Options, cost, benefit and trade-off', publicDecisionOptions(review))}${field('MK recommendation', review?.reviewerRecommendation ?? decision.recommendedDecision)}${field('Recommendation rationale', review?.recommendationRationale)}${field('Accountable executive', review?.owner ?? decision.accountableExecutive)}${field('Target date', humanDate(review?.targetDate ?? decision.deadline))}${field('Management decision record', review?.managementBoardDecision)}${field('Consequence of delay', decision.consequenceOfDelay)}</div></article>`; }).join('') || callout('Decision log', 'No leadership decisions were supplied in the current review input.', 'amber')}`),
    page('actions', 'Agreed actions define ownership and proof', model.managementDecisions.length > 0 ? `<table class="table"><thead><tr><th>Decision / action</th><th>Owner</th><th>Target date</th><th>Status</th><th>Completion evidence</th></tr></thead><tbody>${model.managementDecisions.map((decision) => `<tr><td><strong>${short(decision.decision)}</strong><br><small>${short(decision.managementResponse ?? decision.rationale)}</small></td><td>${short(decision.owner)}</td><td>${humanDate(decision.targetDate)}</td><td>${lifecycleLabel(decision.status)}</td><td>Update the annotated register with the agreed evidence and effectiveness measure.</td></tr>`).join('')}</tbody></table>` : callout('Action log', 'No management actions have been agreed in the supplied review input.', 'amber')),
    page('roadmap', 'Sequenced action creates a reliable control baseline', `<p class="lede">Near-term actions preserve the dependency-closed Comprehensive projection of the analytical roadmap. The full L1 roadmap remains in the annotated register.</p><table class="table"><thead><tr><th>Period</th><th>Deliverable</th><th>Owner</th><th>Dependency / evidence</th></tr></thead><tbody>${projection.roadmapActions.map((action) => `<tr><td>${short(action.period)}</td><td>${short(action.deliverable)}</td><td>${short(action.accountableExecutive)}</td><td>${short([humanDependency(action.dependency), publicCompletionEvidence(action.evidenceOfCompletion)].filter(Boolean).join(' · '))}</td></tr>`).join('')}</tbody></table><div class="two-col">${field('Months 4–6 — embed', 'Run the first full management-information cycle against the approved control designs and close dependency-held actions.')}${field('Months 7–12 — mature', 'Refresh the risk view, effectiveness measures and escalation rhythm through the agreed management cycle.')}</div>${callout('Implementation rule', 'Do not close an action on narrative completion alone. Record the operating evidence, owner and effectiveness measure in the annotated register.', 'navy')}`),
    page('residual', 'Uncertainty remains until the information boundary closes', `<p class="lede">The following matters remain uncertain until their information boundary is closed or management formally accepts the residual risk.</p>${list(unresolved.map((item) => `${item.evidenceItem} · ${STATUS_LABEL[item.validationStatus]} · ${item.reviewerNote}`), 'No unresolved items were supplied.')}${callout('Tracking recommendation', 'Board oversight should track the open information count, age of open actions, proof coverage for high-priority controls and overdue management decisions.', 'amber')}`),
    page('reconciliation', 'The information universe reconciles to one conclusion', `<p class="lede">The supplied information ledger is reconciled before management conclusions are presented. Every item has one and only one recorded state.</p><div class="metric-grid"><div class="metric"><span>Total information items</span><strong>${summary.totalEvidenceItems}</strong><span>complete request universe</span></div><div class="metric"><span>Review notes in scope</span><strong>${summary.evidenceReviewed}</strong><span>review records attached</span></div><div class="metric"><span>Stated-scope notes</span><strong>${summary.validatedSupported}</strong><span>bounded review notes</span></div><div class="metric"><span>Open information</span><strong>${summary.unresolved}</strong><span>items requiring action</span></div></div><table class="table"><thead><tr><th>Reconciliation check</th><th>Result</th><th>Management reading</th></tr></thead><tbody><tr><td>Recorded + review note = total</td><td>${summary.selfReported} + ${summary.evidenceReviewed} = ${summary.totalEvidenceItems}</td><td>Open items remain bounded as recorded information.</td></tr><tr><td>Review-note states reconcile to reviewed items</td><td>${summary.validatedSupported} + ${summary.notValidatedInsufficient} + ${model.evidenceReviews.filter((item) => item.validationStatus === 'NOT_SUPPORTED').length} + ${summary.reviewerJudgement} + ${model.evidenceReviews.filter((item) => item.validationStatus === 'EVIDENCE_REVIEWED').length} = ${summary.evidenceReviewed}</td><td>No review state is silently dropped.</td></tr><tr><td>Open-information formula</td><td>${summary.unresolved} = recorded + further basis required + limitation recorded</td><td>Closure requires defined proof or a recorded management decision.</td></tr></tbody></table>${callout('Reliance boundary', 'A supplied record can inform only the stated population, period and control characteristic. It does not convert unrelated or unrecorded items into assurance.', 'navy')}`),
    page('observations', 'Recorded review observations preserve the human record', `<p class="lede">These observations are the supplied human review record. The annotated register retains the complete technical traceability.</p><table class="table"><thead><tr><th>Subject</th><th>Recorded position</th><th>Evidence examined</th><th>Limitation / response</th></tr></thead><tbody>${topObservations.map((observation) => `<tr><td><strong>${short(observation.subject)}</strong><br>${statusPill(observation.validationStatus)}</td><td>${short(observation.observation)}</td><td>${observation.linkedEvidenceRefs.length ? 'Recorded source references retained in the annotated register.' : 'No source reference recorded.'}</td><td>${short(observation.linkedFindingIds.length ? 'Linked finding and action retained in the register.' : 'No linked finding recorded.')}</td></tr>`).join('')}</tbody></table>${callout('Review discipline', 'A review observation is not a replacement for the deterministic answer. It records the supplied context and where management still needs to close the information boundary.', 'navy')}`),
    page('effectiveness', 'Effectiveness depends on repeatable proof', `<p class="lede">Closure is evidenced through population completeness, approval traceability, exception ageing and a repeatable effectiveness measure.</p><table class="table"><thead><tr><th>Control priority</th><th>Accountable owner</th><th>First evidence deliverable</th><th>Effectiveness measure</th></tr></thead><tbody>${topControls.map((control) => `<tr><td><strong>${short(control.controlObjective)}</strong></td><td>${short(control.accountableExecutive)}</td><td>${short(control.evidenceRetained.join('; '))}</td><td>${short(control.effectivenessTest)}</td></tr>`).join('')}</tbody></table>${callout('Closure rule', 'Close only when the register shows the population, exceptions, approvals, operating sample and next effectiveness review.', 'amber')}`),
    page('options', 'Options make cost, benefit and trade-offs explicit', `<p class="lede">Each decision is presented with distinct options so management can record cost, speed, ownership and control consequences explicitly.</p>${sharedE7}`),
    page('oversight', 'Management cadence converts information into oversight', `<p class="lede">The review becomes useful when owners convert the information boundary into a repeatable management rhythm.</p><div class="two-col"><div>${field('Monthly', 'Review high-risk detection rules, alert ageing, supplier bank-detail exceptions and privileged-access exceptions.')}${field('Quarterly', 'Reconcile the fraud-risk population, committee challenge, whistleblowing route coverage and awareness exceptions.')}</div><div>${field('Board checkpoint', 'Review recorded position, open information count, action ageing, accepted residual risk and decision status.')}${field('Escalation', 'Escalate overdue critical exceptions, incomplete populations and any control claim that cannot be reproduced from the named records.')}</div></div>${callout('Management readiness check', 'Can the accountable owner reproduce the record, explain the exception threshold and show the defined control measure operating again after remediation?', 'navy')}`),
    page('methodology', 'The method and limitations bound the conclusion', `<div class="two-col"><div>${field('Analytical basis', 'Existing locked deterministic score, maturity, evidence-model material findings, risk register, control-action register, evidence requirements, scenarios, contradictions and roadmap.')}${field('Review basis', 'Named review observations, supplied records, limitations, adjusted interpretation and management responses supplied for this engagement.')}</div><div>${field('Limitations', 'No inference beyond the information supplied; no legal or forensic conclusion; no independent operating-effectiveness validation; no silent mutation of answers.')}${field('Traceability', 'Detailed source, finding and methodology references are retained in the annotated register.')}${field('Control completeness', 'What; Who; Population; Frequency; Evidence retained; Independent check; Escalation trigger / recipient; SLA; Effectiveness measure; Failure response.')}</div></div><p class="section-note">Source: persisted assessment, analytical model and management review record.</p>${callout('Basis statement', 'This report is based on recorded responses and supplied review records. It does not independently verify operating effectiveness unless separately scoped to obtain and review that evidence.', 'navy')}`),
    page('signoff', 'The named reviewer records the review boundary', `<div class="two-col"><div>${field('Reviewer', displayReviewerName)}${field('Role', displayReviewerRole)}${field('Organisation', reviewer.organisation)}${field('Review date', humanDate(reviewer.reviewDate))}</div><div>${field('Sign-off status', model.reviewerInput.signOff?.signed ? 'Signed' : 'Not signed')}${field('Signed at', humanDate(model.reviewerInput.signOff?.signedAt))}${field('Reviewer note', model.reviewerInput.signOff?.note)}${field('Board decisions captured', model.reviewerInput.boardDecisions?.join('; '))}</div></div>${callout('Scope acknowledgement', 'This report is a decision-support deliverable. It is bounded by the information supplied, the evidence examined and the limitations recorded by the named reviewer.', 'navy')}`)
  ];
  return `<!doctype html><html><head><meta charset="utf-8"><title>Comprehensive fraud-readiness review</title>${reportCss()}<style>${exhibitCss()}</style></head><body>${pages.join('')}</body></html>`;
}

const BOARD_PAGES = [
  ['1', 'Cover / decision context', 'What decisions does the board need to make now?', 'position'],
  ['2', 'Executive fraud-readiness position', 'Where do we stand, and what remains self-reported?', 'position'],
  ['3', 'Top findings / unresolved information', 'What is recorded, and where is reliance limited?', 'validation'],
  ['4', 'Priority fraud scenarios / risk implications', 'Plausible pathways show how exposure may develop if the priority conditions are not treated?', 'scenarios'],
  ['5', 'Leadership choices define ownership and trade-offs', 'Which design, ownership and acceptance decisions are required?', 'controls'],
  ['6', '30 / 60 / 90 + 12-month priorities', 'What must management do next, and how will completion be evidenced?', 'priorities'],
  ['7', 'Board oversight / metrics', 'What should the board track at each review?', 'oversight']
] as const;

export function BOARD_READOUT_PAGE_COUNT(): number { return BOARD_PAGES.length; }

export function renderBoardReadoutHtml(model: ComprehensiveDeliveryModel): string {
  const score = model.analytical.score;
  const summary = model.validationSummary;
  const projection = buildComprehensiveProjection(model);
  const topFindings = projection.findings.slice(0, 3);
  const topRisks = projection.risks.slice(0, 3);
  const topScenarios = projection.scenarios.slice(0, 3);
  const pages = [
    `<section class="board-page board-cover"><div class="board-kicker">MK Fraud Readiness</div><h1>Board readout</h1><p>Comprehensive target-state design · ${short(model.analytical.organisationName)}</p><p>Named reviewer: ${short(reviewerDisplayName(model.reviewerInput.reviewer.name))}</p><div class="board-decision">Decision context<br><strong>${short(model.managementDecisions[0]?.decision ?? 'Confirm the priority control, ownership and oversight actions.')}</strong></div><div class="board-footer">Confidential · ${humanDate(model.reviewerInput.reviewer.reviewDate)} · Source: persisted assessment and management review record.</div></section>`,
    `<section class="board-page"><div class="board-kicker">02 · Position</div><h2>The recorded result needs bounded reliance</h2><p class="board-lede">The deterministic readiness result remains unchanged by narrative. The supplied information defines the boundary within which management can use the recorded position.</p><div class="board-metrics"><div><span>Deterministic readiness</span><strong>${metricNumber(score.overallScore)}</strong><small>${score.overallScore === null ? '' : '/ 100 · '}${short(score.finalMaturity)}</small></div><div><span>Exposure</span><strong>${metricNumber(score.exposureScore)}</strong><small>${score.exposureScore === null ? '' : '/ 100 · '}${short(score.exposureBand)}</small></div><div><span>Review notes in scope</span><strong>${summary.validatedSupported}</strong><small>of ${summary.totalEvidenceItems} items</small></div><div><span>Open information</span><strong>${summary.unresolved}</strong><small>items requiring action</small></div></div><div class="board-rule"><strong>Board reading:</strong> treat the score as the recorded assessment result; treat review notes as bounded to the named information scope.</div><div class="board-footer">02 / 07 · Deterministic score and information boundary are shown separately.</div></section>`,
    `<section class="board-page"><div class="board-kicker">03 · Information boundary</div><h2>What is recorded and what remains open</h2><div class="board-columns"><div><h3>Review notes in scope</h3>${topFindings.filter((f) => f.validationStatus === 'VALIDATED_SUPPORTED').map((f) => `<div class="board-item good"><strong>${short(f.title)}</strong><span>${short(f.reviewerObservation ?? 'A review note is recorded for the named scope.')}</span></div>`).join('') || '<p class="board-muted">No bounded review note is attached to the priority findings.</p>'}</div><div><h3>Open information</h3>${model.evidenceRequestPack.filter((e) => e.validationStatus === 'SELF_REPORTED' || e.validationStatus === 'NOT_VALIDATED_INSUFFICIENT').slice(0, 4).map((e) => `<div class="board-item warn"><strong>${short(e.evidenceItem)}</strong><span>${short(e.reviewerNote)}</span></div>`).join('') || '<p class="board-muted">No open information item is recorded in the supplied review.</p>'}</div></div><div class="board-footer">03 / 07 · Review notes remain limited to the named scope; an open item is not a finding of misconduct.</div></section>`,
    `<section class="board-page"><div class="board-kicker">04 · Scenarios</div><h2>Plausible pathways show how exposure may develop</h2><p class="board-lede">The scenarios below are plausible, organisation-specific pathways linked to the recorded control and exposure universe. They are not allegations.</p>${topScenarios.map((s) => `<div class="board-scenario"><div class="scenario-title">${short(s.title)}</div><div>Entry point: ${short(s.entryPoint)} · Mechanism: ${short(s.fraudSequence)}</div><small>Control bypassed: ${short(s.controlsExpected.join('; '))} · Concealment: ${short(s.concealmentMechanism)} · Consequence: ${short([s.financialImpact, s.operationalImpact].join('; '))} · Warning: ${short(s.earlyWarningIndicators.join('; '))} · Immediate containment: ${short(s.immediateContainment)} · Long-term response: ${short(s.longerTermResponse)}</small></div>`).join('')}<p class="board-muted">Scenario logic covers actor/opportunity, entry point, mechanism, control bypassed, concealment, consequence, warning indicators, containment and long-term response.</p><div class="board-footer">04 / 07 · Scenario language is conditional and linked to the recorded analytical universe. Source: persisted assessment and management review record.</div></section>`,
    `<section class="board-page"><div class="board-kicker">05 · Decisions</div><h2>Leadership choices define ownership and trade-offs</h2>${model.leadershipDecisions.slice(0, 4).map((d) => { const review = model.decisionReviews.find((candidate) => candidate.decisionId === d.id); return `<div class="board-decision-row"><div><strong>${short(d.decisionRequired)}</strong><span>${short(d.whyNow)}</span><small>Options · ${short(review?.viableOptions.join('; '))}</small><small>Option analysis · ${short(publicDecisionOptions(review))}</small><small>MK recommendation · ${short(review?.reviewerRecommendation ?? d.recommendedDecision)}</small><small>Recommendation rationale · ${short(review?.recommendationRationale)}</small><small>Management / board decision · ${short(review?.managementBoardDecision)}</small></div><div><small>Decision owner</small><strong>${short(review?.owner ?? d.accountableExecutive)}</strong><small>Decision deadline · ${humanDate(review?.targetDate ?? d.deadline)}</small></div></div>`; }).join('')}<p class="board-muted">Each decision keeps three viable options, cost, benefit, trade-off, recommendation, rationale, rejection reason, owner and deadline in the annotated register.</p><div class="board-footer">05 / 07 · Decisions, options and trade-offs are traceable in the annotated register.</div></section>`,
    `<section class="board-page"><div class="board-kicker">06 · Priorities</div><h2>Sequenced action builds a repeatable control cycle</h2><div class="priority-lane">${['30 days', '60 days', '90 days'].map((period) => `<div><h3>${period}</h3>${model.roadmapActions.filter((a) => a.period === period).slice(0, 3).map((a) => `<p><strong>${short(a.deliverable)}</strong><br><small>${short(a.accountableExecutive)} · ${short(publicCompletionEvidence(a.evidenceOfCompletion))}</small></p>`).join('') || '<p class="board-muted">No action supplied.</p>'}</div>`).join('')}</div><div class="board-rule"><strong>Months 4–6:</strong> embed the approved designs and first management-information cycle. <strong>Months 7–12:</strong> mature the cycle through agreed effectiveness measures and the refreshed risk view.</div><div class="board-footer">06 / 07 · Completion means operating evidence and an effectiveness measure, not a narrative update.</div></section>`,
    `<section class="board-page"><div class="board-kicker">07 · Oversight</div><h2>The board should track ownership, information and ageing</h2><div class="board-track-grid"><div><strong>Information coverage</strong><span>Supplied records and open information items within the named scope.</span></div><div><strong>Open information</strong><span>Count and age of recorded or further-basis items.</span></div><div><strong>Action ageing</strong><span>Open, blocked and overdue management actions by owner.</span></div><div><strong>Risk movement</strong><span>Priority risk changes, accepted residual risk and scenario indicators.</span></div></div>${callout('Next board checkpoint', model.managementDecisions[0]?.targetDate ? `Review the agreed action set by ${humanDate(model.managementDecisions[0].targetDate)}, with proof and owner updates.` : 'Set the next checkpoint date and require the annotated register as the supporting pack.', 'amber')}<p class="board-muted">Control completeness: What (objective); Who (accountable executive); Population (complete in-scope population); Frequency (operating cycle); Evidence retained; Independent check; Escalation trigger / recipient; SLA; Effectiveness measure; Failure response.</p><p class="board-muted">This readout is bounded by the named scope and is not a legal, forensic or certification conclusion.</p><div class="board-footer">07 / 07 · Close with decisions, owners, proof and the next checkpoint. Source: persisted assessment and management review record.</div></section>`
  ];
  const css = `<style>
    :root { ${MK_CSS_VARIABLES} }
    @page { size: A4; margin: 0; } * { box-sizing: border-box; } body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: var(--mk-ink); } .board-page { width: 210mm; height: 297mm; padding: 22mm 19mm 18mm; position: relative; page-break-after: always; overflow: hidden; } .board-page:last-child { page-break-after: auto; } .board-cover { background: var(--mk-navy-700); color: var(--mk-white); display:flex; flex-direction:column; justify-content:center; } .board-kicker { text-transform:uppercase; letter-spacing:.12em; font-size:9pt; font-weight:700; color:var(--mk-brass); margin-bottom:8mm; } .board-cover h1 { font-size:43pt; line-height:1; margin:0 0 7mm; letter-spacing:-.04em; } .board-cover p { font-size:16pt; color:var(--mk-rule); } .board-decision { margin-top:35mm; padding:8mm; border-left:5px solid var(--mk-brass); background:var(--mk-navy-500); font-size:10pt; } .board-decision strong { display:block; font-size:15pt; line-height:1.25; margin-top:3mm; } h2 { color:var(--mk-navy-700); font-size:30pt; line-height:1.05; letter-spacing:-.03em; margin:0 0 9mm; } h3 { color:var(--mk-navy-700); font-size:14pt; margin:0 0 4mm; } .board-lede { font-size:16pt; line-height:1.32; color:var(--mk-navy-500); max-width:164mm; } .board-metrics { display:grid; grid-template-columns:repeat(4,1fr); gap:4mm; margin:14mm 0; } .board-metrics > div { background:var(--mk-neutral-bg); border-top:4px solid var(--mk-navy-700); padding:5mm; min-height:33mm; } .board-metrics span,.board-metrics small { display:block; color:var(--mk-muted); font-size:8pt; } .board-metrics strong { display:block; font-size:26pt; color:var(--mk-navy-700); margin:2mm 0; } .board-rule { background:var(--mk-major-bg); border-left:5px solid var(--mk-brass); padding:6mm; margin-top:10mm; font-size:13pt; line-height:1.3; } .board-columns { display:grid; grid-template-columns:1fr 1fr; gap:10mm; } .board-item { padding:5mm 0; border-top:1px solid var(--mk-rule); } .board-item strong,.board-item span { display:block; } .board-item span { margin-top:2mm; color:var(--mk-muted); } .board-item.good { border-top-color:var(--mk-confirmed); } .board-item.warn { border-top-color:var(--mk-critical); } .board-scenario { border-left:4px solid var(--mk-navy-700); padding:5mm 6mm; margin:5mm 0; background:var(--mk-neutral-bg); } .scenario-title { font-size:14pt; font-weight:700; color:var(--mk-navy-700); margin-bottom:2mm; } .board-scenario small { display:block; color:var(--mk-muted); margin-top:3mm; } .board-decision-row { display:grid; grid-template-columns:1.6fr .8fr; gap:10mm; padding:6mm 0; border-bottom:1px solid var(--mk-rule); } .board-decision-row strong,.board-decision-row span { display:block; } .board-decision-row span { margin-top:2mm; color:var(--mk-muted); } .board-decision-row small { display:block; text-transform:uppercase; letter-spacing:.08em; color:var(--mk-muted); font-size:7pt; margin:1mm 0; } .priority-lane { display:grid; grid-template-columns:repeat(3,1fr); gap:5mm; } .priority-lane > div { background:var(--mk-neutral-bg); padding:5mm; min-height:95mm; border-top:4px solid var(--mk-navy-700); } .priority-lane p { border-top:1px solid var(--mk-rule); padding-top:4mm; margin-top:4mm; } .priority-lane small { color:var(--mk-muted); } .board-track-grid { display:grid; grid-template-columns:1fr 1fr; gap:5mm; } .board-track-grid > div { border:1px solid var(--mk-rule); padding:6mm; min-height:35mm; } .board-track-grid strong,.board-track-grid span { display:block; } .board-track-grid span { color:var(--mk-muted); margin-top:2mm; } .board-muted { color:var(--mk-muted); } .callout { padding:6mm; margin:7mm 0; border-left:5px solid var(--mk-brass); background:var(--mk-major-bg); } .callout .callout-label { text-transform:uppercase; letter-spacing:.1em; font-size:7pt; font-weight:700; } .callout p { font-size:13pt; margin:2mm 0 0; } .board-footer { position:absolute; bottom:9mm; left:19mm; right:19mm; border-top:1px solid var(--mk-navy-rule); padding-top:3mm; color:var(--mk-muted); font-size:8pt; } .board-cover .board-footer { color:var(--mk-rule); border-top-color:var(--mk-white-25); }
  </style>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Board readout</title>${css}</head><body>${pages.join('')}</body></html>`;
}
