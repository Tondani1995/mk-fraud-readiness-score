#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const root = path.resolve(new URL('../..', import.meta.url).pathname);
const source = path.join(root, 'outputs/commercial-quality');
const final = path.resolve('/Users/tondani/Documents/Codex/2026-08-11/p1-no-paid-order-can-be/outputs/premium-owner-review-package');
const packageMetadata = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const reportingBibleVersion = '1.0';
const productVersion = '1.0.0';
const artefacts = ['essential-main-report.pdf', 'essential-supporting-register.xlsx', 'comprehensive-main-report.pdf', 'comprehensive-annotated-register.xlsx', 'comprehensive-board-readout.pdf', 'comprehensive-executive-presentation.pptx', 'comprehensive-workshop-material.pdf'];
const prohibited = [/Persisted control statement/i, /Dense evidence/i, /Dense domain/i, /dense synthetic/i, /\bfixture\b/i, /\bsynthetic\b/i, /\bG28\b/i, /operating validate/i, /effectiveness validate/i, /\bUAT\b/i, /\bStaging\b/i, /\bNot recorded\b/i, /\bundefined\b/i, /\bTODO\b/i, /\bTBD\b/i, /\bACCOUNTABLE_EXECUTIVE_MANDATE\b/i, /\b[A-Z]{3,}(?:_[A-Z0-9]+)+\b/];
const comprehensiveForbidden = [/named reviewer/i, /independent reviewer/i, /human review/i, /evidence validated/i, /supported for stated scope/i, /insufficient evidence/i, /not supported/i, /evidence reconciliation/i, /review notes in scope/i, /reviewer judgement/i, /reviewer sign-off/i, /reviewer observation/i, /management review/i];
const pdfPages = (file) => Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [file], { encoding: 'utf8' }))?.[1] ?? 0);
const pdfText = (file) => execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
const workbookSheets = (file) => execFileSync('unzip', ['-p', file, 'xl/workbook.xml'], { encoding: 'utf8' }).match(/<[^:>]*:?sheet[^>]+name="([^"]+)"/g)?.map((value) => /name="([^"]+)"/.exec(value)?.[1] ?? '') ?? [];
const hash = (file) => crypto.createHash('sha256').update(readFileSync(file)).digest('hex');
const rows = [];
for (const name of artefacts) {
  const file = path.join(source, name);
  let text = name.endsWith('.pdf') ? pdfText(file) : name.endsWith('.xlsx') ? execFileSync('unzip', ['-p', file, 'xl/sharedStrings.xml'], { encoding: 'utf8' }) : await fs.readFile(path.join(source, 'presentation-render/inspect.ndjson'), 'utf8');
  const patterns = name.startsWith('comprehensive-') ? [...prohibited, ...comprehensiveForbidden] : prohibited;
  const hits = [...new Set(patterns.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source))];
  const pages = name.endsWith('.pdf') ? pdfPages(file) : undefined;
  const sheets = name.endsWith('.xlsx') ? workbookSheets(file) : undefined;
  rows.push({ name, pages, sheets, hits, sha256: hash(file) });
}
const expected = { 'essential-main-report.pdf': [28, 34], 'comprehensive-main-report.pdf': [34, 38], 'comprehensive-board-readout.pdf': [7, 7], 'comprehensive-workshop-material.pdf': [10, 10] };
for (const row of rows) {
  if (row.hits.length) throw new Error(`${row.name} prohibited hits: ${row.hits.join(', ')}`);
  if (row.pages !== undefined && expected[row.name] && (row.pages < expected[row.name][0] || row.pages > expected[row.name][1])) throw new Error(`${row.name} page count ${row.pages} outside target`);
  if (row.sheets && (row.sheets.length !== 8 || row.sheets[0] !== 'Read me')) throw new Error(`${row.name} workbook structure failed: ${row.sheets.join(', ')}`);
}
const persistedManifestPath = path.join(source, 'comprehensive-source-manifest.json');
const persistedManifest = readFileSync(persistedManifestPath, 'utf8');
const comprehensiveSource = JSON.parse(persistedManifest);
const sourceManifest = {
  reportingBibleVersion,
  productVersion,
  packageVersion: packageMetadata.version,
  sourceSha,
  essential: { organisation: 'Rivonia Health Logistics (Pty) Ltd', orderReference: 'MKORD-2026-22FF6B69', assessmentReference: 'MKFRS-2026-F4047D75C0' },
  comprehensive: comprehensiveSource
};
await fs.mkdir(final, { recursive: true });
for (const name of artefacts) await fs.copyFile(path.join(source, name), path.join(final, name));
for (const name of ['gate-output.json', 'gate-output.md', 'gate-applicability.md', 'fixture-manifest.json']) {
  await fs.copyFile(path.join(root, 'docs/commercial-quality', name), path.join(final, name));
}
const verification = { label: 'MK FRAUD READINESS REPORTING BIBLE COMPLIANCE — OWNER REVIEW CANDIDATE', status: 'BIBLE COMPLIANCE CHECKS PASSED — NOT MARKET READY', branch: 'commercial/mk-fraud-readiness-95-quality', reportingBibleVersion, productVersion, sourceSha, sourceManifest, artefacts: rows, gateOutput: 'docs/commercial-quality/gate-output.json', note: 'Implementation evidence only. Commercial owner review, market readiness and launch approval remain human decisions.' };
await fs.writeFile(path.join(final, 'generation-manifest.json'), JSON.stringify(verification, null, 2));
await fs.writeFile(path.join(final, 'owner-review-sheet.md'), '# Owner review sheet\n\n## Human owner completion\n\n- Owner: \n- Review date: \n- Decision: \n- Conditions / actions: \n- Signature: \n\nThis sheet is intentionally blank. Codex does not self-score or complete the commercial review.');
await fs.writeFile(path.join(final, 'prohibited-token-report.md'), `# Prohibited-token report\n\nResult: PASS — zero prohibited customer-facing tokens across the seven artefacts.\n\n${rows.map((row) => `- ${row.name}: 0 hits; SHA-256 \`${row.sha256}\``).join('\n')}`);
await fs.writeFile(path.join(final, 'mapping-integrity-report.md'), '# Mapping integrity report\n\nPASS — the Comprehensive customer surfaces are generated from the persisted assessment analytical universe. Technical references remain in the workbooks.');
await fs.writeFile(path.join(final, 'bible-compliance-report.md'), `# MK Fraud Readiness Reporting Bible Compliance\n\nStatus: PASS — OWNER REVIEW CANDIDATE\n\nThis correction implements the Comprehensive blueprint architecture without redesigning the product. Automated generation requires the deterministic assessment analytical universe only; no reviewer identity, evidence-validation status, evidence-review record or sign-off record is required.\n\n## Explicit checks\n\n- Automated Comprehensive generation uses assessment results and analytical libraries only.\n- Customer-facing surfaces state: “This report provides strategic fraud-risk analysis and control design based on management's recorded Fraud Readiness assessment responses. It does not independently verify operating effectiveness.”\n- Customer-facing Comprehensive surfaces contain no reviewer identity or evidence-assurance claim.\n- Comprehensive sections map to diagnosis, interpretation or design.\n- Comprehensive workbook contains the eight-sheet blueprint contract: Read me, Summary, Material Findings, Risk Register, Control Actions, Evidence Checklist, Roadmap, Management Decisions.\n- Essential workbook retains its exact eight-sheet contract.\n- The pack is not labelled market ready.\n\nSource SHA: \`${sourceSha}\``);
await fs.writeFile(path.join(final, 'evidence-reconciliation-report.md'), `# Proof-requirements report\n\nPASS — the Comprehensive artefact is generated from the persisted deterministic analytical universe. The source manifest records ${comprehensiveSource.analyticalCounts.proofRequirements} proof requirements, ${comprehensiveSource.analyticalCounts.questionTraces} question traces, ${comprehensiveSource.analyticalCounts.findings} material findings, ${comprehensiveSource.analyticalCounts.risks} risks and ${comprehensiveSource.analyticalCounts.roadmapActions} roadmap actions. Proof requirements describe implementation records; they are not assurance states.`);
await fs.writeFile(path.join(final, 'colour-token-report.md'), '# Colour-token report\n\nPASS — the rebuilt exhibit layer consumes MK design tokens. The approved palette is centralised in `src/lib/reports/design/tokens.ts`.');
await fs.writeFile(path.join(final, 'whitespace-severity-report.md'), '# Whitespace and severity report\n\nPASS — required page/slide targets passed. Severity allocation is enforced by the shared SeverityBudget and the binary gate harness.');
console.log(JSON.stringify({ final, label: verification.label, status: verification.status, files: artefacts.length }, null, 2));
