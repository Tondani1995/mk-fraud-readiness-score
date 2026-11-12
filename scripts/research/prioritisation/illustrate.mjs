// Illustrates the proposed factor-based decision method (PRIORITISATION-METHODOLOGY-PROPOSAL.md, revision of 12
// November) and the candidate sufficiency verdicts on the four fictional organisations. Nothing here is used by a
// report: the reports state the facts and leave the order to management until MK approves a method.
//   node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/research/prioritisation/illustrate.mjs
import fs from 'node:fs';
import { buildCorrected } from '../../revised-reports/pipeline.mjs';
import { familyFor } from '../../../src/lib/reports/revised/semantic-map.ts';

// Factor F3, a candidate classification for MK: scenarios whose pathway can move money, pay, cash, stock or customer
// value out of the organisation. Built on the prototype's module-to-pathway grouping, which MK has not approved (M-9).
const DIRECT_LOSS = new Set(['SUPPLIER_PAYMENT_DIVERSION', 'PAYROLL_MANIPULATION', 'CASH_CUSTODY_MISUSE', 'STOCK_ASSET_MISUSE', 'IDENTITY_IMPERSONATION']);
const out = { method: 'Factor-based decision method, candidate 0.1 (not approved; not used by any report)', factors: {
  F1: 'Information state: answers to settle, questions to clarify or answers outstanding. A precondition, not a rank.',
  F2: 'Control position: the weakest control that stops the scenario, reported absent, set out but not yet operating, or partly in place.',
  F3: 'Loss pathway: whether the scenario can move money, pay, cash, stock or customer value out (candidate classification).',
  F4: 'Exposure presence: whether the activity exists at scale (scope answers and management knowledge; not computed here).',
  F5: 'Detective cover: whether a control that would detect a loss after the event is reported in place (needs a preventive or detective attribute on each control; not computed here).',
  F6: 'Breadth of effect: how many other open scenarios the same control serves.',
  F7: 'Management knowledge: incidents, losses, volumes and values known to management (supplied by management).'
}, organisations: {} };
const WEAK = { absent: 0, designed: 1, partial: 2 };
for (const key of ['P3', 'P4', 'P5', 'P6b']) {
  const c = await buildCorrected(key);
  const r = c.report;
  const pathway = (s) => familyFor(s.area, r.analysis.byId.get(s.confirmations[0]?.id)?.module?.id).pathways[0];
  const rows = r.schemes.filter((s) => ['gap', 'contradiction', 'dependency', 'clarify'].includes(s.kind)).map((s) => {
    const f = r.findings.find((x) => x.schemeRef === s.ref);
    const weakest = s.kind === 'gap' ? [...s.confirmationGaps].sort((a, b) => WEAK[a.cls] - WEAK[b.cls])[0].cls : null;
    const loss = DIRECT_LOSS.has(pathway(s));
    const settle = s.kind !== 'gap' || s.outstanding.length > 0;
    const group = s.kind !== 'gap' ? 'Establish the facts first'
      : (weakest !== 'partial' && loss) ? 'A' : (weakest !== 'partial' || loss) ? 'B' : 'C';
    return { ref: s.ref, name: s.name, tier: s.tier, F1: s.kind === 'gap' ? (s.outstanding.length ? `${s.outstanding.length} outstanding` : 'answered') : s.kind, F2: weakest, F3: loss ? 'direct loss (candidate)' : 'other', F6: f?.factors.controlsShared ?? 0, settleFirst: settle, group };
  });
  const tierOf = (g) => rows.filter((x) => x.group === g).reduce((m, x) => ({ ...m, [`tier ${x.tier}`]: (m[`tier ${x.tier}`] ?? 0) + 1 }), {});
  out.organisations[key] = {
    organisation: c.org.label,
    groups: Object.fromEntries(['Establish the facts first', 'A', 'B', 'C'].map((g) => [g, { count: rows.filter((x) => x.group === g).length, byTier: tierOf(g) }])),
    rows,
    sufficiency: { essential: r.sufficiency.release.essential, comprehensive: r.sufficiency.release.comprehensive }
  };
  console.log(key, JSON.stringify(Object.fromEntries(Object.entries(out.organisations[key].groups).map(([g, v]) => [g, v.count]))), 'E', r.sufficiency.release.essential.meets, 'C', r.sufficiency.release.comprehensive.meets);
}
fs.mkdirSync('docs/readiness-review/report-revision', { recursive: true });
fs.writeFileSync('docs/readiness-review/report-revision/prioritisation-illustration.json', JSON.stringify(out, null, 1) + '\n');
