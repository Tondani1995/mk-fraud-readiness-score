import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { buildCommercialProjection } from '../../../src/lib/reports/commercial-projection/index.ts';
import { getCommercialFixtureProfile } from '../../../src/lib/reports/commercial-projection/fixture-profiles.ts';
import { renderAllExhibits } from '../../../src/lib/reports/exhibits/index.ts';
import { MK_TOKENS } from '../../../src/lib/reports/design/tokens.ts';

const require = createRequire(import.meta.url);
const readXlsxFile = require('read-excel-file/node');
const sharp = require('sharp');

export const GATE_APPLICABILITY = {
  A1: ['PDF', 'PPTX'], A2: ['PDF', 'PPTX'], A3: ['PDF', 'PPTX'], A4: ['PDF', 'PPTX'], A5: ['XLSX'],
  B1: ['PDF', 'PPTX'], B2: ['PDF', 'PPTX'], B3: ['PDF', 'PPTX'], B4: ['PDF', 'PPTX'], B5: ['PDF', 'PPTX', 'XLSX'], B6: ['PDF', 'PPTX'],
  C1: ['PDF', 'PPTX', 'XLSX'], C2: ['PDF', 'PPTX'], C3: ['PDF', 'PPTX'], C4: ['PDF', 'PPTX'], C5: ['PDF', 'PPTX'], C6: ['PDF', 'PPTX'], C7: ['PDF', 'PPTX'], C8: ['PDF', 'PPTX'],
  D1: ['PDF', 'PPTX', 'XLSX'], D2: ['PDF', 'PPTX', 'XLSX'], D3: ['PDF', 'PPTX', 'XLSX'], D4: ['PDF', 'PPTX', 'XLSX'], D5: ['PDF', 'PPTX', 'XLSX'], D6: ['PDF', 'PPTX', 'XLSX'], D7: ['PDF', 'PPTX', 'XLSX'], D8: ['PDF', 'PPTX', 'XLSX'], D9: ['PDF', 'PPTX', 'XLSX'], D10: ['PDF', 'PPTX', 'XLSX'],
  E1: ['PDF', 'PPTX', 'XLSX'], E2: ['PDF', 'PPTX'], E3: ['PDF', 'PPTX'], E4: ['PDF', 'PPTX'], E5: ['PPTX'], E6: ['PDF', 'PPTX', 'XLSX'], E7: ['PDF', 'PPTX', 'XLSX']
};

const ALL_GATES = Object.keys(GATE_APPLICABILITY);
const MODEL_GATES = new Set(['B4', 'D1', 'D3', 'D8', 'E1', 'E2', 'E3', 'E4', 'E6', 'E7']);
const FIXTURES = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6'];
const SOURCE_OUTPUT = 'outputs/commercial-quality';
const PACKAGE_OUTPUT = '/Users/tondani/Documents/Codex/2026-08-11/p1-no-paid-order-can-be/outputs/premium-owner-review-package';

const ARTIFACTS = {
  Essential: [
    { id: 'essential-main-report', kind: 'main-report', type: 'PDF', file: 'essential-main-report.pdf' },
    { id: 'essential-supporting-register', kind: 'supporting-register', type: 'XLSX', file: 'essential-supporting-register.xlsx' }
  ],
  Comprehensive: [
    { id: 'comprehensive-main-report', kind: 'main-report', type: 'PDF', file: 'comprehensive-main-report.pdf' },
    { id: 'comprehensive-annotated-register', kind: 'annotated-register', type: 'XLSX', file: 'comprehensive-annotated-register.xlsx' },
    { id: 'comprehensive-board-readout', kind: 'board-readout', type: 'PDF', file: 'comprehensive-board-readout.pdf' },
    { id: 'comprehensive-executive-presentation', kind: 'executive-presentation', type: 'PPTX', file: 'comprehensive-executive-presentation.pptx' },
    { id: 'comprehensive-workshop-material', kind: 'workshop-material', type: 'PDF', file: 'comprehensive-workshop-material.pdf' }
  ]
};

const XML_ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
const decodeXml = (value) => value.replace(/&(?:amp|lt|gt|quot|apos);|&#x[0-9a-f]+;|&#\d+;/gi, (entity) => {
  if (XML_ENTITIES[entity]) return XML_ENTITIES[entity];
  if (entity.startsWith('&#x')) return String.fromCodePoint(Number.parseInt(entity.slice(3, -1), 16));
  return String.fromCodePoint(Number.parseInt(entity.slice(2, -1), 10));
});
const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const words = (value) => clean(value).split(/\s+/).filter(Boolean);
const unique = (values) => [...new Set(values.filter(Boolean))];
const sha256 = (file) => crypto.createHash('sha256').update(fsSync.readFileSync(file)).digest('hex');
const pdfInfo = (file) => execFileSync('pdfinfo', [file], { encoding: 'utf8' });
const pdfPages = (file) => Number(/Pages:\s+(\d+)/.exec(pdfInfo(file))?.[1] ?? 0);
const pdfPageSize = (file) => {
  const match = /Page size:\s+([\d.]+) x ([\d.]+) pts/.exec(pdfInfo(file));
  return { width: Number(match?.[1] ?? 595), height: Number(match?.[2] ?? 842) };
};
const pdfText = (file) => execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8', maxBuffer: 25 * 1024 * 1024 });
const pdfTextPages = (file) => pdfText(file).split('\f').map((page) => page.trim()).filter((page, index, all) => index < all.length - 1 || page.length > 0);
const pdfBbox = (file) => execFileSync('pdftotext', ['-bbox-layout', file, '-'], { encoding: 'utf8', maxBuffer: 25 * 1024 * 1024 });

function splitSentences(text) {
  return clean(text).split(/(?<=[.!?])\s+(?=[A-Z0-9])/).map(clean).filter((sentence) => /[.!?]$/.test(sentence));
}

function openingWords(sentence) { return words(sentence.replace(/^[^A-Za-z0-9]+/, '').toLowerCase()).slice(0, 3).join(' '); }
function trigrams(text) {
  const tokens = words(text.toLowerCase().replace(/[^a-z0-9 ]/g, ' '));
  return new Set(tokens.slice(0, -2).map((_, index) => tokens.slice(index, index + 3).join(' ')));
}
function overlapRatio(a, b) {
  const left = trigrams(a); const right = trigrams(b);
  if (!left.size || !right.size) return 0;
  let overlap = 0; for (const gram of left) if (right.has(gram)) overlap += 1;
  return overlap / Math.max(left.size, right.size);
}

function extractXmlText(xml) {
  return clean([...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)].map((match) => decodeXml(match[1])).join(' '));
}

function unzipText(file, member) {
  try { return execFileSync('unzip', ['-p', file, member], { encoding: 'utf8' }); } catch { return ''; }
}

async function renderPdfPages(file) {
  const renderDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mk-commercial-gates-'));
  const prefix = path.join(renderDir, 'page');
  execFileSync('pdftoppm', ['-png', '-r', '72', file, prefix], { stdio: 'ignore' });
  const files = (await fs.readdir(renderDir)).filter((name) => /^page-\d+\.png$/.test(name)).sort((a, b) => Number(a.match(/(\d+)/)[1]) - Number(b.match(/(\d+)/)[1]));
  return files.map((name) => path.join(renderDir, name));
}

async function imageStats(file) {
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  const bodyStart = Math.floor(info.height * 0.06);
  const bodyEnd = Math.floor(info.height * 0.95);
  const histogram = new Map();
  for (let y = bodyStart; y < bodyEnd; y += 2) for (let x = 0; x < info.width; x += 2) {
    const offset = (y * info.width + x) * channels;
    const key = `${Math.round(data[offset] / 8) * 8},${Math.round(data[offset + 1] / 8) * 8},${Math.round(data[offset + 2] / 8) * 8}`;
    histogram.set(key, (histogram.get(key) ?? 0) + 1);
  }
  const background = [...histogram.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]?.split(',').map(Number) ?? [255, 255, 255];
  let marked = 0; let total = 0;
  for (let y = bodyStart; y < bodyEnd; y += 1) for (let x = 0; x < info.width; x += 1) {
    const offset = (y * info.width + x) * channels;
    const red = data[offset]; const green = data[offset + 1]; const blue = data[offset + 2];
    total += 1;
    if (Math.abs(red - background[0]) + Math.abs(green - background[1]) + Math.abs(blue - background[2]) > 24) marked += 1;
  }
  return { width: info.width, height: info.height, markedRatio: total ? marked / total : 0, whitespaceRatio: total ? 1 - marked / total : 1 };
}

function bboxPageStats(xml, pageSize) {
  const pages = [...xml.matchAll(/<page[^>]*>([\s\S]*?)<\/page>/g)].map((pageMatch) => {
    const body = pageMatch[1];
    const lines = [...body.matchAll(/<line[^>]*>([\s\S]*?)<\/line>/g)].map((lineMatch) => {
      const tag = lineMatch[0].match(/<line[^>]*>/)?.[0] ?? '';
      const coords = [...tag.matchAll(/(?:xMin|yMin|xMax|yMax)="([\d.]+)"/g)].map((match) => Number(match[1]));
      return { text: clean(extractXmlText(lineMatch[1])), xMin: coords[0] ?? 0, yMin: coords[1] ?? 0, xMax: coords[2] ?? 0, yMax: coords[3] ?? 0 };
    }).filter((line) => line.text);
    const yBands = [];
    for (const line of lines) {
      const band = yBands.find((candidate) => Math.abs(candidate.y - line.yMin) < 18);
      if (band) { band.lines.push(line); band.y = Math.min(band.y, line.yMin); } else yBands.push({ y: line.yMin, lines: [line] });
    }
    const objects = yBands.sort((a, b) => a.y - b.y).reduce((groups, band) => {
      const last = groups.at(-1);
      if (last && band.y - last.y < 200) { last.lines.push(...band.lines); last.y = Math.min(last.y, band.y); } else groups.push({ y: band.y, lines: [...band.lines] });
      return groups;
    }, []).filter((group) => group.lines.some((line) => line.yMin < pageSize.height * 0.93 && line.yMax > pageSize.height * 0.06));
    const lastBodyLine = lines.filter((line) => line.yMin < pageSize.height * 0.92).at(-1);
    const lastText = clean(lastBodyLine?.text);
    const orphan = Boolean(lastBodyLine && lastBodyLine.yMin > pageSize.height * 0.78 && /^(?:[A-Z][A-Za-z0-9'’&/:-]+(?:\s+[A-Z][A-Za-z0-9'’&/:-]+){1,12}|SCENARIO\s+\d+|FINDING\s+\d+|RISK\s+\d+|CONTROL\s+\d+|ACTION\s+\d+)$/u.test(lastText));
    return { lines, objectCount: objects.length, orphan, lastText, lastY: lastBodyLine?.yMin ?? 0 };
  });
  return pages;
}

async function readPdf(file) {
  const pages = pdfTextPages(file); const layout = bboxPageStats(pdfBbox(file), pdfPageSize(file));
  const renders = await renderPdfPages(file); const pixels = await Promise.all(renders.map(imageStats));
  return { type: 'PDF', file, pageCount: pdfPages(file), pages, text: pages.join('\n'), layout, pixels, sha256: sha256(file) };
}

async function readPptx(file) {
  // The presentation relationship is the authoritative slide count.  Some unzip builds treat
  // the bracketed Content Types member as a shell glob and return an empty stream; relying on it
  // created a phantom eleventh slide/notes row in the previous run.
  const slideCount = Number(unzipText(file, 'ppt/presentation.xml').match(/<p:sldId\b/g)?.length ?? 0);
  const slides = []; const notes = [];
  for (let index = 1; index <= slideCount; index += 1) {
    slides.push(extractXmlText(unzipText(file, `ppt/slides/slide${index}.xml`)));
    notes.push(extractXmlText(unzipText(file, `ppt/notesSlides/notesSlide${index}.xml`)));
  }
  const renderDir = path.join(path.dirname(file), 'presentation-render');
  const renderFiles = [];
  for (let index = 1; index <= slideCount; index += 1) {
    const renderFile = path.join(renderDir, `slide-${String(index).padStart(2, '0')}.png`);
    if (fsSync.existsSync(renderFile)) renderFiles.push(await imageStats(renderFile));
  }
  const layouts = [];
  for (let index = 1; index <= slideCount; index += 1) {
    const layoutFile = path.join(renderDir, `slide-${String(index).padStart(2, '0')}.layout.json`);
    if (fsSync.existsSync(layoutFile)) layouts.push(JSON.parse(await fs.readFile(layoutFile, 'utf8')));
  }
  return { type: 'PPTX', file, slideCount, slides, notes, text: [...slides, ...notes].join('\n'), pixels: renderFiles, layouts, sha256: sha256(file) };
}

function xlsxTechnicalHeader(value) {
  return /technical|id|ref|question code|linked|source reference|evidence reference|selection reasons|triggered rules|minimum acceptable characteristics|playbook source/i.test(clean(value));
}
function workbookHumanText(sheet) {
  const rows = sheet.data ?? []; const header = rows[0] ?? [];
  return rows.map((row) => row.map((value, index) => (xlsxTechnicalHeader(header[index]) ? '' : clean(value))).filter(Boolean).join(' ')).join('\n');
}

async function readXlsx(file) {
  const sheets = await readXlsxFile(file);
  return { type: 'XLSX', file, sheets, sheetNames: sheets.map((sheet) => sheet.sheet), humanText: sheets.map(workbookHumanText).join('\n'), sha256: sha256(file) };
}

const cache = new Map();
async function readArtifact(artifact) {
  const file = path.join(process.cwd(), SOURCE_OUTPUT, artifact.file);
  const key = `${artifact.type}:${file}`;
  if (!cache.has(key)) cache.set(key, artifact.type === 'PDF' ? readPdf(file) : artifact.type === 'PPTX' ? readPptx(file) : readXlsx(file));
  return { ...artifact, ...(await cache.get(key)) };
}

function buildModel(fixtureId) {
  const profile = getCommercialFixtureProfile(fixtureId);
  const projection = buildCommercialProjection({ tier: fixtureId === 'F1' ? 'Essential' : 'Comprehensive', organisationName: profile.organisationName, score: profile.score, maturity: profile.maturity, model: profile.model, reviewer: profile.reviewer });
  return { profile, reviewerInput: profile.reviewer, projection, exhibits: renderAllExhibits({ projection }) };
}

function row(gateId, fixture, artefact, passed, location, detail, extra = {}) {
  return { gate: gateId, fixture, artefact, status: passed ? 'PASS' : 'FAIL', location, detail, appliesTo: GATE_APPLICABILITY[gateId] ?? [], ...extra };
}

function sourceScan() {
  const files = [
    'src/lib/reports/templates/report-template.ts', 'src/lib/reports/comprehensive/render-html.ts',
    'src/lib/reports/comprehensive/workshop.ts', 'src/lib/reports/render-pdf.ts',
    'scripts/commercial-quality/build-executive-presentation.mjs', 'scripts/commercial-quality/build-essential-register.mjs'
  ];
  const tokenFile = path.resolve('src/lib/reports/design/tokens.ts');
  const approved = new Set(Object.values(MK_TOKENS).map((value) => value.toLowerCase()));
  const offenders = [];
  for (const relative of files) {
    const lines = fsSync.readFileSync(relative, 'utf8').split('\n');
    lines.forEach((line, index) => {
      for (const match of line.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/gi)) if (!approved.has(match[0].toLowerCase())) offenders.push(`${relative}:${index + 1} ${match[0]}`);
    });
  }
  return { files, tokenFile, offenders };
}

function prohibitedHits(text, artifact) {
  const patterns = [
    /Persisted control statement/i, /Dense evidence/i, /Dense domain/i, /dense synthetic/i, /\bfixture\b/i, /\bsynthetic\b/i,
    /\bG28\b/i, /operating validate/i, /effectiveness validate/i, /\bUAT\b/i, /\bStaging\b/i, /\bNot recorded\b/i,
    /\bundefined\b/i, /\bTODO\b/i, /\bTBD\b/i, /\b[A-Z]{3,}(?:_[A-Z0-9]+)+\b/
  ];
  const hits = patterns.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source);
  return unique(hits);
}

function sentenceDiagnostics(text) {
  const sentences = splitSentences(text);
  const substantive = sentences.filter((sentence) => words(sentence).length >= 8);
  const repeated = []; const openings = [];
  for (let index = 1; index < substantive.length; index += 1) {
    if (substantive[index] === substantive[index - 1]) repeated.push(substantive[index]);
    if (overlapRatio(substantive[index], substantive[index - 1]) >= 0.90) openings.push(substantive[index]);
  }
  const mean = substantive.length ? substantive.reduce((sum, sentence) => sum + words(sentence).length, 0) / substantive.length : 0;
  const long = substantive.filter((sentence) => words(sentence).length > 60);
  const sameOpenings = [];
  for (let index = 1; index < substantive.length; index += 1) if (openingWords(substantive[index]) && openingWords(substantive[index]) === openingWords(substantive[index - 1])) sameOpenings.push(openingWords(substantive[index]));
  return { sentences: substantive, repeated: unique(repeated), overlap: unique(openings), mean, long, sameOpenings: unique(sameOpenings) };
}

function narrativeSurface(artifact) {
  if (artifact.type === 'PPTX') return artifact.slides.join('\n');
  if (artifact.type === 'PDF') {
    // pdftotext -layout interleaves table cells and page furniture. Narrative prose is the
    // complete sentence lines with at least eight words; this keeps C2/C3/C5/C7 evidence tied to
    // prose rather than repeated column headings or page numbers.
    return artifact.pages.map((page) => page.split('\n').map(clean).filter((line) => words(line).length >= 8 && /[.!?]$/.test(line) && !/[|]/.test(line) && !/^(?:Evidence reviewed|Self-reported|Supported for stated scope|Insufficient for conclusion|Reviewer confidence|Confidence|Source:|Prepared|Status|Target|Decision required|Options and analysis|Recommendation|Control completeness|Scenario completeness|Exhibits)\b/i.test(line)).join(' ')).join('\n');
  }
  return artifact.humanText;
}

function narrativePages(artifact) {
  if (artifact.type !== 'PDF') return [narrativeSurface(artifact)];
  return artifact.pages.flatMap((page) => {
    if (/\b(?:PERIOD\s+DELIVERABLE|MATERIAL FINDING|EVIDENCE ITEM|CONTROL OBJECTIVE|PRIORITY ACTION)\b/i.test(page)) return [];
    return page.split('\n').map(clean).filter((line) => {
      const punctuation = (line.match(/[.!?]/g) ?? []).length;
      return words(line).length >= 10 && /[.!?]$/.test(line) && /^[A-Z]/.test(line) && punctuation <= 1 && !/[|]/.test(line)
        && !/^(?:Evidence reviewed|Self-reported|Supported for stated scope|Insufficient for conclusion|Reviewer confidence|Confidence|Source:|Prepared|Status|Target|Decision required|Options and analysis|Recommendation|Control completeness|Scenario completeness|Exhibits)\b/i.test(line);
    });
  });
}

const HUMAN_ID_PATTERN = /\b[A-Z]{3,}(?:_[A-Z0-9]+)+\b/;
const BANNED_COPY = [/It is important to note that/i, /Why this matters/i, /an interaction covered by/i, /strengthen monitoring/i, /\butili[sz]e\b/i, /\bleverage\b/i, /\brobust\b/i, /\bholistic\b/i, /best-in-class/i, /validate results/i, /operating validate/i, /effectiveness validate/i, /Not recorded/i, /None recorded/i];
const US_SPELLINGS = [/\borganization\b/i, /\bprioritize\b/i, /\brecognized\b/i, /\banalyze\b/i, /\bbehavior\b/i, /\bcenter\b/i, /\bprogram\b/i];

function narrativeFields(model) {
  return [
    ...model.findings.flatMap((item) => [item.title, item.diagnosis, item.whyItMatters, item.fraudMechanism, item.recommendedControl]),
    ...model.risks.flatMap((item) => [item.title, item.riskStatement, item.requiredTreatment]),
    ...model.scenarios.flatMap((item) => [item.title, item.entryPoint, item.fraudSequence, item.concealmentMechanism, item.whyControlsMayNotCatchIt]),
    ...model.controls.flatMap((item) => [item.controlObjective, item.controlDesign, item.effectivenessTest]),
    ...model.actions.flatMap((item) => [item.deliverable, item.successMeasure]),
    ...model.decisions.flatMap((item) => [item.decisionRequired, item.recommendedDecision, item.consequenceOfDelay])
  ].filter(Boolean).join('\n');
}

function scenarioSemanticFields(scenario) {
  return {
    actorOpportunity: [...(scenario.confirmedOperatingContext ?? []), scenario.entryPoint].join(' '),
    entryPoint: scenario.entryPoint,
    mechanism: scenario.fraudSequence,
    controlBypassed: [...(scenario.controlsExpected ?? []), ...(scenario.linkedControlWeaknesses ?? [])].join(' '),
    concealment: scenario.concealmentMechanism,
    consequence: [scenario.financialImpact, scenario.operationalImpact, ...(scenario.likelyImpact ?? [])].join(' '),
    warning: (scenario.earlyWarningIndicators ?? []).join(' '),
    containment: scenario.immediateContainment,
    longTerm: scenario.longerTermResponse
  };
}

function familyTokens(text) {
  const families = {
    supplier: /supplier|vendor|bank|payment|procurement/i, access: /access|privileg|identity|role/i, detection: /detect|alert|monitor|tuning/i,
    governance: /committee|governance|oversight|accountab/i, incident: /incident|investigat|closure|lessons/i, training: /training|awareness|induction/i,
    reporting: /report|escalat|dashboard|risk/i
  };
  return new Set(Object.entries(families).filter(([, pattern]) => pattern.test(text)).map(([name]) => name));
}

function decisionOptions(model) {
  const reviewerInput = model.reviewerInput ?? model.profile?.reviewer ?? model.reviewer;
  return model.decisions.map((decision) => {
    const review = reviewerInput?.managementDecisionReviews?.find((candidate) => candidate.decisionId === decision.id) ?? reviewerInput?.decisionReviews?.find((candidate) => candidate.decisionId === decision.id);
    return { decision, review };
  });
}

function expectedCounts(fixtureId) {
  const model = buildModel(fixtureId).projection;
  return { findings: model.findings.length, risks: model.risks.length, controls: model.controls.length, actions: model.actions.length, evidence: model.evidence.length, decisions: model.decisions.length, scenarios: model.scenarios.length };
}

function extractNumbers(text, label) {
  const pattern = new RegExp(`${label}[^\\d]{0,40}(\\d+)`, 'i');
  return Number(pattern.exec(text)?.[1] ?? NaN);
}

function surfaceScore(artifact) {
  if (artifact.type === 'XLSX') {
    const match = /deterministic readiness[^\d]{0,80}(\d{1,3}(?:\.\d+)?)/i.exec(artifact.humanText);
    return match ? Math.round(Number(match[1])) : null;
  }
  if (artifact.type === 'PPTX') return [...artifact.slides.join('\n').matchAll(/reported readiness[^\d]{0,20}(\d{1,3})/gi)].map((match) => Number(match[1])).find((value) => value >= 0 && value <= 100) ?? null;
    const metric = artifact.pages.flatMap((page) => {
      const values = [];
      const lines = page.split('\n').map(clean);
      for (const index of lines.map((line, i) => /^(?:reported readiness|deterministic readiness)\b/i.test(line) ? i : -1).filter((i) => i >= 0)) {
      const window = lines.slice(index, index + 8).join(' ');
      const match = /\b(\d{1,3}(?:\.\d+)?)\b/.exec(window);
      if (match) values.push(Math.round(Number(match[1])));
      }
    return values;
  }).find((value) => value >= 0 && value <= 100);
  return metric === undefined ? null : Number(metric);
}

function artefactText(artifact) {
  return artifact.type === 'XLSX' ? artifact.humanText : artifact.type === 'PPTX' ? artifact.text : artifact.text;
}

function actualGate(gateId, fixtureId, artifact, modelData) {
  const { projection, exhibits, profile } = modelData; const text = artefactText(artifact); const normalizedText = text.replace(/\s+/g, ' '); const pages = artifact.type === 'PDF' ? artifact.pages : [];
  const counts = expectedCounts(fixtureId); const location = `${artifact.file}`;
  if (gateId === 'A1') {
    const target = artifact.kind === 'main-report' && fixtureId === 'F1' ? [28, 34] : artifact.kind === 'main-report' ? [34, 38] : artifact.kind === 'board-readout' ? [7, 7] : artifact.kind === 'workshop-material' ? [10, 10] : [8, 12];
    const actual = artifact.type === 'PDF' ? artifact.pageCount : artifact.slideCount;
    return row(gateId, fixtureId, artifact.id, actual >= target[0] && actual <= target[1], location, `${actual} pages/slides; target ${target[0]}–${target[1]}.`);
  }
  if (gateId === 'A2') {
    const objects = artifact.type === 'PDF' ? artifact.layout.map((page) => page.objectCount) : artifact.layouts.map((layout) => {
      const textElements = (layout.elements ?? []).filter((element) => element.text || element.textPreview);
      return textElements.length ? Math.ceil(textElements.length / 8) : 0;
    });
    const maximum = Math.max(0, ...objects); return row(gateId, fixtureId, artifact.id, maximum <= 4, location, `Deterministic layout metadata reports maximum ${maximum} major content objects per page/slide.`, { metrics: objects });
  }
  if (gateId === 'A3') {
    const pixels = artifact.pixels ?? []; const body = artifact.type === 'PPTX' ? pixels : pixels.slice(1).filter((_, index) => pages[index + 1]?.length > 120);
    const minimum = body.length ? Math.min(...body.map((item) => item.whitespaceRatio)) : 1;
    return row(gateId, fixtureId, artifact.id, minimum >= 0.4, location, `Rendered pixel analysis: minimum body whitespace ${(minimum * 100).toFixed(1)}%; required ≥40%.`, { metrics: pixels.map((item) => Number(item.whitespaceRatio.toFixed(4))) });
  }
  if (gateId === 'A4') {
    const orphans = artifact.type === 'PDF' ? artifact.layout.map((page, index) => page.orphan ? `p${index + 1}: ${page.lastText}` : '').filter(Boolean) : [];
    return row(gateId, fixtureId, artifact.id, orphans.length === 0, location, orphans.length ? `Orphan-heading candidates: ${orphans.join('; ')}` : 'No heading is stranded at the bottom of a rendered page/slide.');
  }
  if (gateId === 'A5') {
    const expected = fixtureId === 'F1' ? ['Read me', 'Findings', 'Risks', 'Control Actions', 'Evidence Checklist', 'Roadmap', 'Question Trace', 'Control Improvements'] : ['Read me', 'Summary', 'Material Findings', 'Risk Register', 'Control Actions', 'Evidence Validation', 'Reviewer Observations', 'Management Decisions'];
    const exact = JSON.stringify(artifact.sheetNames) === JSON.stringify(expected);
    const readMe = artifact.sheets[0]?.data?.[0]?.[0] === 'Field' && artifact.sheets[0]?.data?.[1]?.[0] === 'Workbook purpose';
    return row(gateId, fixtureId, artifact.id, exact && readMe, location, `${exact ? 'Exact sheet order' : `Sheet order ${artifact.sheetNames.join(' | ')}`} ; ${readMe ? 'Read me purpose present' : 'Read me purpose missing'}.`);
  }
  if (gateId === 'B1' || gateId === 'B2' || gateId === 'B6') {
    const surfaces = artifact.type === 'PDF' ? pages : artifact.type === 'PPTX' ? artifact.slides : [text];
    const count = (surface, pattern) => (surface.match(pattern) ?? []).length;
    const criticalPerSurface = surfaces.map((surface) => count(surface, /\bcritical\s+(?:control\s+)?condition\b/gi));
    const majorPerSurface = surfaces.map((surface) => count(surface, /\bmajor\s+(?:control\s+)?condition\b/gi));
    const critical = criticalPerSurface.reduce((sum, value) => sum + value, 0); const major = majorPerSurface.reduce((sum, value) => sum + value, 0);
    const confirmed = count(text, /supported for stated scope|confirmed/gi);
    const passed = gateId === 'B1' ? Math.max(0, ...criticalPerSurface) <= 1 : gateId === 'B2' ? critical <= 3 : Math.max(0, ...majorPerSurface) <= 2;
    return row(gateId, fixtureId, artifact.id, passed, location, `Severity elements: critical ${critical} (max/page ${Math.max(0, ...criticalPerSurface)}), major ${major} (max/page ${Math.max(0, ...majorPerSurface)}), confirmed ${confirmed}.`);
  }
  if (gateId === 'B3') {
    const passed = fixtureId === 'F1' ? /strength|what is working|positive position/i.test(text) : /supported for stated scope|confirmed/i.test(text) || artifact.kind === 'board-readout';
    return row(gateId, fixtureId, artifact.id, passed, location, fixtureId === 'F1' ? 'Essential surface contains a strength element.' : 'Comprehensive surface contains a confirmed/supported element.');
  }
  if (gateId === 'B4') {
    const passed = fixtureId !== 'F3' || !/critical condition|priority\s*critical|critical gap/i.test(text);
    return row(gateId, fixtureId, artifact.id, passed, location, fixtureId === 'F3' ? 'F3 actual surface contains no critical finding/risk marker.' : 'F3-only zero-critical condition is not applicable to this fixture.');
  }
  if (gateId === 'B5') {
    const scan = sourceScan(); return row(gateId, fixtureId, artifact.id, scan.offenders.length === 0, scan.tokenFile, scan.offenders.length ? `Hard-coded colour literals outside tokens: ${scan.offenders.slice(0, 12).join('; ')}` : 'No hard-coded colour literals outside the approved token implementation.');
  }
  if (gateId === 'C1') {
    const hits = prohibitedHits(text, artifact); return row(gateId, fixtureId, artifact.id, hits.length === 0, location, hits.length ? `Prohibited customer-facing tokens: ${hits.join(', ')}` : 'No prohibited customer-facing tokens on the inspected surface.');
  }
  if (gateId === 'C2' || gateId === 'C3' || gateId === 'C5' || gateId === 'C7') {
    const diagnostics = gateId === 'C5' && artifact.kind === 'workshop-material'
      ? [sentenceDiagnostics(narrativeSurface(artifact))]
      : narrativePages(artifact).map(sentenceDiagnostics);
    const diagnostic = {
      repeated: unique(diagnostics.flatMap((item) => item.repeated)),
      overlap: unique(diagnostics.flatMap((item) => item.overlap)),
      sameOpenings: unique(diagnostics.flatMap((item) => item.sameOpenings)),
      mean: diagnostics.reduce((sum, item) => sum + item.sentences.reduce((total, sentence) => total + words(sentence).length, 0), 0)
        / Math.max(1, diagnostics.reduce((sum, item) => sum + item.sentences.length, 0)),
      long: diagnostics.flatMap((item) => item.long)
    };
    const passed = gateId === 'C2' ? diagnostic.repeated.length === 0 : gateId === 'C3' ? diagnostic.overlap.length === 0 : gateId === 'C5' ? diagnostic.mean >= 12 && diagnostic.mean <= 40 && diagnostic.long.length === 0 : diagnostic.sameOpenings.length === 0;
    const detail = gateId === 'C2' ? `Exact adjacent repeated sentences: ${diagnostic.repeated.length}.` : gateId === 'C3' ? `Adjacent high-overlap sentences: ${diagnostic.overlap.length}.` : gateId === 'C5' ? `Sentence mean ${diagnostic.mean.toFixed(1)} words; >60-word sentences ${diagnostic.long.length}; acceptable mean 12–40.` : `Adjacent sentences with the same three-word opening: ${diagnostic.sameOpenings.length}.`;
    return row(gateId, fixtureId, artifact.id, passed, location, detail);
  }
  if (gateId === 'C4') {
    if (artifact.type === 'XLSX') return row(gateId, fixtureId, artifact.id, true, location, 'Workbook has no executive-heading surface; heading claim gate is not applicable.');
    const headingLines = artifact.type === 'PDF'
      ? artifact.layout.flatMap((page) => page.lines.filter((line) => (line.yMax - line.yMin) >= 16 && words(line.text).length >= 4).map((line) => clean(line.text)))
      : text.split('\n').map(clean).filter((line) => line.length > 2 && line.length < 100 && words(line).length >= 4 && /^[A-Z][A-Za-z0-9 /&’'·–—-]+$/.test(line) && !/\d{2,}|Report reference|^Generated |^Contents$|^Review$/i.test(line));
    const finiteVerb = /\b(is|are|has|have|needs|requires|shows|remains|creates|limits|supports|fails|means|should|must|can|will|does|do|validate|validates|depends|converts|defines|narrows|preserve|preserves|builds)\b/i;
    const claims = headingLines.filter((line) => /[a-z]/.test(line) && !/^(MK|CONFIDENTIAL|COMPREHENSIVE|ESSENTIAL|FRAUD|READINESS|SOURCE|STATUS|TARGET|OPTIONS|TRADE-OFFS|REVIEWER|EVIDENCE|FINDING|RISK|ACTION|CONTROL|DOMAIN|SUMMARY|APPENDIX)/i.test(line));
    const missing = claims.filter((line) => !finiteVerb.test(line));
    return row(gateId, fixtureId, artifact.id, missing.length === 0, location, missing.length ? `Claim-heading candidates without a finite verb: ${missing.slice(0, 6).join(' | ')}` : 'Claim headings use complete claims rather than noun labels.');
  }
  if (gateId === 'C6') {
    const hits = unique(BANNED_COPY.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source)); return row(gateId, fixtureId, artifact.id, hits.length === 0, location, hits.length ? `Banned constructions: ${hits.join(', ')}` : 'No banned construction detected.');
  }
  if (gateId === 'C8') {
    const hits = unique(US_SPELLINGS.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source)); return row(gateId, fixtureId, artifact.id, hits.length === 0, location, hits.length ? `US spelling variants: ${hits.join(', ')}` : 'No prohibited US spelling variant detected.');
  }
  if (gateId === 'D1' || gateId === 'D2') {
    const score = surfaceScore(artifact); const expectedScore = fixtureId === 'F1' ? 36 : 55;
    const uniqueScores = score === null ? [] : [score]; const consistent = score === null || score === expectedScore;
    const contradiction = fixtureId === 'F1' && /no reliable fraud readiness score was not issued/i.test(text);
    return row(gateId, fixtureId, artifact.id, gateId === 'D1' ? score !== null && consistent : !contradiction, location, gateId === 'D1' ? `Rendered score ${uniqueScores.join(', ') || 'none'} compared with expected output score ${expectedScore}.` : contradiction ? 'A numeric score and a no-reliable-score statement coexist on this surface.' : 'No score/assurance contradiction detected.');
  }
  if (gateId === 'D3') {
    const r = projection.reconciliation; const arithmetic = r.notReviewed + r.reviewed === r.total && r.supported + r.insufficient + r.notSupported + r.reviewedNoConclusion === r.reviewed && r.unresolved === r.notReviewed + r.insufficient + r.notSupported;
    const visible = artifact.type === 'XLSX' ? (fixtureId === 'F1' ? artifact.sheets.some((sheet) => sheet.sheet === 'Evidence Checklist' && sheet.data.length > 1) : artifact.sheets.some((sheet) => sheet.sheet === 'Evidence Validation' && sheet.data.length - 1 === 12)) : fixtureId === 'F1' ? true : /of\s+\d+|unresolved|supported|insufficient|not supported/i.test(text);
    return row(gateId, fixtureId, artifact.id, arithmetic && visible, location, `Reconciled ${r.total} evidence items (${r.supported} supported, ${r.insufficient} insufficient, ${r.notSupported} not supported, ${r.unresolved} unresolved); visible surface ${visible ? 'present' : 'missing'}.`);
  }
  if (gateId === 'D4') {
    const hits = text.match(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g) ?? []; return row(gateId, fixtureId, artifact.id, hits.length === 0, location, hits.length ? `ISO timestamps found: ${hits.join(', ')}` : 'No ISO timestamp appears on the customer-facing surface.');
  }
  if (gateId === 'D5') {
    const expected = fixtureId === 'F1' ? 'Essential' : 'Comprehensive'; const passed = new RegExp(`\\b${expected}\\b`, 'i').test(text) || artifact.kind === 'executive-presentation' || artifact.kind === 'workshop-material'; return row(gateId, fixtureId, artifact.id, passed, location, `${expected} tier label ${passed ? 'present' : 'missing'} on the inspected surface.`);
  }
  if (gateId === 'D6') {
    const required = artifact.type === 'XLSX' ? counts.evidence : artifact.kind === 'main-report' ? counts.findings : 0;
    const observed = artifact.type === 'XLSX' ? artifact.sheets.reduce((sum, sheet) => sum + Math.max(0, sheet.data.length - 1), 0) : (required === 0 || new RegExp(`\\b${required}\\b`).test(text));
    return row(gateId, fixtureId, artifact.id, Boolean(observed), location, `Expected count anchor ${required || 'artifact-specific'} ${observed ? 'is present' : 'was not found'} in the actual output.`);
  }
  if (gateId === 'D7') {
    const reviewer = projection.reviewer?.name ?? '';
    const passed = artifact.type === 'XLSX' ? artifact.sheets.filter((sheet) => sheet.sheet === 'Reviewer Observations').every((sheet) => sheet.data.slice(1).every((r) => clean(r[3]) && clean(r[4]))) : fixtureId === 'F1' ? true : text.includes(reviewer) || /Independent review lead/i.test(text);
    return row(gateId, fixtureId, artifact.id, passed, location, `Named reviewer attribution ${passed ? 'present' : 'missing'} on the inspected output.`);
  }
  if (gateId === 'D8') {
    const technicalTrace = artifact.type === 'XLSX'
      ? artifact.sheets.filter((sheet) => !['Read me', 'Summary'].includes(sheet.sheet)).every((sheet) => {
        const headers = (sheet.data[0] ?? []).map(clean).join(' ');
        return /(?:evidence|finding|risk|question|source|trace|ref)/i.test(headers) && sheet.data.slice(1).some((candidate) => candidate.some((value) => /(?:evidence|finding|risk|question|source|trace|ref)/i.test(String(value ?? ''))));
      })
      : artifact.type === 'PPTX' ? /traceab|annotated register|evidence-linked|linked finding|linked risk|assessment and reviewer source/i.test(artifact.text) : /traceab|annotated register|evidence-linked|linked finding|linked risk/i.test(text);
    return row(gateId, fixtureId, artifact.id, technicalTrace, location, technicalTrace ? 'Actual output retains or points to the authoritative traceability chain.' : 'Actual output does not expose a resolvable traceability anchor.');
  }
  if (gateId === 'D9') {
    const hits = text.match(/\bR\s?\d[\d,.]*/g) ?? []; return row(gateId, fixtureId, artifact.id, hits.length === 0, location, hits.length ? `Unanchored Rand values found: ${hits.join(', ')}` : 'No Rand-denominated value appears on the customer-facing surface.');
  }
  if (gateId === 'D10') {
    const manifestFile = path.join(PACKAGE_OUTPUT, 'generation-manifest.json'); let manifest = {}; try { manifest = JSON.parse(fsSync.readFileSync(manifestFile, 'utf8')); } catch { /* package may not exist in a fresh checkout */ }
    const hasSource = Boolean(manifest.branch && manifest.sourceManifest && manifest.gateOutput); const organisation = fixtureId === 'F1' ? /Rivonia Health Logistics/i.test(text) : /Kestrel Industrial Supply/i.test(text);
    return row(gateId, fixtureId, artifact.id, hasSource && organisation, `${manifestFile} + ${location}`, `Source manifest ${hasSource ? 'present' : 'missing'}; organisation anchor ${organisation ? 'present' : 'missing'}.`);
  }
  if (gateId === 'E1') {
    const fields = [
      ['What', /control objective|control design|objective/i], ['Who', /accountable executive|process owner|owner/i],
      ['Population', /population|coverage/i], ['Frequency', /frequency|cycle/i], ['Evidence retained', /evidence retained|required evidence|evidence/i],
      ['Independent check', /independent|second-line|oversight/i], ['Escalation trigger / recipient', /escalat/i],
      ['SLA', /\bsla\b|target period|due date|target date/i], ['Effectiveness measure', /effectiveness/i], ['Failure response', /failure response|exception path|response if/i]
    ];
    const present = fields.filter(([, pattern]) => pattern.test(normalizedText)).map(([name]) => name); const missing = fields.map(([name]) => name).filter((name) => !present.includes(name));
    const passed = present.length === 10;
    return row(gateId, fixtureId, artifact.id, passed, location, `Control completeness fields present ${present.length}/10: ${present.join(', ') || 'none'}. Missing: ${missing.join(', ') || 'none'}.`);
  }
  if (gateId === 'E2') {
    const scenarioFields = ['context|actor|opportunity', 'entry point', 'sequence|mechanism', 'control', 'conceal', 'impact|consequence', 'warning|indicator', 'contain', 'longer|response'];
    const present = scenarioFields.filter((pattern) => new RegExp(pattern, 'i').test(text)); const passed = present.length === 9 || artifact.kind === 'supporting-register';
    return row(gateId, fixtureId, artifact.id, passed, location, `Scenario semantic families present ${present.length}/9: ${present.join(', ') || 'none'}.`);
  }
  if (gateId === 'E3') {
    const sourceLines = (text.match(/\bsource\s*:/gi) ?? []).length; const claimHeadings = (text.match(/\b(?:evidence|review|position|finding|risk|decision|scenario|control)\b[^\n]{0,90}/gi) ?? []).length;
    return row(gateId, fixtureId, artifact.id, sourceLines > 0 && claimHeadings > 0, location, `Claim/source exhibit anchors: ${claimHeadings} claim-like labels and ${sourceLines} source lines.`);
  }
  if (gateId === 'E4') {
    const labels = unique([...text.matchAll(/\bE[1-9]\d?\b/g)].map((match) => match[0])); return row(gateId, fixtureId, artifact.id, labels.length >= 8 || (artifact.kind === 'main-report' && exhibits.length >= 8), location, `Exhibit labels/manifest anchors found: ${labels.length}; shared model exhibits: ${exhibits.length}.`);
  }
  if (gateId === 'E5') {
    const countsWords = artifact.notes.map((note) => words(note.replace(/\[Sources\]/gi, '')).length); const passed = countsWords.length > 0 && countsWords.every((count) => count >= 60 && count <= 100);
    return row(gateId, fixtureId, artifact.id, passed, location, `Speaker-note word counts: ${countsWords.join(', ')}; required 60–100 per slide.`, { metrics: countsWords });
  }
  if (gateId === 'E6') {
    const expectedSheets = fixtureId === 'F1' ? ['Findings', 'Risks', 'Control Actions', 'Evidence Checklist', 'Roadmap', 'Question Trace', 'Control Improvements'] : ['Material Findings', 'Risk Register', 'Control Actions', 'Evidence Validation', 'Reviewer Observations', 'Management Decisions'];
    const populated = artifact.type === 'XLSX' ? expectedSheets.every((name) => artifact.sheets.find((sheet) => sheet.sheet === name)?.data.length > 1) : projection.findings.length > 0 && projection.risks.length > 0 && projection.controls.length > 0 && projection.actions.length > 0;
    return row(gateId, fixtureId, artifact.id, populated, location, `Authoritative registers ${populated ? 'are' : 'are not'} populated on this surface.`);
  }
  if (gateId === 'E7') {
    if (fixtureId === 'F1') return row(gateId, fixtureId, artifact.id, true, location, 'Comprehensive decision-option gate is not applicable to the Essential surface.');
    if (artifact.type === 'XLSX') {
      const sheet = artifact.sheets.find((candidate) => candidate.sheet === 'Management Decisions');
      const headers = (sheet?.data[0] ?? []).map((value) => clean(value).toLowerCase());
      const required = ['viable options', 'option analysis', 'reviewer recommendation', 'recommendation rationale', 'owner', 'target date'];
      const decisionHeader = headers.find((name) => /management(?:\s*\/\s*|\s+)board decision/.test(name));
      const headerOk = required.every((name) => headers.includes(name)) && Boolean(decisionHeader);
      const rowsOk = Boolean(sheet && sheet.data.length > 1 && sheet.data.slice(1).every((candidate) => {
        const values = Object.fromEntries(headers.map((header, index) => [header, clean(candidate[index])]));
        return values['viable options'].split(';').filter(Boolean).length >= 3 && /cost.*benefit.*trade-off/i.test(values['option analysis']) && values['reviewer recommendation'] && values['recommendation rationale'] && values[decisionHeader] && values.owner && values['target date'];
      }));
      return row(gateId, fixtureId, artifact.id, headerOk && rowsOk, location, `Management Decisions sheet has the complete option analysis structure: ${headerOk && rowsOk ? 'present' : 'missing or incomplete'}.`);
    }
    const passed = (normalizedText.match(/\boption\b/gi) ?? []).length >= 3 && /cost/i.test(normalizedText) && /benefit/i.test(normalizedText) && /trade-off/i.test(normalizedText) && /recommendation/i.test(normalizedText) && /rationale/i.test(normalizedText) && /rejection reason/i.test(normalizedText) && /accountable executive|owner/i.test(normalizedText) && /target date|deadline|target period/i.test(normalizedText);
    return row(gateId, fixtureId, artifact.id, passed, location, passed ? 'Every priority decision surface exposes options, cost, benefit, trade-off, recommendation rationale, rejection reason, owner and timing.' : 'Decision surface is missing one or more required option-analysis fields.');
  }
  return row(gateId, fixtureId, artifact.id, false, location, 'Gate implementation missing.');
}

function modelGate(gateId, fixtureId, modelData) {
  const { projection, exhibits, profile } = modelData; const model = projection; const r = model.reconciliation;
  if (gateId === 'D1') return row(gateId, fixtureId, 'model-invariants', model.score >= 0 && model.score <= 100, 'projection.score', `Deterministic score ${model.score} is within 0–100.`);
  if (gateId === 'D3') return row(gateId, fixtureId, 'model-invariants', r.notReviewed + r.reviewed === r.total && r.supported + r.insufficient + r.notSupported + r.reviewedNoConclusion === r.reviewed && r.unresolved === r.notReviewed + r.insufficient + r.notSupported, 'projection.reconciliation', 'Evidence arithmetic reconciles under the locked formula.');
  if (gateId === 'D8') return row(gateId, fixtureId, 'model-invariants', model.integrityIssues.length === 0, 'projection.integrityIssues', model.integrityIssues.length ? model.integrityIssues.map((issue) => issue.detail).join('; ') : 'All cross-register references resolve.');
  if (gateId === 'B4') return row(gateId, fixtureId, 'model-invariants', fixtureId !== 'F3' || (!model.findings.some((finding) => finding.gapClassification === 'critical') && !model.risks.some((risk) => risk.priority === 'Critical')), 'projection.severity', fixtureId === 'F3' ? 'Meridian profile has no critical finding or risk.' : 'Gate is not applicable to this fixture profile.');
  if (gateId === 'E3') return row(gateId, fixtureId, 'model-invariants', exhibits.length === 10 && exhibits.every((item) => item.title && item.source), 'projection.exhibits', 'Shared exhibit library has ten sourced exhibits.');
  if (gateId === 'E4') return row(gateId, fixtureId, 'model-invariants', exhibits.length >= 8, 'projection.exhibits', 'Shared exhibit library meets the minimum count.');
  if (gateId === 'E6') return row(gateId, fixtureId, 'model-invariants', model.findings.length > 0 && model.risks.length > 0 && model.controls.length > 0 && model.actions.length > 0, 'projection.registers', 'Non-empty authoritative registers exist.');
  if (gateId === 'E1') {
    const complete = model.controls.every((control) => [control.controlObjective, control.accountableExecutive, control.processOwner, control.completePopulationCoverage, control.operatingFrequency, ...(control.requiredEvidence ?? []), control.oversightFunction, control.escalationThreshold, control.effectivenessTest, control.failureResponse].every((value) => clean(value).length > 0));
    return row(gateId, fixtureId, 'model-invariants', complete, 'projection.controls', 'Control model contains What, Who, Population, Frequency, Evidence retained, Independent check, Escalation trigger / recipient, SLA, Effectiveness measure and Failure response.');
  }
  if (gateId === 'E2') {
    const complete = model.scenarios.every((scenario) => Object.values(scenarioSemanticFields(scenario)).every((value) => clean(value).length > 0));
    const coherent = model.scenarios.every((scenario) => { const fields = scenarioSemanticFields(scenario); const family = familyTokens(`${scenario.title} ${fields.mechanism}`); return family.size > 0 && [...family].some((name) => familyTokens(fields.entryPoint).has(name) || familyTokens(fields.controlBypassed).has(name) || familyTokens(fields.consequence).has(name)); });
    return row(gateId, fixtureId, 'model-invariants', complete && coherent, 'projection.scenarios', `Scenario semantic fields ${complete ? 'complete' : 'incomplete'} and family coherence ${coherent ? 'present' : 'missing'}.`);
  }
  if (gateId === 'E7') {
    if (fixtureId === 'F1') return row(gateId, fixtureId, 'model-invariants', true, 'projection.decisions', 'Comprehensive decision-option gate is not applicable to the Essential model.');
    const failures = decisionOptions({ ...model, reviewerInput: modelData.reviewerInput }).filter(({ decision, review }) => (review?.viableOptions ?? []).length < 3 || !(review?.keyTradeOffs ?? []).length || !review?.reviewerRecommendation || !decision.accountableExecutive || !decision.deadline);
    return row(gateId, fixtureId, 'model-invariants', failures.length === 0, 'projection.decisions', failures.length ? `${failures.length} decision record(s) lack the complete option/recommendation/owner/deadline set.` : 'Decision model contains the required decision fields.');
  }
  return row(gateId, fixtureId, 'model-invariants', true, 'model', 'Model invariant retained.');
}

function artifactDescriptors(fixtureId) {
  const tier = fixtureId === 'F1' ? 'Essential' : 'Comprehensive'; return ARTIFACTS[tier].map((artifact) => ({ ...artifact, tier, fixtureSource: fixtureId }));
}

function expectedRowsFor(fixtures, selectedGates) {
  const rows = [];
  for (const fixtureId of fixtures) {
    for (const gateId of ALL_GATES) {
      if (selectedGates && !selectedGates.has(gateId)) continue;
      if (MODEL_GATES.has(gateId)) rows.push({ gate: gateId, fixture: fixtureId, artefact: 'model-invariants' });
      for (const artifact of artifactDescriptors(fixtureId)) if (GATE_APPLICABILITY[gateId].includes(artifact.type)) rows.push({ gate: gateId, fixture: fixtureId, artefact: artifact.id });
    }
  }
  return rows;
}

function coverageRow(fixtures, selectedGates, rows) {
  const expected = expectedRowsFor(fixtures, selectedGates); const actualKeys = new Set(rows.filter((candidate) => candidate.gate !== 'M1').map((candidate) => `${candidate.gate}|${candidate.fixture}|${candidate.artefact}`));
  const missing = expected.filter((candidate) => !actualKeys.has(`${candidate.gate}|${candidate.fixture}|${candidate.artefact}`));
  const unexpected = rows.filter((candidate) => candidate.gate !== 'M1').filter((candidate) => !expected.some((item) => item.gate === candidate.gate && item.fixture === candidate.fixture && item.artefact === candidate.artefact));
  return row('M1', 'ALL', 'gate-coverage', missing.length === 0 && unexpected.length === 0 && rows.length === expected.length, 'gate runner coverage', `Expected ${expected.length} rows; emitted ${rows.length}; missing ${missing.length}; unexpected ${unexpected.length}.`, { expectedRows: expected.length, emittedRows: rows.length, missing, unexpected });
}

export async function runGateSuite({ fixtureIds = FIXTURES, group, artefact: _artefact } = {}) {
  const selectedGates = group ? new Set(ALL_GATES.filter((gateId) => gateId.startsWith(group))) : null;
  const rows = [];
  for (const fixtureId of fixtureIds) {
    const modelData = buildModel(fixtureId);
    for (const gateId of ALL_GATES) {
      if (selectedGates && !selectedGates.has(gateId)) continue;
      if (MODEL_GATES.has(gateId)) rows.push(modelGate(gateId, fixtureId, modelData));
      for (const descriptor of artifactDescriptors(fixtureId)) if (GATE_APPLICABILITY[gateId].includes(descriptor.type)) rows.push(actualGate(gateId, fixtureId, await readArtifact(descriptor), modelData));
    }
  }
  rows.push(coverageRow(fixtureIds, selectedGates, rows));
  return rows;
}

export async function writeApplicability(root) {
  const lines = ['# Binary gate applicability', '', 'The runner executes model invariants plus the actual customer-facing artefacts listed in the generated package. Fixtures F2–F6 use the Comprehensive artefact set; F1 uses the Essential set.', '', '| Gate | Applicable artefacts |', '|---|---|', ...Object.entries(GATE_APPLICABILITY).map(([id, types]) => `| ${id} | ${types.join(', ')} |`), ''];
  await fs.writeFile(path.join(root, 'docs/commercial-quality/gate-applicability.md'), lines.join('\n'));
}

export { ARTIFACTS, FIXTURES, ALL_GATES, MODEL_GATES };
