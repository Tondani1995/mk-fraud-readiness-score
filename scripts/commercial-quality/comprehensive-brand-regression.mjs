#!/usr/bin/env node
/**
 * Provider-free structural brand regression for the Comprehensive PDF path.
 *
 * Essential's production template is the authority: it imports the shared MK token set and
 * renders the approved vector mark through renderCoverLogo(). Comprehensive must use those same
 * seams while retaining its own narrative layout.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import { MK_LOGO_ASPECT_RATIO, renderCoverLogo } from '../../src/lib/reports/design/brand-assets.ts';
import { MK_TOKENS } from '../../src/lib/reports/design/tokens.ts';
import { renderComprehensiveNarrativeReportHtml } from '../../src/lib/reports/comprehensive/render-narrative-html.ts';

const rendererSource = await fs.readFile('src/lib/reports/comprehensive/render-narrative-html.ts', 'utf8');
const generationSource = await fs.readFile('src/lib/reports/comprehensive/narrative-generation.ts', 'utf8');

assert.match(rendererSource, /from ['"]\.\.\/design\/brand-assets['"]/,
  'Comprehensive renderer must import the approved brand asset module.');
assert.match(rendererSource, /renderCoverLogo\(\)/,
  'Comprehensive cover must use the approved logo renderer.');
assert.match(rendererSource, /MK_CSS_VARIABLES/,
  'Comprehensive renderer must consume the shared MK CSS token source.');
assert.doesNotMatch(rendererSource, /#0B1B33|#5A6B7C|--navy-900|--muted\s*:/i,
  'Deprecated approximate MK colours must not return to the Comprehensive renderer.');
assert.match(generationSource, /MK Fraud Insights · Comprehensive Fraud Readiness Report/,
  'Comprehensive PDF footer must use the approved MK report identity.');

const minimalModel = {
  product: 'Comprehensive',
  title: 'Fraud Readiness Strategy and Control Blueprint',
  organisationName: 'Brand regression fixture',
  assessmentReference: 'MKFRS-BRAND-REGRESSION',
  score: 80,
  maturity: 'Strategic',
  narrativeMode: 'SUSTAINMENT',
  tone: 'positive',
  assuranceBoundary: 'Based on management recorded self-assessment.',
  chapters: [],
  transformationSequence: [],
  companionWorkbook: {
    title: 'MK Fraud Readiness Comprehensive Workbook',
    purpose: 'Detailed companion record.',
    sheets: ['Read me', 'Summary', 'Material Findings', 'Risk Register', 'Control Blueprints', 'Implementation Blueprint', 'Management Decisions', 'Question Traceability']
  }
};

const html = renderComprehensiveNarrativeReportHtml(minimalModel);
const logo = renderCoverLogo();
const styleHeight = Number(logo.match(/height:(\d+(?:\.\d+)?)pt/)?.[1] ?? 0);
const styleWidth = Number(logo.match(/width:(\d+(?:\.\d+)?)pt/)?.[1] ?? 0);

assert.match(logo, /<img\s+src="data:image\/svg\+xml,/,
  'Approved MK logo must be embedded as a vector SVG data URI.');
assert.match(logo, /alt="MK Fraud Insights"/,
  'Approved MK logo must retain its accessible identity.');
assert.ok(styleHeight > 0 && styleWidth > 0, 'Approved MK logo must have explicit dimensions.');
assert.ok(Math.abs((styleWidth / styleHeight) - MK_LOGO_ASPECT_RATIO) < 0.01,
  'Approved MK logo aspect ratio must remain unchanged.');
assert.match(html, /data-brand-asset="approved-mk-fraud-insights-mark"/,
  'Comprehensive cover must declare the approved MK brand asset.');
assert.match(html, /data:image\/svg\+xml,/,
  'Comprehensive cover must contain the approved vector logo.');
assert.match(html, /Fraud readiness advisory/,
  'Comprehensive cover must retain the Essential family eyebrow.');
assert.match(html, /Confidential · Internal leadership use/,
  'Comprehensive cover must retain the approved confidentiality convention.');
assert.match(html, /Report reference MKFRS-BRAND-REGRESSION/,
  'Comprehensive cover must retain the report-reference convention.');
const cssTokenNames = {
  navy900: 'navy-900',
  navy700: 'navy-700',
  navy500: 'navy-500',
  confirmed: 'confirmed',
  major: 'major',
  brass: 'brass'
};
for (const token of Object.keys(cssTokenNames)) {
  assert.match(html, new RegExp(`--mk-${cssTokenNames[token]}:`),
    `Shared MK token ${token} must be present in the rendered CSS.`);
}
assert.doesNotMatch(html, /src="(?:https?:\/\/|\/)(?!data:)/i,
  'Comprehensive brand asset must not depend on a browser, Vercel or external asset URL.');
assert.equal(MK_TOKENS.navy900, '#01123A');
assert.equal(MK_TOKENS.confirmed, '#1F6B4A');
assert.equal(MK_TOKENS.brass, '#C9A227');

console.log(JSON.stringify({
  status: 'PASS',
  gate: 'comprehensive-brand-regression',
  providerCalls: 0,
  approvedLogo: 'renderCoverLogo -> MK_LOGO_REVERSED_RENDER_DATA_URI',
  aspectRatio: Number((styleWidth / styleHeight).toFixed(4)),
  tokens: {
    navy: MK_TOKENS.navy900,
    green: MK_TOKENS.confirmed,
    brass: MK_TOKENS.brass
  },
  cover: {
    logo: true,
    reference: true,
    confidentiality: true,
    externalAsset: false
  }
}, null, 2));
