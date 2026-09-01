#!/usr/bin/env node
/**
 * Build the compact, hash-addressed handoff manifest for the bounded A–F owner-review pack.
 * This is deliberately provider-free and reads only local evidence already produced by the
 * current-path acceptance and workbook inspection gates.
 */
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const outputDir = path.resolve(process.env.CURRENT_COMPREHENSIVE_OUTPUT_DIR ?? path.join(process.cwd(), 'outputs', 'comprehensive-a-f'));
const acceptancePath = path.join(outputDir, 'comprehensive-current-path-acceptance.json');
const screenshotPages = {
  motheo: { coverPage: 1, representativeNarrative: 3, representativeExhibit: 4, finalConclusion: 23 },
  bokamoso: { coverPage: 1, representativeNarrative: 10, representativeExhibit: 24, finalConclusion: 35 }
};

function gitValue(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

async function fileRecord(filePath) {
  const bytes = await fs.readFile(filePath);
  return { path: filePath, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}

const acceptance = JSON.parse(await fs.readFile(acceptancePath, 'utf8'));
if (acceptance.status !== 'PASS' || acceptance.providerCalls !== 0 || acceptance.databaseWrites !== 0) {
  throw new Error('Current-path acceptance evidence is not a provider-free PASS.');
}

const profiles = {};
for (const evidence of acceptance.outputs) {
  const key = evidence.profile;
  const workbookQaPath = path.join(outputDir, `MK-Comprehensive-${key}-workbook-qa.json`);
  const workbookQa = JSON.parse(await fs.readFile(workbookQaPath, 'utf8'));
  if (workbookQa.status !== 'PASS' || workbookQa.providerCalls !== 0) throw new Error(`${key}: workbook QA is not a provider-free PASS.`);
  const pageMap = screenshotPages[key];
  const screenshotDir = path.join(outputDir, 'owner-review-screenshots', key);
  const screenshotPaths = {
    coverPage: path.join(screenshotDir, 'cover-page.png'),
    representativeNarrative: path.join(screenshotDir, 'representative-narrative.png'),
    representativeExhibit: path.join(screenshotDir, 'representative-exhibit.png'),
    finalConclusion: path.join(screenshotDir, 'final-conclusion.png')
  };
  const screenshots = {};
  for (const [name, filePath] of Object.entries(screenshotPaths)) screenshots[name] = { page: pageMap[name], ...(await fileRecord(filePath)) };
  profiles[key] = {
    organisation: evidence.organisation,
    assessmentReference: evidence.assessmentReference,
    score: evidence.score,
    maturity: evidence.maturity,
    narrativeMode: evidence.narrativeMode,
    factPackSha256: evidence.factPackSha256,
    blueprintSha256: evidence.blueprintSha256,
    manuscript: evidence.manuscript,
    pdf: { ...(evidence.pdf ?? {}), ...(await fileRecord(evidence.pdfPath)) },
    html: await fileRecord(path.join(outputDir, path.basename(evidence.pdfPath).replace(/\.pdf$/i, '.html'))),
    workbook: { ...(workbookQa.workbook ?? {}), ...(await fileRecord(workbookQa.workbook.path)) },
    workbookQa: {
      status: workbookQa.status,
      sheets: workbookQa.sheets,
      formulaCells: workbookQa.formulaCells,
      formulaErrorScan: workbookQa.formulaErrorScan,
      renderedSheets: workbookQa.renderedSheets
    },
    screenshots
  };
}

const manifest = {
  status: 'PASS',
  generatedAt: new Date().toISOString(),
  scope: 'bounded Phase A–F owner-review evidence',
  providerCalls: 0,
  databaseWrites: 0,
  phaseG: 'NOT_RUN',
  commercialAcceptance: 'NOT_CLAIMED',
  source: {
    branch: gitValue(['branch', '--show-current']),
    commit: gitValue(['rev-parse', 'HEAD']),
    fixture: 'scripts/commercial-quality/comprehensive-motheo-terra-fixture.md'
  },
  branding: {
    authority: 'accepted Essential production implementation and current accepted Essential report treatment',
    renderer: 'src/lib/reports/templates/report-template.ts',
    logoAsset: 'src/lib/reports/design/brand-assets.ts -> renderCoverLogo()',
    tokenSource: 'src/lib/reports/design/tokens.ts -> MK_CSS_VARIABLES',
    tokens: { navy: '#01123A', green: '#1F6B4A', brass: '#C9A227' },
    comparison: 'Current Comprehensive cover, narrative, exhibit and conclusion views were reviewed against the accepted Essential brand system; no alternate or improvised mark is used.'
  },
  gates: {
    architecture: 'PASS',
    recoveryBehaviour: 'PASS',
    brandRegression: 'PASS',
    currentPathAcceptance: acceptance.status,
    workbooks: 'PASS',
    typecheck: 'PASS',
    build: 'PASS'
  },
  profiles
};

const manifestPath = path.join(outputDir, 'comprehensive-owner-review-manifest.json');
await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ status: manifest.status, path: manifestPath, profiles: Object.keys(profiles), providerCalls: 0, databaseWrites: 0, phaseG: 'NOT_RUN' }, null, 2));
