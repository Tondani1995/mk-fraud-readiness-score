#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(new URL('../..', import.meta.url).pathname);
const outputDir = path.resolve(process.env.V11_OWNER_REVIEW_OUTPUT_DIR ?? path.join(root, 'outputs/v1.1-manuscript-owner-review'));
const biblePath = path.join(root, 'docs/product/MK_Fraud_Readiness_Reporting_Bible_v1.1.md');
const expectedBibleSha256 = '2b9c9673d041bf5c5659dc0bc05e352ba3ab7d79232050f0691f7f5c20308749';
const required = ['essential-fact-pack.json', 'essential-story-plan.json', 'comprehensive-fact-pack.json', 'comprehensive-story-plan.json', 'generation-manifest.json'];
const forbiddenFinalArtefact = /\.(?:pdf|pptx|xlsx)$/i;
const genericScenario = /(?:recorded control condition|assessment question|actor exploits the recorded control condition|threat actor exploits the recorded control condition)/i;
const machineIdentifier = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+){1,}\b/;

const readJson = async (name) => JSON.parse(await fs.readFile(path.join(outputDir, name), 'utf8'));
const bibleSha256 = crypto.createHash('sha256').update(await fs.readFile(biblePath)).digest('hex');
const issues = [];
if (bibleSha256 !== expectedBibleSha256) issues.push(`canonical Bible SHA-256 mismatch: ${bibleSha256}`);
const files = new Set(await fs.readdir(outputDir));
for (const name of required) if (!files.has(name)) issues.push(`missing required owner-review file: ${name}`);
for (const name of files) if (forbiddenFinalArtefact.test(name)) issues.push(`final customer artefact present before manuscript approval: ${name}`);

const packs = await Promise.all(['essential-fact-pack.json', 'comprehensive-fact-pack.json'].map(readJson));
const plans = await Promise.all(['essential-story-plan.json', 'comprehensive-story-plan.json'].map(readJson));
for (const pack of packs) {
  if (pack.bibleVersion !== '1.1') issues.push(`${pack.productTier}: wrong Bible version`);
  if (!/^mk-fraud-readiness-1\.1-fact-pack-v1$|^mk-reporting-bible-1\.1-fact-pack-v1$/.test(pack.schemaVersion)) issues.push(`${pack.productTier}: wrong Fact Pack schema`);
  const ids = pack.facts.map((fact) => fact.id);
  if (new Set(ids).size !== ids.length) issues.push(`${pack.productTier}: duplicate Fact Pack IDs`);
  for (const scenario of pack.scenarios) {
    const text = Object.values(scenario).flatMap((value) => Array.isArray(value) ? value : [value]).filter((value) => typeof value === 'string').join(' ');
    if (genericScenario.test(text)) issues.push(`${pack.productTier}: generic scenario language in ${scenario.factRef}`);
    if (!scenario.actorClass || !scenario.opportunity || !scenario.entryPoint || !scenario.mechanism) issues.push(`${pack.productTier}: incomplete scenario ${scenario.factRef}`);
  }
}
for (const plan of plans) {
  if (plan.bibleVersion !== '1.1') issues.push(`${plan.productTier}: wrong Story Plan Bible version`);
  if (plan.movements.length < 6) issues.push(`${plan.productTier}: Story Plan has too few movements`);
  for (const ref of [...plan.findingOrder, ...plan.scenarioOrder, ...plan.riskOrder, ...plan.controlOrder, ...plan.decisionOrder, ...plan.roadmapOrder]) {
    if (machineIdentifier.test(ref)) continue; // technical provenance IDs are allowed in JSON plans.
    if (!ref) issues.push(`${plan.productTier}: empty Story Plan reference`);
  }
}
const manifest = await readJson('generation-manifest.json');
if (manifest.bibleVersion !== '1.1' || manifest.bibleSha256 !== expectedBibleSha256) issues.push('generation manifest does not bind to the canonical Bible hash');
if (manifest.finalPdfGeneration !== 'blocked_until_owner_approves_manuscripts') issues.push('PDF release boundary is not explicitly blocked');
const status = issues.length ? 'FAIL' : manifest.blocker ? 'BLOCKED_BEFORE_AI_MANUSCRIPT' : 'PASS_PRE_PDF_OWNER_REVIEW';
const report = { status, outputDir, bibleSha256, checkedFiles: [...files].sort(), issues, manifestStage: manifest.stage, blocker: manifest.blocker ?? null, products: packs.map((pack) => ({ tier: pack.productTier, organisation: pack.organisation.name, facts: pack.facts.length, findings: pack.findings.length, scenarios: pack.scenarios.length, movements: plans.find((plan) => plan.productTier === pack.productTier)?.movements.length ?? 0 })) };
await fs.writeFile(path.join(outputDir, 'v11-manuscript-gate-report.json'), `${JSON.stringify(report, null, 2)}\n`);
await fs.writeFile(path.join(outputDir, 'v11-manuscript-gate-report.md'), `# Reporting Bible v1.1 manuscript gate\n\nStatus: **${status}**\n\n- Canonical Bible SHA-256: \`${bibleSha256}\`\n- Manifest stage: \`${manifest.stage}\`\n- Final PDF generation: \`${manifest.finalPdfGeneration}\`\n- Issues: ${issues.length}\n\n${issues.length ? issues.map((issue) => `- ${issue}`).join('\n') : '- Fact Pack and Story Plan checks passed.'}\n`);
console.log(JSON.stringify(report, null, 2));
if (issues.length) process.exitCode = 1;
else if (manifest.blocker) process.exitCode = 2;
