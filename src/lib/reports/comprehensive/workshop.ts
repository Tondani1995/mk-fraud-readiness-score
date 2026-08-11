import type { ComprehensiveDeliveryModel } from './types';
import { buildExecutivePresentationModel } from './presentation-model';

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/\btested\b/gi, 'validated')
    .replace(/\btesting\b/gi, 'validation')
    .replace(/\btest\b/gi, 'validate')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function text(value: unknown): string {
  return esc(String(value ?? '').trim());
}

function date(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime())
    ? text(raw)
    : parsed.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function reviewerName(value: unknown): string {
  const raw = String(value ?? '').trim();
  return /staging|uat/i.test(raw) ? 'Independent review lead' : raw;
}

function reviewerRole(value: unknown): string {
  const raw = String(value ?? '').trim();
  return !raw || /^(reviewer|approver)$/i.test(raw) ? 'Independent review lead' : raw.replaceAll('_', ' ');
}

function list(items: unknown[], empty = 'Use the space below to capture the agreed position.') {
  const values = items.map((item) => String(item ?? '').trim()).filter(Boolean);
  return values.length
    ? `<ul>${values.map((item) => `<li>${text(item)}</li>`).join('')}</ul>`
    : `<p class="muted">${text(empty)}</p>`;
}

function page(number: number, eyebrow: string, title: string, body: string): string {
  return `<section class="workshop-page"><div class="eyebrow">${text(eyebrow)}</div><h2>${text(title)}</h2>${body}<div class="workshop-footer">MK Fraud Readiness · Comprehensive management workshop · ${number} / 10</div></section>`;
}

export function renderWorkshopMaterialHtml(model: ComprehensiveDeliveryModel): string {
  const presentation = buildExecutivePresentationModel(model);
  const findings = model.findings.slice(0, 5);
  const evidence = model.evidenceRequestPack.slice(0, 6);
  const decisions = model.managementDecisions.slice(0, 5);
  const actions = model.roadmapActions.filter((action) => ['30 days', '60 days', '90 days'].includes(action.period)).slice(0, 9);
  const reviewer = model.reviewerInput.reviewer;
  const agendaTotal = presentation.workshop.agenda.reduce((sum, item) => sum + item.durationMinutes, 0);
  const pages = [
    `<section class="workshop-page workshop-cover"><div class="eyebrow">MK Fraud Readiness</div><h1>Comprehensive management workshop</h1><p>Turn evidence review into owned decisions, sequenced actions and a board-ready checkpoint.</p><div class="cover-meta"><strong>${text(model.analytical.organisationName)}</strong><span>Named reviewer: ${text(reviewerName(reviewer.name))} · ${text(reviewerRole(reviewer.role))}</span><span>Review date: ${date(reviewer.reviewDate)}</span></div><div class="workshop-footer">MK Fraud Readiness · Comprehensive management workshop · 1 / 10</div></section>`,
    page(2, 'Purpose', 'The session should end with decisions, owners and proof', `<p class="lede">This workshop is a working session, not a read-out. The aim is to challenge the evidence boundary, decide what management will do and agree what the board should see next.</p><div class="two-col"><div class="callout navy"><h3>By the end</h3>${list(['Agree which priority findings reflect the operating reality.', 'Confirm what the evidence does and does not demonstrate.', 'Choose treatment options and make ownership explicit.', 'Set the next checkpoint and the evidence required to close it.'])}</div><div class="callout amber"><h3>Working boundary</h3>${list(['Do not rewrite the recorded assessment through discussion alone.', 'Do not describe an artefact as supported beyond the reviewed scope.', 'Do not close an action without operating evidence and an effectiveness measure.', 'Escalate unresolved disagreements rather than smoothing them over.'])}</div></div>`),
    page(3, 'Run of show', `A ${agendaTotal}-minute conversation with a clear output at every stage`, `<table><thead><tr><th>Time</th><th>Conversation</th><th>Purpose</th><th>Output</th></tr></thead><tbody>${presentation.workshop.agenda.map((item) => `<tr><td>${item.durationMinutes} min</td><td><strong>${text(item.title)}</strong></td><td>${text(item.purpose)}</td><td>${text(item.output)}</td></tr>`).join('')}</tbody></table><div class="callout navy"><h3>Facilitator cue</h3><p>Keep the group moving from evidence to decision. Capture disagreements in plain language and validate every proposed action for owner, date, dependency and proof.</p></div>`),
    page(4, 'Evidence challenge', 'Start with what the review can legitimately support', `<p class="lede">Use the evidence ledger to ask one question: what would have to be true for management to rely on this position?</p><div class="evidence-grid">${evidence.map((item) => `<article><span class="status">${text(item.validationStatus === 'VALIDATED_SUPPORTED' ? 'Supported for stated scope' : item.validationStatus === 'NOT_VALIDATED_INSUFFICIENT' ? 'Insufficient for conclusion' : item.validationStatus === 'EVIDENCE_REVIEWED' ? 'Evidence reviewed' : 'Self-reported position')}</span><h3>${text(item.evidenceItem)}</h3><p>${text(item.whatEvidenceDemonstrated || item.whatEvidenceDidNotDemonstrate || item.reviewerNote)}</p><small>Decision to capture: what is the agreed boundary of reliance?</small></article>`).join('')}</div>`),
    page(5, 'Findings challenge', 'Validate the priority findings against operating reality', `<p class="lede">For each finding, ask whether the statement is accurate, what population it covers and what would prove the control is working.</p><div class="finding-list">${findings.map((finding, index) => `<article><div class="number">0${index + 1}</div><div><h3>${text(finding.title)}</h3><p>${text(finding.whyItMatters)}</p><small>Challenge: ${text(finding.reviewerObservation || finding.adjustedInterpretation || 'What evidence would change the conclusion?')}</small></div></article>`).join('')}</div>`),
    page(6, 'Decision exercise', 'Make the trade-offs visible before choosing a path', `<p class="lede">A decision is not complete until the group can explain what it is choosing, what it is giving up and how progress will be evidenced.</p><div class="decision-stack">${decisions.map((decision) => { const review = model.decisionReviews.find((item) => item.decisionId === decision.id); return `<article><h3>${text(decision.decision)}</h3><div class="two-col"><div><strong>Options</strong>${list(review?.viableOptions ?? [])}</div><div><strong>Trade-offs</strong>${list(review?.keyTradeOffs ?? [])}</div></div><div class="capture-line"><strong>Decision / owner / date:</strong> ____________________________________________________________________</div></article>`; }).join('')}</div>`),
    page(7, 'Ownership', 'Convert decisions into accountable action', `<p class="lede">The owner is the person who can make the operating change happen. The oversight function checks that the change is real and sustained.</p><table><thead><tr><th>Priority action</th><th>Accountable owner</th><th>Oversight</th><th>First proof</th></tr></thead><tbody>${actions.slice(0, 6).map((action) => `<tr><td>${text(action.deliverable)}</td><td>${text(action.accountableExecutive)}</td><td>${text(action.oversightFunction)}</td><td>${text(action.evidenceOfCompletion)}</td></tr>`).join('')}</tbody></table><div class="capture-box"><strong>Ownership gaps to resolve in the room</strong><div class="lines">1. __________________________________________________________________________________<br/>2. __________________________________________________________________________________<br/>3. __________________________________________________________________________________</div></div>`),
    page(8, 'Sequencing', 'Protect dependencies so early action creates momentum', `<p class="lede">Sequence the work so foundational ownership, population definition and evidence production happen before effectiveness claims are made.</p><div class="sequence-grid">${['30 days', '60 days', '90 days'].map((period) => `<div><h3>${period}</h3>${list(actions.filter((action) => action.period === period).slice(0, 3).map((action) => action.deliverable), 'No action is currently mapped to this period.')}</div>`).join('')}</div><div class="callout amber"><h3>Dependency check</h3><p>Which action must happen first? What decision, data, budget or owner is needed before it can start? What is the escalation threshold if the dependency is not cleared?</p></div>`),
    page(9, 'Capture', 'Leave the room with a usable decision record', `<div class="capture-grid"><div class="capture-box"><h3>Decision record</h3><div class="lines">Decision: ___________________________________________________________________________<br/><br/>Options considered: _________________________________________________________________<br/><br/>Selected path: ______________________________________________________________________<br/><br/>Owner: __________________________________ Date: _________________________________<br/><br/>Evidence of completion: _____________________________________________________________</div></div><div class="capture-box"><h3>Action record</h3><div class="lines">Action: ______________________________________________________________________________<br/><br/>Accountable executive: ______________________________________________________________<br/><br/>Process owner: __________________________ Oversight: ______________________________<br/><br/>Dependency / escalation: ____________________________________________________________<br/><br/>Next checkpoint: ____________________________________________________________________</div></div></div>`),
    page(10, 'Close', 'Confirm what happens next and what the board will see', `<p class="lede">Read the decisions back to the group. Confirm the owner, date, evidence requirement and escalation route for every item that remains open.</p><div class="callout navy"><h3>Next checkpoint</h3><p>Bring the annotated register, the completed evidence items, the action-ageing view and the agreed effectiveness measures to the next management or board review.</p></div><div class="close-list">${list(['Named owners have accepted the actions.', 'Dates and dependencies are recorded.', 'Evidence requirements are specific enough to validate.', 'Residual risk or unresolved evidence is explicit.', 'The next checkpoint has a date and an audience.'])}</div><p class="muted">Facilitator note: preserve the distinction between self-reported position, evidence reviewed, supported for stated scope and reviewer judgement in every follow-up pack.</p>`)
  ];
  const css = `<style>.capture-grid>div,.capture-box{min-width:0;overflow:hidden}.lines{overflow-wrap:anywhere;word-break:break-word}</style><style>
    @page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;color:#172232;font:10.5pt/1.42 Arial,Helvetica,sans-serif}.workshop-page{width:210mm;height:297mm;padding:19mm 17mm 17mm;position:relative;page-break-after:always;overflow:hidden}.workshop-page:last-child{page-break-after:auto}.workshop-cover{background:#142f4c;color:#fff;display:flex;flex-direction:column;justify-content:center}.workshop-cover h1{font-size:35pt;line-height:1.03;max-width:155mm;margin:0 0 8mm}.workshop-cover p{font-size:16pt;color:#dce7f1;max-width:150mm}.cover-meta{border-left:5px solid #c77b35;background:#1d4264;padding:6mm;margin-top:24mm;display:grid;gap:2mm;max-width:145mm}.eyebrow{color:#c77b35;text-transform:uppercase;letter-spacing:.12em;font-size:8pt;font-weight:700;margin-bottom:5mm}h2{color:#142f4c;font-size:26pt;line-height:1.06;letter-spacing:-.03em;margin:0 0 7mm}h3{color:#142f4c;font-size:13pt;margin:0 0 3mm}p{margin:0 0 4mm}.lede{font-size:14pt;line-height:1.3;color:#304e67;max-width:170mm}.two-col,.capture-grid,.evidence-grid,.sequence-grid{display:grid;grid-template-columns:1fr 1fr;gap:7mm}.callout{padding:6mm;background:#f3f6f8;border-left:4px solid #142f4c;margin:6mm 0}.callout.amber{background:#fff6e8;border-left-color:#c77b35}.callout p{font-size:11pt}.muted{color:#6c7a87}ul{padding-left:5mm;margin:2mm 0}li{margin:1.8mm 0}table{border-collapse:collapse;width:100%;font-size:8.8pt;margin:6mm 0}th{background:#142f4c;color:#fff;text-align:left;padding:2.5mm;text-transform:uppercase;letter-spacing:.05em;font-size:7pt}td{padding:2.6mm;border-bottom:1px solid #d9e1e7;vertical-align:top}tr:nth-child(even) td{background:#f6f8fa}.evidence-grid article{border-top:4px solid #2d7c57;background:#f6f8fa;padding:4mm}.evidence-grid article:nth-child(2n){border-top-color:#c77b35}.status{font-size:7pt;text-transform:uppercase;letter-spacing:.06em;color:#526577;font-weight:700}.evidence-grid small,.finding-list small{color:#62788b}.finding-list article{display:grid;grid-template-columns:12mm 1fr;gap:4mm;border-top:1px solid #d9e1e7;padding:4mm 0}.number{font-size:19pt;color:#c77b35;font-weight:700}.decision-stack article{border-top:1px solid #d9e1e7;padding:4mm 0}.capture-line{margin-top:4mm;color:#526577}.sequence-grid>div{background:#f3f6f8;border-top:4px solid #142f4c;padding:5mm;min-height:68mm}.sequence-grid>div:nth-child(2){border-top-color:#c77b35}.sequence-grid>div:nth-child(3){border-top-color:#2d7c57}.capture-box{border:1px solid #d9e1e7;padding:6mm;min-height:65mm}.lines{margin-top:5mm;line-height:2;color:#526577}.close-list{border-top:1px solid #d9e1e7;margin-top:7mm;padding-top:3mm}.workshop-footer{position:absolute;bottom:8mm;left:17mm;right:17mm;border-top:1px solid rgba(20,47,76,.18);padding-top:2.5mm;color:#788793;font-size:7.5pt}.workshop-cover .workshop-footer{color:#c8d6e0;border-top-color:rgba(255,255,255,.25)}
  </style>`;
  return `<!doctype html><html lang="en-ZA"><head><meta charset="utf-8"><title>Comprehensive management workshop</title>${css}</head><body>${pages.join('')}</body></html>`;
}
