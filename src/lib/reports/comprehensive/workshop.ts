import type { ComprehensiveDeliveryModel } from './types';
import { buildExecutivePresentationModel } from './presentation-model';
import { MK_CSS_VARIABLES } from '../design/tokens';

function esc(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function text(value: unknown): string {
  return esc(String(value ?? '').trim()
    .replace(/\bAn interaction covered by the recorded control condition:\s*/gi, 'The recorded control condition is engaged through ')
    .replace(/\bAn actor exploits the recorded control condition so that\b/gi, 'A threat actor can exploit the recorded control condition when')
    .replace(/\bvalidated\b/gi, 'checked'));
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
  return /staging|uat/i.test(raw) ? 'Named review lead' : raw;
}

function reviewerRole(value: unknown): string {
  const raw = String(value ?? '').trim();
  return !raw || /^(reviewer|approver)$/i.test(raw) ? 'Review lead' : raw.replaceAll('_', ' ');
}

function list(items: unknown[], empty = 'Use the space below to capture the agreed position.') {
  const values = items.map((item) => String(item ?? '').trim()).filter(Boolean);
  return values.length
    ? `<ul>${values.map((item) => `<li>${text(item)}</li>`).join('')}</ul>`
    : `<p class="muted">${text(empty)}</p>`;
}

function compact(value: unknown, limit = 14): string {
  const words = String(value ?? '').trim().split(/\s+/).filter(Boolean);
  return words.length > limit ? `${words.slice(0, limit).join(' ')}…` : words.join(' ');
}

function page(number: number, eyebrow: string, title: string, body: string): string {
  return `<section class="workshop-page"><div class="eyebrow">${text(eyebrow)}</div><h2>${text(title)}</h2>${body}<div class="workshop-footer">MK Fraud Readiness · Comprehensive management workshop · ${number} / 10 · Source: persisted assessment and management review record.</div></section>`;
}

export function renderWorkshopMaterialHtml(model: ComprehensiveDeliveryModel): string {
  const presentation = buildExecutivePresentationModel(model);
  const findings = model.findings.slice(0, 2);
  const evidence = model.evidenceRequestPack.slice(0, 6);
  const decisions = model.leadershipDecisions.slice(0, 5);
  const actions = model.roadmapActions.filter((action) => ['30 days', '60 days', '90 days'].includes(action.period)).slice(0, 9);
  const reviewer = model.reviewerInput.reviewer;
  const agendaTotal = presentation.workshop.agenda.reduce((sum, item) => sum + item.durationMinutes, 0);
  const scenario = model.scenarios[0];
  const scenarioLens = scenario ? [
    ['Actor / opportunity', compact(scenario.confirmedOperatingContext.join('; '))],
    ['Entry point', compact(scenario.entryPoint)],
    ['Mechanism', compact(scenario.fraudSequence)],
    ['Control bypassed', compact(scenario.controlsExpected.join('; '))],
    ['Concealment', compact(scenario.concealmentMechanism)],
    ['Consequence', compact([scenario.financialImpact, scenario.operationalImpact, ...scenario.likelyImpact].join('; '))],
    ['Warning indicators', compact(scenario.earlyWarningIndicators.join('; '))],
    ['Containment', compact(scenario.immediateContainment)],
    ['Long-term response', compact(scenario.longerTermResponse)]
  ].map(([label, value]) => `<tr><th>${text(label)}</th><td>${text(value)}</td></tr>`).join('') : '';
  const pages = [
    `<section class="workshop-page workshop-cover"><div class="eyebrow">MK Fraud Readiness</div><h1>Comprehensive management workshop</h1><p>Turn the recorded assessment into owned decisions, sequenced actions and a board-ready checkpoint.</p><div class="cover-meta"><strong>${text(model.analytical.organisationName)}</strong><span>Named reviewer: ${text(reviewerName(reviewer.name))} · ${text(reviewerRole(reviewer.role))}</span><span>Review date: ${date(reviewer.reviewDate)}</span></div><div class="workshop-footer">MK Fraud Readiness · Comprehensive management workshop · 1 / 10</div></section>`,
    page(2, 'Purpose', 'The session should end with decisions, owners and proof', `<p class="lede">This workshop is a working session, not a read-out. The aim is to challenge the information boundary, decide what management will do and agree what the board should see next.</p><div class="two-col"><div class="callout navy"><h3>By the end</h3>${list(['Agree which priority findings reflect the operating reality.', 'Confirm what the supplied information does and does not demonstrate.', 'Choose treatment options and make ownership explicit.', 'Set the next checkpoint and the proof required to close it.'])}</div><div class="callout amber"><h3>Working boundary</h3>${list(['Do not rewrite the recorded assessment through discussion alone.', 'Do not claim operating effectiveness beyond the named scope.', 'Do not close an action without operating proof and an effectiveness measure.', 'Escalate unresolved disagreements rather than smoothing them over.'])}</div></div><p class="muted">Reported readiness: ${model.analytical.score.overallScore ?? 'Not scored'} out of 100. This workshop changes neither the deterministic score nor maturity.</p>`),
    page(3, 'Run of show', `A ${agendaTotal}-minute conversation with a clear output at every stage`, `<table><thead><tr><th>Time</th><th>Conversation</th><th>Purpose</th><th>Output</th></tr></thead><tbody>${presentation.workshop.agenda.map((item) => `<tr><td>${item.durationMinutes} min</td><td><strong>${text(item.title)}</strong></td><td>${text(item.purpose)}</td><td>${text(item.output)}</td></tr>`).join('')}</tbody></table><div class="callout navy"><h3>Facilitator cue</h3><p>Keep the group moving from information to decision. Capture disagreements in plain language and check every proposed action for owner, date, dependency, proof and failure response.</p></div>`),
    page(4, 'Information boundary', 'The review note is limited to the named scope', `<p class="lede">Use the information register to ask one question: what would have to be true for management to rely on this position?</p><div class="evidence-grid">${evidence.map((item) => `<article><span class="status">${text(item.validationStatus === 'VALIDATED_SUPPORTED' ? 'Review note — stated scope recorded' : item.validationStatus === 'NOT_VALIDATED_INSUFFICIENT' ? 'Review note — further basis required' : item.validationStatus === 'EVIDENCE_REVIEWED' ? 'Management review record' : 'Recorded self-assessment')}</span><h3>${text(item.evidenceItem)}</h3><p>${text(item.whatEvidenceDemonstrated || item.whatEvidenceDidNotDemonstrate || item.reviewerNote)}</p><small>Decision to capture: what is the agreed boundary of reliance?</small></article>`).join('')}</div>`),
    page(5, 'Findings challenge', 'Priority findings should match operating reality', `<p class="lede">For each finding, ask whether the statement is accurate, what population it covers and what would prove the control is working.</p><div class="finding-list">${findings.map((finding, index) => `<article><div class="number">0${index + 1}</div><div><h3>${text(finding.title)}</h3><p>${text(finding.whyItMatters)}</p><small>Challenge: ${text(finding.reviewerObservation || finding.adjustedInterpretation || 'What evidence would change the conclusion?')}</small></div></article>`).join('')}</div><div class="callout navy"><h3>Scenario resilience lens</h3><table class="scenario-lens"><tbody>${scenarioLens || '<tr><td>Actor / opportunity, entry point, mechanism, control bypassed, concealment, consequence, warning indicators, containment and long-term response should all be recorded.</td></tr>'}</tbody></table></div>`),
    page(6, 'Decision exercise', 'Visible trade-offs improve the chosen path', `<p class="lede">A decision is not complete until the group can explain what it is choosing, what it is giving up and how progress will be evidenced.</p><div class="decision-stack">${decisions.slice(0, 1).map((decision) => { const review = model.decisionReviews.find((item) => item.decisionId === decision.id); return `<article><h3>${text(decision.decisionRequired)}</h3><div class="two-col"><div><strong>Options and analysis</strong>${list((review?.optionDetails ?? []).map((option) => `${option.option}: cost — ${option.cost}; benefit — ${option.benefit}; trade-off — ${option.tradeOff}; ${option.rejectionReason ? `rejection reason — ${option.rejectionReason}` : 'recommended option'}`))}</div><div><strong>MK recommendation and rationale</strong><p><strong>MK recommendation:</strong> ${text(review?.reviewerRecommendation ?? decision.recommendedDecision)}</p><p><strong>Recommendation rationale:</strong> ${text(review?.recommendationRationale)}</p><p><strong>Owner / deadline:</strong> ${text(review?.owner ?? decision.accountableExecutive)} · ${text(date(review?.targetDate ?? decision.deadline))}</p></div></div><div class="capture-line"><strong>Decision / owner / date / failure response:</strong> ______________________________________________________________</div></article>`; }).join('')}</div>`),
    page(7, 'Ownership', 'Accountable ownership converts decisions into action', `<p class="lede">The owner is the person who can make the operating change happen. The oversight function checks that the change is real and sustained.</p><table><thead><tr><th>Priority action</th><th>Accountable owner</th><th>Oversight</th><th>First proof</th><th>Failure response</th></tr></thead><tbody>${actions.slice(0, 6).map((action) => `<tr><td>${text(action.deliverable)}</td><td>${text(action.accountableExecutive)}</td><td>${text(action.oversightFunction)}</td><td>${text(action.evidenceOfCompletion)}</td><td>${text(action.escalationThreshold)}</td></tr>`).join('')}</tbody></table><div class="capture-box"><strong>Ownership gaps to resolve in the room</strong><div class="lines">1. __________________________________________________________________________________<br/>2. __________________________________________________________________________________<br/>3. __________________________________________________________________________________</div></div>`),
    page(8, 'Sequencing', 'Sequencing protects dependencies and creates momentum', `<p class="lede">Sequence the work so foundational ownership, population definition and evidence production happen before effectiveness claims are made.</p><div class="sequence-grid">${['30 days', '60 days', '90 days'].map((period) => `<div><h3>${period}</h3>${list(actions.filter((action) => action.period === period).slice(0, 3).map((action) => `${action.deliverable} · proof: ${action.evidenceOfCompletion} · failure response: ${action.escalationThreshold}`), 'No action is currently mapped to this period.')}</div>`).join('')}</div><div class="callout amber"><h3>Dependency check</h3><p>Which action must happen first? What decision, data, budget or owner is needed before it can start? What is the escalation threshold if the dependency is not cleared?</p></div>`),
    page(9, 'Capture', 'A usable decision record makes ownership durable', `<div class="capture-grid"><div class="capture-box"><h3>Decision record</h3><div class="lines">Decision: ___________________________________________________________________________<br/><br/>Options considered: _________________________________________________________________<br/><br/>Selected path: ______________________________________________________________________<br/><br/>Owner: __________________________________ Date: _________________________________<br/><br/>Evidence of completion: _____________________________________________________________</div></div><div class="capture-box"><h3>Action record</h3><div class="lines">Action: ______________________________________________________________________________<br/><br/>Accountable executive: ______________________________________________________________<br/><br/>Process owner: __________________________ Oversight: ______________________________<br/><br/>Dependency / escalation: ____________________________________________________________<br/><br/>Next checkpoint: ____________________________________________________________________</div></div></div>`),
    page(10, 'Close', 'The next checkpoint should show proof and ownership', `<p class="lede">Read the decisions back to the group. Confirm the owner, date, proof requirement and escalation route for every item that remains open.</p><div class="callout navy"><h3>Next checkpoint</h3><p>Bring the annotated register, the completed proof items, the action-ageing view and the agreed effectiveness measures to the next management or board review.</p></div><div class="close-list">${list(['Named owners have accepted the actions.', 'Dates and dependencies are recorded.', 'Proof requirements are specific enough to use.', 'Residual risk or unresolved information is explicit.', 'The next checkpoint has a date and an audience.'])}</div><p class="muted">Facilitator note: preserve the distinction between the recorded assessment, supplied information, management review notes and reviewer judgement in every follow-up pack.</p>`)
  ];
  const css = `<style>.capture-grid>div,.capture-box{min-width:0;overflow:hidden}.lines{overflow-wrap:anywhere;word-break:break-word}</style><style>
    :root{${MK_CSS_VARIABLES}}@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;color:var(--mk-ink);font:10.5pt/1.42 Arial,Helvetica,sans-serif}.workshop-page{width:210mm;height:297mm;padding:19mm 17mm 17mm;position:relative;page-break-after:always;overflow:hidden}.workshop-page:last-child{page-break-after:auto}.workshop-cover{background:var(--mk-navy-700);color:var(--mk-white);display:flex;flex-direction:column;justify-content:center}.workshop-cover h1{font-size:35pt;line-height:1.03;max-width:155mm;margin:0 0 8mm}.workshop-cover p{font-size:16pt;color:var(--mk-rule);max-width:150mm}.cover-meta{border-left:5px solid var(--mk-brass);background:var(--mk-navy-500);padding:6mm;margin-top:24mm;display:grid;gap:2mm;max-width:145mm}.eyebrow{color:var(--mk-brass);text-transform:uppercase;letter-spacing:.12em;font-size:8pt;font-weight:700;margin-bottom:5mm}h2{color:var(--mk-navy-700);font-size:26pt;line-height:1.06;letter-spacing:-.03em;margin:0 0 7mm}h3{color:var(--mk-navy-700);font-size:13pt;margin:0 0 3mm}p{margin:0 0 4mm}.lede{font-size:14pt;line-height:1.3;color:var(--mk-navy-500);max-width:170mm}.two-col,.capture-grid,.evidence-grid,.sequence-grid{display:grid;grid-template-columns:1fr 1fr;gap:7mm}.callout{padding:6mm;background:var(--mk-neutral-bg);border-left:4px solid var(--mk-navy-700);margin:6mm 0}.callout.amber{background:var(--mk-major-bg);border-left-color:var(--mk-brass)}.callout p{font-size:11pt}.muted{color:var(--mk-muted)}ul{padding-left:5mm;margin:2mm 0}li{margin:1.8mm 0}table{border-collapse:collapse;width:100%;font-size:8.8pt;margin:6mm 0}th{background:var(--mk-navy-700);color:var(--mk-white);text-align:left;padding:2.5mm;text-transform:uppercase;letter-spacing:.05em;font-size:7pt}td{padding:2.6mm;border-bottom:1px solid var(--mk-rule);vertical-align:top}tr:nth-child(even) td{background:var(--mk-neutral-bg)}.evidence-grid article{border-top:4px solid var(--mk-confirmed);background:var(--mk-neutral-bg);padding:4mm}.evidence-grid article:nth-child(2n){border-top-color:var(--mk-brass)}.status{font-size:7pt;text-transform:uppercase;letter-spacing:.06em;color:var(--mk-muted);font-weight:700}.evidence-grid small,.finding-list small{color:var(--mk-muted)}.finding-list article{display:grid;grid-template-columns:12mm 1fr;gap:4mm;border-top:1px solid var(--mk-rule);padding:4mm 0}.number{font-size:19pt;color:var(--mk-brass);font-weight:700}.decision-stack article{border-top:1px solid var(--mk-rule);padding:4mm 0}.capture-line{margin-top:4mm;color:var(--mk-muted)}.sequence-grid>div{background:var(--mk-neutral-bg);border-top:4px solid var(--mk-navy-700);padding:5mm;min-height:68mm}.sequence-grid>div:nth-child(2){border-top-color:var(--mk-brass)}.sequence-grid>div:nth-child(3){border-top-color:var(--mk-confirmed)}.capture-box{border:1px solid var(--mk-rule);padding:6mm;min-height:65mm}.lines{margin-top:5mm;line-height:2;color:var(--mk-muted)}.close-list{border-top:1px solid var(--mk-rule);margin-top:7mm;padding-top:3mm}.workshop-footer{position:absolute;bottom:8mm;left:17mm;right:17mm;border-top:1px solid var(--mk-navy-rule);padding-top:2.5mm;color:var(--mk-muted);font-size:7.5pt}.workshop-cover .workshop-footer{color:var(--mk-rule);border-top-color:var(--mk-white-25)}
  .scenario-lens{font-size:7.5pt;line-height:1.16;margin:1mm 0}.scenario-lens th{width:30%;background:var(--mk-navy-700);color:var(--mk-white);padding:1mm;text-align:left}.scenario-lens td{padding:1mm;border-bottom:1px solid var(--mk-rule);vertical-align:top}.decision-stack article{padding:3mm 0}.decision-stack ul{margin:1mm 0}.decision-stack li{margin:1mm 0}
  </style>`;
  return `<!doctype html><html lang="en-ZA"><head><meta charset="utf-8"><title>Comprehensive management workshop</title>${css}</head><body>${pages.join('')}</body></html>`;
}
