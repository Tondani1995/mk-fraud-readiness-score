// Stage 3 and 4 of the Bible's method for the four fictional organisations: the Fact Pack, the Story Plan and the
// writer brief for each product, written to docs/readiness-review/report-excellence/<org>/.
//   node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/revised-reports/excellence-briefs.mjs
import fs from 'node:fs';
import path from 'node:path';
import { buildCorrected, GENERATED } from './pipeline.mjs';
import { buildRevisedFactPack } from '../../src/lib/reports/revised/manuscript/fact-pack.ts';
import { buildRevisedStoryPlan } from '../../src/lib/reports/revised/manuscript/story-plan.ts';
import { renderWriterBrief } from '../../src/lib/reports/revised/manuscript/writer-brief.ts';

export const EXCELLENCE_DIR = 'docs/readiness-review/report-excellence';
export async function factPacksFor(key) {
  const c = await buildCorrected(key);
  const out = {};
  for (const product of ['essential', 'comprehensive']) {
    const fp = buildRevisedFactPack({ report: c.report, product, organisationName: c.org.label, assessmentReference: c.reference, generatedAt: GENERATED, profile: c.staged.profile, position: c.position, figure: { overall: c.fixture.overall, areas: c.fixture.areas, label: c.fixture.label } });
    out[product] = { fp, plan: buildRevisedStoryPlan(fp) };
  }
  return { corrected: c, ...out };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  for (const key of ['P3', 'P4', 'P5', 'P6b']) {
    const r = await factPacksFor(key);
    const dir = path.join(EXCELLENCE_DIR, key);
    fs.mkdirSync(dir, { recursive: true });
    for (const product of ['essential', 'comprehensive']) {
      const { fp, plan } = r[product];
      fs.writeFileSync(path.join(dir, `${product}-fact-pack.json`), JSON.stringify(fp, null, 1) + '\n');
      fs.writeFileSync(path.join(dir, `${product}-story-plan.json`), JSON.stringify(plan, null, 1) + '\n');
      fs.writeFileSync(path.join(dir, `${product}-writer-brief.md`), renderWriterBrief(fp, plan));
      console.log(key, product, 'themes', fp.themes.length, 'findings', fp.findings.length, 'pathways', fp.pathways.map((p) => p.schemeId).join(','), 'priorities', fp.priorities.length, 'blueprints', fp.blueprints.length);
    }
  }
}
