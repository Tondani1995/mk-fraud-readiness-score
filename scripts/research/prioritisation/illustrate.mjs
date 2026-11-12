// Illustrates the prioritisation options in PRIORITISATION-METHODOLOGY-PROPOSAL.md and the candidate information-
// sufficiency rules in INFORMATION-SUFFICIENCY-AND-RELEASE.md on the four fictional organisations (and the mixed
// organisation with two declined questions). Nothing here is used by a report; it shows what each option would do.
//   node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/research/prioritisation/illustrate.mjs
import fs from 'node:fs';
import { buildCorrected } from '../../revised-reports/pipeline.mjs';
import { runJourney, makeClock, newStagedSession, runRespondent } from '../../lib/build16-driver.mjs';
import { familyFor } from '../../../src/lib/reports/revised/semantic-map.ts';

// Option B's candidate "direct loss" class: schemes whose pathway moves money, pay, cash or stock out of the
// organisation. A proposal for MK, built on the prototype's module-to-pathway grouping (itself unapproved, M-9).
const DIRECT_LOSS = new Set(['SUPPLIER_PAYMENT_DIVERSION', 'PAYROLL_MANIPULATION', 'CASH_CUSTODY_MISUSE', 'STOCK_ASSET_MISUSE', 'IDENTITY_IMPERSONATION']);
const out = {};
const cases = [['P3'], ['P4'], ['P5'], ['P6b'], ['P3-declined', 'P3'], ['P3-partial', 'P3']];
for (const [label, key] of cases.map(([l, k]) => [l, k ?? l])) {
  let n = 0;
  let live = label === 'P3-declined' ? runJourney('P3', { decline: (fn) => (fn === 'Finance' && n++ < 2 ? 'Handled by the group treasury, not by us' : null) }).live : null;
  if (label === 'P3-partial') { const clock = makeClock(); live = newStagedSession('Fictional Retail Group, interview part-way', clock); runRespondent(live, clock, 'P3', { maxScreens: 60 }); }
  const c = await buildCorrected(key, { live });
  const r = c.report;
  const prereqSchemes = new Set(r.controls.filter((x) => x.dependentRefs.length).flatMap((x) => x.schemeRefs));
  const pathway = (s) => familyFor(s.area, r.analysis.byId.get(s.confirmations[0]?.id)?.module?.id).pathways[0];
  const groups = { optionA: {}, optionB: { group1: [], group2: [], group3: [] } };
  for (const s of r.schemes) {
    if (['contradiction', 'dependency'].includes(s.kind) || (s.kind === 'gap' && prereqSchemes.has(s.ref))) groups.optionB.group1.push(s.ref);
    else if (s.kind === 'gap' && s.tier === 1 && s.confirmationGaps.every((v) => v.cls === 'absent') && DIRECT_LOSS.has(pathway(s))) groups.optionB.group1.push(s.ref);
    else if (s.kind === 'gap' && s.tier === 1) groups.optionB.group2.push(s.ref);
    else if (s.kind === 'gap') groups.optionB.group3.push(s.ref);
  }
  groups.optionA = { resolveFirst: r.schemes.filter((s) => ['contradiction', 'dependency'].includes(s.kind)).length, prerequisites: r.controls.filter((x) => x.dependentRefs.length).length, managementChoice: r.summary.byKind.gap };
  out[label] = {
    organisation: c.org.label + (label === 'P3-declined' ? ' (two questions declined by Finance)' : label === 'P3-partial' ? ' (interview stopped after 60 screens)' : ''),
    schemes: r.summary.applicable, gap: r.summary.byKind.gap, tier1Gap: r.summary.tier1Gap, unresolved: r.r1.unresolved,
    optionA: groups.optionA,
    optionB: { group1: groups.optionB.group1.length, group2: groups.optionB.group2.length, group3: groups.optionB.group3.length },
    sufficiency: { stages: r.sufficiency.stages, outstanding: r.sufficiency.outstanding, analytical: { ...r.sufficiency.analytical, perScheme: undefined }, release: r.sufficiency.release }
  };
  console.log(label, JSON.stringify(out[label].optionB), JSON.stringify(out[label].sufficiency.release));
}
fs.mkdirSync('docs/readiness-review/report-correction', { recursive: true });
fs.writeFileSync('docs/readiness-review/report-correction/prioritisation-and-sufficiency.json', JSON.stringify(out, null, 1) + '\n');
