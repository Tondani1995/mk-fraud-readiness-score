import type { CommercialProjection } from '../commercial-projection';
import { severityToken } from '../design/tokens';
import { escapeHtml, exhibitResult, type DomainDatum, type ExhibitContext, type ExhibitResult, type OptionDatum, type SlopeDatum } from './types';

const source = (ctx: ExhibitContext) => ctx.source ?? 'Assessment projection, reviewer evidence register, and management response record.';
const empty = (value: string | null | undefined, fallback = 'Not recorded in the assessment record.') => value?.trim() || fallback;

export function renderE1DomainMaturity(ctx: ExhibitContext): ExhibitResult {
  const domains = ctx.domains?.length ? ctx.domains : ctx.projection.domains;
  const rows = domains.map((domain) => `<tr><th>${escapeHtml(domain.code)}</th><td>${escapeHtml(domain.name)}</td><td>${domain.score == null ? 'Not scored' : escapeHtml(domain.score)}</td><td>${escapeHtml(domain.controlCount ?? 0)}</td></tr>`).join('');
  return exhibitResult('E1', 'Show domain maturity', `<table class="mk-table"><thead><tr><th>Domain</th><th>Meaning</th><th>Score</th><th>Controls</th></tr></thead><tbody>${rows || '<tr><td colspan="4">No domain results were supplied.</td></tr>'}</tbody></table>`, source(ctx), ['domains']);
}

export function renderE2PriorityMatrix(ctx: ExhibitContext): ExhibitResult {
  const rows = ctx.projection.findings.slice(0, 12).map((finding) => {
    const severity = finding.gapClassification === 'critical' ? 'critical' : finding.gapClassification === 'major' ? 'major' : 'neutral';
    return `<tr><th>${escapeHtml(finding.title)}</th><td>${escapeHtml(finding.domainName)}</td><td style="color:${severityToken(severity)}">${escapeHtml(finding.gapClassification)}</td><td>${escapeHtml(finding.targetPeriod)}</td></tr>`;
  }).join('');
  return exhibitResult('E2', 'Prioritise material findings', `<table class="mk-table"><thead><tr><th>Finding</th><th>Domain</th><th>Materiality</th><th>Target period</th></tr></thead><tbody>${rows || '<tr><td colspan="4">No material findings were supplied.</td></tr>'}</tbody></table>`, source(ctx), ['findings']);
}

export function renderE3EvidenceBar(ctx: ExhibitContext): ExhibitResult {
  const r = ctx.projection.reconciliation;
  const cells = [['Not reviewed', r.notReviewed], ['Supported', r.supported], ['Insufficient', r.insufficient], ['Not supported', r.notSupported], ['Reviewed—no conclusion', r.reviewedNoConclusion]];
  const total = Math.max(r.total, 1);
  const bar = cells.map(([label, count]) => `<div class="mk-bar-segment" style="width:${(Number(count) / total) * 100}%" title="${escapeHtml(label)}: ${count}">${escapeHtml(label)} ${count}</div>`).join('');
  return exhibitResult('E3', 'Reconcile evidence status', `<div class="mk-evidence-bar">${bar}</div><p>${r.reviewed} of ${r.total} items reviewed; ${r.unresolved} unresolved under the locked reconciliation rule.</p>`, source(ctx), ['total', 'notReviewed', 'reviewed', 'supported', 'insufficient', 'notSupported', 'reviewedNoConclusion', 'unresolved']);
}

export function renderE4SlopeChart(ctx: ExhibitContext): ExhibitResult {
  const points = ctx.slope ?? ctx.domains?.filter((d): d is DomainDatum & { score: number } => d.score !== null).map((d) => ({ label: d.name, score: d.score })) ?? [];
  const width = 640; const height = 210; const max = Math.max(100, ...points.map((point) => point.score));
  const pointMarkup = points.map((point, index) => {
    const x = points.length <= 1 ? width / 2 : 40 + (index * (width - 80)) / (points.length - 1);
    const y = height - 34 - (point.score / max) * (height - 70);
    return `<circle cx="${x}" cy="${y}" r="5" fill="var(--mk-brass)"/><text x="${x}" y="${height - 10}" text-anchor="middle">${escapeHtml(point.label)}</text><text x="${x}" y="${y - 10}" text-anchor="middle">${escapeHtml(point.score)}</text>`;
  }).join('');
  const line = points.map((point, index) => {
    const x = points.length <= 1 ? width / 2 : 40 + (index * (width - 80)) / (points.length - 1);
    const y = height - 34 - (point.score / max) * (height - 70);
    return `${x},${y}`;
  }).join(' ');
  return exhibitResult('E4', 'Show maturity movement', `<svg class="mk-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Maturity movement slope chart"><line x1="40" y1="${height - 34}" x2="${width - 40}" y2="${height - 34}" stroke="var(--mk-rule)"/><polyline points="${line}" fill="none" stroke="var(--mk-navy-500)" stroke-width="3"/>${pointMarkup || '<text x="320" y="100" text-anchor="middle">No comparable scores supplied.</text>'}</svg>`, source(ctx), ['slope']);
}

export function renderE5HeatStrip(ctx: ExhibitContext): ExhibitResult {
  const cells = ctx.projection.domains.map((domain) => {
    const score = domain.score ?? 0; const severity = score < 40 ? 'critical' : score < 60 ? 'major' : 'confirmed';
    return `<div class="mk-heat-cell" style="background:${severityToken(severity)}">${escapeHtml(domain.code)}<small>${escapeHtml(score)}</small></div>`;
  }).join('');
  return exhibitResult('E5', 'Locate exposure concentration', `<div class="mk-heat-strip">${cells || '<div>No domain scores supplied.</div>'}</div>`, source(ctx), ['domains']);
}

export function renderE6FraudPathway(ctx: ExhibitContext): ExhibitResult {
  const scenario = ctx.projection.scenarios[0];
  const items = scenario ? [scenario.title, scenario.entryPoint, scenario.fraudSequence, scenario.concealmentMechanism, scenario.earlyWarningIndicators.join('; '), scenario.immediateContainment] : [];
  return exhibitResult('E6', 'Trace the fraud pathway', `<ol class="mk-pathway">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('') || '<li>No scenario pathway supplied.</li>'}</ol>`, source(ctx), ['scenario', 'entryPoint', 'sequence', 'concealment', 'warning', 'containment']);
}

export function renderE7Options(ctx: ExhibitContext): ExhibitResult {
  const options: OptionDatum[] = ctx.options ?? ctx.projection.decisions.map((decision) => ({ id: decision.id, title: decision.decisionRequired, decision: decision.recommendedDecision, owner: decision.accountableExecutive, timing: decision.targetPeriod, tradeOff: decision.consequenceOfDelay }));
  const rows = options.map((option) => `<tr><th>${escapeHtml(option.title)}</th><td>${escapeHtml(option.decision)}</td><td>${escapeHtml(option.owner)}</td><td>${escapeHtml(option.timing)}</td><td>${escapeHtml(option.tradeOff)}</td></tr>`).join('');
  return exhibitResult('E7', 'Compare leadership options', `<table class="mk-table"><thead><tr><th>Option</th><th>Decision</th><th>Accountable owner</th><th>Timing</th><th>Trade-off</th></tr></thead><tbody>${rows || '<tr><td colspan="5">No options supplied.</td></tr>'}</tbody></table>`, source(ctx), ['options', 'decision', 'owner', 'timing', 'tradeOff']);
}

export function renderE8Roadmap(ctx: ExhibitContext): ExhibitResult {
  const rows = ctx.projection.actions.slice(0, 16).map((action) => `<tr><th>${escapeHtml(action.deliverable)}</th><td>${escapeHtml(action.period)}</td><td>${escapeHtml(action.accountableExecutive)}</td><td>${escapeHtml(action.successMeasure)}</td></tr>`).join('');
  return exhibitResult('E8', 'Sequence the remediation roadmap', `<table class="mk-table"><thead><tr><th>Action</th><th>Timing</th><th>Owner</th><th>Success measure</th></tr></thead><tbody>${rows || '<tr><td colspan="4">No roadmap actions supplied.</td></tr>'}</tbody></table>`, source(ctx), ['actions', 'timing', 'owner', 'successMeasure']);
}

export function renderE9ControlDesign(ctx: ExhibitContext): ExhibitResult {
  const rows = ctx.projection.controls.slice(0, 16).map((control) => `<tr><th>${escapeHtml(control.controlObjective)}</th><td>${escapeHtml(control.accountableExecutive)}</td><td>${escapeHtml(control.operatingFrequency)}</td><td>${escapeHtml(control.effectivenessTest)}</td><td>${escapeHtml(control.escalationThreshold)}</td></tr>`).join('');
  return exhibitResult('E9', 'Test control design', `<table class="mk-table"><thead><tr><th>Objective</th><th>Executive</th><th>Frequency</th><th>Effectiveness test</th><th>Escalation</th></tr></thead><tbody>${rows || '<tr><td colspan="5">No control improvements supplied.</td></tr>'}</tbody></table>`, source(ctx), ['controls', 'objective', 'owner', 'frequency', 'effectiveness', 'escalation']);
}

export function renderE10BoardOversight(ctx: ExhibitContext): ExhibitResult {
  const rows = ctx.projection.decisions.slice(0, 8).map((decision) => `<tr><th>${escapeHtml(decision.decisionRequired)}</th><td>${escapeHtml(decision.accountableExecutive)}</td><td>${escapeHtml(decision.targetPeriod)}</td><td>${escapeHtml(decision.evidenceDrivingIt)}</td></tr>`).join('');
  return exhibitResult('E10', 'Focus board oversight', `<table class="mk-table"><thead><tr><th>Decision</th><th>Accountable executive</th><th>Timing</th><th>Oversight question</th></tr></thead><tbody>${rows || '<tr><td colspan="4">No leadership decisions supplied.</td></tr>'}</tbody></table>`, source(ctx), ['decisions', 'accountableExecutive', 'timing', 'oversightQuestion']);
}

export function renderAllExhibits(ctx: ExhibitContext): ExhibitResult[] {
  return [renderE1DomainMaturity(ctx), renderE2PriorityMatrix(ctx), renderE3EvidenceBar(ctx), renderE4SlopeChart(ctx), renderE5HeatStrip(ctx), renderE6FraudPathway(ctx), renderE7Options(ctx), renderE8Roadmap(ctx), renderE9ControlDesign(ctx), renderE10BoardOversight(ctx)];
}

export function exhibitCss(): string {
  return `.mk-table{width:100%;border-collapse:collapse;color:var(--mk-ink);font-size:10px}.mk-table th,.mk-table td{border-bottom:1px solid var(--mk-rule);padding:7px;text-align:left;vertical-align:top}.mk-table th{font-weight:700;color:var(--mk-navy-700)}.mk-source{font-size:8px;color:var(--mk-muted);margin-top:10px}.mk-evidence-bar{display:flex;min-height:34px;background:var(--mk-rule);border-radius:4px;overflow:hidden}.mk-bar-segment{display:flex;align-items:center;justify-content:center;min-width:4%;padding:4px;color:var(--mk-white);font-size:9px;border-right:1px solid var(--mk-white);background:var(--mk-navy-500)}.mk-bar-segment:nth-child(2){background:var(--mk-confirmed)}.mk-bar-segment:nth-child(3){background:var(--mk-major)}.mk-bar-segment:nth-child(4){background:var(--mk-critical)}.mk-bar-segment:nth-child(5){background:var(--mk-navy-700)}.mk-chart{width:100%;height:auto;background:var(--mk-cream);border:1px solid var(--mk-rule)}.mk-heat-strip{display:flex;gap:4px;align-items:stretch}.mk-heat-cell{flex:1;min-height:58px;padding:8px;color:var(--mk-white);font-weight:700}.mk-heat-cell small{display:block;font-weight:400;margin-top:7px}.mk-pathway{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:0;list-style-position:inside}.mk-pathway li{background:var(--mk-cream);border-left:3px solid var(--mk-brass);padding:12px;min-height:50px}.mk-severity{font-weight:700}`;
}

export { type CommercialProjection };
