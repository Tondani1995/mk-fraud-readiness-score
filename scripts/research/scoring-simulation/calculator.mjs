// HYPOTHETICAL RESEARCH ONLY. A simulation of scoring-frame Option A over a review-engine report: the applicable
// scenario-confirmation controls, each counted once. Every treatment, weight, threshold, cap and band below is a
// labelled hypothesis for MK's decision; none is a production value, and nothing under src imports this file.
import { BANK, COVERAGE, DOMAINS, HYPOTHETICAL, QI, SCENARIOS } from './lib.mjs';

const ROLE = COVERAGE.questionRole;
export const FRAME_IDS = Object.keys(ROLE).filter((id) => ROLE[id].role === 'confirm' && QI.get(id)?.type === 'practice' && !QI.get(id)?.retired);
const LEVEL_CLASS = { 0: 'absent', 1: 'partial', 2: 'partial', 3: 'partial', 4: 'full', 5: 'full' }; // the method's own levelClass (all 133 anchored)

// ------------------------------------------------------------------------------------------------ hypotheses
// Numeric treatments for answers that carry a class but no level. Intervals are on the 0 to 100 scale (level x 20).
export const CLASS_TREATMENTS = {
  exclude: { note: 'Class-only answers are kept out of the number and reported as a class profile beside it', values: null },
  interval: { note: 'The range the method itself implies: its levelClass puts full at levels 4 to 5 and partial at levels 1 to 3; designed is placed at levels 1 to 2 from the option labels (assumption H-D)', values: { full: [80, 100], partial: [20, 60], designed: [20, 40], absent: [0, 0] } },
  lower: { note: 'The lower end of the interval', values: { full: [80, 80], partial: [20, 20], designed: [20, 20], absent: [0, 0] } },
  midpoint: { note: 'The centre of the interval', values: { full: [90, 90], partial: [40, 40], designed: [30, 30], absent: [0, 0] } },
  labelEquivalent: { note: 'Each class read as the single 0 to 5 label its wording resembles (full as 4 "Consistently operating", partial as 3 "Implemented in key areas", designed as 2 "Partly designed"); shown to demonstrate the effect of a direct mapping, not proposed', values: { full: [80, 80], partial: [60, 60], designed: [40, 40], absent: [0, 0] } }
};
export const FRAMES = {
  A: { note: 'Option A: every applicable scenario-confirmation control', tiers: [1, 2, 3] },
  A1: { note: 'Option A restricted to tier 1 confirmations for the number; tier 2 and 3 confirmations reported beside it', tiers: [1] }
};
export const WEIGHTINGS = {
  equal: { note: 'Every applicable confirmation weighs the same', weight: () => 1 },
  tier: { note: 'Tier 1 = 3, tier 2 = 2, tier 3 = 1 (illustrative only)', weight: (c) => ({ 1: 3, 2: 2, 3: 1 })[c.tier] }
};
export const AGGREGATIONS = {
  equalDomains: 'Overall = the mean of the visible domain results, each domain equal',
  pooled: 'Overall = the mean over every scored confirmation, so domains with more applicable confirmations weigh more',
  none: 'No overall figure; the domain results and the scenario picture only'
};
export const FALSE_COMFORT = {
  F0: 'No treatment: a confirmation counts as reported',
  F1: 'Disclosure only: the confirmation is qualified in the report and the score is unchanged',
  F2: 'Ceiling: a contradicted confirmation counts no higher than partly in place (level 3, or the partial values)',
  F3: 'Blend: a contradicted confirmation counts as the mean of its own value and the mean of its answered follow-ups (still one control)',
  F4: 'Band limit: any contradicted tier 1 confirmation limits the band to Structured; the score is unchanged',
  F2F4: 'F2 and F4 together, with each contradiction disclosed (F1)'
};
// Visibility: the MFRS thresholds applied to the frame as a comparator, and a proposal that treats scope differently.
export const VISIBILITY_RULES = {
  mfrsComparator: { note: 'MFRS V1.2 rules on the frame: insufficient if coverage < 70%, unknown >= 30% or exclusions >= 40%; provisional if unknown >= 20%, any exclusion or coverage < 90% (coverage counts unknown answers as answered, as in MFRS)' },
  recommended: { note: 'Outstanding share = (unknown + not reached + applicability not known) / (applicable + applicability not known) over the frame in use. Insufficient at 15% or more; provisional when anything is outstanding. Exclusions by a recorded scope decision never reduce visibility. A domain figure is shown only with 3 or more scored confirmations' },
  proposed: { note: 'Coverage = known / applicable frame; tier 1 coverage tracked separately; exclusions by a recorded scope decision do not reduce visibility; pending applicability does. Insufficient if coverage < 70%, tier 1 coverage < 80%, unknown >= 30% or pending applicability >= 30%; provisional if coverage < 90%, tier 1 coverage < 100%, unknown >= 10% or pending applicability >= 10%. A domain is shown only with coverage >= 70% and at least one scored confirmation' }
};
export const BANDS = [[80, 'Strategic'], [60, 'Structured'], [40, 'Developing'], [0, 'Reactive']]; // existing 40/60/80 thresholds as a comparator
const BAND_ORDER = ['Reactive', 'Developing', 'Structured', 'Strategic'];
export const bandOf = (score) => (score === null || score === undefined ? null : BANDS.find(([min]) => score >= min - 1e-9)[1]);
const lowerBand = (a, b) => (BAND_ORDER.indexOf(a) <= BAND_ORDER.indexOf(b) ? a : b);
export const CAP_RULES = {
  K1: 'A tier 1 confirmation at level 0 or 1, or reported not in place: limit Developing',
  K2: 'A tier 1 confirmation at level 2, or reported partly in place or set out but not working: limit Structured',
  K3: 'Three or more tier 1 confirmations at level 2 or below, or reported as a gap: limit Developing',
  K4: 'A visible domain result below 40: limit Developing; below 60: limit Structured'
};

// ------------------------------------------------------------------------------------------------ helpers
const r1 = (x) => (x === null || x === undefined ? null : Math.round(x * 10) / 10);
const pct = (a, b) => (b > 0 ? r1((a / b) * 100) : null);
export function categoryOf(row) {
  switch (row.state) {
    case 'reported': return row.cls === 'na' ? 'na' : row.cls === 'noinstance' ? 'noinstance' : 'known';
    case 'na': return 'na';
    case 'reused': return 'known';
    case 'waiting': return 'unknown';
    case 'unconfirmed': return 'notReached';
    case 'scope-unconfirmed': case 'prerequisite': case 'waiting-scope': case 'assumed': return 'pending';
    case 'outofscope': case 'proportion': case 'precluded': case 'retired': return 'excluded';
    default: throw new Error(`unclassified state ${row.state} on ${row.id}`);
  }
}
const levelOf = (row) => (row.state === 'reported' && row.format === 'anchored' && /^[0-5]$/.test(String(row.answer?.v)) ? Number(row.answer.v) : null);
const classOfRow = (row) => { const l = levelOf(row); return l !== null ? LEVEL_CLASS[l] : row.cls; };
const isIssue = (row) => ['partial', 'designed', 'absent'].includes(classOfRow(row));
function valueOf(row, treatment) {
  const l = levelOf(row);
  if (l !== null) return { lo: l * 20, hi: l * 20, basis: 'level' };
  const t = CLASS_TREATMENTS[treatment].values;
  if (!t) return null;
  const v = t[row.cls];
  if (!v) throw new Error(`no value for class ${row.cls} on ${row.id}`);
  return { lo: v[0], hi: v[1], basis: 'class' };
}

// Contradictions: a confirmation reported in place (level 4 or 5, or the full class) while a follow-up of the same
// scenario is reported as a gap. The reverse (a confirmation reported as a gap while every answered follow-up is in
// place) is recorded too, as it can understate.
export function contradictionsOf(rowsById) {
  const out = [];
  for (const id of FRAME_IDS) {
    const c = rowsById.get(id);
    if (!c || !['reported', 'reused'].includes(c.state)) continue;
    const s = SCENARIOS.get(ROLE[id].scenario);
    const fus = (s.followups || []).map((f) => rowsById.get(f)).filter((r) => r && r.state === 'reported' && !['na', 'noinstance'].includes(r.cls));
    if (!fus.length) continue;
    const gaps = fus.filter(isIssue);
    if (classOfRow(c) === 'full' && gaps.length) out.push({ kind: 'in-place-confirmation-with-follow-up-gap', confirmation: id, scenario: s.id, tier: s.tier, domain: QI.get(id).domain, followUps: fus.map((f) => ({ id: f.id, cls: classOfRow(f) })), severity: gaps.some((g) => classOfRow(g) === 'absent') ? 'follow-up not in place' : 'follow-up partly in place or not yet working' });
    else if (isIssue(c) && fus.every((f) => classOfRow(f) === 'full')) out.push({ kind: 'gap-confirmation-with-follow-ups-in-place', confirmation: id, scenario: s.id, tier: s.tier, domain: QI.get(id).domain, followUps: fus.map((f) => ({ id: f.id, cls: classOfRow(f) })) });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ the simulation
export function simulate(report, params = {}) {
  const p = { frame: 'A', treatment: 'interval', weighting: 'equal', aggregation: 'equalDomains', falseComfort: 'F0', visibility: 'proposed', caps: 'all', bandBasis: 'point', overrides: null, ...params };
  const tiers = FRAMES[p.frame].tiers;
  // overrides: { id: 'unknown' } replaces a row's answer by an unknown for the denominator tests (no routing effect).
  const rows = report.domains.flatMap((d) => d.rows).map((r) => (p.overrides && p.overrides[r.id] === 'unknown' ? { ...r, state: 'waiting', cls: undefined, answer: undefined } : r));
  const rowsById = new Map(rows.map((r) => [r.id, r]));
  const contradictions = contradictionsOf(rowsById).filter((c) => tiers.includes(c.tier));
  const contradicted = new Map(contradictions.filter((c) => c.kind === 'in-place-confirmation-with-follow-up-gap').map((c) => [c.confirmation, c]));

  // Each frame control is taken from its own row, once, whatever number of scenarios name it (bank 1.3: one each).
  const controls = FRAME_IDS.filter((id) => tiers.includes(SCENARIOS.get(ROLE[id].scenario).tier)).map((id) => {
    const row = rowsById.get(id);
    const q = QI.get(id);
    const tier = SCENARIOS.get(ROLE[id].scenario).tier;
    const category = categoryOf(row);
    let value = category === 'known' ? valueOf(row, p.treatment) : null;
    const cls = category === 'known' ? classOfRow(row) : null;
    const fc = contradicted.get(id) || null;
    if (value && fc) {
      if (p.falseComfort === 'F2' || p.falseComfort === 'F2F4') {
        const cap = value.basis === 'level' ? 60 : CLASS_TREATMENTS[p.treatment].values.partial[1];
        const capLo = value.basis === 'level' ? 60 : CLASS_TREATMENTS[p.treatment].values.partial[0];
        value = { ...value, lo: Math.min(value.lo, capLo), hi: Math.min(value.hi, cap), adjusted: 'F2' };
      } else if (p.falseComfort === 'F3') {
        const fv = fc.followUps.map((f) => valueOf({ ...rowsById.get(f.id) }, p.treatment)).filter(Boolean);
        if (fv.length) {
          const mlo = fv.reduce((a, v) => a + v.lo, 0) / fv.length, mhi = fv.reduce((a, v) => a + v.hi, 0) / fv.length;
          value = { ...value, lo: (value.lo + mlo) / 2, hi: (value.hi + mhi) / 2, adjusted: 'F3' };
        }
      }
    }
    return { id, domain: q.domain, format: q.format, stage: q.stage, tier, scenario: ROLE[id].scenario, state: row.state, category, cls, level: levelOf(row), value, weight: WEIGHTINGS[p.weighting].weight({ tier }), contradicted: !!fc };
  });

  const count = (f) => controls.filter(f).length;
  const cat = (c) => count((x) => x.category === c);
  const applicable = cat('known') + cat('unknown') + cat('notReached');
  const population = {
    frameTotal: controls.length, applicable, known: cat('known'), knownScored: count((c) => c.value), knownClassOnly: count((c) => c.category === 'known' && !c.value),
    unknown: cat('unknown'), notReached: cat('notReached'), pendingApplicability: cat('pending'), excluded: cat('excluded'), na: cat('na'), noinstance: cat('noinstance'),
    excludedByState: controls.filter((c) => c.category === 'excluded').reduce((a, c) => ((a[c.state] = (a[c.state] || 0) + 1), a), {}),
    pendingByState: controls.filter((c) => c.category === 'pending').reduce((a, c) => ((a[c.state] = (a[c.state] || 0) + 1), a), {})
  };
  const t1 = controls.filter((c) => c.tier === 1);
  const t1Applicable = t1.filter((c) => ['known', 'unknown', 'notReached'].includes(c.category)).length;
  const metrics = {
    coveragePct: pct(population.known, applicable), unknownSharePct: pct(population.unknown, applicable), notReachedSharePct: pct(population.notReached, applicable),
    tier1Applicable: t1Applicable, tier1CoveragePct: pct(t1.filter((c) => c.category === 'known').length, t1Applicable),
    pendingSharePct: pct(population.pendingApplicability, applicable + population.pendingApplicability),
    exclusionSharePct: pct(population.excluded + population.na, controls.length),
    outstandingSharePct: pct(population.unknown + population.notReached + population.pendingApplicability, applicable + population.pendingApplicability),
    mfrsCoveragePct: pct(population.known + population.unknown, applicable)
  };

  // Domains.
  const mean = (list, k) => { const w = list.reduce((a, c) => a + c.weight, 0); return w ? list.reduce((a, c) => a + c.value[k] * c.weight, 0) / w : null; };
  const domains = DOMAINS.map((d) => {
    const mine = controls.filter((c) => c.domain === d.id);
    const app = mine.filter((c) => ['known', 'unknown', 'notReached'].includes(c.category));
    const scored = mine.filter((c) => c.value);
    const coverage = pct(mine.filter((c) => c.category === 'known').length, app.length);
    const lo = mean(scored, 'lo'), hi = mean(scored, 'hi');
    const visible = p.visibility === 'proposed' ? scored.length > 0 && coverage !== null && coverage >= 70 : p.visibility === 'recommended' ? scored.length >= 3 : scored.length > 0;
    return { id: d.id, name: d.name, frame: mine.length, applicable: app.length, known: mine.filter((c) => c.category === 'known').length, scored: scored.length, unknown: mine.filter((c) => c.category === 'unknown').length, notReached: mine.filter((c) => c.category === 'notReached').length, pending: mine.filter((c) => c.category === 'pending').length, excluded: mine.filter((c) => c.category === 'excluded').length, coveragePct: coverage, lo: r1(lo), hi: r1(hi), point: lo === null ? null : r1((lo + hi) / 2), visible };
  });

  // Overall.
  const scoredAll = controls.filter((c) => c.value);
  let lo = null, hi = null;
  if (p.aggregation === 'pooled') { lo = mean(scoredAll, 'lo'); hi = mean(scoredAll, 'hi'); }
  if (p.aggregation === 'equalDomains') { const vis = domains.filter((d) => d.visible); if (vis.length) { lo = vis.reduce((a, d) => a + d.lo, 0) / vis.length; hi = vis.reduce((a, d) => a + d.hi, 0) / vis.length; } }
  const overall = { lo: r1(lo), hi: r1(hi), point: lo === null ? null : r1((lo + hi) / 2) };

  // Visibility.
  const reasons = [];
  let status = 'NORMAL';
  const RANK = ['NORMAL', 'PROVISIONAL', 'INSUFFICIENT'];
  const raise = (to, why) => { reasons.push(`${to}: ${why}`); if (RANK.indexOf(to) > RANK.indexOf(status)) status = to; };
  if (p.visibility === 'mfrsComparator') {
    if (metrics.mfrsCoveragePct === null || metrics.mfrsCoveragePct < 70) raise('INSUFFICIENT', `answered coverage ${metrics.mfrsCoveragePct}% below 70%`);
    if (metrics.unknownSharePct >= 30) raise('INSUFFICIENT', `unknown ${metrics.unknownSharePct}% at or above 30%`);
    if (metrics.exclusionSharePct >= 40) raise('INSUFFICIENT', `exclusions ${metrics.exclusionSharePct}% at or above 40%`);
    if (metrics.unknownSharePct >= 20 && metrics.unknownSharePct < 30) raise('PROVISIONAL', `unknown ${metrics.unknownSharePct}%`);
    if (population.excluded + population.na > 0) raise('PROVISIONAL', `${population.excluded + population.na} confirmations excluded`);
    if (metrics.mfrsCoveragePct >= 70 && metrics.mfrsCoveragePct < 90) raise('PROVISIONAL', `answered coverage ${metrics.mfrsCoveragePct}%`);
  } else if (p.visibility === 'recommended') {
    if (metrics.outstandingSharePct === null) raise('INSUFFICIENT', 'nothing applicable in the frame');
    else if (metrics.outstandingSharePct >= 15) raise('INSUFFICIENT', `${metrics.outstandingSharePct}% of the frame outstanding (unknown ${population.unknown}, not reached ${population.notReached}, applicability not known ${population.pendingApplicability})`);
    else if (metrics.outstandingSharePct > 0) raise('PROVISIONAL', `${metrics.outstandingSharePct}% of the frame outstanding (unknown ${population.unknown}, not reached ${population.notReached}, applicability not known ${population.pendingApplicability})`);
  } else {
    if (metrics.coveragePct === null || metrics.coveragePct < 70) raise('INSUFFICIENT', `known coverage ${metrics.coveragePct}% below 70%`);
    else if (metrics.coveragePct < 90) raise('PROVISIONAL', `known coverage ${metrics.coveragePct}% below 90%`);
    if (metrics.tier1CoveragePct === null || metrics.tier1CoveragePct < 80) raise('INSUFFICIENT', `tier 1 coverage ${metrics.tier1CoveragePct}% below 80%`);
    else if (metrics.tier1CoveragePct < 100) raise('PROVISIONAL', `tier 1 coverage ${metrics.tier1CoveragePct}% below 100%`);
    if (metrics.unknownSharePct >= 30) raise('INSUFFICIENT', `unknown ${metrics.unknownSharePct}% at or above 30%`);
    else if (metrics.unknownSharePct >= 10) raise('PROVISIONAL', `unknown ${metrics.unknownSharePct}% at or above 10%`);
    if (metrics.pendingSharePct >= 30) raise('INSUFFICIENT', `applicability not yet known for ${metrics.pendingSharePct}%`);
    else if (metrics.pendingSharePct >= 10) raise('PROVISIONAL', `applicability not yet known for ${metrics.pendingSharePct}%`);
  }
  const withheld = status === 'INSUFFICIENT' || overall.point === null || p.aggregation === 'none';

  // Bands and caps.
  const capsHit = [];
  const capSet = p.caps === true || p.caps === 'all' ? 'all' : p.caps === false || p.caps === 'none' ? 'none' : p.caps;
  if (capSet !== 'none') {
    const t1Known = t1.filter((c) => c.category === 'known');
    const low = (c) => (c.level !== null ? c.level <= 1 : c.cls === 'absent');
    const mid = (c) => (c.level !== null ? c.level === 2 : ['partial', 'designed'].includes(c.cls));
    if (t1Known.some(low)) capsHit.push(['K1', 'Developing']);
    if (t1Known.some(mid)) capsHit.push(['K2', 'Structured']);
    if (t1Known.filter((c) => low(c) || mid(c)).length >= 3) capsHit.push(['K3', 'Developing']);
    const vis = domains.filter((d) => d.visible);
    if (capSet === 'all' && vis.some((d) => d.point < 40)) capsHit.push(['K4', 'Developing']); else if (capSet === 'all' && vis.some((d) => d.point < 60)) capsHit.push(['K4', 'Structured']);
  }
  if (['F4', 'F2F4'].includes(p.falseComfort) && contradictions.some((c) => c.kind === 'in-place-confirmation-with-follow-up-gap' && c.tier === 1)) capsHit.push(['F4', 'Structured']);
  const calculated = withheld ? null : bandOf(p.bandBasis === 'lower' ? overall.lo : overall.point);
  const capTo = capsHit.reduce((a, [, b]) => (a ? lowerBand(a, b) : b), null);
  const final = calculated && capTo ? lowerBand(calculated, capTo) : calculated;
  const band = { calculated, lo: withheld ? null : bandOf(overall.lo), hi: withheld ? null : bandOf(overall.hi), indeterminate: !withheld && bandOf(overall.lo) !== bandOf(overall.hi), caps: capsHit.map(([k, b]) => `${k}→${b}`), final, capLowered: !!(calculated && final !== calculated) };

  // Class profile over every known confirmation, whatever the format (anchored read through the method's levelClass).
  const known = controls.filter((c) => c.category === 'known');
  const classProfile = ['full', 'partial', 'designed', 'absent'].reduce((a, k) => ((a[k] = known.filter((c) => c.cls === k).length), a), {});

  // Scenario picture from the engine's own scenario statuses.
  const scen = report.scenarios.filter((s) => s.status !== 'outofscope');
  const scenarioPicture = { applicableOrPossible: scen.length, outOfScope: report.scenarios.length - scen.length, byStatus: scen.reduce((a, s) => ((a[s.status] = (a[s.status] || 0) + 1), a), {}), tier1: scen.filter((s) => s.tier === 1).reduce((a, s) => ((a[s.status] = (a[s.status] || 0) + 1), a), {}) };

  return {
    label: HYPOTHETICAL, params: p, population, metrics, domains,
    overall: { ...overall, withheld, shown: withheld ? null : overall.point }, band,
    visibility: { status, reasons }, classProfile, inPlaceSharePct: pct(classProfile.full, known.length),
    scenarioPicture, contradictions, controls
  };
}

export const frameSummary = () => ({ frame: FRAME_IDS.length, bank: BANK.bankVersion });
