import type { AssembledReportData, RoadmapItem, SelectedContent } from '../types';
import { buildAdvisoryEvidenceModel, type AdvisoryEvidenceModel } from '../evidence-model';
import { assertCommercialReportQuality } from '../commercial-quality';
import { gapKey } from '../select-content-blocks';

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

function chunk<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

export function renderReportHtml(
  data: AssembledReportData,
  content: SelectedContent,
  roadmap: { agenda: RoadmapItem[] },
  preparedEvidenceModel?: AdvisoryEvidenceModel
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
  const exposurePosition = exposurePct >= 50 && readinessPct < 50
    ? 'High exposure with limited reported readiness'
    : exposurePct >= 50 && readinessPct >= 50
      ? 'High exposure with stronger reported readiness'
      : exposurePct < 50 && readinessPct < 50
        ? 'Lower exposure with developing reported readiness'
        : 'Lower exposure with stronger reported readiness';

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

  const domainPages = DOMAIN_GROUPS.map((group) => {
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
    return section('Domain advisory', group.title, `<p class="lede">${esc(group.subtitle)}</p><div class="stack">${cards}</div>`);
  }).join('');

  const findingCards = evidenceModel.materialFindings.map((finding, index) => `<article class="long-record finding-record">
    <div class="record-heading"><div><span class="record-number">Material finding ${index + 1}</span><h3>${esc(finding.title)}</h3></div><span class="priority-badge">${esc(finding.materialityClass.replaceAll('_', ' '))}</span></div>
    <div class="record-grid two">
      ${labelled('Domain', finding.domainName)}
      ${labelled('Recorded control condition', `${finding.questionPrompt} — ${finding.responseLabel}`)}
      ${labelled('Diagnosis', finding.diagnosis)}
      ${labelled('Why it matters', finding.whyItMatters)}
      ${labelled('Fraud mechanism', finding.fraudMechanism)}
      ${labelled('Likely financial impact', finding.likelyFinancialImpact)}
      ${labelled('Likely operational impact', finding.likelyOperationalImpact)}
      ${labelled('Expected control standard', finding.expectedControlStandard)}
      ${labelled('Recommended control', finding.recommendedControl)}
      ${labelled('Accountable executive', finding.accountableOwner)}
      ${labelled('Process owner', finding.processOwner)}
      ${labelled('Oversight function', finding.oversightFunction)}
      ${labelled('Operating frequency', finding.operatingFrequency)}
      ${labelled('Implementation', `${finding.implementationDifficulty} difficulty · ${finding.targetPeriod}`)}
      ${labelled('Effectiveness measure', finding.effectivenessMeasure)}
      ${labelled('Escalation threshold', finding.escalationThreshold)}
      ${labelledList('Supporting functions', finding.supportingFunctions)}
      ${labelledList('Minimum evidence characteristics', finding.minimumEvidenceCharacteristics)}
      ${labelled('Remaining limitation', finding.selfAssessmentLimitation)}
    </div>
  </article>`).join('');

  const contradictions = evidenceModel.contradictions.map((item, index) => `<article class="compact-card amber-card">
    <div class="card-eyebrow">Contradiction ${index + 1}</div>
    <h3>${esc(item.title)}</h3>
    ${labelled('What the assessment shows', item.drivingResponses)}
    ${labelled('Why it matters', item.whyItMatters)}
    ${labelled('Risk of false comfort', item.falseComfortRisk)}
    ${labelled('Leadership verification', item.whatLeadershipShouldVerify)}
    ${labelled('Fraud pathway enabled', item.fraudPathwayEnabled)}
  </article>`).join('');

  const scenarios = evidenceModel.scenarios.map((item, index) => `<article class="long-record scenario-record">
    <div class="record-heading"><div><span class="record-number">Scenario ${index + 1} · ${esc(item.scenarioBasis.replaceAll('_', ' '))}</span><h3>${esc(item.title)}</h3></div></div>
    <p class="disclaimer">${esc(item.disclaimer)}</p>
    <div class="record-grid two">
      ${labelledList('Confirmed operating context', item.confirmedOperatingContext)}
      ${labelled('Entry point', item.entryPoint)}
      ${labelled('Sequence', item.fraudSequence)}
      ${labelled('Concealment mechanism', item.concealmentMechanism)}
      ${labelledList('Controls expected', item.controlsExpected)}
      ${labelled('Why controls may fail, or what assurance must validate', item.whyControlsMayNotCatchIt)}
      ${labelledList('Early warning indicators', item.earlyWarningIndicators)}
      ${labelledList('Likely impacts', item.likelyImpact)}
      ${labelled('Financial impact', item.financialImpact)}
      ${labelled('Operational impact', item.operationalImpact)}
      ${labelled('Immediate containment', item.immediateContainment)}
      ${labelled('Longer-term response', item.longerTermResponse)}
    </div>
  </article>`).join('');

  const riskCards = evidenceModel.riskRegister.map((risk, index) => `<article class="long-record risk-record">
    <div class="record-heading"><div><span class="record-number">Risk ${index + 1} · ${esc(risk.affectedDomains.join(', '))}</span><h3>${esc(risk.title)}</h3></div><span class="priority-badge priority-${risk.priority.toLowerCase()}">${esc(risk.priority)}</span></div>
    <div class="risk-statement">${esc(risk.riskStatement)}</div>
    <div class="record-grid two">
      ${labelled('Cause', risk.cause)}
      ${labelled('Risk event', risk.riskEvent)}
      ${labelled('Financial impact', risk.financialImpact)}
      ${labelled('Operational impact', risk.operationalImpact)}
      ${risk.legalRegulatoryImpact ? labelled('Legal or regulatory impact', risk.legalRegulatoryImpact) : ''}
      ${risk.reputationalImpact ? labelled('Reputational impact', risk.reputationalImpact) : ''}
      ${labelled('Likelihood', `${risk.likelihood} — ${risk.likelihoodRationale}`)}
      ${labelled('Impact', `${risk.impact} — ${risk.impactRationale}`)}
      ${labelled('Current control position', risk.currentControlPosition)}
      ${labelled('Required treatment', risk.requiredTreatment)}
      ${labelled('Accountable executive', risk.accountableExecutive)}
      ${labelled('Process owner', risk.processOwner)}
      ${labelled('Oversight function', risk.oversightFunction)}
      ${labelled('Target period', risk.targetPeriod)}
      ${labelled('Effectiveness measure', risk.effectivenessMeasure)}
      ${labelled('Assessment confidence', risk.assessmentConfidence)}
      ${labelled('Remaining limitation', risk.remainingLimitation)}
    </div>
  </article>`).join('');

  const controlCards = evidenceModel.controlImprovements.map((control, index) => `<article class="long-record control-record">
    <div class="record-heading"><div><span class="record-number">Control improvement ${index + 1}</span><h3>${esc(control.controlObjective)}</h3></div><span class="priority-badge">${esc(control.implementationDifficulty)} · ${esc(control.targetPeriod)}</span></div>
    <div class="record-grid two">
      ${labelled('Exact current condition', control.currentState)}
      ${labelled('Target state', control.targetState)}
      ${labelled('Control design', control.controlDesign)}
      ${labelled('Accountable executive', control.accountableExecutive)}
      ${labelled('Process owner', control.processOwner)}
      ${labelled('Oversight function', control.oversightFunction)}
      ${labelledList('Supporting functions', control.supportingFunctions)}
      ${labelled('Operating frequency', control.operatingFrequency)}
      ${labelled('Complete population coverage', control.completePopulationCoverage)}
      ${labelledList('Evidence retained', control.evidenceRetained)}
      ${labelledList('Required evidence', control.requiredEvidence)}
      ${labelledList('Minimum evidence characteristics', control.minimumEvidenceCharacteristics)}
      ${labelledList('Dependencies', control.dependencies)}
      ${labelled('Implementation dependency', control.implementationDependency)}
      ${labelled('Effectiveness test', control.effectivenessTest)}
      ${labelled('Escalation threshold', control.escalationThreshold)}
    </div>
  </article>`).join('');

  const evidenceRows = evidenceModel.evidenceChecklist.map((item, index) => `<div class="evidence-row">
    <div class="evidence-index">${index + 1}</div>
    <div>
      <h3>${esc(item.artefact)}</h3>
      <div class="evidence-grid">
        ${labelled('Likely owner', item.likelyOwner)}
        ${labelled('What it proves', item.provesWhat)}
        ${labelled('Expected recency', item.expectedRecency)}
        ${labelled('Required population', item.requiredPopulation)}
        ${labelled('Sampling expectation', item.samplingExpectation)}
        ${labelledList('Minimum acceptable characteristics', item.minimumAcceptableCharacteristics)}
        ${labelled('Review status', 'Not yet requested')}
      </div>
    </div>
  </div>`).join('');

  const decisions = evidenceModel.leadershipDecisions.map((decision, index) => `<article class="long-record decision-record">
    <div class="record-heading"><div><span class="record-number">Decision ${index + 1} · ${esc(decision.decisionCategory.replaceAll('_', ' '))}</span><h3>${esc(decision.decisionRequired)}</h3></div></div>
    <div class="record-grid two">
      ${labelled('Evidence driving the decision', decision.evidenceDrivingIt)}
      ${labelled('Why now', decision.whyNow)}
      ${labelled('Recommended decision', decision.recommendedDecision)}
      ${labelled('Accountable executive', decision.accountableExecutive)}
      ${labelled('Implementation owner', decision.implementationOwner)}
      ${labelled('Oversight function', decision.oversightFunction)}
      ${labelled('Target period', decision.targetPeriod)}
      ${labelled('Deadline', decision.deadline)}
      ${labelled('Consequence of delay', decision.consequenceOfDelay)}
      ${labelled('Immediate next deliverable', decision.immediateNextDeliverable)}
    </div>
  </article>`).join('');

  const roadmapCards = evidenceModel.roadmapActions.map((action, index) => `<article class="long-record roadmap-record">
    <div class="record-heading"><div><span class="record-number">Roadmap action ${index + 1} · ${esc(action.period)}</span><h3>${esc(action.deliverable)}</h3></div><span class="priority-badge">${esc(action.implementationDifficulty)}</span></div>
    <div class="record-grid two">
      ${labelled('Domain', action.domainName)}
      ${labelled('Accountable executive', action.accountableExecutive)}
      ${labelled('Process owner', action.processOwner)}
      ${labelled('Oversight function', action.oversightFunction)}
      ${labelledList('Supporting functions', action.supportingFunctions)}
      ${labelled('Dependency', action.dependency)}
      ${labelled('Success measure', action.successMeasure)}
      ${labelled('Evidence of completion', action.evidenceOfCompletion)}
      ${labelled('Escalation threshold', action.escalationThreshold)}
    </div>
  </article>`).join('');

  const agendaRows = evidenceModel.functionalAgenda.map((item) => `<tr><td>${esc(item.function)}</td><td>${esc(item.question)}</td></tr>`).join('');

  const methodology = `<p>This report is generated from a structured self-assessment across ten fraud-risk-management domains. The score, maturity constraints and advisory model use only the recorded assessment inputs and deterministic methodology.</p>
    <h3>Limitations</h3>
    <p>This is not a forensic investigation, external audit, compliance certification or guarantee. Responses were not independently verified. Findings, scenarios and recommendations are decision-support material; leadership should obtain and test the specified operating evidence before treating a control as effective or a finding as resolved.</p>
    <h3>Coverage by domain</h3>
    <table class="continuing-table"><thead><tr><th>Domain</th><th>Coverage</th><th>Reported score</th></tr></thead><tbody>${data.domainResults.map((domain) => `<tr><td>${esc(domain.domainName)}</td><td>${pct(domain.coveragePct)}</td><td>${score(domain.rawScore)}/100</td></tr>`).join('')}</tbody></table>`;

  const priorityAndFalseComfort = data.maturityCapEvents.length > 0
    ? [
        section('Priority gap dashboard', 'The recorded conditions requiring first attention', priorityGaps),
        section('Critical Flags and False Comfort', content.falseComfort.title, `${capCards}<div class="false-comfort"><p>${esc(content.falseComfort.body)}</p></div>`)
      ].join('\n')
    : section(
        'Priority gap dashboard',
        data.criticalMajorGaps.length > 0 ? 'The recorded conditions requiring first attention' : 'No critical or major gap was recorded',
        `${priorityGaps || '<div class="clean-note"><strong>No critical or major gaps were recorded.</strong><p>The strong self-reported result remains subject to evidence-based assurance.</p></div>'}
        <div class="subsection-heading"><div class="section-kicker">Critical Flags and False Comfort</div><h2>${esc(content.falseComfort.title)}</h2></div>
        <div class="false-comfort"><p>${esc(content.falseComfort.body)}</p></div>`
      );

  const contradictionAndScenarioSections = evidenceModel.contradictions.length > 0
    ? [
        section('Evidence-based contradictions', 'Where reported conditions combine into a less reassuring picture', contradictions, 'long-section'),
        section('Plausible scenarios and assurance tests', 'How weaknesses could be exploited—or how reported strength should be validated', scenarios, 'long-section')
      ].join('\n')
    : section(
        'Evidence-based contradictions',
        'No material contradiction was detected',
        `<div class="clean-note"><strong>No material contradiction was detected.</strong><p>Independent evidence remains necessary to validate the reported control position.</p></div>
        <div class="subsection-heading"><div class="section-kicker">Plausible scenarios and assurance tests</div><h2>How reported strength should be validated</h2></div>
        ${scenarios}`,
        'long-section'
      );

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
    section('Report governance', 'Confidentiality, use and Version Record', `
      <div class="governance-grid">
        <div class="compact-card"><h3>Confidentiality and use</h3><p>Prepared exclusively for ${esc(data.organisationName)}. This document is for internal leadership use and should not be distributed externally without MK Fraud Insights’ consent.</p><p>The assessment is a diagnostic starting point, not an audit opinion, certification or guarantee.</p></div>
        <div class="compact-card version-card">
          ${labelled('Report reference', data.reportReference)}
          ${labelled('Assessment reference', data.assessmentReference)}
          ${labelled('Generated', generatedDate)}
          ${labelled('Package', data.packageName)}
        </div>
      </div>`),
    section('Executive diagnosis', content.executiveSummary.title, `
      <div class="diagnosis">
        <div class="score-tile"><strong>${score(sr.overallScore)}</strong><span>out of 100</span><b style="background:${bandColor}">${esc(sr.finalMaturity)}</b></div>
        <div><p class="executive-copy">${esc(content.executiveSummary.body)}</p><div class="attention-box"><strong>Leadership attention</strong><p>${esc(content.leadershipAttention.body)}</p></div></div>
      </div>
      <div class="metric-grid">
        <div><span>Exposure</span><strong>${esc(sr.exposureBand)}</strong></div>
        <div><span>Coverage</span><strong>${pct(sr.coveragePct)}</strong></div>
        <div><span>Critical gaps</span><strong>${sr.criticalGapCount}</strong></div>
        <div><span>Major gaps</span><strong>${sr.majorGapCount}</strong></div>
      </div>`),
    section('Readiness score', 'The aggregate result and its ten underlying domains', `
      <p class="lede">The ${esc(sr.finalMaturity)} result describes the reported self-assessment position. It does not, by itself, establish operating effectiveness. Read the score with the exposure profile, material findings and evidence requirements.</p>
      <div class="heatmap">${heatmap}</div>`),
    section('Exposure profile', exposurePosition, `
      <div class="exposure-layout">
        <div><div class="matrix"><i style="left:${plotX}mm;top:${plotY}mm"></i></div><div class="axis-note">Exposure increases left to right. Reported readiness increases bottom to top.</div></div>
        <div><p>Exposure describes the operating model’s inherent fraud risk. Readiness describes the reported control response. Neither measure is independent assurance.</p>${exposureRows}</div>
      </div>`),
    priorityAndFalseComfort,
    domainPages,
    section('Material findings', 'The assessment conditions selected for executive attention', findingCards, 'long-section'),
    contradictionAndScenarioSections,
    section('Risk register', 'Material findings translated into accountable risk statements', `<p class="section-note">Priority is derived from the assessment evidence and is not an independent risk assessment.</p>${riskCards}`, 'long-section'),
    section('Control improvement plan', 'Specific control conditions, designs and effectiveness tests', controlCards, 'long-section'),
    section('Evidence checklist', 'Operating artefacts required before findings can be treated as resolved', `<p class="section-note">Every item begins with the status “Not yet requested”. Status changes require an evidence-review process outside this report.</p><div class="evidence-list">${evidenceRows}</div>`, 'long-section'),
    section('Leadership decisions required', 'Decisions, owners, deadlines and consequences', decisions, 'long-section'),
    section('30/60/90-Day Roadmap', 'The authoritative sequenced implementation plan', `<p class="section-note">This is the report’s only action roadmap. Dependencies and measures are carried directly from the deterministic advisory model.</p>${roadmapCards}`, 'long-section'),
    section('Leadership Agenda', 'Questions each accountable function should take into the review', `<table class="continuing-table agenda-table"><thead><tr><th>Function</th><th>Question for the review</th></tr></thead><tbody>${agendaRows}</tbody></table>`, 'long-section'),
    section('Methodology and limitations', 'How to interpret this report', methodology),
    section('Where MK Fraud Insights can help next', 'Optional support after leadership has reviewed the evidence', `
      <div class="support-grid">
        <div class="compact-card"><h3>Targeted control review</h3><p>Examine the operating evidence for the specific material findings and control improvements identified in this report.</p></div>
        <div class="compact-card"><h3>Fraud risk framework design</h3><p>Translate approved decisions into governance, control standards, ownership and reporting routines.</p></div>
        <div class="compact-card"><h3>Independent implementation support</h3><p>Support sequenced delivery and evidence-based effectiveness testing without replacing accountable management ownership.</p></div>
      </div>
      <div class="closing-note"><strong>Controller review remains required.</strong><p>This report is a commercial release candidate. Final visual and release approval is not implied by generation.</p></div>`),
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
  .section-kicker { display: inline-block; background: #071b3d; color: #fff; font-size: 7pt; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; padding: 1.7mm 4mm; margin-bottom: 5mm; }
  .lede { color: #5b554b; font-size: 10pt; max-width: 170mm; }
  .section-note, .disclaimer { color: #686158; font-size: 8pt; font-style: italic; }
  .subsection-heading { margin-top: 8mm; break-after: avoid; page-break-after: avoid; }
  .governance-grid, .support-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 5mm; }
  .support-grid { grid-template-columns: repeat(3,1fr); }
  .compact-card { border: .25mm solid #ded5c5; border-left: 1mm solid #214f79; padding: 4mm; margin-bottom: 3.5mm; break-inside: avoid; page-break-inside: avoid; background: #fff; }
  .amber-card { border-left-color: #9b6418; background: #fdf9f0; }
  .alert-card { border-left-color: #a61b1b; background: #fffafa; }
  .card-eyebrow, .record-number { color: #765b2d; font-size: 6.8pt; font-weight: 700; letter-spacing: .6px; text-transform: uppercase; margin-bottom: 1mm; }
  .version-card .field { grid-template-columns: 38mm 1fr; }
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
  .heat-cell { border: .25mm solid #ded5c5; border-top: 1.2mm solid; padding: 3mm; min-height: 29mm; break-inside: avoid; }
  .heat-name { min-height: 12mm; font: 7pt/1.25 Arial,sans-serif; color: #4e493f; }
  .heat-score { font: 700 17pt Arial,sans-serif; color:#071b3d; }
  .heat-band { font: 6.5pt Arial,sans-serif; color:#6c665b; }
  .exposure-layout { display:grid; grid-template-columns:72mm 1fr; gap:8mm; }
  .matrix { width:68mm; height:68mm; position:relative; border:.3mm solid #cfc4b2; background:linear-gradient(90deg,rgba(16,46,87,.06) 50%,transparent 50%),linear-gradient(0deg,rgba(16,46,87,.06) 50%,transparent 50%); }
  .matrix:before,.matrix:after { content:''; position:absolute; background:#d8cebd; }
  .matrix:before { left:50%;top:0;bottom:0;width:.2mm; }
  .matrix:after { top:50%;left:0;right:0;height:.2mm; }
  .matrix i { position:absolute;width:5mm;height:5mm;border-radius:50%;background:#071b3d;border:.8mm solid white;box-shadow:0 0 0 .3mm #071b3d;transform:translate(-50%,-50%); }
  .axis-note { color:#6c665b;font:6.5pt Arial,sans-serif;margin-top:2mm; }
  .bar-row { margin-bottom:3mm; break-inside:avoid; }
  .bar-row div:first-child { display:flex;justify-content:space-between;font:7.5pt Arial,sans-serif;gap:3mm; }
  .bar-row span { color:#6c665b; }
  .bar-track,.mini-track { height:2.4mm;background:#e7dfd2;margin-top:1.2mm;overflow:hidden;border-radius:2mm; }
  .bar-track i,.mini-track i { display:block;height:100%; }
  .stack { display:flex;flex-direction:column;gap:1mm; }
  .domain-top { display:flex;justify-content:space-between;gap:4mm;align-items:baseline; }
  .domain-top span { font:700 10pt Arial,sans-serif; }
  .inline-alert { margin-top:2mm;padding:2mm 3mm;background:#fff2f2;border-left:.8mm solid #a61b1b;font-size:8pt; }
  .long-record { border-top:.8mm solid #214f79; padding-top:3mm; margin:0 0 6mm; break-inside:auto; page-break-inside:auto; }
  .decision-record, .roadmap-record { break-inside:avoid; page-break-inside:avoid; }
  .long-record h3 { font-size:12pt;margin:1mm 0 0; }
  .record-heading { display:flex;justify-content:space-between;gap:5mm;align-items:flex-start;break-after:avoid;page-break-after:avoid; }
  .priority-badge { flex:0 0 auto;background:#e8edf3;color:#173f68;border-radius:6mm;padding:1mm 2.5mm;font-size:6.8pt;text-transform:uppercase; }
  .priority-critical { background:#f9dddd;color:#8f1515; }.priority-high { background:#faead7;color:#914708; }.priority-medium { background:#e8edf3;color:#173f68; }.priority-low { background:#e3f2e8;color:#12613a; }
  .record-grid { display:grid; gap:0 5mm; margin-top:3mm; }
  .record-grid.two { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .field { display:grid; grid-template-columns:38mm 1fr; gap:3mm; border-top:.2mm solid #e7dfd2; padding:2mm 0; break-inside:avoid; page-break-inside:avoid; }
  .record-grid .field { display:block; }
  .field-label { color:#765b2d;font-size:6.5pt;font-weight:700;letter-spacing:.45px;text-transform:uppercase;margin-bottom:.7mm; }
  .field-value { font-size:8.4pt; }
  .field-value p { margin:0; }.field-value ul { margin-top:0; }
  .risk-statement { background:#f2f5f8;border-left:1mm solid #071b3d;padding:3mm 4mm;margin-top:3mm;font-size:9.3pt;break-inside:avoid; }
  .evidence-row { display:grid;grid-template-columns:9mm 1fr;gap:3mm;border-top:.3mm solid #cfc4b2;padding:3mm 0;break-inside:avoid;page-break-inside:avoid; }
  .evidence-index { width:7mm;height:7mm;border-radius:50%;background:#071b3d;color:white;text-align:center;padding-top:1mm;font:7pt Arial,sans-serif; }
  .evidence-grid { display:grid;grid-template-columns:repeat(2,1fr);gap:0 4mm; }
  .evidence-grid .field { display:block; }
  table { width:100%;border-collapse:collapse; }
  thead { display:table-header-group; }
  tr { break-inside:avoid;page-break-inside:avoid; }
  th,td { border:.2mm solid #dcd3c4;padding:2.2mm 3mm;text-align:left;vertical-align:top; }
  th { background:#071b3d;color:white;font-size:7pt;text-transform:uppercase;letter-spacing:.4px; }
  td { font-size:8pt; }
  .agenda-table th:first-child,.agenda-table td:first-child { width:45mm; }
  .support-grid .compact-card { min-height:42mm; }
  .closing-note { margin-top:7mm;background:#f3f6f9;border-left-color:#214f79; }
</style>
</head>
<body>${parts}</body>
</html>`;
}
