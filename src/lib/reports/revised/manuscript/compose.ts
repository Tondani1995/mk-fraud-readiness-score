import { esc, mkLogo, mkPageRules, mkPublicationCss, MK_PUB, MK_PUBLICATION_VERSION } from '../../design/mk-publication';
import { parseManuscript, fillSlots, type ParsedSection } from './manuscript';
import type { RevisedFactPack, FindingFact } from './fact-pack';
import type { RevisedStoryPlan } from './story-plan';

/**
 * Report composer (Reporting Bible v1.1, section 3.5 and stage 10).
 *
 * FICTIONAL PROTOTYPE. Publishes the validated manuscript in the MK publication system. It paginates, applies MK
 * typography, inserts deterministic exhibits from the Fact Pack and places the prototype label. It writes no
 * analysis: every sentence of prose comes from the manuscript, and every exhibit value comes from the Fact Pack.
 */
export const REVISED_COMPOSER_VERSION = 'revised-composer-0.2';

const AREA_SHORT: Record<string, string> = { D1: 'Governance', D2: 'Risk assessment', D3: 'Ethics', D4: 'Third parties', D5: 'People and payroll', D6: 'Finance', D7: 'Customers', D8: 'Assets and stock', D9: 'Digital', D10: 'Detection' };
const KIND_TEXT: Record<string, string> = { contradiction: 'Answers that cannot both be right', dependency: 'A control lacking an input it needs', clarify: 'A question the answers leave open', gap: 'A core control reported as a gap', qualified: 'Core control in place; related practice weaker' };

/** Typographic finish: curly quotes and apostrophes. */
function typeset(s: string): string {
  return s.replace(/(^|[\s(\[])"/g, '$1“').replace(/"/g, '”').replace(/(^|[\s(\[])'/g, '$1‘').replace(/'/g, '’');
}
const prose = (text: string, fp: RevisedFactPack) => esc(typeset(fillSlots(text, fp).text));

export type PageMap = Record<string, number>;
export type ComposeInput = { md: string; fp: RevisedFactPack; plan: RevisedStoryPlan; pageMap?: PageMap; dateLabel: string; prototype: boolean;
  /** B5 restricted test: replaces the prototype notice on the cover, footer and back cover. Implies `prototype`. */
  restrictedNotice?: string;
  /** Sections that follow on from the previous page instead of starting a new one, because the previous section would otherwise end on a near-empty page. */
  flowSections?: string[];
  /** Headings that start a new page because the layout pass found them stranded at the foot of one: a section id, or `${sectionId}::${normalised unit heading}`. */
  breakBefore?: string[];
  /** Units that would start a new page by design (control blueprints) but follow on, because the previous page would otherwise be near empty. */
  flowUnits?: string[];
  /** Tighter contents rows, when the contents would otherwise run a few rows onto a near-empty page. */
  compactContents?: boolean };
export const layoutKey = (sectionId: string, unitHeading: string) => `${sectionId}::${unitHeading.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase()}`;

export function composeRevisedReportHtml(input: ComposeInput): { html: string; sections: { id: string; heading: string; units: string[] }[] } {
  const { fp, plan } = input;
  const parsed = parseManuscript(input.md);
  const product = fp.product;
  const titleOf = (id: string) => plan.sections.find((s) => s.id === id)?.title ?? '';
  const footerLeft = `Confidential${input.restrictedNotice ? '  ·  RESTRICTED TEST, not for customer release' : input.prototype ? '  ·  Fictional prototype for MK review, not a customer report' : `  ·  Prepared for ${fp.organisation.name}`}`;
  void titleOf;
  const css = mkPublicationCss() + mkPageRules({ footerLeft, runningTitle: product === 'essential' ? 'Fraud Readiness Report' : 'Strategy and Control Blueprint' });

  const body: string[] = [cover(input)];
  const outline: { id: string; heading: string; units: string[] }[] = [];
  for (const s of parsed.sections) {
    const ps = plan.sections.find((x) => x.id === s.id);
    outline.push({ id: s.id, heading: fillSlots(s.heading, fp).text, units: s.blocks.filter((b) => b.type === 'h2').map((b) => fillSlots(b.text, fp).text) });
    body.push(sectionHtml(s, ps?.units ?? [], input, (ps?.newPage !== false && !(input.flowSections ?? []).includes(s.id)) || (input.breakBefore ?? []).includes(s.id), parsed.sections, outline));
  }
  body.push(backCover(input));
  const html = `<!doctype html><html lang="en-ZA"><head><meta charset="utf-8"><title>${esc(product === 'essential' ? 'Fraud Readiness Report' : 'Fraud Readiness Strategy and Control Blueprint')}: ${esc(fp.organisation.name)}</title>
<meta name="generator" content="${REVISED_COMPOSER_VERSION}; ${MK_PUBLICATION_VERSION}"><meta name="author" content="MK Fraud Insights"><style>${css}</style></head><body>${body.join('\n')}</body></html>`;
  return { html, sections: outline };
}

function cover(input: ComposeInput): string {
  const { fp } = input;
  const essential = fp.product === 'essential';
  return `<section class="cover"><div class="inner">
<div class="brand">${mkLogo('reversed', 27)}</div>
<div class="kicker">${essential ? 'Fraud Readiness · Essential' : 'Fraud Readiness · Comprehensive'}</div>
<h1 class="title">${essential ? 'Fraud Readiness Report' : 'Fraud Readiness Strategy and Control Blueprint'}</h1>
<div class="org">${esc(fp.organisation.name)}</div>
<div class="meta">Assessment reference ${esc(fp.organisation.reference)}<br>${esc(input.dateLabel)}<br>Confidential. Prepared for the management of ${esc(fp.organisation.name)}.</div>
${input.restrictedNotice ? `<div class="proto">${esc(input.restrictedNotice)}</div>` : input.prototype ? `<div class="proto">Fictional prototype for MK review. The organisation is fictional, calculated figures are labelled test results, and this is not a customer report or a certified paid report.</div>` : ''}
<div class="foot"><span>Independent specialist fraud risk advisory · South Africa</span><span>mkfraud.co.za</span></div>
</div></section>`;
}

function backCover(input: ComposeInput): string {
  return `<section class="cover back"><div class="inner">
<div class="brand">${mkLogo('reversed', 24)}</div>
<div class="closing">Fraud strategy, readiness and operational resilience.</div>
<div class="contact">info@mkfraud.co.za<br>www.mkfraud.co.za</div>
<div class="legal">This report was prepared for the management of ${esc(input.fp.organisation.name)} on the basis of the organisation's own answers to the MK Fraud Readiness assessment. It is confidential to the organisation. MK Fraud Insights is a trading name of Stonda (Pty) Ltd.${input.restrictedNotice ? ' Restricted test; not for customer release.' : input.prototype ? ' Fictional prototype for MK review; not a customer report.' : ''}</div>
<div class="foot"><span>Independent specialist fraud risk advisory · South Africa</span><span>mkfraud.co.za</span></div>
</div></section>`;
}

function sectionHtml(s: ParsedSection, units: { id: string; ref: string; exhibit?: string }[], input: ComposeInput, newPage: boolean, all: ParsedSection[], outline: { id: string; heading: string; units: string[] }[]): string {
  const { fp, plan } = input;
  const ps = plan.sections.find((x) => x.id === s.id);
  const out: string[] = [`<section class="section ${newPage ? 'newpage' : 'flow'}" id="${esc(s.id)}">`, `<div class="keep"><div class="eyebrow">${esc(ps?.title ?? '')}</div>`, `<h1>${prose(s.heading, fp)}</h1>`];
  let headOpen = true;
  let unitIndex = -1;
  let firstPara = true;
  for (let i = 0; i < s.blocks.length; i++) {
    const b = s.blocks[i];
    if (b.type === 'h2') {
      if (headOpen) { out.push('</div>'); headOpen = false; }
      unitIndex++;
      const u = units[unitIndex];
      const label = u ? unitLabel(u.ref, fp) : '';
      const next = s.blocks[i + 1];
      const lead = next && next.type === 'p' ? `<p>${prose(next.text, fp)}</p>` : '';
      const key = layoutKey(s.id, fillSlots(b.text, fp).text);
      const pageStart = (/TARGET$/.test(s.id) && unitIndex > 0 && !(input.flowUnits ?? []).includes(key)) || (input.breakBefore ?? []).includes(key);
      out.push(`<div class="keep${pageStart ? ' page-start' : ''}">${label ? `<div class="unit-label">${esc(label)}</div>` : ''}<h2>${prose(b.text, fp)}</h2>${lead}</div>`);
      if (lead) i++;
      continue;
    }
    if (b.type === 'h3') { out.push(`<h3>${prose(b.text, fp)}</h3>`); continue; }
    if (b.type === 'exhibit') { if (headOpen) { out.push('</div>'); headOpen = false; } out.push(exhibit(b.text, input, all, outline)); continue; }
    const nextB = s.blocks[i + 1];
    if (!headOpen && nextB && nextB.type === 'exhibit' && /^(finding|pathway|blueprint):/.test(nextB.text)) {
      // A unit's fact strip, panel or specification stays with the paragraph before it, never alone on a page.
      out.push(`<div class="keep"><p>${prose(b.text, fp)}</p>${exhibit(nextB.text, input, all, outline)}</div>`);
      i++; firstPara = false; continue;
    }
    out.push(`<p${firstPara && /EXEC$/.test(s.id) ? ' class="lead"' : ''}>${prose(b.text, fp)}</p>`);
    if (headOpen) { out.push('</div>'); headOpen = false; }
    firstPara = false;
  }
  if (headOpen) out.push('</div>');
  out.push('</section>');
  return out.join('\n');
}

function unitLabel(ref: string, fp: RevisedFactPack): string {
  if (ref.startsWith('THEME')) { const t = fp.themes.find((x) => x.ref === ref); return t ? (t.areas.length > 3 ? 'Across the organisation' : t.areas.map((a) => a).join(' · ')) : ''; }
  if (ref.startsWith('FINDING')) { const f = fp.findings.find((x) => x.ref === ref); return f ? f.areaName : ''; }
  if (ref.startsWith('PATHWAY')) { const p = fp.pathways.find((x) => x.ref === ref); const f = p && fp.findings.find((x) => x.ref === p.findingRef); return f ? `Fraud pathway · ${f.areaName}` : 'Fraud pathway'; }
  if (ref.startsWith('BLUEPRINT')) { const b = fp.blueprints.find((x) => x.ref === ref); return b ? `Control blueprint · ${b.purpose === 'put-in-place' ? 'to put in place' : 'to strengthen'}` : ''; }
  if (ref.startsWith('DECISION')) return 'Leadership decision';
  return '';
}

function exhibit(name: string, input: ComposeInput, all: ParsedSection[], outline: { id: string; heading: string; units: string[] }[]): string {
  const { fp } = input;
  const [kind, ref] = name.split(':');
  switch (kind) {
    case 'contents': return contents(input, all);
    case 'position': return position(fp);
    case 'profile': return profile(fp);
    case 'finding': return findingStrip(fp, ref);
    case 'pathway': return pathwayPanel(fp, ref);
    case 'priorities': return priorities(fp);
    case 'roadmap-90':
    case 'roadmap-12': return stages(fp);
    case 'theme-map': return themeMap(fp);
    case 'blueprint': return blueprintSpec(fp, ref);
    case 'operating-model': return operatingModel(fp);
    case 'decision': return decisionOptions(fp, ref);
    case 'scorecard': return scorecard(fp);
    case 'method-status': return methodStatus(input);
    default: void outline; return '';
  }
}

function contents(input: ComposeInput, all: ParsedSection[]): string {
  const { fp, plan, pageMap } = input;
  const rows: string[] = [];
  for (const s of all) {
    if (/ORIENT$/.test(s.id)) continue;
    const ps = plan.sections.find((x) => x.id === s.id);
    rows.push(`<div class="row"><span class="m">${esc(ps?.title ?? '')}</span><span class="t">${prose(s.heading, fp)}</span><span class="n">${pageMap?.[s.id] ?? ''}</span></div>`);
    if (/FINDINGS$/.test(s.id)) {
      for (const h of s.blocks.filter((b) => b.type === 'h2')) rows.push(`<div class="sub"><span class="t">${prose(h.text, fp)}</span><span class="n">${pageMap?.[`${s.id}::${fillSlots(h.text, fp).text}`] ?? ''}</span></div>`);
    }
  }
  return `<div class="contents${input.compactContents ? ' compact' : ''}">${rows.join('')}</div>`;
}

function position(fp: RevisedFactPack): string {
  // The four statements MK set (12 November): labels and order fixed. The calculated result carries a visible fixture
  // tag; the explanatory copy is written as a released report would read, and method status sits in the notice.
  const text: Record<string, (p: { value: string; text: string }) => string> = {
    // When no score is issued (the revised method is unapproved), the cell states exactly that and nothing implies a
    // calculated result exists.
    calculated: (p) => (/not (issued|calculated)/i.test(p.value) ? p.text : 'The arithmetic result of the answers under the method\'s scoring frame, shown for traceability. It carries no band.'),
    inconsistencies: (p) => p.text,
    interpretation: () => {
      // Same counts, same framing as the executive summary: held, open to settle, outstanding and gap add up to the total.
      const n = (r: string) => Number(fp.facts[r]?.value ?? 0);
      const held = n('N-REPORTED-HELD'), apply = n('N-APPLY'), settle = n('N-SETTLE'), outs = n('N-OUTSTANDING-SCHEMES'), gap = n('N-GAP');
      return `On its own answers, the organisation reports the core control in place for ${held} of the ${apply} fraud scenarios that apply${settle ? `; ${settle} more have answers to settle or clarify` : ''}${outs ? `; ${outs} cannot yet be read because answers are outstanding` : ''}; and ${gap} ${gap === 1 ? 'has' : 'have'} a core control reported as a gap.`;
    },
    conclusion: () => 'MK states its readiness conclusion here under its approved readiness method. Until then the report sets out what the answers establish.'
  };
  const keys = ['calculated', 'inconsistencies', 'interpretation', 'conclusion'];
  const cells = fp.position.map((p, i) => {
    const key = keys[i];
    const fixture = key === 'calculated' && /test fixture/i.test(p.value);
    const value = fixture ? p.value.replace(/,\s*test fixture$/i, '') : p.value;
    return `<div class="cell${i === 3 ? ' pending' : ''}"><div class="label">${esc(p.label)}</div><div class="v">${esc(value)}${fixture ? ' <span class="tag">Test fixture</span>' : ''}</div><div class="x">${esc(typeset(text[key] ? text[key](p) : p.text))}</div></div>`;
  }).join('');
  const scored = !/not (issued|calculated)/i.test(fp.position[0]?.value ?? '');
  const caption = scored
    ? 'The four statements are kept separate: the calculated result is arithmetic, the inconsistencies and the interpretation come from the organisation\'s own answers, and the readiness conclusion is MK\'s.'
    : 'The four statements are kept separate: no score is issued, the inconsistencies and the interpretation come from the organisation\'s own answers, and the readiness conclusion is MK\'s.';
  return `<div class="exhibit"><div class="exhibit-title">What the assessment establishes</div><div class="position">${cells}</div><div class="caption">${caption}</div></div>`;
}

/** Composer-rendered, never manuscript prose: what a released report adds that this prototype edition does not. */
function methodStatus(input: ComposeInput): string {
  if (!input.prototype) return '';
  const rows: [string, string, string][] = [
    ['Readiness conclusion', 'Issued under MK\'s approved readiness method, with the score and level that method defines.', ((input.fp as any).facts?.['FIX-SCORE'] ? 'Calculated result shown as a labelled test fixture; no level or band issued (decision D-1).' : 'No score is calculated: the revised scoring method awaits MK approval, so no score, level or band is issued (decisions D-1, MD-1 to MD-16).')],
    ['Order of work', 'Set by MK\'s approved decision method.', 'Ordered by the explicit factors stated in the report, a candidate method (decision D-3).'],
    ['Control specifications, pathways and decision options', 'MK-approved advisory content.', 'Draft content from MK\'s control-content library, scenario structures and decision options (decision D-5).'],
    ['Manuscript', 'Written by the production AI writer from this fact pack, then validated.', 'Written in-session under the same writer contract and validated by the same checks; the production AI run is a blocked acceptance test.']
  ];
  return `<div class="notice"><div class="notice-title">Prototype notice: what a released report adds</div><table><thead><tr><th>Element</th><th>In a released report</th><th>In this edition</th></tr></thead><tbody>${rows.map((r) => `<tr><td class="strong">${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join('')}</tbody></table></div>`;
}

function profile(fp: RevisedFactPack): string {
  const max = Math.max(...fp.areas.map((a) => a.apply + a.notExpected + (a.pending ?? 0)), 1);
  // No area figure exists when no score is issued: the column and its caption sentence are then left out entirely.
  const figures = fp.areas.some((a) => a.figure !== null);
  const rows = fp.areas.map((a) => {
    const w = (n: number) => `${((n / max) * 100).toFixed(2)}%`;
    const seg = (cls: string, n: number) => (n > 0 ? `<span class="${cls}" style="width:${w(n)}"></span>` : '');
    const held = a.confirmed + a.qualified;
    return `<tr><td class="strong" style="width:52mm">${esc(a.name)}</td><td style="width:70mm"><div class="bar">${seg('seg-held', a.confirmed)}${seg('seg-qual', a.qualified)}${seg('seg-open', a.unresolved)}${seg('seg-gap', a.gap)}${seg('seg-out', a.outstanding)}${seg('seg-pend', a.pending ?? 0)}</div></td><td class="num" style="width:24mm">${held} of ${a.apply}</td>${figures ? `<td class="num muted" style="width:18mm">${a.figure === null ? '' : a.figure.toFixed(1)}</td>` : ''}</tr>`;
  }).join('');
  return `<div class="exhibit"><div class="exhibit-title">Readiness profile: fraud scenarios by area</div>
<table class="profile"><thead><tr><th>Area</th><th>Scenarios that apply</th><th class="num">Core controls in place</th>${figures ? '<th class="num">Test figure</th>' : ''}</tr></thead><tbody>${rows}</tbody></table>
<div class="legend"><span><i class="seg-held"></i>Core controls reported in place</span><span><i class="seg-qual"></i>In place, related practice weaker</span><span><i class="seg-open"></i>Answers to settle or clarify</span><span><i class="seg-gap"></i>Core control reported as a gap</span>${fp.areas.some((a) => a.outstanding) ? '<span><i class="seg-out"></i>Answers outstanding</span>' : ''}${fp.areas.some((a) => a.pending) ? '<span><i class="seg-pend"></i>Not yet established (outside the count)</span>' : ''}</div>
<div class="caption">Each bar shows the fraud scenarios in the method that apply to the organisation in that area, by what its answers report about the controls that stop them. Areas appear in the method's order.${fp.areas.some((a) => a.pending) ? ' A scenario whose applicability depends on an outstanding answer, or that was not reached, is shown outside the count: it is not treated as applying, in place or missing.' : ''}${figures ? ' Test figures are the calculated result for each area, shown for traceability; they are not scores and carry no band.' : ''}</div></div>`;
}

function stageFor(fp: RevisedFactPack, f: FindingFact): string {
  const p = fp.priorities.find((x) => x.findingRefs.includes(f.ref));
  if (p) return p.stage.replace(/, proposed$/, '') + ' (proposed)';
  // Essential is PDF-only (product contract): nothing points at a workbook the customer does not receive.
  return fp.product === 'essential' ? 'After the first responses' : 'In the twelve-month programme';
}

function findingStrip(fp: RevisedFactPack, ref: string): string {
  const f = fp.findings.find((x) => x.ref === ref);
  if (!f) return '';
  const core = f.reported.length === 1 ? `${f.reported[0].key}: ${f.reported[0].state.toLowerCase()}` : f.reported.map((c) => `${c.key}: ${c.state.toLowerCase()}`).join('; ');
  return `<div class="strip"><div><div class="label">Position</div><div class="v">${esc(KIND_TEXT[f.kind] ?? f.kind)}</div></div><div><div class="label">Core control</div><div class="v">${esc(core)}</div></div><div><div class="label">Owner</div><div class="v">${esc(f.ownerRole)}</div></div><div><div class="label">First response</div><div class="v">${esc(stageFor(fp, f))}</div></div></div>`;
}

function pathwayPanel(fp: RevisedFactPack, ref: string): string {
  const p = fp.pathways.find((x) => x.ref === ref);
  if (!p) return '';
  const s = p.structure;
  return `<div class="panel"><div><div class="label">Warning signs</div><ul class="plain">${s.warningIndicators.map((w) => `<li>${esc(typeset(w))}</li>`).join('')}</ul></div><div><div class="label">First response</div><p>${esc(typeset(s.containment))}</p><div class="label">Lasting control</div><p>${esc(typeset(s.longTerm))}</p></div></div>`;
}

function priorities(fp: RevisedFactPack): string {
  const rows = fp.priorities.map((p) => `<tr><td class="strong" style="width:40mm">${esc(p.title)}</td><td style="width:27mm">${esc(p.accountable)}</td><td style="width:27mm">${esc(p.practicalOwner)}</td><td style="width:20mm">${esc(p.stage.replace(/, proposed$/, ''))}</td><td>${esc(typeset(p.measure))}</td></tr>`).join('');
  return `<div class="exhibit flowing"><div class="exhibit-title">First responses</div><table><thead><tr><th>Response</th><th>Accountable executive</th><th>Practical owner</th><th>Proposed stage</th><th>Success measure</th></tr></thead><tbody>${rows}</tbody></table><div class="caption">Responses are listed in the order the work should start, which is not a ranking of fraud risk. Stages are proposals for management's own plan, not deadlines.${fp.product === 'essential' ? '' : ' Full specifications, records and failure responses are in the supporting workbook.'}</div></div>`;
}

function stages(fp: RevisedFactPack): string {
  const n = fp.roadmap.length;
  const cols = fp.roadmap.map((s) => {
    const k = fp.product === 'essential' ? s.label.replace(/, proposed$/, '') : s.label;
    const w = fp.product === 'essential' ? 'Proposed stage' : s.window;
    return `<div class="stage"><div class="k">${esc(k)}</div><div class="w">${esc(w)}</div><div class="p">${esc(typeset(s.purpose))}</div><ul class="plain">${s.outcomes.slice(0, 6).map((o) => `<li>${esc(typeset(o))}</li>`).join('')}</ul><div class="o"><span class="label" style="display:block">Owners</span>${esc(s.owners.length > 5 ? 'Every area owner, coordinated by the fraud risk lead and reporting to the chief executive' : s.owners.join(', '))}</div></div>`;
  }).join('');
  return `<div class="exhibit"><div class="exhibit-title">${fp.product === 'essential' ? 'The first ninety days, in proposed stages' : 'The twelve-month programme, in proposed stages'}</div><div class="stages n${n}">${cols}</div><div class="caption">Windows are proposals for management's own plan. They are not deadlines, contractual dates or estimates of how long any control takes to design, put in place or show to be working.${fp.product === 'essential' ? '' : ' Every action, with its deliverable and completion test, is in the supporting workbook.'}</div></div>`;
}

function themeMap(fp: RevisedFactPack): string {
  const areas = fp.areas.filter((a) => a.apply > 0);
  const w = Math.floor(118 / Math.max(fp.themes.length, 1));
  const head = fp.themes.map((t) => `<th class="rot" style="width:${w}mm">${esc(t.title)}</th>`).join('');
  const rows = areas.map((a) => `<tr><td class="strong">${esc(a.name)}</td>${fp.themes.map((t) => `<td class="dot">${t.areas.includes(a.name) ? '<span></span>' : ''}</td>`).join('')}</tr>`).join('');
  void AREA_SHORT;
  return `<div class="exhibit"><div class="exhibit-title">Where each theme appears</div><table class="tmap"><thead><tr><th>Area</th>${head}</tr></thead><tbody>${rows}</tbody></table><div class="caption">A mark shows an area in which the answers contribute to the theme.</div></div>`;
}

function blueprintSpec(fp: RevisedFactPack, ref: string): string {
  const b = fp.blueprints.find((x) => x.ref === ref);
  if (!b) return '';
  const cell = (label: string, v: string, wide = false) => `<div${wide ? ' class="wide"' : ''}><div class="label">${esc(label)}</div><div class="v">${esc(typeset(v))}</div></div>`;
  return `<div class="spec">${cell('Fraud scenario it addresses', b.objective, true)}${cell('Accountable executive', b.accountable)}${cell('Process owner', b.processOwner)}${cell('Population', b.population)}${cell('Frequency', b.frequency)}${cell('Service level (proposed)', b.sla)}${cell('Independent check', b.independentCheck)}${cell('Record kept', b.record, true)}${cell('Effectiveness measure', b.measure, true)}${cell('Escalation', b.escalation, true)}${cell('Failure response', b.onFailure, true)}${b.connected.length ? cell('Connected controls', b.connected.join('; '), true) : ''}</div>`;
}

function operatingModel(fp: RevisedFactPack): string {
  const tier = (r: { role: string; responsibility: string; basis: string }, top = false, label = '') => `<div class="tier${top ? ' top' : ''}"><div class="who">${label ? `<div class="label">${esc(label)}</div>` : ''}${esc(r.role)}</div><div class="what">${esc(typeset(r.responsibility))}<div class="basis">${esc(typeset(r.basis))}</div></div></div>`;
  const R = (ref: string) => fp.operatingModel.find((x) => x.ref === ref)!;
  return `<div class="exhibit"><div class="exhibit-title">Target fraud-risk operating model</div><div class="om">
${tier(R('ROLE-OVERSIGHT'), true, 'Oversight')}
<div class="flow">Status and escalations reported upward · direction and decisions downward</div>
${tier(R('ROLE-EXECUTIVE'), false, 'Executive accountability')}
${tier(R('ROLE-RISK'), false, 'Coordination and challenge')}
${tier(R('ROLE-OWNERS'), false, 'Control ownership')}
${tier(R('ROLE-DETECT'), false, 'Detection and investigation')}
</div><div class="caption">Roles are named by function, not by person; the assessment does not identify individuals. The chief executive's coordinating role and the fraud risk lead's challenge role are the method's owners for governance and risk assessment.</div></div>`;
}

function decisionOptions(fp: RevisedFactPack, ref: string): string {
  const d = fp.decisions.find((x) => x.ref === ref);
  if (!d || !d.options) return '';
  const rec = d.options.recommended;
  const rows = d.options.options.map((o) => `<tr><td class="strong${rec.startsWith(o.label) ? ' rec' : ''}" style="width:34mm">${esc(o.label)}</td><td>${esc(typeset(o.description))}</td><td style="width:24mm">${esc(o.effort)}</td><td style="width:32mm">${esc(typeset(o.benefit))}</td><td style="width:32mm">${esc(typeset(o.tradeOff))}</td></tr>`).join('');
  return `<div class="exhibit options flowing"><table><thead><tr><th>Option</th><th>What it involves</th><th>Effort</th><th>Benefit</th><th>Trade-off</th></tr></thead><tbody>${rows}</tbody></table><div class="route"><div class="label">MK's recommended route</div>${esc(typeset(rec))} ${esc(typeset(d.options.rationale))}<div style="margin-top:2mm;color:${MK_PUB.slate};font-size:7.6pt">Decision owner: ${esc(d.owner)}. When: ${esc(typeset(d.when))} If delayed: ${esc(typeset(d.delay))}</div></div></div>`;
}

function scorecard(fp: RevisedFactPack): string {
  const rows = fp.scorecard.map((m) => `<tr><td class="strong">${esc(typeset(m.measure))}</td><td style="width:30mm">${esc(m.owner)}</td><td style="width:26mm">${esc(m.frequency)}</td><td style="width:52mm">${esc(typeset(m.escalation))}</td></tr>`).join('');
  return `<div class="exhibit flowing"><div class="exhibit-title">Management fraud-readiness scorecard</div><table><thead><tr><th>Measure</th><th>Owner</th><th>Frequency</th><th>Escalation threshold</th></tr></thead><tbody>${rows}</tbody></table><div class="caption">Control measures describe what each control's records should show for a period once it operates; programme measures track the response itself. None is reported as met today.</div></div>`;
}
