import type { AssembledReportData, RoadmapItem, SelectedContent } from '../types';
import { gapKey } from '../select-content-blocks';

const BAND_COLOR: Record<string, string> = {
  Reactive: '#b91c1c',
  Developing: '#b45309',
  Structured: '#1d3658',
  Strategic: '#15803d',
  'Not scored': '#746B5C'
};

const DOMAIN_GROUPS: { title: string; subtitle: string; domains: string[] }[] = [
  {
    title: 'Foundations: ownership, awareness and reporting culture',
    subtitle: 'Whether fraud risk has a real owner, whether people are equipped to notice it, and whether concerns can be raised safely.',
    domains: ['Fraud Leadership and Governance', 'Fraud Risk Identification', 'Fraud Culture and Awareness', 'Whistleblowing and Reporting Culture']
  },
  {
    title: 'Operational defence: controls, detection and third parties',
    subtitle: 'Whether day-to-day processes, monitoring and supplier relationships are actually protected, not only described as protected.',
    domains: ['Operational Fraud Controls', 'Fraud Detection Capability', 'Third-Party and Supply Chain Fraud Risk']
  },
  {
    title: 'Response and evolution: incidents, digital risk and improvement',
    subtitle: 'Whether the organisation would handle a real incident well, defend fast-moving digital risk, and keep improving.',
    domains: ['Fraud Incident Response', 'Digital and Identity Fraud Risk', 'Continuous Improvement and Fraud Risk Monitoring']
  }
];

const LEADERSHIP_FUNCTIONS: { role: string; relevantDomains: string[]; question: (weak: boolean) => string }[] = [
  { role: 'CEO', relevantDomains: ['Fraud Leadership and Governance'], question: (weak) => weak ? 'Is fraud risk genuinely owned at executive level, with real authority to act?' : 'Does leadership see fraud readiness evidence often enough to trust it, not just assume it?' },
  { role: 'CFO', relevantDomains: ['Operational Fraud Controls', 'Third-Party and Supply Chain Fraud Risk'], question: (weak) => weak ? 'Which payment, procurement or supplier processes rely on trust rather than a control that would catch manipulation?' : 'Where would finance be the last line of defence if an operational control failed upstream?' },
  { role: 'COO', relevantDomains: ['Operational Fraud Controls', 'Fraud Detection Capability'], question: (weak) => weak ? 'Which day-to-day processes have no independent review or exception monitoring?' : 'Are operational controls tested under real pressure, or only under normal conditions?' },
  { role: 'Head of Risk / Internal Audit', relevantDomains: ['Fraud Risk Identification', 'Continuous Improvement and Fraud Risk Monitoring'], question: (weak) => weak ? 'When was fraud risk last mapped across the business, and has that map kept pace with change?' : 'Is the review cycle fast enough to catch a new risk before it becomes a loss?' },
  { role: 'Head of Technology / IT Security', relevantDomains: ['Digital and Identity Fraud Risk'], question: (weak) => weak ? 'Can the organisation reliably verify identity before granting access, approving a payment or onboarding someone new?' : 'Is digital fraud monitoring being updated as fast as digital fraud methods are changing?' },
  { role: 'Head of HR / People', relevantDomains: ['Fraud Culture and Awareness', 'Whistleblowing and Reporting Culture'], question: (weak) => weak ? 'Would an employee know how to report a concern and trust that reporting it is safe?' : 'Is fraud awareness reinforced with real examples, or treated as a once-off induction topic?' },
  { role: 'Legal / Compliance', relevantDomains: ['Fraud Incident Response'], question: (weak) => weak ? 'If fraud were suspected today, is there a documented evidence-handling process that would hold up to scrutiny?' : 'Has the incident response process actually been rehearsed, not just written down?' }
];

function esc(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function score(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
  return String(Math.round(Number(value)));
}

function pct(value: number | null | undefined) {
  const rendered = score(value);
  return rendered === '-' ? '-' : `${rendered}%`;
}

function domainBandLabel(rawScore: number | null) {
  if (rawScore === null) return 'Not scored';
  if (rawScore < 40) return 'Reactive';
  if (rawScore < 65) return 'Developing';
  if (rawScore < 80) return 'Structured';
  return 'Strategic';
}

function roadmapCard(item: RoadmapItem) {
  return `
    <div class="agenda-card">
      <div class="agenda-card-top">
        <span class="agenda-domain">${esc(item.domainName)}</span>
        <span class="agenda-severity">${esc(item.severity)}</span>
      </div>
      <div class="agenda-owner">Suggested owner: ${esc(item.ownerRole)}</div>
      <div class="agenda-rationale">${esc(item.rationale)}</div>
      <div class="agenda-timeline">
        ${item.action30 ? `<div class="agenda-stage"><span class="stage-label">30 days</span><span class="stage-action">${esc(item.action30)}</span></div>` : ''}
        ${item.action60 ? `<div class="agenda-stage"><span class="stage-label">60 days</span><span class="stage-action">${esc(item.action60)}</span></div>` : ''}
        ${item.action90 ? `<div class="agenda-stage"><span class="stage-label">90 days</span><span class="stage-action">${esc(item.action90)}</span></div>` : ''}
      </div>
    </div>`;
}

export function renderReportHtml(
  data: AssembledReportData,
  content: SelectedContent,
  roadmap: { agenda: RoadmapItem[] }
) {
  const sr = data.scoreRun;
  const bandColor = BAND_COLOR[sr.finalMaturity] ?? '#1d3658';
  const generatedDate = new Date(data.generatedAt).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' });
  const domainByName = new Map(data.domainResults.map((domain) => [domain.domainName, domain]));

  const domainHeatmap = data.domainResults.map((domain) => {
    const band = domainBandLabel(domain.rawScore);
    const color = BAND_COLOR[band] ?? '#1d3658';
    return `<div class="heatmap-cell" style="background:${color}">
      <span class="heatmap-name">${esc(domain.domainName)}</span>
      <span class="heatmap-score">${score(domain.rawScore)}</span>
    </div>`;
  }).join('');

  const exposurePct = Math.min(100, Math.max(0, Number(sr.exposureScore) || 0));
  const readinessPct = Math.min(100, Math.max(0, Number(sr.overallScore) || 0));
  const exposurePlotSizeMm = 72;
  const exposurePlotInsetMm = 6;
  const exposurePointSizeMm = 5;
  const exposurePlotUsableMm = exposurePlotSizeMm - exposurePlotInsetMm * 2;
  const plotX = exposurePlotInsetMm + (exposurePct / 100) * exposurePlotUsableMm;
  const plotY = exposurePlotInsetMm + (1 - readinessPct / 100) * exposurePlotUsableMm;
  const quadrantLabel = exposurePct >= 50 && readinessPct < 50
    ? 'High exposure, limited readiness: the highest-priority combination'
    : exposurePct >= 50 && readinessPct >= 50
      ? 'High exposure, matched by real readiness: a defensible position'
      : exposurePct < 50 && readinessPct < 50
        ? 'Lower inherent exposure, but readiness has not yet been tested at scale'
        : 'Lower exposure and genuine readiness: the strongest combination available';

  const exposureFactorRows = data.exposureAnswers.map((answer) => {
    const level = answer.maxPoints > 0 ? answer.pointsAwarded / answer.maxPoints : 0;
    const barColor = level > 0.66 ? '#b91c1c' : level > 0.33 ? '#b45309' : '#15803d';
    return `<div class="exposure-row">
      <div class="exposure-row-label">${esc(answer.name)}</div>
      <div class="exposure-row-bottom">
        <div class="exposure-row-track"><div class="exposure-row-fill" style="width:${Math.round(level * 100)}%; background:${barColor};"></div></div>
        <div class="exposure-row-level">${esc(answer.selectedLabel)}</div>
      </div>
    </div>`;
  }).join('');

  const topRisksHtml = [...data.domainResults]
    .filter((domain) => domain.rawScore !== null)
    .sort((a, b) => b.weightPct * (100 - (b.rawScore ?? 100)) - a.weightPct * (100 - (a.rawScore ?? 100)))
    .slice(0, 3)
    .map((domain, index) => {
      const narrative = content.domainNarratives[domain.domainName];
      return `<div class="risk-card">
        <div class="risk-rank">Risk ${index + 1}</div>
        <div class="risk-domain">${esc(domain.domainName)}</div>
        <div class="risk-body">${esc(narrative?.body ?? 'This domain should be reviewed with leadership as part of the report walkthrough.')}</div>
      </div>`;
    }).join('');

  const priorityGaps = data.criticalMajorGaps.slice(0, 8).map((gap) => `<li>
    <div class="priority-domain">${esc(gap.domainName)} <span class="gap-severity">${gap.isCriticalGap ? 'Critical' : 'Major'}</span></div>
    <div class="priority-prompt">${esc(gap.prompt)}</div>
  </li>`).join('');

  const criticalControlsList = data.maturityCapEvents.map((event) => {
    const gap = data.criticalMajorGaps.find((item) => item.domainCode === event.relatedDomainCode);
    const domainName = gap?.domainName ?? data.domainResults.find((domain) => domain.domainCode === event.relatedDomainCode)?.domainName ?? 'A core control area';
    const description = gap?.prompt ?? 'A control did not meet the required standard.';
    return `<li>
      <div class="critical-control-domain">${esc(domainName)}</div>
      <div class="critical-control-desc">${esc(description)}</div>
      <div class="critical-control-effect">This limits the overall reading to <strong>${esc(event.capTo)}</strong>, regardless of performance elsewhere.</div>
    </li>`;
  }).join('');

  const domainGroupPages = DOMAIN_GROUPS.map((group) => {
    const cards = group.domains.map((domainName) => {
      const domain = domainByName.get(domainName);
      if (!domain) return '';
      const narrative = content.domainNarratives[domainName];
      const band = domainBandLabel(domain.rawScore);
      const color = BAND_COLOR[band] ?? '#1d3658';
      const gapHtml = data.criticalMajorGaps.filter((gap) => gap.domainName === domainName).map((gap) => {
        const commentary = content.gapCommentary[gapKey(gap.domainCode, gap.questionCode)];
        return `<div class="mini-gap-note">${gap.isCriticalGap ? 'Critical' : 'Major'}: ${esc(commentary?.body ?? gap.prompt)}</div>`;
      }).join('');
      return `<div class="domain-card">
        <div class="domain-card-top">
          <span class="domain-card-name">${esc(domainName)}</span>
          <span class="domain-card-score" style="color:${color};">${score(domain.rawScore)}/100</span>
        </div>
        <div class="position-track"><div class="position-fill" style="width:${domain.rawScore ?? 0}%; background:${color};"></div></div>
        <div class="domain-card-headline">${esc(narrative?.title ?? domainName)}</div>
        <p class="domain-card-body">${esc(narrative?.body ?? '')}</p>
        ${gapHtml}
      </div>`;
    }).join('');
    return `<section class="page">
      <div class="section-divider">Domain Advisory</div>
      <h2>${esc(group.title)}</h2>
      <p class="group-subtitle">${esc(group.subtitle)}</p>
      <div class="domain-card-grid">${cards}</div>
    </section>`;
  }).join('\n');

  const actionRegisterRows = roadmap.agenda.map((item) => `<tr>
    <td>${esc(item.domainName)}</td>
    <td>${esc(item.severity)}</td>
    <td>${esc(item.action30 ?? '-')}</td>
    <td>${esc(item.ownerRole)}</td>
  </tr>`).join('');

  const agendaCards = roadmap.agenda.map((item) => roadmapCard(item)).join('');

  const weakDomainNames = new Set(data.domainResults.filter((domain) => (domain.rawScore ?? 100) < 70).map((domain) => domain.domainName));
  const leadershipAgendaRows = LEADERSHIP_FUNCTIONS.map((fn) => {
    const isWeak = fn.relevantDomains.some((domain) => weakDomainNames.has(domain));
    return `<div class="leadership-row">
      <div class="leadership-role">${esc(fn.role)}</div>
      <div class="leadership-question">${esc(fn.question(isWeak))}</div>
    </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en-ZA">
<head>
<meta charset="utf-8" />
<title>MK Fraud Readiness Advisory Report - ${esc(data.organisationName)}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #16140f; margin: 0; font-size: 10.5pt; line-height: 1.5; }
  h1, h2, h3, .heading-font { font-family: Arial, Helvetica, sans-serif; }
  .page { break-after: page; page-break-after: always; padding: 18mm 15mm 15mm 15mm; display: flex; flex-direction: column; }
  .page:last-child { break-after: auto; page-break-after: auto; }
  .cover { background: linear-gradient(160deg, #001030 0%, #0a1f4d 60%, #1d3658 100%); color: white; padding: 0; }
  .cover-inner { padding: 36mm 24mm; height: 297mm; display: flex; flex-direction: column; justify-content: space-between; }
  .cover-top .eyebrow { text-transform: uppercase; letter-spacing: 4px; font-size: 9pt; color: #b7c6e0; font-family: Arial, sans-serif; font-weight: 600; }
  .cover-top h1 { font-size: 32pt; margin: 7mm 0 4mm 0; font-family: Arial, sans-serif; font-weight: 800; line-height: 1.1; }
  .cover-top .sub { font-size: 12pt; color: #d7e0f0; font-family: Arial, sans-serif; font-weight: 300; max-width: 120mm; }
  .cover-mid { border-top: 1px solid rgba(255,255,255,0.25); border-bottom: 1px solid rgba(255,255,255,0.25); padding: 7mm 0; margin: 9mm 0; }
  .cover-mid .org { font-size: 19pt; font-family: Arial, sans-serif; font-weight: 700; }
  .cover-mid .prepared-for { font-size: 8.5pt; color: #b7c6e0; text-transform: uppercase; letter-spacing: 2px; font-family: Arial, sans-serif; margin-bottom: 2mm; }
  .cover-bottom .meta { font-size: 8.5pt; color: #b7c6e0; font-family: Arial, sans-serif; line-height: 1.8; }
  .cover-bottom .confidential { margin-top: 7mm; font-size: 8pt; color: #8fa3c9; font-style: italic; font-family: Arial, sans-serif; }
  .confidentiality-page { justify-content: center; }
  .confidentiality-page .box { border: 1px solid #E6D8BF; border-radius: 2mm; padding: 12mm; background: #FCF9F2; }
  .section-divider { align-self: flex-start; background: #001030; color: white; padding: 2.2mm 5.5mm; font-family: Arial, sans-serif; text-transform: uppercase; letter-spacing: 2px; font-size: 8pt; margin-bottom: 7mm; border-radius: 1mm; }
  h2 { font-size: 17pt; margin: 0 0 4mm 0; color: #001030; line-height: 1.25; font-weight: 700; }
  h3 { font-size: 11pt; color: #001030; margin: 0 0 3mm 0; }
  p { margin: 0 0 4mm 0; }
  .group-subtitle { color: #746B5C; font-size: 9.5pt; margin: -2mm 0 6mm 0; }
  .diagnosis-tile { display: flex; gap: 8mm; margin-bottom: 6mm; }
  .diagnosis-score { flex: 0 0 40mm; }
  .diagnosis-score .big-number { font-size: 42pt; font-weight: 800; font-family: Arial, sans-serif; color: #001030; line-height: 1; }
  .diagnosis-score .out-of { font-size: 9.5pt; color: #746B5C; font-family: Arial, sans-serif; }
  .diagnosis-score .band-chip { display: inline-block; padding: 1.4mm 3.8mm; border-radius: 20px; color: white; font-family: Arial, sans-serif; font-size: 9pt; font-weight: 700; margin-top: 3mm; }
  .diagnosis-narrative { flex: 1; }
  .diagnosis-narrative p { font-size: 11pt; }
  .leadership-box { background: #F7F1E6; border-left: 4px solid #1d3658; padding: 5mm 6mm; margin-top: 5mm; }
  .leadership-box .label { font-family: Arial, sans-serif; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 1.5px; color: #1d3658; font-weight: 700; margin-bottom: 2mm; }
  .score-grid { display: flex; gap: 3mm; margin: 5mm 0; }
  .score-grid-cell { flex: 1; border: 1px solid #E6D8BF; padding: 4mm 2mm; text-align: center; break-inside: avoid; }
  .score-grid-cell .label { font-size: 7pt; text-transform: uppercase; letter-spacing: 0.5px; color: #746B5C; font-family: Arial, sans-serif; }
  .score-grid-cell .value { font-size: 14pt; font-weight: bold; font-family: Arial, sans-serif; color: #001030; margin-top: 2mm; }
  .heatmap { display: flex; flex-wrap: wrap; gap: 2mm; margin: 5mm 0; }
  .heatmap-cell { flex: 1 1 18mm; min-width: 18mm; text-align: center; color: white; padding: 4mm 2mm; font-family: Arial, sans-serif; border-radius: 1.5mm; break-inside: avoid; }
  .heatmap-name { display: block; font-size: 6.5pt; line-height: 1.2; margin-bottom: 2mm; min-height: 8mm; }
  .heatmap-score { display: block; font-size: 12pt; font-weight: bold; }
  .exposure-page { padding: 14mm 15mm 13mm 15mm; }
  .exposure-page .section-divider { margin-bottom: 4mm; padding: 1.9mm 5mm; font-size: 7.5pt; }
  .exposure-page h2 { font-size: 14.5pt; line-height: 1.18; margin-bottom: 3mm; }
  .exposure-page h3 { font-size: 9.5pt; margin: 4mm 0 2.5mm 0 !important; }
  .matrix-wrap { display: flex; gap: 6mm; align-items: flex-start; margin-bottom: 3mm; }
  .matrix-plot-cell { flex: 0 0 73mm; }
  .matrix-legend-cell { flex: 1; }
  .matrix-legend-cell p { font-size: 8.8pt; line-height: 1.35; margin-bottom: 0; }
  .matrix-plot { position: relative; width: 72mm; height: 72mm; border: 1px solid #E6D8BF; background: linear-gradient(to right, rgba(29,54,88,0.04) 50%, transparent 50%), linear-gradient(to bottom, transparent 50%, rgba(29,54,88,0.04) 50%); }
  .matrix-axis-label { font-family: Arial, sans-serif; font-size: 6.5pt; color: #746B5C; margin-top: 1.2mm; line-height: 1.25; }
  .matrix-point { position: absolute; width: 5mm; height: 5mm; border-radius: 50%; background: #001030; border: 1.5px solid white; box-shadow: 0 0 0 1px #001030; }
  .exposure-driver-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 4mm; row-gap: 2mm; margin-top: 2mm; }
  .exposure-row { display: block; border: 1px solid #E6D8BF; border-radius: 1mm; padding: 2mm 2.5mm; margin-bottom: 0; break-inside: avoid; page-break-inside: avoid; }
  .exposure-row-label { font-size: 7.5pt; line-height: 1.22; font-family: Arial, sans-serif; margin-bottom: 1.5mm; min-height: 7mm; }
  .exposure-row-bottom { display: flex; align-items: center; gap: 2mm; }
  .exposure-row-track { flex: 1; height: 2.4mm; border-radius: 2mm; background: #E6D8BF; overflow: hidden; }
  .exposure-row-fill { height: 100%; }
  .exposure-row-level { flex: 0 0 22mm; text-align: right; font-size: 7pt; line-height: 1.15; font-family: Arial, sans-serif; color: #746B5C; }
  .risk-card { border: 1px solid #E6D8BF; border-left: 3px solid #b91c1c; border-radius: 1mm; padding: 4mm 5mm; margin-bottom: 4mm; break-inside: avoid; }
  .risk-rank { font-family: Arial, sans-serif; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 1px; color: #b91c1c; font-weight: 700; }
  .risk-domain { font-family: Arial, sans-serif; font-size: 12pt; font-weight: 700; color: #001030; margin: 1mm 0 2mm 0; }
  .risk-body { font-size: 10pt; }
  ul.priority-list { list-style: none; padding: 0; margin: 4mm 0; }
  ul.priority-list li { border-bottom: 1px solid #E6D8BF; padding: 3.5mm 0; break-inside: avoid; }
  .priority-domain { font-family: Arial, sans-serif; font-weight: 700; color: #001030; font-size: 9.5pt; }
  .priority-prompt { font-size: 9.5pt; margin-top: 1.5mm; }
  .gap-severity { float: right; font-family: Arial, sans-serif; font-size: 7pt; text-transform: uppercase; color: #b91c1c; font-weight: 700; }
  ul.critical-list { list-style: none; padding: 0; }
  ul.critical-list li { background: white; border: 1px solid #E6D8BF; border-radius: 1.5mm; padding: 3.5mm 4.5mm; margin-bottom: 3mm; break-inside: avoid; }
  .critical-control-domain { font-family: Arial, sans-serif; font-weight: 700; color: #001030; font-size: 9.5pt; }
  .critical-control-desc { font-size: 9.5pt; margin: 1.5mm 0; }
  .critical-control-effect { font-size: 8.5pt; color: #7C5F2A; }
  .clean-note { background: #F0F7F2; border-left: 4px solid #15803d; padding: 5mm 6mm; font-size: 10pt; }
  .false-comfort-page { background: #FCF7ED; }
  .false-comfort-page h2 { color: #7C5F2A; }
  .domain-card-grid { display: flex; flex-direction: column; gap: 4mm; }
  .domain-card { border: 1px solid #E6D8BF; border-radius: 1.5mm; padding: 4.5mm 5.5mm; break-inside: avoid; }
  .domain-card-top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 2mm; }
  .domain-card-name { font-family: Arial, sans-serif; font-weight: 700; font-size: 10pt; color: #001030; }
  .domain-card-score { font-family: Arial, sans-serif; font-weight: 700; font-size: 10pt; }
  .position-track { height: 3mm; background: #E6D8BF; border-radius: 2mm; overflow: hidden; margin-bottom: 3mm; }
  .position-fill { height: 100%; }
  .domain-card-headline { font-family: Arial, sans-serif; font-weight: 700; font-size: 9.5pt; color: #1d3658; margin-bottom: 1.5mm; }
  .domain-card-body { font-size: 9.5pt; margin: 0; }
  .mini-gap-note { background: #FCEAEA; border-left: 3px solid #b91c1c; padding: 2.5mm 3.5mm; margin-top: 2.5mm; font-size: 8.5pt; }
  table.action-register { width: 100%; border-collapse: collapse; margin: 4mm 0; }
  table.action-register th, table.action-register td { border: 1px solid #E6D8BF; padding: 2.5mm 3.5mm; text-align: left; font-size: 9pt; }
  table.action-register th { background: #F7F1E6; font-family: Arial, sans-serif; font-size: 8pt; text-transform: uppercase; }
  .agenda-list { display: flex; flex-direction: column; gap: 4mm; }
  .agenda-card { background: white; border: 1px solid #E6D8BF; border-left: 3px solid #1d3658; border-radius: 1mm; padding: 4mm 5mm; break-inside: avoid; }
  .agenda-card-top { display: flex; justify-content: space-between; margin-bottom: 1.5mm; }
  .agenda-domain { font-family: Arial, sans-serif; font-weight: 700; font-size: 10pt; color: #001030; }
  .agenda-severity { font-family: Arial, sans-serif; font-size: 7.5pt; text-transform: uppercase; color: #746B5C; }
  .agenda-owner { font-family: Arial, sans-serif; font-size: 8pt; color: #7C5F2A; font-weight: 700; margin-bottom: 1.5mm; }
  .agenda-rationale { font-size: 9pt; color: #746B5C; font-style: italic; margin-bottom: 3mm; }
  .agenda-timeline { display: flex; gap: 3mm; }
  .agenda-stage { flex: 1; background: #F7F1E6; border-radius: 1mm; padding: 2.5mm 3mm; }
  .stage-label { display: block; font-family: Arial, sans-serif; font-size: 7pt; text-transform: uppercase; font-weight: 700; color: #1d3658; margin-bottom: 1mm; }
  .stage-action { display: block; font-size: 8.5pt; }
  .leadership-row { display: flex; gap: 5mm; padding: 3.5mm 0; border-bottom: 1px solid #E6D8BF; break-inside: avoid; }
  .leadership-role { flex: 0 0 48mm; font-family: Arial, sans-serif; font-weight: 700; color: #001030; font-size: 9.5pt; }
  .leadership-question { flex: 1; font-size: 9.5pt; }
  .next-step-list { display: flex; flex-direction: column; gap: 3mm; margin-top: 4mm; }
  .next-step-item { border-left: 3px solid #1d3658; padding-left: 4mm; break-inside: avoid; }
  .next-step-title { font-family: Arial, sans-serif; font-weight: 700; color: #001030; font-size: 9.5pt; }
  .version-record { border: 1px solid #E6D8BF; border-radius: 1.5mm; padding: 6mm; margin-top: 6mm; }
  .version-record .row { display: flex; justify-content: space-between; padding: 2mm 0; border-bottom: 1px solid #F0EBDD; font-size: 9pt; font-family: Arial, sans-serif; }
  table.appendix-table { width: 100%; border-collapse: collapse; margin: 4mm 0; }
  table.appendix-table th, table.appendix-table td { border: 1px solid #E6D8BF; padding: 2mm 3mm; font-size: 8.5pt; }
  table.appendix-table th { background: #F7F1E6; font-family: Arial, sans-serif; }
  .footer-note { font-family: Arial, sans-serif; font-size: 7pt; color: #746B5C; margin-top: auto; padding-top: 5mm; border-top: 1px solid #E6D8BF; }
</style>
</head>
<body>
<section class="page cover">
  <div class="cover-inner">
    <div class="cover-top">
      <div class="eyebrow">MK Fraud Insights &middot; Independent Fraud Risk Advisory</div>
      <h1>Fraud Readiness Advisory Report</h1>
      <div class="sub">A structured diagnosis of fraud readiness, exposure and priority action prepared exclusively for this organisation's leadership team.</div>
    </div>
    <div class="cover-mid">
      <div class="prepared-for">Prepared exclusively for</div>
      <div class="org">${esc(data.organisationName)}</div>
    </div>
    <div class="cover-bottom">
      <div class="meta">Report reference: ${esc(data.reportReference)}<br/>Generated: ${esc(generatedDate)}<br/>Package: ${esc(data.packageName)}</div>
      <div class="confidential">Confidential. Prepared exclusively for ${esc(data.organisationName)} and not for wider distribution without MK Fraud Insights' consent.</div>
    </div>
  </div>
</section>
<section class="page confidentiality-page">
  <div class="box">
    <h2>Confidentiality and use</h2>
    <p>This report is prepared exclusively for ${esc(data.organisationName)} based on a structured self-assessment. It is intended for internal leadership use and is not for external distribution without MK Fraud Insights' consent.</p>
    <p>Findings reflect the responses provided at the time of assessment and should be read as a diagnostic starting point, not a certification, audit opinion or guarantee.</p>
  </div>
</section>
<section class="page">
  <div class="section-divider">Executive Diagnosis</div>
  <div class="diagnosis-tile">
    <div class="diagnosis-score"><div class="big-number">${score(sr.overallScore)}</div><div class="out-of">out of 100</div><div class="band-chip" style="background:${bandColor};">${esc(sr.finalMaturity)}</div></div>
    <div class="diagnosis-narrative"><h2>${esc(content.executiveSummary.title)}</h2><p>${esc(content.executiveSummary.body)}</p></div>
  </div>
  <div class="leadership-box"><div class="label">What leadership should pay attention to</div><p>${esc(content.leadershipAttention.body)}</p></div>
</section>
<section class="page">
  <div class="section-divider">Readiness Score</div>
  <h2>What this score means in commercial terms</h2>
  <div class="score-grid">
    <div class="score-grid-cell"><div class="label">Score</div><div class="value">${score(sr.overallScore)}/100</div></div>
    <div class="score-grid-cell"><div class="label">Band</div><div class="value">${esc(sr.finalMaturity)}</div></div>
    <div class="score-grid-cell"><div class="label">Exposure</div><div class="value">${esc(sr.exposureBand)}</div></div>
    <div class="score-grid-cell"><div class="label">Coverage</div><div class="value">${pct(sr.coveragePct)}</div></div>
    <div class="score-grid-cell"><div class="label">Flags</div><div class="value">${sr.criticalGapCount + sr.majorGapCount}</div></div>
  </div>
  <p>A ${esc(sr.finalMaturity)} reading means fraud controls are ${sr.finalMaturity === 'Strategic' ? 'mature and largely proven' : sr.finalMaturity === 'Structured' ? 'genuinely present and operating, with consistency the main remaining gap' : sr.finalMaturity === 'Developing' ? 'present in places but not yet reliable' : 'not yet structured'}. This number should be read together with the exposure profile and domain view that follow, not in isolation.</p>
</section>
<section class="page">
  <div class="section-divider">The Three Biggest Fraud-Readiness Risks</div>
  <h2>Where leadership attention matters most right now</h2>
  ${topRisksHtml}
</section>
<section class="page exposure-page">
  <div class="section-divider">Exposure Profile</div>
  <h2>${esc(quadrantLabel)}</h2>
  <div class="matrix-wrap">
    <div class="matrix-plot-cell"><div class="matrix-plot"><div class="matrix-point" style="left:${plotX - exposurePointSizeMm / 2}mm; top:${plotY - exposurePointSizeMm / 2}mm;"></div></div><div class="matrix-axis-label">Horizontal: inherent exposure low to high. Vertical: readiness low to high.</div></div>
    <div class="matrix-legend-cell"><p>Exposure describes how much inherent fraud risk the operating model carries, independent of how good controls are. Readiness describes how well those controls defend against it. The same readiness score means something different for a low-exposure organisation than a high-exposure one.</p></div>
  </div>
  <h3>What is driving this organisation's exposure</h3>
  <div class="exposure-driver-list">${exposureFactorRows}</div>
</section>
<section class="page">
  <div class="section-divider">Domain Heatmap</div>
  <h2>The score is made up of ten areas, not one average</h2>
  <div class="heatmap">${domainHeatmap}</div>
</section>
<section class="page">
  <div class="section-divider">Priority Gap Dashboard</div>
  <h2>If leadership reads one page, it should be this one</h2>
  ${priorityGaps ? `<ul class="priority-list">${priorityGaps}</ul>` : '<div class="clean-note">No critical or major gaps were flagged in this assessment. See the False Comfort page next: a clean result is good news, but it is not the same claim as zero risk.</div>'}
</section>
<section class="page">
  <div class="section-divider">Critical Flags and Leadership Blind Spots</div>
  <h2>Where a small number of issues can still mean high risk</h2>
  <p>A small number of controls in this methodology carry enough weight that a serious gap in one can limit the overall reading, regardless of how strong other areas are.</p>
  ${criticalControlsList ? `<ul class="critical-list">${criticalControlsList}</ul>` : '<div class="clean-note">No control issues of this kind were flagged in this assessment.</div>'}
</section>
<section class="page false-comfort-page">
  <div class="section-divider">False Comfort</div>
  <h2>${esc(content.falseComfort.title)}</h2>
  <p>${esc(content.falseComfort.body)}</p>
</section>
${domainGroupPages}
<section class="page">
  <div class="section-divider">Action Register</div>
  <h2>The specific actions behind the roadmap</h2>
  <table class="action-register"><tr><th>Domain</th><th>Priority</th><th>Immediate action</th><th>Suggested owner</th></tr>${actionRegisterRows}</table>
</section>
<section class="page">
  <div class="section-divider">30/60/90-Day Roadmap</div>
  <h2>A sequenced plan, not a repeated checklist</h2>
  <div class="agenda-list">${agendaCards}</div>
</section>
<section class="page">
  <div class="section-divider">Leadership Agenda</div>
  <h2>What each function should be asking</h2>
  ${leadershipAgendaRows}
</section>
<section class="page">
  <div class="section-divider">Where MK Fraud Insights Can Help Next</div>
  <h2>Natural next steps, not a hard sell</h2>
  <div class="next-step-list">
    <div class="next-step-item"><div class="next-step-title">Targeted control review</div><p>A focused review of the specific domains flagged as highest priority in this report.</p></div>
    <div class="next-step-item"><div class="next-step-title">Fraud risk framework design</div><p>Building the governance, ownership and reporting structure this report's findings point toward.</p></div>
    <div class="next-step-item"><div class="next-step-title">Advisory retainer</div><p>Ongoing access to fraud risk expertise as the organisation's controls and exposure evolve.</p></div>
  </div>
</section>
<section class="page">
  <div class="section-divider">Methodology and Limitations</div>
  <h2>How this reading was produced</h2>
  <p>This report is generated from a structured self-assessment across ten areas of fraud risk management, each weighted by relative importance to overall fraud readiness. Certain control failures can limit the overall reading even where other areas score well.</p>
  <h3 style="margin-top:6mm;">Limitations</h3>
  <p>This is a structured self-assessment, not a forensic investigation, external audit or compliance certification. It reflects responses at a point in time and should be read as a diagnostic starting point, not assurance that fraud has not occurred or cannot occur.</p>
</section>
<section class="page">
  <div class="section-divider">Appendix: Score Basis</div>
  <h2>Coverage and completeness</h2>
  <table class="appendix-table"><tr><th>Domain</th><th>Coverage</th></tr>${data.domainResults.map((domain) => `<tr><td>${esc(domain.domainName)}</td><td>${pct(domain.coveragePct)}</td></tr>`).join('')}</table>
</section>
<section class="page">
  <div class="section-divider">Version Record</div>
  <h2>Report versioning</h2>
  <div class="version-record">
    <div class="row"><span>Report reference</span><span>${esc(data.reportReference)}</span></div>
    <div class="row"><span>Assessment reference</span><span>${esc(data.assessmentReference)}</span></div>
    <div class="row"><span>Generated</span><span>${esc(generatedDate)}</span></div>
    <div class="row"><span>Package</span><span>${esc(data.packageName)}</span></div>
  </div>
  <div class="footer-note">MK Fraud Insights | Independent Fraud Risk Advisory | www.mkfraud.co.za | Prepared exclusively for ${esc(data.organisationName)}</div>
</section>
</body>
</html>`;
}
