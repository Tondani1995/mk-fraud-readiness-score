#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildComprehensiveDeliveryModel, fromAssembledReportData, buildExecutivePresentationModel, buildComprehensiveProjection } from '../../src/lib/reports/comprehensive/index.ts';
import { assembleReportData } from '../../src/lib/reports/assemble-report-data.ts';
import { MK_TOKENS } from '../../src/lib/reports/design/tokens.ts';

const runtimeRoot = process.env.CODEX_NODE_MODULES ?? '/Users/tondani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const { Presentation, PresentationFile } = await import(pathToFileURL(path.join(runtimeRoot, '@oai/artifact-tool/dist/artifact_tool.mjs')).href);
const { comprehensiveFixtures } = await import('../../src/lib/reports/comprehensive/fixtures.ts');

const outputDir = path.resolve(process.env.COMMERCIAL_OUTPUT_DIR ?? 'outputs/commercial-quality');
await fs.mkdir(outputDir, { recursive: true });
const orderReference = process.env.COMPREHENSIVE_ORDER_REFERENCE ?? '';
const fixtureKey = orderReference ? 'persistedKestrel' : (process.env.COMPREHENSIVE_FIXTURE ?? 'denseWeakAssessment');
let model;
let sourceLabel;
if (orderReference) {
  const assembled = await assembleReportData(orderReference);
  model = await fromAssembledReportData(assembled);
  sourceLabel = `persisted Kestrel assessment ${orderReference}`;
} else {
  const fixture = comprehensiveFixtures[fixtureKey];
  if (!fixture) throw new Error(`Unknown Comprehensive fixture: ${fixtureKey}`);
  model = buildComprehensiveDeliveryModel(fixture.analytical);
  sourceLabel = `internal reference profile ${fixtureKey}`;
}
const projection = buildComprehensiveProjection(model);
const contentModel = buildExecutivePresentationModel(model);

const C = { navy: MK_TOKENS.navy700, ink: MK_TOKENS.ink, muted: MK_TOKENS.muted, brass: MK_TOKENS.brass, brassSoft: MK_TOKENS.brassSoft, cream: MK_TOKENS.cream, pale: MK_TOKENS.neutralBg, line: MK_TOKENS.rule, green: MK_TOKENS.confirmed, red: MK_TOKENS.critical, white: MK_TOKENS.white, light: MK_TOKENS.rule, amberBg: MK_TOKENS.majorBg, redBg: MK_TOKENS.criticalBg, blue: MK_TOKENS.navy500 };
const W = 1280;
const H = 720;
const margin = 72;
const bodyTop = 170;

function shape(slide, geometry, position, fill = 'none', line = { style: 'solid', fill: 'none', width: 0 }, name) {
  return slide.shapes.add({ geometry, name, position, fill, line, borderRadius: geometry === 'roundRect' ? 'rounded-xl' : undefined });
}

function text(slide, value, position, style = {}, name) {
  const box = shape(slide, 'textbox', position, 'none', { style: 'solid', fill: 'none', width: 0 }, name);
  box.text = String(value ?? '');
  box.text.style = { fontSize: 18, color: C.ink, ...style };
  return box;
}

function publicText(value) {
  return String(value ?? '')
    .replace(/\bAn interaction covered by the recorded control condition:\s*/gi, 'The recorded control condition is engaged through ')
    .replace(/\bAn actor exploits the recorded control condition so that\b/gi, 'A threat actor can exploit the recorded control condition when')
    .replace(/\bvalidated\b/gi, 'checked')
    .replace(/\bnamed reviewers\b/gi, 'designated control owners')
    .replace(/\bD\d+[- ]Q\d+\b/g, 'the named question')
    .replace(/\b(?:MF|CI|RA|SC|OBS|EVID|DEC|ACT|RISK)-[A-Z0-9-]+\b/g, 'the named record');
}

function executiveActionText(action) {
  const raw = publicText(action?.deliverable ?? '');
  const withoutTrigger = raw.replace(/^Apply immediate escalation at\s+"[^"]+"\s+and deliver the exact control design:\s*/i, '');
  const words = withoutTrigger.split(/\s+/).filter(Boolean);
  const compact = words.length > 18 ? `${words.slice(0, 18).join(' ')}…` : withoutTrigger;
  return compact.endsWith('.') || compact.endsWith('…') ? compact : `${compact}.`;
}

function executiveReviewText(value, limit = 22) {
  const raw = publicText(value);
  const words = raw.split(/\s+/).filter(Boolean);
  const compact = words.length > limit ? `${words.slice(0, limit).join(' ')}…` : raw;
  return compact.endsWith('.') || compact.endsWith('…') ? compact : `${compact}.`;
}

function executiveRiskText(value) {
  const raw = publicText(value);
  const words = raw.split(/\s+/).filter(Boolean);
  return words.length > 9 ? `${words.slice(0, 9).join(' ')}…` : raw;
}

function line(slide, left, top, width, color = C.line, widthPx = 1) {
  shape(slide, 'line', { left, top, width, height: 0 }, 'none', { style: 'solid', fill: color, width: widthPx });
}

function footer(slide, number) {
  line(slide, margin, 664, W - margin * 2, C.line, 1);
  text(slide, 'MK Fraud Readiness · Comprehensive', { left: margin, top: 676, width: 420, height: 22 }, { fontSize: 13, color: C.muted });
  text(slide, `${String(number).padStart(2, '0')} / ${contentModel.slides.length}`, { left: 1135, top: 676, width: 72, height: 22 }, { fontSize: 13, color: C.muted, alignment: 'right' });
}

function header(slide, number, title, strapline) {
  text(slide, `COMPREHENSIVE REVIEW · ${String(number).padStart(2, '0')}`, { left: margin, top: 42, width: 360, height: 24 }, { fontSize: 14, bold: true, color: C.brass });
  text(slide, title, { left: margin, top: 76, width: 1080, height: 80 }, { fontSize: 39, bold: true, color: C.navy });
  if (strapline) text(slide, strapline, { left: margin, top: 164, width: 1050, height: 28 }, { fontSize: 18, color: C.muted });
  footer(slide, number);
}

function notes(slide, extra = '') {
  slide.speakerNotes.textFrame.setText(`[Sources]\n- Source: ${sourceLabel}.\n- McKinsey board risk perspective: https://www.mckinsey.com/~/media/mckinsey/dotcom/client_service/risk/working%20papers/18_a_board_perspective_on_enterprise_risk_management.pdf\n- Deloitte fraud risk management: https://www.deloitte.com/ch/en/services/financial-advisory/perspectives/fraud-risk-management-strategic-imperative.html\n- Preserve scope, position, information boundary, owner, date and proof in the annotated register.\n- Scenarios: actor, opportunity, entry point, mechanism, bypassed control, concealment, consequence, warning, containment, long-term response.\n- Controls: What (control objective), Who, Population, Frequency, Evidence retained, Independent check, Escalation, SLA, Effectiveness measure, Failure response.\n- Decisions: three options with cost, benefit, trade-off; recommendation, rationale, rejection reason, owner, deadline.\n- Traceability: annotated register preserves the source chain.\n${extra}`);
}

function addMetric(slide, left, top, width, label, value, note, accent = C.navy) {
  shape(slide, 'roundRect', { left, top, width, height: 128 }, C.white, { style: 'solid', fill: C.line, width: 1 });
  shape(slide, 'rect', { left, top, width, height: 6 }, accent, { style: 'solid', fill: accent, width: 0 });
  text(slide, label, { left: left + 18, top: top + 18, width: width - 36, height: 28 }, { fontSize: 15, bold: true, color: C.muted });
  text(slide, value, { left: left + 18, top: top + 47, width: width - 36, height: 42 }, { fontSize: 32, bold: true, color: C.navy });
  text(slide, note, { left: left + 18, top: top + 94, width: width - 36, height: 22 }, { fontSize: 14, color: C.muted });
}

function addBullets(slide, items, left, top, width, lineHeight = 42, color = C.ink, fontSize = 18) {
  items.forEach((item, index) => {
    shape(slide, 'ellipse', { left, top: top + index * lineHeight + 8, width: 10, height: 10 }, C.brass, { style: 'solid', fill: C.brass, width: 0 });
    text(slide, item, { left: left + 24, top: top + index * lineHeight, width, height: lineHeight - 4 }, { fontSize, color });
  });
}

const slides = [];

// 1 — minimal cover
{
  const slide = Presentation.create({ slideSize: { width: W, height: H } }).slides.add();
  slide.background.fill = C.navy;
  shape(slide, 'rect', { left: 0, top: 0, width: 22, height: H }, C.brass, { style: 'solid', fill: C.brass, width: 0 });
  text(slide, 'MK FRAUD READINESS', { left: 88, top: 92, width: 420, height: 30 }, { fontSize: 16, bold: true, color: C.light });
  text(slide, 'The target-state blueprint turns a diagnostic into a management decision record.', { left: 88, top: 188, width: 900, height: 150 }, { fontSize: 50, bold: true, color: C.white });
  text(slide, `${model.analytical.organisationName}\nComprehensive blueprint · strategic design engagement`, { left: 90, top: 430, width: 640, height: 80 }, { fontSize: 22, color: C.light });
  text(slide, "Based on management's recorded Fraud Readiness assessment responses", { left: 90, top: 590, width: 800, height: 28 }, { fontSize: 16, color: C.light });
  text(slide, 'CONFIDENTIAL · DECISION SUPPORT', { left: 930, top: 600, width: 250, height: 24 }, { fontSize: 13, bold: true, color: C.brass, alignment: 'right' });
  notes(slide);
  slides.push(slide);
}

// Re-home the first slide from the temporary presentation into the final deck by collecting later
// slides in a single presentation below. The temporary slide is kept only for its canvas config.
const presentation = Presentation.create({ slideSize: { width: W, height: H } });
slides.length = 0;

function newSlide() {
  const slide = presentation.slides.add();
  slide.background.fill = C.cream;
  slides.push(slide);
  return slide;
}

// Cover
{
  const slide = newSlide(); slide.background.fill = C.navy;
  shape(slide, 'rect', { left: 0, top: 0, width: 22, height: H }, C.brass, { style: 'solid', fill: C.brass, width: 0 });
  text(slide, 'MK FRAUD READINESS', { left: 88, top: 92, width: 420, height: 30 }, { fontSize: 16, bold: true, color: C.light });
  text(slide, 'The target-state blueprint turns a diagnostic into a management decision record.', { left: 88, top: 188, width: 900, height: 150 }, { fontSize: 50, bold: true, color: C.white });
  text(slide, `${model.analytical.organisationName}\nComprehensive blueprint · strategic design engagement`, { left: 90, top: 430, width: 640, height: 80 }, { fontSize: 22, color: C.light });
  text(slide, "Based on management's recorded Fraud Readiness assessment responses", { left: 90, top: 590, width: 800, height: 28 }, { fontSize: 16, color: C.light });
  text(slide, 'CONFIDENTIAL · DECISION SUPPORT', { left: 930, top: 600, width: 250, height: 24 }, { fontSize: 13, bold: true, color: C.brass, alignment: 'right' });
  notes(slide);
}

// 2 — position
{
  const slide = newSlide(); header(slide, 2, 'The recorded position is developing; reliance is narrower than the score.', 'Separate the deterministic result from the information boundary.');
  addMetric(slide, 72, 208, 240, 'Reported readiness', `${Math.round(model.analytical.score.overallScore ?? 0)} / 100`, model.analytical.score.finalMaturity ?? 'Not scored', C.navy);
  addMetric(slide, 334, 208, 240, 'Exposure position', `${Math.round(model.analytical.score.exposureScore ?? 0)} / 100`, model.analytical.score.exposureBand ?? 'Not assessed', C.red);
  addMetric(slide, 596, 208, 240, 'Material findings', `${model.findings.length}`, 'priority diagnosis', C.green);
  addMetric(slide, 858, 208, 240, 'Target controls', `${model.controlImprovements.length}`, 'blueprints to build', C.brass);
  shape(slide, 'roundRect', { left: 72, top: 390, width: 1026, height: 130 }, C.pale, { style: 'solid', fill: C.line, width: 1 });
  text(slide, 'Management reading', { left: 98, top: 416, width: 230, height: 28 }, { fontSize: 16, bold: true, color: C.brass });
  text(slide, "The score is the locked recorded result. The blueprint translates management's recorded responses into diagnosis, decisions and target-state control design.", { left: 98, top: 454, width: 940, height: 54 }, { fontSize: 20, color: C.navy });
  notes(slide);
}

// 3 — diagnosis and exposure
{
  const slide = newSlide(); header(slide, 3, 'Diagnosis shows where exposure concentrates.', 'Material findings, risks and control blueprints are the decision-useful analytical universe.');
  const counts = [
    ['Material findings', model.findings.length, C.green],
    ['Priority risks', model.riskRegister.length, C.blue],
    ['Scenarios', model.scenarios.length, C.red],
    ['Target controls', model.controlImprovements.length, C.brass]
  ];
  let y = 222;
  for (const [label, value, color] of counts) {
    text(slide, label, { left: 88, top: y, width: 300, height: 24 }, { fontSize: 18, bold: true, color: C.navy });
    shape(slide, 'rect', { left: 420, top: y + 3, width: 520, height: 24 }, C.line, { style: 'solid', fill: C.line, width: 0 });
    shape(slide, 'rect', { left: 420, top: y + 3, width: Math.max(18, 520 * Number(value) / Math.max(1, model.findings.length + model.riskRegister.length + model.scenarios.length + model.controlImprovements.length)), height: 24 }, color, { style: 'solid', fill: color, width: 0 });
    text(slide, String(value), { left: 965, top: y - 2, width: 80, height: 30 }, { fontSize: 22, bold: true, color: C.navy, alignment: 'right' });
    y += 62;
  }
  shape(slide, 'roundRect', { left: 88, top: 500, width: 965, height: 92 }, C.white, { style: 'solid', fill: C.line, width: 1 });
  text(slide, 'Blueprint reading rule', { left: 112, top: 522, width: 310, height: 26 }, { fontSize: 16, bold: true, color: C.brass });
  text(slide, 'The deterministic engine decides; bounded narrative explains. The target state is a management design, not a claim that operating effectiveness is already established.', { left: 112, top: 556, width: 870, height: 32 }, { fontSize: 18, color: C.ink });
  notes(slide);
}

// 4 — theme interaction
{
  const slide = newSlide(); header(slide, 4, 'The themes interact across the control environment.', 'Use interaction patterns to prioritise target-state design.');
  const changes = model.contradictions.slice(0, 4);
  changes.forEach((change, index) => {
    const y = 208 + index * 94;
    shape(slide, 'rect', { left: 88, top: y, width: 8, height: 68 }, index % 2 === 0 ? C.green : C.brass, { style: 'solid', fill: index % 2 === 0 ? C.green : C.brass, width: 0 });
    text(slide, change.title, { left: 116, top: y, width: 330, height: 28 }, { fontSize: 18, bold: true, color: C.navy });
    text(slide, `Why it matters: ${executiveReviewText(change.whyItMatters)}`, { left: 470, top: y, width: 310, height: 28 }, { fontSize: 16, color: C.muted });
    text(slide, `Leadership response: ${executiveReviewText(change.whatLeadershipShouldVerify)}`, { left: 800, top: y, width: 270, height: 52 }, { fontSize: 15, color: C.ink });
  });
  if (!changes.length) addBullets(slide, ['No cross-domain interaction is currently recorded.', 'Use the complete analytical register for the underlying question traces.'], 96, 240, 900);
  notes(slide);
}

// 5 — risk concentration
{
  const slide = newSlide(); header(slide, 5, 'Risk concentrates where ownership, detection and response do not yet connect.', 'Top risk pathways are shown as operating exposure, not as allegations.');
  projection.risks.slice(0, 5).forEach((risk, index) => {
    const y = 208 + index * 70;
    const color = risk.priority === 'Critical' ? C.red : risk.priority === 'High' ? C.brass : C.navy;
    text(slide, risk.title, { left: 88, top: y, width: 390, height: 42 }, { fontSize: 17, bold: true, color: C.navy });
    shape(slide, 'rect', { left: 505, top: y + 8, width: 360, height: 20 }, C.line, { style: 'solid', fill: C.line, width: 0 });
    shape(slide, 'rect', { left: 505, top: y + 8, width: risk.priority === 'Critical' ? 360 : risk.priority === 'High' ? 260 : 160, height: 20 }, color, { style: 'solid', fill: color, width: 0 });
    text(slide, risk.priority, { left: 892, top: y + 2, width: 100, height: 30 }, { fontSize: 16, bold: true, color });
    text(slide, executiveRiskText(`${risk.title}. ${risk.requiredTreatment}`), { left: 1010, top: y, width: 170, height: 45 }, { fontSize: 13, color: C.muted });
  });
  notes(slide);
}

// 6 — scenarios
{
  const slide = newSlide(); header(slide, 6, 'Three plausible pathways show how control gaps can compound.', 'Scenario logic helps management test prevention, detection and containment together.');
  projection.scenarios.slice(0, 3).forEach((scenario, index) => {
    const left = 80 + index * 370;
    shape(slide, 'roundRect', { left, top: 220, width: 330, height: 300 }, index === 0 ? C.pale : index === 1 ? C.amberBg : C.redBg, { style: 'solid', fill: C.line, width: 1 });
    text(slide, `0${index + 1}`, { left: left + 22, top: 240, width: 72, height: 34 }, { fontSize: 26, bold: true, color: index === 2 ? C.red : C.brass });
    text(slide, publicText(scenario.title), { left: left + 22, top: 292, width: 280, height: 68 }, { fontSize: 20, bold: true, color: C.navy });
    text(slide, publicText(scenario.entryPoint), { left: left + 22, top: 378, width: 280, height: 36 }, { fontSize: 16, color: C.muted });
    text(slide, publicText(scenario.fraudSequence), { left: left + 22, top: 424, width: 280, height: 76 }, { fontSize: 16, color: C.ink });
  });
  notes(slide);
}

// 7 — decisions
{
  const slide = newSlide(); header(slide, 7, 'Management must choose how to close the access-review gap.', 'Options and trade-offs make the decision explicit before the action plan is agreed.');
  const decision = model.leadershipDecisions[0];
  const decisionOptions = decision ? model.decisionOptionSets.find((item) => item.decisionId === decision.id) : undefined;
  text(slide, decision?.decisionRequired ?? 'Confirm the priority control and evidence decision.', { left: 88, top: 212, width: 980, height: 52 }, { fontSize: 24, bold: true, color: C.navy });
  const options = decisionOptions?.optionDetails?.slice(0, 3) ?? [];
  options.forEach((option, index) => {
    const left = 88 + index * 335;
    shape(slide, 'roundRect', { left, top: 312, width: 295, height: 160 }, C.white, { style: 'solid', fill: C.line, width: 1 });
    text(slide, `OPTION ${String.fromCharCode(65 + index)}`, { left: left + 20, top: 332, width: 150, height: 22 }, { fontSize: 14, bold: true, color: C.brass });
    text(slide, publicText(option.option), { left: left + 20, top: 372, width: 250, height: 44 }, { fontSize: 17, bold: true, color: C.navy });
    text(slide, `Cost: ${publicText(option.cost)}\nBenefit: ${publicText(option.benefit)}\nTrade-off: ${publicText(option.tradeOff)}\n${option.rejectionReason ? `Rejection reason: ${publicText(option.rejectionReason)}` : 'Recommended option'}`, { left: left + 20, top: 422, width: 250, height: 66 }, { fontSize: 12, color: C.muted });
  });
  shape(slide, 'roundRect', { left: 88, top: 522, width: 965, height: 74 }, C.amberBg, { style: 'solid', fill: C.brassSoft, width: 1 });
  text(slide, `Deterministic recommendation: ${executiveReviewText(decisionOptions?.deterministicRecommendation ?? decision?.recommendedDecision, 18)}`, { left: 112, top: 532, width: 910, height: 20 }, { fontSize: 13, color: C.navy });
  text(slide, `Recommendation rationale: ${executiveReviewText(decisionOptions?.recommendationRationale, 18)}`, { left: 112, top: 552, width: 910, height: 20 }, { fontSize: 13, color: C.navy });
  text(slide, `Owner: ${publicText(decisionOptions?.owner ?? decision?.accountableExecutive)} · Target period: ${publicText(decisionOptions?.targetPeriod ?? decision?.targetPeriod)}`, { left: 112, top: 572, width: 910, height: 18 }, { fontSize: 13, color: C.navy });
  notes(slide);
}

// 8 — roadmap
{
  const slide = newSlide(); header(slide, 8, 'The first 90 days should establish population, ownership and proof.', 'Sequence the work so early progress creates a reliable control baseline.');
  ['30 days', '60 days', '90 days'].forEach((period, index) => {
    const left = 88 + index * 340;
    shape(slide, 'roundRect', { left, top: 220, width: 300, height: 330 }, C.white, { style: 'solid', fill: C.line, width: 1 });
    shape(slide, 'rect', { left, top: 220, width: 300, height: 8 }, index === 0 ? C.brass : index === 1 ? C.navy : C.green, { style: 'solid', fill: C.navy, width: 0 });
    text(slide, period, { left: left + 22, top: 248, width: 220, height: 30 }, { fontSize: 24, bold: true, color: C.navy });
    const deliverables = projection.roadmapActions.filter((action) => action.period === period).slice(0, 3).map(executiveActionText);
    addBullets(slide, deliverables.length ? deliverables : ['No committed actions recorded for this period.'], left + 22, 300, 250, 68, C.ink, 15);
  });
  notes(slide);
}

// 9 — ownership
{
  const slide = newSlide(); header(slide, 9, 'Every action needs an owner, an effectiveness measure and a board checkpoint.', 'Accountability is the mechanism that turns advisory judgement into operating change.');
  const actions = projection.roadmapActions.slice(0, 5);
  actions.forEach((action, index) => {
    const y = 208 + index * 72;
    line(slide, 88, y + 54, 1000, C.line, 1);
    text(slide, executiveActionText(action), { left: 88, top: y, width: 340, height: 44 }, { fontSize: 15, bold: true, color: C.navy });
    text(slide, action.accountableExecutive, { left: 450, top: y, width: 190, height: 42 }, { fontSize: 16, color: C.ink });
    text(slide, action.period, { left: 665, top: y, width: 100, height: 42 }, { fontSize: 16, bold: true, color: C.brass });
    text(slide, action.successMeasure, { left: 790, top: y, width: 300, height: 42 }, { fontSize: 15, color: C.muted });
  });
  text(slide, 'Owner', { left: 450, top: 178, width: 190, height: 24 }, { fontSize: 14, bold: true, color: C.muted });
  text(slide, 'Timing', { left: 665, top: 178, width: 100, height: 24 }, { fontSize: 14, bold: true, color: C.muted });
  text(slide, 'Effectiveness measure', { left: 790, top: 178, width: 240, height: 24 }, { fontSize: 14, bold: true, color: C.muted });
  notes(slide);
}

// 10 — close
{
  const slide = newSlide(); header(slide, 10, 'Next checkpoint: review proof, measures and overdue action ageing.', 'The blueprint is useful when the decision record and operating measures are maintained.');
  shape(slide, 'roundRect', { left: 88, top: 228, width: 950, height: 220 }, C.navy, { style: 'solid', fill: C.navy, width: 0 });
  text(slide, 'Bring four things to the next review', { left: 122, top: 260, width: 500, height: 32 }, { fontSize: 23, bold: true, color: C.brass });
  addBullets(slide, ['Proof requirements and retained control records', 'Open action ageing by accountable owner', 'Effectiveness measures for the highest-priority controls', 'Explicit residual-risk and escalation decisions'], 124, 312, 800, 38, C.white);
  text(slide, 'The board should see the decision, the owner, the target period, the measure and the response - not a longer register.', { left: 88, top: 505, width: 950, height: 54 }, { fontSize: 24, bold: true, color: C.navy });
  notes(slide);
}

const previewDir = path.join(outputDir, 'presentation-render');
await fs.mkdir(previewDir, { recursive: true });
for (const [index, slide] of presentation.slides.items.entries()) {
  const png = await presentation.export({ slide, format: 'png', scale: 1 });
  await fs.writeFile(path.join(previewDir, `slide-${String(index + 1).padStart(2, '0')}.png`), new Uint8Array(await png.arrayBuffer()));
  const layout = await slide.export({ format: 'layout' });
  await fs.writeFile(path.join(previewDir, `slide-${String(index + 1).padStart(2, '0')}.layout.json`), await layout.text());
}
const montage = await presentation.export({ format: 'webp', montage: true, scale: 1 });
await fs.writeFile(path.join(previewDir, 'montage.webp'), new Uint8Array(await montage.arrayBuffer()));
const inspect = await presentation.inspect({ kind: 'slide,textbox,shape,notes', maxChars: 10000 });
await fs.writeFile(path.join(previewDir, 'inspect.ndjson'), inspect.ndjson);
const pptx = await PresentationFile.exportPptx(presentation);
const finalPath = path.join(outputDir, process.env.COMMERCIAL_PRESENTATION_FILENAME ?? `${model.analytical.organisationName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()}-executive-presentation.pptx`);
await pptx.save(finalPath);
console.log(JSON.stringify({ output: finalPath, fixtureKey, slides: presentation.slides.items.length, previewDir }, null, 2));
