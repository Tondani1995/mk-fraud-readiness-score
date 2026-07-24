import type { AssembledReportData, RoadmapItem, SelectedContent } from '../types';
import { buildAdvisoryEvidenceModel, type AdvisoryEvidenceModel } from '../evidence-model';
import { assertCommercialReportQuality } from '../commercial-quality';
import { gapKey } from '../select-content-blocks';
import type { TocEntry } from '../pdf-navigation';

const BAND_COLOR: Record<string, string> = {
  Reactive: '#a61b1b',
  Developing: '#a84f08',
  Structured: '#173f68',
  Strategic: '#167044',
  'Not scored': '#6c665b'
};

const DOMAIN_GROUPS = [
  {
    title: 'Foundations: ownership, awareness and reporting culture',
    subtitle: 'Executive ownership, risk identification, workforce awareness and safe reporting.',
    domains: ['Fraud Leadership and Governance', 'Fraud Risk Identification', 'Fraud Culture and Awareness', 'Whistleblowing and Reporting Culture']
  },
  {
    title: 'Operational defence: controls, detection and third parties',
    subtitle: 'Day-to-day prevention, detection and supplier-facing control operation.',
    domains: ['Operational Fraud Controls', 'Fraud Detection Capability', 'Third-Party and Supply Chain Fraud Risk']
  },
  {
    title: 'Response and evolution: incidents, digital risk and improvement',
    subtitle: 'Incident response, digital and identity defence, and continuous control improvement.',
    domains: ['Fraud Incident Response', 'Digital and Identity Fraud Risk', 'Continuous Improvement and Fraud Risk Monitoring']
  }
];

/**
 * Checkpoint F controller review blocker 4 -- executive core vs. implementation appendix.
 * Only the highest-materiality findings/risks are rendered in full narrative-card form in the
 * core; every finding/risk/control/evidence-item/agenda-item is still rendered, in compact-table
 * form, in the appendix (see buildAppendixSections()) -- nothing is dropped, only the *depth* of
 * presentation differs by priority.
 */
const TOP_FINDINGS_COUNT = 5;
const TOP_RISKS_COUNT = 4;
const TOP_CONTRADICTIONS_COUNT = 2;
const TOP_SCENARIOS_COUNT = 3;

/**
 * Checkpoint F controller review blocker 7 -- the exact heading strings used for both the
 * customer-facing contents page and the PDF bookmark tree, and the lookup keys
 * extractHeadingPageMap() (pdf-navigation.ts) searches for in the rendered PDF text. Keep every
 * key unique and stable; renderReportHtml() renders each as the literal h2 text of its section.
 */
export const REPORT_TOC_ENTRIES: TocEntry[] = [
  { key: 'Executive summary', label: 'Executive summary' },
  { key: 'What the result means', label: 'What the result means' },
  { key: 'Domain overview', label: 'Domain overview' },
  { key: 'Priority findings, contradictions and scenarios', label: 'Priority findings, contradictions and scenarios' },
  { key: 'Priority risks', label: 'Priority risks' },
  { key: 'Leadership decisions and roadmap', label: 'Leadership decisions and roadmap' },
  { key: 'Evidence validation priorities', label: 'Evidence validation priorities' },
  { key: 'Methodology, limitations and next steps', label: 'Methodology, limitations and next steps' },
  // key is deliberately not the bare word "Appendix" -- the core sections cross-reference the
  // appendix by name ("...is in Appendix A1"), so a plain "Appendix" search key would match that
  // cross-reference text on an earlier page instead of the actual appendix divider page.
  { key: 'The complete, authoritative registers behind the executive summary', label: 'Appendix', appendix: true },
  { key: 'A1. Complete material findings register', label: 'A1. Complete material findings register', appendix: true },
  { key: 'A2. Complete risk register', label: 'A2. Complete risk register', appendix: true },
  { key: 'A3. Complete control improvement register', label: 'A3. Complete control improvement register', appendix: true },
  { key: 'A4. Complete evidence checklist', label: 'A4. Complete evidence checklist', appendix: true },
  { key: 'A5. Functional agenda', label: 'A5. Functional agenda', appendix: true },
  { key: 'A6. Methodology question-code mapping', label: 'A6. Methodology question-code mapping', appendix: true },
  { key: 'A7. Definitions and score basis', label: 'A7. Definitions and score basis', appendix: true }
];

/** The exact marker text that begins the appendix -- used by the audit script to scope its
 * internal-question-code check to the core report only (the appendix mapping table is the one
 * place question codes are intentionally shown). */
export const APPENDIX_START_MARKER = 'Appendix';

function esc(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function score(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return String(Math.round(Number(value)));
}

function pct(value: number | null | undefined): string {
  const rendered = score(value);
  return rendered === '—' ? rendered : `${rendered}%`;
}

function bandFor(value: number | null): string {
  if (value === null) return 'Not scored';
  if (value < 40) return 'Reactive';
  if (value < 65) return 'Developing';
  if (value < 80) return 'Structured';
  return 'Strategic';
}

function list(items: string[]): string {
  return items.length > 0
    ? `<ul>${items.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>`
    : '<p>None recorded.</p>';
}

function labelled(label: string, value: unknown): string {
  return `<div class="field"><div class="field-label">${esc(label)}</div><div class="field-value">${esc(value || 'Not recorded')}</div></div>`;
}

function labelledList(label: string, items: string[]): string {
  return `<div class="field"><div class="field-label">${esc(label)}</div><div class="field-value">${list(items)}</div></div>`;
}

function section(title: string, heading: string, body: string, className = ''): string {
  return `<section class="report-section ${className}">
    <div class="section-kicker">${esc(title)}</div>
    <h2>${esc(heading)}</h2>
    ${body}
  </section>`;
}

/** A subsection heading inside a merged section -- does not force a new PDF page (unlike h2/section()
 * above), which is the main lever used to remove pages 4 previously spent purely on forced breaks
 * between short, related sections. */
function subsection(heading: string, body: string): string {
  return `<div class="subsection-heading"><h2>${esc(heading)}</h2></div>${body}`;
}

function table(headers: string[], rows: string[], className = 'compact-register'): string {
  return `<table class="continuing-table ${className}"><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

export function renderReportHtml(
  data: AssembledReportData,
  content: SelectedContent,
  roadmap: { agenda: RoadmapItem[] },
  preparedEvidenceModel?: AdvisoryEvidenceModel,
  tocPageMap?: Record<string, number>
): string {
  const sr = data.scoreRun;
  const evidenceModel = preparedEvidenceModel ?? buildAdvisoryEvidenceModel(data);
  const quality = assertCommercialReportQuality({ data, content, roadmap, evidenceModel });
  if (quality.warnings.length > 0) {
    console.warn('COMMERCIAL_QUALITY_WARNING', {
      assessmentReference: data.assessmentReference,
      warningCodes: quality.warnings.map((issue) => issue.code),
      warningCount: quality.warnings.length
    });
  }

  const generatedDate = new Date(data.generatedAt).toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC'
  });
  const bandColor = BAND_COLOR[sr.finalMaturity] ?? '#173f68';
  const domainByName = new Map(data.domainResults.map((domain) => [domain.domainName, domain]));
  const exposurePct = Math.min(100, Math.max(0, Number(sr.exposureScore) || 0));
  const readinessPct = Math.min(100, Math.max(0, Number(sr.overallScore) || 0));
  const plotX = 5 + exposurePct * 0.62;
  const plotY = 5 + (100 - readinessPct) * 0.62;
  // The exposure headline must always be derived from the authoritative sr.exposureBand (never
  // re-derived from raw exposurePct/readinessPct thresholds), so it can never diverge from the
  // exposure band shown elsewhere in the report. See Checkpoint F controller review blocker 2.
  const readinessDescriptor = readinessPct >= 50 ? 'stronger reported readiness' : 'developing reported readiness';
  const exposurePosition = `${sr.exposureBand} exposure with ${readinessDescriptor}`;

  const heatmap = data.domainResults.map((domain) => {
    const band = bandFor(domain.rawScore);
    return `<div class="heat-cell" style="border-top-color:${BAND_COLOR[band] ?? '#173f68'}">
      <div class="heat-name">${esc(domain.domainName)}</div>
      <div class="heat-score">${score(domain.rawScore)}</div>
      <div class="heat-band">${esc(band)}</div>
    </div>`;
  }).join('');

  const exposureRows = data.exposureAnswers.map((answer) => {
    const level = answer.maxPoints > 0 ? answer.pointsAwarded / answer.maxPoints : 0;
    const color = level > 0.66 ? '#a61b1b' : level > 0.33 ? '#a84f08' : '#167044';
    return `<div class="bar-row">
      <div><strong>${esc(answer.name)}</strong><span>${esc(answer.selectedLabel)}</span></div>
      <div class="bar-track"><i style="width:${Math.round(level * 100)}%;background:${color}"></i></div>
    </div>`;
  }).join('');

  const priorityGaps = data.criticalMajorGaps.map((gap) => {
    const commentary = content.gapCommentary[gapKey(gap.domainCode, gap.questionCode)];
    return `<div class="compact-card alert-card">
      <div class="card-eyebrow">${gap.isCriticalGap ? 'Critical control condition' : 'Major control condition'} · ${esc(gap.domainName)}</div>
      <h3>${esc(gap.prompt)}</h3>
      <p>${esc(commentary?.body ?? 'Leadership should validate the operating evidence and remediation ownership for this recorded condition.')}</p>
    </div>`;
  }).join('');

  const capCards = data.maturityCapEvents.map((event) => `<div class="compact-card amber-card">
    <div class="card-eyebrow">Maturity constraint · ${esc(event.relatedDomainName ?? 'Cross-domain')}</div>
    <h3>${esc(event.relatedQuestionPrompt ?? event.reason)}</h3>
    <p>This recorded condition limits the final maturity reading to <strong>${esc(event.capTo)}</strong>. The constraint remains a self-assessment result until operating evidence is independently examined.</p>
  </div>`).join('');

  const domainGroupBlocks = DOMAIN_GROUPS.map((group) => {
    const cards = group.domains.map((domainName) => {
      const domain = domainByName.get(domainName);
      if (!domain) return '';
      const narrative = content.domainNarratives[domainName];
      const band = bandFor(domain.rawScore);
      const gaps = data.criticalMajorGaps.filter((gap) => gap.domainName === domainName);
      return `<div class="compact-card domain-card">
        <div class="domain-top"><h3>${esc(domainName)}</h3><span style="color:${BAND_COLOR[band]}">${score(domain.rawScore)}/100</span></div>
        <div class="mini-track"><i style="width:${domain.rawScore ?? 0}%;background:${BAND_COLOR[band]}"></i></div>
        <p><strong>${esc(narrative?.title ?? band)}</strong></p>
        <p>${esc(narrative?.body ?? 'No domain narrative was produced.')}</p>
        ${gaps.map((gap) => `<div class="inline-alert">${gap.isCriticalGap ? 'Critical' : 'Major'} condition: ${esc(gap.prompt)}</div>`).join('')}
      </div>`;
    }).join('');
    return `<p class="lede">${esc(group.subtitle)}</p><div class="stack">${cards}</div>`;
  });

  const sortedFindings = [...evidenceModel.materialFindings].sort((a, b) => b.materialityScore - a.materialityScore);
  const topFindings = sortedFindings.slice(0, TOP_FINDINGS_COUNT);
  const sortedRisks = [...evidenceModel.riskRegister].sort((a, b) => {
    const rank: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };
    return rank[b.priority] - rank[a.priority];
  });
  const topRisks = sortedRisks.slice(0, TOP_RISKS_COUNT);
  const topContradictions = evidenceModel.contradictions.slice(0, TOP_CONTRADICTIONS_COUNT);
  const topScenarios = evidenceModel.scenarios.slice(0, TOP_SCENARIOS_COUNT);

  const findingCard = (finding: AdvisoryEvidenceModel['materialFindings'][number], index: number) => `<article class="long-record finding-record">
    <div class="record-heading"><div><span class="record-number">Material finding ${index + 1}</span><h3>${esc(finding.title)}</h3></div><span class="priority-badge">${esc(finding.materialityClass.replaceAll('_', ' '))}</span></div>
    <div class="record-grid two">
      ${labelled('Domain', finding.domainName)}
      ${labelled('Recorded control condition', `${finding.questionPrompt} — ${finding.responseLabel}`)}
      ${labelled('Diagnosis', finding.diagnosis)}
      ${labelled('Why it matters', finding.whyItMatters)}
      ${labelled('Recommended control', finding.recommendedControl)}
      ${labelled('Accountable executive', finding.accountableOwner)}
      ${labelled('Implementation', `${finding.implementationDifficulty} difficulty · ${finding.targetPeriod}`)}
      ${labelled('Remaining limitation', finding.selfAssessmentLimitation)}
    </div>
  </article>`;

  const contradictionCard = (item: AdvisoryEvidenceModel['contradictions'][number], index: number) => `<article class="compact-card amber-card">
    <div class="card-eyebrow">Contradiction ${index + 1}</div>
    <h3>${esc(item.title)}</h3>
    ${labelled('What the assessment shows', item.drivingResponses)}
    ${labelled('Why it matters', item.whyItMatters)}
    ${labelled('Leadership verification', item.whatLeadershipShouldVerify)}
  </article>`;

  const scenarioCard = (item: AdvisoryEvidenceModel['scenarios'][number], index: number) => `<article class="long-record scenario-record">
    <div class="record-heading"><div><span class="record-number">Scenario ${index + 1} · ${esc(item.scenarioBasis.replaceAll('_', ' '))}</span><h3>${esc(item.title)}</h3></div></div>
    <p class="disclaimer">${esc(item.disclaimer)}</p>
    <div class="record-grid two">
      ${labelled('Entry point', item.entryPoint)}
      ${labelled('Sequence', item.fraudSequence)}
      ${labelledList('Early warning indicators', item.earlyWarningIndicators)}
      ${labelled('Immediate containment', item.immediateContainment)}
      ${labelled('Longer-term response', item.longerTermResponse)}
    </div>
  </article>`;

  const riskCard = (risk: AdvisoryEvidenceModel['riskRegister'][number], index: number) => `<article class="long-record risk-record">
    <div class="record-heading"><div><span class="record-number">Risk ${index + 1} · ${esc(risk.affectedDomains.join(', '))}</span><h3>${esc(risk.title)}</h3></div><span class="priority-badge priority-${risk.priority.toLowerCase()}">${esc(risk.priority)}</span></div>
    <div class="risk-statement">${esc(risk.riskStatement)}</div>
    <div class="record-grid two">
      ${labelled('Cause', risk.cause)}
      ${labelled('Risk event', risk.riskEvent)}
      ${labelled('Likelihood', `${risk.likelihood} — ${risk.likelihoodRationale}`)}
      ${labelled('Impact', `${risk.impact} — ${risk.impactRationale}`)}
      ${labelled('Current control position', risk.currentControlPosition)}
      ${labelled('Required treatment', risk.requiredTreatment)}
      ${labelled('Accountable executive', risk.accountableExecutive)}
      ${labelled('Target period', risk.targetPeriod)}
    </div>
  </article>`;

  const priorityFindingsBlock = topFindings.map(findingCard).join('');
  const priorityContradictionsBlock = topContradictions.length > 0
    ? subsection('Contradictions', topContradictions.map(contradictionCard).join(''))
    : subsection('Contradictions', '<div class="clean-note"><strong>No material contradiction was detected.</strong><p>Independent evidence remains necessary to validate the reported control position.</p></div>');
  const priorityScenariosBlock = subsection('Scenarios and assurance tests', topScenarios.map(scenarioCard).join(''));
  const priorityRisksBlock = topRisks.map(riskCard).join('');

  const decisionRows = evidenceModel.leadershipDecisions.map((decision, index) => `<tr>
    <td>${index + 1}</td>
    <td>${esc(decision.decisionRequired)}</td>
    <td>${esc(decision.recommendedDecision)}</td>
    <td>${esc(decision.accountableExecutive)}</td>
    <td>${esc(decision.targetPeriod)}</td>
    <td>${esc(decision.consequenceOfDelay)}</td>
  </tr>`);
  const decisionsBlock = subsection('Leadership decisions required', `
    <p class="section-note">Every decision below carries a named accountable executive and a fixed target period; each is grounded in the material findings, risks and controls set out in this report and in the complete registers in the appendix.</p>
    ${table(['No.', 'Decision required', 'Recommended decision', 'Accountable executive', 'Target period', 'Consequence of delay'], decisionRows)}`);

  const roadmapRows = evidenceModel.roadmapActions.map((action) => `<tr>
    <td>${esc(action.period)}</td>
    <td>${esc(action.domainName)}</td>
    <td>${esc(action.deliverable)}</td>
    <td>${esc(action.accountableExecutive)}</td>
    <td>${esc(action.successMeasure)}</td>
  </tr>`);
  const roadmapBlock = subsection('30/60/90-day roadmap', `
    <p class="section-note">This is the report's only action roadmap. Dependencies and measures are carried directly from the material findings, risks and controls set out in this report.</p>
    ${table(['Period', 'Domain', 'Deliverable', 'Accountable executive', 'Success measure'], roadmapRows)}`);

  const evidenceGroupedByFinding = new Map<string, typeof evidenceModel.evidenceChecklist>();
  for (const item of evidenceModel.evidenceChecklist) {
    const key = item.linkedFindingIds[0] ?? 'unlinked';
    evidenceGroupedByFinding.set(key, [...(evidenceGroupedByFinding.get(key) ?? []), item]);
  }
  const priorityEvidenceRows = topFindings.flatMap((finding) => (evidenceGroupedByFinding.get(finding.id) ?? []).slice(0, 2)).map((item, index) => `<tr>
    <td>${index + 1}</td>
    <td>${esc(item.artefact)}</td>
    <td>${esc(item.provesWhat)}</td>
    <td>${esc(item.likelyOwner)}</td>
    <td>${esc(item.reviewStatus)}</td>
  </tr>`);
  const evidencePriorityBlock = `
    <p class="lede">The complete evidence checklist (${evidenceModel.evidenceChecklist.length} items) is in the appendix. The items below are the immediate validation priorities linked to the top material findings above.</p>
    ${table(['No.', 'Evidence artefact', 'What it proves', 'Likely owner', 'Status'], priorityEvidenceRows)}
    <p class="section-note">Required population for every item: the complete in-scope population for the stated operating period, reconciled to the source system or register. Sampling expectation: review the complete population where feasible; otherwise use a documented risk-based sample including exceptions, changes and overdue items. Every item begins with the status "Not yet requested"; status changes require an evidence-review process outside this report. This remains a self-assessment: no document, interview, transaction sample or system evidence has been independently verified for any item.</p>`;

  const methodology = `<p>This report is generated from a structured self-assessment across ten fraud-risk-management domains. The score, maturity constraints and advisory model use only the recorded assessment inputs and the deterministic methodology.</p>
    <p><strong>Limitations.</strong> This is not a forensic investigation, external audit, compliance certification or guarantee. Responses were not independently verified. Findings, scenarios and recommendations are decision-support material; leadership should obtain and test the specified operating evidence before treating a control as effective or a finding as resolved.</p>
    <p><strong>Next step.</strong> Commission independent validation of the operating evidence listed in this report's evidence-validation section and appendix, in the sequence set by the leadership decisions above.</p>`;

  const priorityAndFalseComfort = data.maturityCapEvents.length > 0
    ? [
        subsection('The recorded conditions requiring first attention', priorityGaps),
        subsection(content.falseComfort.title, `${capCards}<div class="false-comfort"><p>${esc(content.falseComfort.body)}</p></div>`)
      ].join('\n')
    : subsection(
        data.criticalMajorGaps.length > 0 ? 'The recorded conditions requiring first attention' : 'No critical or major gap was recorded',
        `${priorityGaps || '<div class="clean-note"><strong>No critical or major gaps were recorded.</strong><p>The strong self-reported result remains subject to evidence-based assurance.</p></div>'}
        <div class="subsection-heading"><h2>${esc(content.falseComfort.title)}</h2></div>
        <div class="false-comfort"><p>${esc(content.falseComfort.body)}</p></div>`
      );

  // ---- Appendix (blocker 4): the complete, authoritative registers in compact table form. ----
  const findingsAppendixRows = sortedFindings.map((finding, index) => `<tr>
    <td>${index + 1}</td>
    <td>${esc(finding.domainName)}</td>
    <td>${esc(finding.questionPrompt)} — ${esc(finding.responseLabel)}</td>
    <td>${esc(finding.diagnosis)}</td>
    <td>${esc(finding.recommendedControl)}</td>
    <td>${esc(finding.accountableOwner)}<br/>${esc(finding.targetPeriod)}</td>
  </tr>`);
  const risksAppendixRows = sortedRisks.map((risk, index) => `<tr>
    <td>${index + 1}</td>
    <td><span class="priority-badge priority-${risk.priority.toLowerCase()}">${esc(risk.priority)}</span></td>
    <td>${esc(risk.title)}</td>
    <td>${esc(risk.cause)}</td>
    <td>${esc(risk.riskEvent)}</td>
    <td>${esc(risk.requiredTreatment)}</td>
  </tr>`);
  const controlsAppendixRows = evidenceModel.controlImprovements.map((control, index) => `<tr>
    <td>${index + 1}</td>
    <td>${esc(control.controlObjective)}</td>
    <td>${esc(control.currentState)}</td>
    <td>${esc(control.controlDesign)}</td>
    <td>${esc(control.accountableExecutive)}<br/>${esc(control.targetPeriod)}</td>
  </tr>`);
  const evidenceAppendixRows = evidenceModel.evidenceChecklist.map((item, index) => `<tr>
    <td>${index + 1}</td>
    <td>${esc(item.artefact)}</td>
    <td>${esc(item.provesWhat)}</td>
    <td>${esc(item.likelyOwner)}</td>
    <td>${esc(item.reviewStatus)}</td>
  </tr>`);
  const agendaAppendixRows = evidenceModel.functionalAgenda.map((item, index) => `<tr>
    <td>${index + 1}</td>
    <td>${esc(item.function)}</td>
    <td>${esc(item.question)}</td>
  </tr>`);
  // This is the one place a methodology question code is intentionally shown -- see
  // APPENDIX_START_MARKER above and the audit script's core-only PDF_INTERNAL_METHOD_CODE_OVERUSE scope.
  const methodologyMappingRows = sortedFindings.map((finding, index) => `<tr>
    <td>${index + 1}</td>
    <td>${esc(finding.domainName)}</td>
    <td>${esc(finding.questionPrompt)}</td>
    <td>${esc(finding.questionCode)}</td>
  </tr>`);
  const definitionsBlock = `<table class="continuing-table compact-register"><thead><tr><th>Domain</th><th>Coverage</th><th>Reported score</th></tr></thead><tbody>${data.domainResults.map((domain) => `<tr><td>${esc(domain.domainName)}</td><td>${pct(domain.coveragePct)}</td><td>${score(domain.rawScore)}/100</td></tr>`).join('')}</tbody></table>
    <p class="section-note">Priority (risk register) and materiality (findings) are derived from the assessment evidence and the deterministic methodology; neither is an independent risk assessment. Likelihood/impact ratings are qualitative, not statistical probabilities.</p>`;

  const appendixSections = [
    `<section class="report-section appendix-divider"><div class="section-kicker">Appendix</div><h2>Appendix</h2><p class="lede">The complete, authoritative registers behind the executive summary above. Every material finding, risk, control, evidence item and functional-agenda item is listed here in full, whether or not it was highlighted earlier in this report.</p></section>`,
    section('A1', 'A1. Complete material findings register', table(['No.', 'Domain', 'Recorded condition', 'Diagnosis', 'Recommended control', 'Owner / Target'], findingsAppendixRows), 'long-section'),
    section('A2', 'A2. Complete risk register', table(['No.', 'Priority', 'Risk', 'Cause', 'Risk event', 'Required treatment'], risksAppendixRows), 'long-section'),
    section('A3', 'A3. Complete control improvement register', table(['No.', 'Objective', 'Current state', 'Control design', 'Owner / Target'], controlsAppendixRows), 'long-section'),
    section('A4', 'A4. Complete evidence checklist', table(['No.', 'Evidence artefact', 'What it proves', 'Likely owner', 'Status'], evidenceAppendixRows), 'long-section'),
    section('A5', 'A5. Functional agenda', table(['No.', 'Function', 'Question for the review'], agendaAppendixRows), 'long-section'),
    section('A6', 'A6. Methodology question-code mapping', `<p class="section-note">Internal methodology reference codes are shown here only, for auditability -- they do not appear in the executive summary above.</p>${table(['No.', 'Domain', 'Recorded condition', 'Methodology reference'], methodologyMappingRows)}${subsection('A7. Definitions and score basis', definitionsBlock)}`)
  ].join('\n');

  const tocRows = REPORT_TOC_ENTRIES.map((entry) => {
    const pageNumber = tocPageMap?.[entry.key];
    return `<tr class="${entry.appendix ? 'toc-appendix-row' : ''}"><td>${esc(entry.label)}</td><td class="toc-page">${pageNumber ?? '—'}</td></tr>`;
  }).join('');

  const parts = [
    `<section class="cover">
      <div>
        <div class="cover-brand">MK FRAUD INSIGHTS</div>
        <div class="cover-rule"></div>
        <div class="cover-eyebrow">Independent fraud risk advisory</div>
        <h1>Fraud Readiness<br/>Advisory Report</h1>
        <p class="cover-subtitle">An evidence-linked view of reported readiness, material risk, control priorities and leadership decisions.</p>
      </div>
      <div class="cover-client"><span>Prepared exclusively for</span><strong>${esc(data.organisationName)}</strong></div>
      <div class="cover-meta">Report reference ${esc(data.reportReference)}<br/>Generated ${esc(generatedDate)}<br/>${esc(data.packageName)} package</div>
      <div class="cover-confidential">Confidential · Internal leadership use</div>
    </section>`,
    section('Contents', 'Contents', `<table class="continuing-table toc-table"><tbody>${tocRows}</tbody></table>`),
    section('Executive summary', 'Executive summary', `
      ${subsection(content.executiveSummary.title, `
      <div class="diagnosis">
        <div class="score-tile"><strong>${score(sr.overallScore)}</strong><span>out of 100</span><b style="background:${bandColor}">${esc(sr.finalMaturity)}</b></div>
        <div><p class="executive-copy">${esc(content.executiveSummary.body)}</p><div class="attention-box"><strong>Leadership attention</strong><p>${esc(content.leadershipAttention.body)}</p></div></div>
      </div>
      <div class="metric-grid">
        <div><span>Exposure</span><strong>${esc(sr.exposureBand)}</strong></div>
        <div><span>Coverage</span><strong>${pct(sr.coveragePct)}</strong></div>
        <div><span>Critical gaps</span><strong>${sr.criticalGapCount}</strong></div>
        <div><span>Major gaps</span><strong>${sr.majorGapCount}</strong></div>
      </div>`)}
      ${subsection('The aggregate result and its ten underlying domains', `<p class="lede">The ${esc(sr.finalMaturity)} result describes the reported self-assessment position. It does not, by itself, establish operating effectiveness.</p><div class="heatmap">${heatmap}</div>`)}
      ${subsection(exposurePosition, `
      <div class="exposure-layout">
        <div><div class="matrix"><i style="left:${plotX}mm;top:${plotY}mm"></i></div><div class="axis-note">Exposure increases left to right. Reported readiness increases bottom to top.</div></div>
        <div><p>Exposure describes the operating model's inherent fraud risk. Readiness describes the reported control response. Neither measure is independent assurance.</p><div class="bar-row-list">${exposureRows}</div></div>
      </div>`)}
      ${subsection('What the result means', priorityAndFalseComfort)}`, 'long-section'),
    section('Domain overview', 'Domain overview', domainGroupBlocks.map((block, index) => subsection(DOMAIN_GROUPS[index].title, block)).join(''), 'long-section'),
    section('Priority findings, contradictions and scenarios', 'Priority findings, contradictions and scenarios', `
      <p class="lede">The ${topFindings.length} conditions selected for executive attention from ${sortedFindings.length} recorded findings. The complete register is in Appendix A1.</p>
      ${priorityFindingsBlock}
      ${priorityContradictionsBlock}
      ${priorityScenariosBlock}`, 'long-section'),
    section('Priority risks', 'Priority risks', `
      <p class="section-note">Priority is derived from the assessment evidence and is not an independent risk assessment. The complete risk register (${sortedRisks.length} risks) is in Appendix A2.</p>
      ${priorityRisksBlock}`, 'long-section'),
    section('Leadership decisions and roadmap', 'Leadership decisions and roadmap', `${decisionsBlock}${roadmapBlock}`, 'long-section'),
    section('Evidence validation priorities', 'Evidence validation priorities', evidencePriorityBlock, 'long-section'),
    section('Methodology, limitations and next steps', 'Methodology, limitations and next steps', `${methodology}<div class="closing-note"><strong>Controller review remains required.</strong><p>This report is a commercial release candidate. Final visual and release approval is not implied by generation.</p></div>`),
    appendixSections
  ].join('\n');

  return `<!doctype html>
<html lang="en-ZA">
<head>
<meta charset="utf-8"/>
<title>MK Essential Report — ${esc(data.organisationName)}</title>
<style>
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { color: #171713; font: 9.2pt/1.42 Georgia, 'Times New Roman', serif; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  h1, h2, h3, strong, b, th, .cover-brand, .cover-eyebrow, .section-kicker, .field-label, .record-number, .priority-badge { font-family: Arial, Helvetica, sans-serif; }
  h1, h2, h3, p { margin-top: 0; }
  h2 { color: #071b3d; font-size: 20pt; line-height: 1.15; margin-bottom: 5mm; }
  h3 { color: #102a52; font-size: 10.5pt; line-height: 1.25; margin-bottom: 2mm; }
  p { margin-bottom: 3mm; }
  ul { margin: 1mm 0 0; padding-left: 5mm; }
  li { margin-bottom: 1mm; }
  .cover, .report-section { break-before: page; page-break-before: always; }
  .cover { break-before: auto; min-height: 270mm; padding: 19mm; color: #fff; background: linear-gradient(145deg,#06152f 0%,#102e57 70%,#244c72 100%); display: flex; flex-direction: column; justify-content: space-between; }
  .cover-brand { font-size: 10pt; font-weight: 700; letter-spacing: 2.4px; }
  .cover-rule { width: 28mm; border-top: 1.2mm solid #d7b56d; margin: 9mm 0; }
  .cover-eyebrow { color: #c8d5e5; font-size: 8pt; letter-spacing: 1.8px; text-transform: uppercase; }
  .cover h1 { color: #fff; font-size: 31pt; line-height: 1.08; margin: 6mm 0; }
  .cover-subtitle { color: #dce6f1; max-width: 125mm; font-size: 11.5pt; }
  .cover-client { border-top: .3mm solid rgba(255,255,255,.35); border-bottom: .3mm solid rgba(255,255,255,.35); padding: 6mm 0; }
  .cover-client span { display: block; color: #b8c9dc; font: 7.5pt Arial,sans-serif; letter-spacing: 1.4px; text-transform: uppercase; margin-bottom: 2mm; }
  .cover-client strong { font-size: 18pt; }
  .cover-meta, .cover-confidential { color: #c8d5e5; font: 8pt/1.7 Arial,sans-serif; }
  .cover-confidential { text-transform: uppercase; letter-spacing: 1px; }
  .report-section { padding: 1mm 1mm 0; }
  .appendix-divider { min-height: 250mm; }
  .section-kicker { display: inline-block; background: #071b3d; color: #fff; font-size: 7pt; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; padding: 1.7mm 4mm; margin-bottom: 5mm; }
  .lede { color: #5b554b; font-size: 10pt; max-width: 170mm; }
  .section-note, .disclaimer { color: #686158; font-size: 8pt; font-style: italic; }
  .subsection-heading { margin-top: 8mm; break-after: avoid; page-break-after: avoid; }
  .subsection-heading h2 { font-size: 14pt; margin-bottom: 3mm; }
  .subsection-heading:first-child { margin-top: 0; }
  .toc-table td { border: none; padding: 1.6mm 0; font-size: 9.5pt; }
  .toc-table .toc-page { text-align: right; width: 16mm; color: #071b3d; font-weight: 700; }
  .toc-appendix-row td { color: #4e493f; }
  .governance-grid, .support-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 5mm; }
  .support-grid { grid-template-columns: repeat(3,1fr); }
  .compact-card { border: .25mm solid #ded5c5; border-left: 1mm solid #214f79; padding: 4mm; margin-bottom: 3.5mm; break-inside: avoid; page-break-inside: avoid; background: #fff; }
  .amber-card { border-left-color: #9b6418; background: #fdf9f0; }
  .alert-card { border-left-color: #a61b1b; background: #fffafa; }
  .card-eyebrow, .record-number { color: #765b2d; font-size: 6.8pt; font-weight: 700; letter-spacing: .6px; text-transform: uppercase; margin-bottom: 1mm; }
  .diagnosis { display: grid; grid-template-columns: 42mm 1fr; gap: 8mm; align-items: start; }
  .score-tile strong { display: block; color: #071b3d; font-size: 43pt; line-height: .9; }
  .score-tile span { display: block; color: #6c665b; font: 8pt Arial,sans-serif; margin: 2mm 0; }
  .score-tile b { display: inline-block; color: white; padding: 1.4mm 3mm; border-radius: 8mm; font-size: 8pt; }
  .executive-copy { font-size: 11pt; }
  .attention-box, .false-comfort, .closing-note, .clean-note { padding: 4mm 5mm; background: #f3ede2; border-left: 1mm solid #9b6418; break-inside: avoid; }
  .attention-box strong { color: #765b2d; font-size: 8pt; text-transform: uppercase; letter-spacing: .6px; }
  .attention-box p, .closing-note p, .clean-note p { margin: 1mm 0 0; }
  .metric-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 3mm; margin-top: 6mm; }
  .metric-grid div { border: .25mm solid #ded5c5; padding: 3mm; text-align: center; }
  .metric-grid span { display:block; color:#6c665b; font:6.5pt Arial,sans-serif; text-transform:uppercase; letter-spacing:.5px; }
  .metric-grid strong { display:block; color:#071b3d; font-size:12pt; margin-top:1mm; }
  .heatmap { display: grid; grid-template-columns: repeat(5,1fr); gap: 3mm; }
  .heat-cell { border: .25mm solid #ded5c5; border-top: 1.2mm solid; padding: 3mm; min-height: 26mm; break-inside: avoid; }
  .heat-name { min-height: 12mm; font: 7pt/1.25 Arial,sans-serif; color: #4e493f; }
  .heat-score { font: 700 17pt Arial,sans-serif; color:#071b3d; }
  .heat-band { font: 6.5pt Arial,sans-serif; color:#6c665b; }
  .exposure-layout { display:grid; grid-template-columns:72mm 1fr; gap:8mm; }
  .matrix { width:60mm; height:60mm; position:relative; border:.3mm solid #cfc4b2; background:linear-gradient(90deg,rgba(16,46,87,.06) 50%,transparent 50%),linear-gradient(0deg,rgba(16,46,87,.06) 50%,transparent 50%); }
  .matrix:before,.matrix:after { content:''; position:absolute; background:#d8cebd; }
  .matrix:before { left:50%;top:0;bottom:0;width:.2mm; }
  .matrix:after { top:50%;left:0;right:0;height:.2mm; }
  .matrix i { position:absolute;width:5mm;height:5mm;border-radius:50%;background:#071b3d;border:.8mm solid white;box-shadow:0 0 0 .3mm #071b3d;transform:translate(-50%,-50%); }
  .axis-note { color:#6c665b;font:6.5pt Arial,sans-serif;margin-top:2mm; }
  /* Checkpoint F controller review blocker 5: keep the whole (short, ~6-row) exposure-factor list
     together rather than letting it split with a couple of trailing rows stranded on their own
     near-empty page -- the list is small enough that "avoid" here costs at most a few millimetres
     of earlier pushed content, never a forced blank page. */
  .bar-row-list { break-inside: avoid; page-break-inside: avoid; }
  .bar-row { margin-bottom:2mm; break-inside:avoid; }
  .bar-row div:first-child { display:flex;justify-content:space-between;font:7.5pt Arial,sans-serif;gap:3mm; }
  .bar-row span { color:#6c665b; }
  .bar-track,.mini-track { height:2.4mm;background:#e7dfd2;margin-top:1.2mm;overflow:hidden;border-radius:2mm; }
  .bar-track i,.mini-track i { display:block;height:100%; }
  .stack { display:flex;flex-direction:column;gap:1mm; }
  .domain-top { display:flex;justify-content:space-between;gap:4mm;align-items:baseline; }
  .domain-top span { font:700 10pt Arial,sans-serif; }
  .inline-alert { margin-top:2mm;padding:2mm 3mm;background:#fff2f2;border-left:.8mm solid #a61b1b;font-size:8pt; }
  .long-record { border-top:.8mm solid #214f79; padding-top:3mm; margin:0 0 6mm; break-inside:auto; page-break-inside:auto; }
  .long-record h3 { font-size:12pt;margin:1mm 0 0; }
  .record-heading { display:flex;justify-content:space-between;gap:5mm;align-items:flex-start;break-after:avoid;page-break-after:avoid; }
  .priority-badge { flex:0 0 auto;background:#e8edf3;color:#173f68;border-radius:6mm;padding:1mm 2.5mm;font-size:6.8pt;text-transform:uppercase; }
  .priority-critical { background:#f9dddd;color:#8f1515; }.priority-high { background:#faead7;color:#914708; }.priority-medium { background:#e8edf3;color:#173f68; }.priority-low { background:#e3f2e8;color:#12613a; }
  .record-grid { display:grid; gap:0 5mm; margin-top:3mm; }
  .record-grid.two { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .field { display:grid; grid-template-columns:38mm 1fr; gap:3mm; border-top:.2mm solid #e7dfd2; padding:2mm 0; break-inside:avoid; page-break-inside:avoid; }
  /* Checkpoint F controller review blocker 5: allow the *last field* of a record to move back onto
     the previous page instead of starting a fresh, near-empty page on its own; combined with
     limiting full narrative-card records to the small top-priority set (blocker 4), no record is
     long enough for this to still leave a near-empty trailing page. */
  .field:last-child { break-before: avoid; page-break-before: avoid; }
  tr:last-child { break-before: avoid; page-break-before: avoid; }
  .record-grid .field { display:block; }
  .field-label { color:#765b2d;font-size:6.5pt;font-weight:700;letter-spacing:.45px;text-transform:uppercase;margin-bottom:.7mm; }
  .field-value { font-size:8.4pt; }
  .field-value p { margin:0; }.field-value ul { margin-top:0; }
  .risk-statement { background:#f2f5f8;border-left:1mm solid #071b3d;padding:3mm 4mm;margin-top:3mm;font-size:9.3pt;break-inside:avoid; }
  table { width:100%;border-collapse:collapse; }
  thead { display:table-header-group; }
  tr { break-inside:avoid;page-break-inside:avoid; }
  th,td { border:.2mm solid #dcd3c4;padding:2.2mm 3mm;text-align:left;vertical-align:top; }
  th { background:#071b3d;color:white;font-size:7pt;text-transform:uppercase;letter-spacing:.4px; }
  td { font-size:8pt; }
  .compact-register th:first-child, .compact-register td:first-child { width:8mm; }
  .support-grid .compact-card { min-height:42mm; }
  .closing-note { margin-top:7mm;background:#f3f6f9;border-left-color:#214f79; }
</style>
</head>
<body>${parts}</body>
</html>`;
}
