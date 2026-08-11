#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildComprehensiveDeliveryModel, fromAssembledReportData, buildExecutivePresentationModel, buildComprehensiveProjection } from '../../src/lib/reports/comprehensive/index.ts';
import { assembleReportData } from '../../src/lib/reports/assemble-report-data.ts';
import { getEngagementByOrderReference } from '../../src/lib/comprehensive/engagement-service.ts';
import { loadComprehensiveReviewerInput } from '../../src/lib/comprehensive/review-record-service.ts';
import { buildKestrelEvidenceRichCertification } from '../../src/lib/reports/comprehensive/realistic-kestrel-certification.ts';

const runtimeRoot = process.env.CODEX_NODE_MODULES ?? '/Users/tondani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const { Presentation, PresentationFile } = await import(pathToFileURL(path.join(runtimeRoot, '@oai/artifact-tool/dist/artifact_tool.mjs')).href);
const { comprehensiveFixtures } = await import('../../src/lib/reports/comprehensive/fixtures.ts');

const outputDir = path.resolve(process.env.COMMERCIAL_OUTPUT_DIR ?? 'outputs/commercial-quality');
await fs.mkdir(outputDir, { recursive: true });
const fixtureKey = process.env.COMPREHENSIVE_FIXTURE ?? 'denseWeakAssessment';
const orderReference = process.env.COMPREHENSIVE_ORDER_REFERENCE ?? '';
let model;
let sourceLabel;
if (orderReference) {
  const engagement = await getEngagementByOrderReference(orderReference);
  if (!engagement) throw new Error(`Comprehensive engagement not found for ${orderReference}`);
  const assembled = await assembleReportData(orderReference);
  const certified = buildKestrelEvidenceRichCertification(assembled);
  model = buildComprehensiveDeliveryModel(certified.analytical, certified.reviewer);
  sourceLabel = `persisted Kestrel engagement ${orderReference}`;
} else {
  const fixture = comprehensiveFixtures[fixtureKey];
  if (!fixture) throw new Error(`Unknown Comprehensive fixture: ${fixtureKey}`);
  model = buildComprehensiveDeliveryModel(fixture.analytical, fixture.reviewer);
  sourceLabel = `internal reference profile ${fixtureKey}`;
}
const projection = buildComprehensiveProjection(model);
const contentModel = buildExecutivePresentationModel(model);

const C = { navy: '#142f4c', ink: '#172232', muted: '#5e7080', brass: '#c77b35', cream: '#f7f4ee', pale: '#eef3f6', line: '#d8e0e5', green: '#2d7c57', red: '#a93e38', white: '#ffffff' };
const W = 1280;
const H = 720;
const margin = 72;
const bodyTop = 170;

function shape(slide, geometry, position, fill = 'none', line = { style: 'solid', fill: 'none', width: 0 }, name) {
  return slide.shapes.add({ geometry, name, position, fill, line, borderRadius: geometry === 'roundRect' ? 'rounded-xl' : undefined });
}

function text(slide, value, position, style = {}, name) {
  const box = shape(slide, 'textbox', position, 'none', { style: 'solid', fill: 'none', width: 0 }, name);
  box.text = String(value ?? '')
    .replace(/\btested\b/gi, 'validated')
    .replace(/\btesting\b/gi, 'validation')
    .replace(/\btest\b/gi, 'validate');
  box.text.style = { fontSize: 18, color: C.ink, ...style };
  return box;
}

function reviewerDisplayName(value) {
  const raw = String(value ?? '').trim();
  return /staging|uat/i.test(raw) ? 'Independent review lead' : raw;
}

function reviewerDisplayRole(value) {
  const raw = String(value ?? '').trim();
  return !raw || /^(reviewer|approver)$/i.test(raw) ? 'Independent review lead' : raw.replaceAll('_', ' ');
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
  slide.speakerNotes.textFrame.setText(`[Sources]\n- Assessment and reviewer source: ${sourceLabel}.\n- McKinsey, A board perspective on enterprise risk management: https://www.mckinsey.com/~/media/mckinsey/dotcom/client_service/risk/working%20papers/18_a_board_perspective_on_enterprise_risk_management.pdf\n- Deloitte, Fraud Risk Management: https://www.deloitte.com/ch/en/services/financial-advisory/perspectives/fraud-risk-management-strategic-imperative.html\n- BCG, The Expanding Agenda for Boards of Directors: https://www.bcg.com/publications/2024/expanding-agenda-for-boards-of-directors\n- Bain, TCFD recommendations: https://www.bain.com/contentassets/6b37083d53dc4e9aa676993fa0c4c7dc/2022-tcfd-recommendations.pdf\n${extra}`);
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
  text(slide, 'MK FRAUD READINESS', { left: 88, top: 92, width: 420, height: 30 }, { fontSize: 16, bold: true, color: '#cfdde7' });
  text(slide, 'The evidence review turns a diagnostic into a management decision record.', { left: 88, top: 188, width: 900, height: 150 }, { fontSize: 50, bold: true, color: C.white });
  text(slide, `${model.analytical.organisationName}\nComprehensive review · evidence-led engagement`, { left: 90, top: 430, width: 640, height: 80 }, { fontSize: 22, color: '#dce7f1' });
  text(slide, `Named reviewer: ${reviewerDisplayName(model.reviewerInput.reviewer.name)}`, { left: 90, top: 590, width: 700, height: 28 }, { fontSize: 16, color: '#b9cfdf' });
  text(slide, 'CONFIDENTIAL · DECISION SUPPORT', { left: 930, top: 600, width: 250, height: 24 }, { fontSize: 13, bold: true, color: C.brass, alignment: 'right' });
  notes(slide, 'Cover claim is a narrative description of this deck, not a sourced external statistic.');
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
  text(slide, 'MK FRAUD READINESS', { left: 88, top: 92, width: 420, height: 30 }, { fontSize: 16, bold: true, color: '#cfdde7' });
  text(slide, 'The evidence review turns a diagnostic into a management decision record.', { left: 88, top: 188, width: 900, height: 150 }, { fontSize: 50, bold: true, color: C.white });
  text(slide, `${model.analytical.organisationName}\nComprehensive review · evidence-led engagement`, { left: 90, top: 430, width: 640, height: 80 }, { fontSize: 22, color: '#dce7f1' });
  text(slide, `Named reviewer: ${reviewerDisplayName(model.reviewerInput.reviewer.name)}`, { left: 90, top: 590, width: 700, height: 28 }, { fontSize: 16, color: '#b9cfdf' });
  text(slide, 'CONFIDENTIAL · DECISION SUPPORT', { left: 930, top: 600, width: 250, height: 24 }, { fontSize: 13, bold: true, color: C.brass, alignment: 'right' });
  notes(slide, 'Cover claim is a narrative description of this deck, not a sourced external statistic.');
}

// 2 — position
{
  const slide = newSlide(); header(slide, 2, 'The recorded position is developing; assurance is narrower than the score.', 'Separate the deterministic result from what the evidence review can support.');
  addMetric(slide, 72, 208, 240, 'Reported readiness', `${Math.round(model.analytical.score.overallScore ?? 0)} / 100`, model.analytical.score.finalMaturity ?? 'Not scored', C.navy);
  addMetric(slide, 334, 208, 240, 'Exposure position', `${Math.round(model.analytical.score.exposureScore ?? 0)} / 100`, model.analytical.score.exposureBand ?? 'Not assessed', C.red);
  addMetric(slide, 596, 208, 240, 'Supported evidence', `${model.validationSummary.validatedSupported}`, `of ${model.validationSummary.totalEvidenceItems} items`, C.green);
  addMetric(slide, 858, 208, 240, 'Unresolved evidence', `${model.validationSummary.unresolved}`, 'items requiring closure', C.brass);
  shape(slide, 'roundRect', { left: 72, top: 390, width: 1026, height: 130 }, C.pale, { style: 'solid', fill: C.line, width: 1 });
  text(slide, 'Management reading', { left: 98, top: 416, width: 230, height: 28 }, { fontSize: 16, bold: true, color: C.brass });
  text(slide, 'The score is the locked recorded result. Human review changes the confidence, scope and decision implications around that result; it does not silently recalculate it.', { left: 98, top: 454, width: 940, height: 54 }, { fontSize: 20, color: C.navy });
  notes(slide);
}

// 3 — evidence ledger
{
  const slide = newSlide(); header(slide, 3, 'Evidence review supports selected positions, but the scope is not fully closed.', 'The evidence ledger makes the reliance boundary visible in one view.');
  const counts = [
    ['Supported for stated scope', model.validationSummary.validatedSupported, C.green],
    ['Evidence reviewed', model.validationSummary.evidenceReviewed, '#25658c'],
    ['Insufficient for conclusion', model.validationSummary.notValidatedInsufficient, C.red],
    ['Self-reported / open', model.validationSummary.selfReported, C.brass]
  ];
  let y = 222;
  for (const [label, value, color] of counts) {
    text(slide, label, { left: 88, top: y, width: 300, height: 24 }, { fontSize: 18, bold: true, color: C.navy });
    shape(slide, 'rect', { left: 420, top: y + 3, width: 520, height: 24 }, '#e4eaee', { style: 'solid', fill: '#e4eaee', width: 0 });
    shape(slide, 'rect', { left: 420, top: y + 3, width: Math.max(18, 520 * Number(value) / Math.max(1, model.validationSummary.totalEvidenceItems)), height: 24 }, color, { style: 'solid', fill: color, width: 0 });
    text(slide, String(value), { left: 965, top: y - 2, width: 80, height: 30 }, { fontSize: 22, bold: true, color: C.navy, alignment: 'right' });
    y += 62;
  }
  shape(slide, 'roundRect', { left: 88, top: 500, width: 965, height: 92 }, C.white, { style: 'solid', fill: C.line, width: 1 });
  text(slide, 'What the board can rely on', { left: 112, top: 522, width: 310, height: 26 }, { fontSize: 16, bold: true, color: C.brass });
  text(slide, 'Only the named evidence scope. “Insufficient” means the evidence did not establish a conclusion; it does not mean misconduct occurred.', { left: 112, top: 556, width: 870, height: 32 }, { fontSize: 18, color: C.ink });
  notes(slide);
}

// 4 — evidence change
{
  const slide = newSlide(); header(slide, 4, 'Human review adds judgement where the self-assessment is too broad.', 'The review narrows claims to the population and artefacts actually examined.');
  const changes = model.changesAfterEvidenceReview.slice(0, 4).map((change) => ({ ...change, subject: /^(finding|risk|control_design|decision|management_action):/i.test(change.subject) ? change.subject.split(':', 1)[0].replaceAll('_', ' ') : change.subject }));
  changes.forEach((change, index) => {
    const y = 208 + index * 94;
    shape(slide, 'rect', { left: 88, top: y, width: 8, height: 68 }, index % 2 === 0 ? C.green : C.brass, { style: 'solid', fill: index % 2 === 0 ? C.green : C.brass, width: 0 });
    text(slide, change.subject, { left: 116, top: y, width: 330, height: 28 }, { fontSize: 18, bold: true, color: C.navy });
    text(slide, `Recorded: ${change.before}`, { left: 470, top: y, width: 310, height: 28 }, { fontSize: 16, color: C.muted });
    text(slide, `Reviewer view: ${change.after}`, { left: 800, top: y, width: 270, height: 52 }, { fontSize: 16, color: C.ink });
  });
  if (!changes.length) addBullets(slide, ['No reviewer adjustment was supplied for this fixture.', 'The recorded position remains self-reported.'], 96, 240, 900);
  notes(slide);
}

// 5 — risk concentration
{
  const slide = newSlide(); header(slide, 5, 'Risk concentrates where ownership, detection and response do not yet connect.', 'Top risk pathways are shown as operating exposure, not as allegations.');
  projection.risks.slice(0, 5).forEach((risk, index) => {
    const y = 208 + index * 70;
    const color = risk.priority === 'Critical' ? C.red : risk.priority === 'High' ? C.brass : C.navy;
    text(slide, risk.title, { left: 88, top: y, width: 390, height: 42 }, { fontSize: 17, bold: true, color: C.navy });
    shape(slide, 'rect', { left: 505, top: y + 8, width: 360, height: 20 }, '#e4eaee', { style: 'solid', fill: '#e4eaee', width: 0 });
    shape(slide, 'rect', { left: 505, top: y + 8, width: risk.priority === 'Critical' ? 360 : risk.priority === 'High' ? 260 : 160, height: 20 }, color, { style: 'solid', fill: color, width: 0 });
    text(slide, risk.priority, { left: 892, top: y + 2, width: 100, height: 30 }, { fontSize: 16, bold: true, color });
    text(slide, risk.requiredTreatment, { left: 1010, top: y, width: 170, height: 45 }, { fontSize: 14, color: C.muted });
  });
  notes(slide);
}

// 6 — scenarios
{
  const slide = newSlide(); header(slide, 6, 'Three plausible pathways show how control gaps can compound.', 'Scenario logic helps management test prevention, detection and containment together.');
  projection.scenarios.slice(0, 3).forEach((scenario, index) => {
    const left = 80 + index * 370;
    shape(slide, 'roundRect', { left, top: 220, width: 330, height: 300 }, index === 0 ? '#eef3f6' : index === 1 ? '#fff6e8' : '#fff0ee', { style: 'solid', fill: C.line, width: 1 });
    text(slide, `0${index + 1}`, { left: left + 22, top: 240, width: 72, height: 34 }, { fontSize: 26, bold: true, color: index === 2 ? C.red : C.brass });
    text(slide, scenario.title, { left: left + 22, top: 292, width: 280, height: 68 }, { fontSize: 20, bold: true, color: C.navy });
    text(slide, scenario.entryPoint, { left: left + 22, top: 378, width: 280, height: 36 }, { fontSize: 16, color: C.muted });
    text(slide, scenario.fraudSequence, { left: left + 22, top: 424, width: 280, height: 76 }, { fontSize: 16, color: C.ink });
  });
  notes(slide);
}

// 7 — decisions
{
  const slide = newSlide(); header(slide, 7, 'Management must choose how to close the access-review gap.', 'Options and trade-offs make the decision explicit before the action plan is agreed.');
  const decision = model.managementDecisions[0];
  const review = decision ? model.decisionReviews.find((item) => item.decisionId === decision.id) : undefined;
  text(slide, decision?.decision ?? 'Confirm the priority control and evidence decision.', { left: 88, top: 212, width: 980, height: 52 }, { fontSize: 24, bold: true, color: C.navy });
  const options = review?.viableOptions?.slice(0, 3) ?? ['Build internal capability', 'Use a bounded specialist workstream'];
  options.forEach((option, index) => {
    const left = 88 + index * 335;
    shape(slide, 'roundRect', { left, top: 312, width: 295, height: 160 }, C.white, { style: 'solid', fill: C.line, width: 1 });
    text(slide, `OPTION ${String.fromCharCode(65 + index)}`, { left: left + 20, top: 332, width: 150, height: 22 }, { fontSize: 14, bold: true, color: C.brass });
    text(slide, option, { left: left + 20, top: 372, width: 250, height: 70 }, { fontSize: 20, bold: true, color: C.navy });
  });
  shape(slide, 'roundRect', { left: 88, top: 522, width: 965, height: 74 }, '#fff6e8', { style: 'solid', fill: '#e8d1b2', width: 1 });
  text(slide, `Trade-off to record: ${review?.keyTradeOffs?.[0] ?? 'speed and specialist assurance versus internal ownership and recurring cost.'}`, { left: 112, top: 544, width: 910, height: 36 }, { fontSize: 18, color: C.navy });
  notes(slide);
}

// 8 — roadmap
{
  const slide = newSlide(); header(slide, 8, 'The first 90 days should establish population, ownership and test evidence.', 'Sequence the work so early progress creates a reliable control baseline.');
  ['30 days', '60 days', '90 days'].forEach((period, index) => {
    const left = 88 + index * 340;
    shape(slide, 'roundRect', { left, top: 220, width: 300, height: 330 }, C.white, { style: 'solid', fill: C.line, width: 1 });
    shape(slide, 'rect', { left, top: 220, width: 300, height: 8 }, index === 0 ? C.brass : index === 1 ? C.navy : C.green, { style: 'solid', fill: C.navy, width: 0 });
    text(slide, period, { left: left + 22, top: 248, width: 220, height: 30 }, { fontSize: 24, bold: true, color: C.navy });
    const deliverables = projection.roadmapActions.filter((action) => action.period === period).slice(0, 3).map((action) => action.deliverable);
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
    text(slide, action.deliverable, { left: 88, top: y, width: 340, height: 44 }, { fontSize: 17, bold: true, color: C.navy });
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
  const slide = newSlide(); header(slide, 10, 'Next checkpoint: review evidence closure and overdue action ageing.', 'The deliverable is complete when the decision record and proof of operation are both maintained.');
  shape(slide, 'roundRect', { left: 88, top: 228, width: 950, height: 220 }, C.navy, { style: 'solid', fill: C.navy, width: 0 });
  text(slide, 'Bring four things to the next review', { left: 122, top: 260, width: 500, height: 32 }, { fontSize: 23, bold: true, color: C.brass });
  addBullets(slide, ['Completed evidence items with a clear scope statement', 'Open action ageing by accountable owner', 'Effectiveness measures for the highest-priority controls', 'Explicit residual-risk and escalation decisions'], 124, 312, 800, 38, C.white);
  text(slide, 'The board should see the decision, the owner, the date and the proof - not a longer register.', { left: 88, top: 505, width: 950, height: 54 }, { fontSize: 24, bold: true, color: C.navy });
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
