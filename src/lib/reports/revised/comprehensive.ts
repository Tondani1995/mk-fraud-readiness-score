import { renderComprehensiveManagementReportHtml } from '@/lib/reports/comprehensive/render-comprehensive-html';
import { AREA_SHORT, KIND_LABEL, PHASES, PURPOSE_LABEL, concentration, joinList, type RevisedReport, type SchemeView } from './evidence-model';
import { CONTENT_GAP_TEXT, controlName } from './answer-text';
import { RELATION_LABEL } from './relationships';

/**
 * FICTIONAL INTEGRATION PROTOTYPE. The Comprehensive report from the revised report model.
 *
 * Structure kept from the existing Comprehensive: cover, contents and basis, nine numbered management sections in the
 * same order and with the same titles, and lettered analytical registers (A to F as before, with G to I added for
 * answer relationships, outstanding information and roles). The visual system is the existing renderer's own style
 * sheet, taken from its output so the two cannot drift.
 *
 * Why not the existing renderer itself: its management sections are count tables whose interpretation is written by
 * the AI manuscript stage, which this prototype does not run, and its inputs carry the tier-derived periods and
 * difficulty MK has asked to remove. Here the management sections state the analysis in full, in fixed-rule prose,
 * and every register row is printed in full (sections flow across pages; nothing is clipped).
 *
 * R-3 (prototype convention): the management sections are concise and decision-oriented; each control is described
 * once, in Appendix C, and referred to elsewhere by name and reference; role labels are consolidated (Appendix I);
 * every register is complete in the appendices and in the supporting workbook, and a reconciliation checks that no
 * row is omitted from either.
 */

const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const lc = (s: string) => (s && !/^[A-Z]{2,}|^I\b/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const ul = (xs: string[]) => (xs.length ? `<ul>${xs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<span class="muted">None</span>');

let STYLE_CACHE: string | null = null;
/** The existing Comprehensive style sheet, read from the existing renderer's own output. */
export function existingComprehensiveStyles(): string {
  if (STYLE_CACHE) return STYLE_CACHE;
  const empty = {
    narrativeMode: 'REMEDIATION',
    core: { governanceRoles: [], managementThemes: [], exposureThemes: [], controlProgrammes: [], decisionAgenda: [], implementationPhases: [] },
    registers: { findings: [], risks: [], controls: [], evidence: [], actions: [], measures: [], scenarios: [], assuranceCoverage: [], assurancePriorities: [], resilienceTests: [] }
  };
  const html = renderComprehensiveManagementReportHtml({ model: empty as never, organisationName: '', assessmentReference: '', score: 0, maturity: '', domains: [] });
  STYLE_CACHE = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
  return STYLE_CACHE;
}
const EXTRA_STYLES = `
.proto{background:#7a1f1f;color:#fff;font:600 7pt/1.4 sans-serif;padding:1.2mm 3mm;text-align:center;margin-bottom:4mm;letter-spacing:.02em}
.page--navy .proto{margin:-10mm -6mm 8mm}
.gapkey{display:inline-block;font-size:6pt;font-weight:700;padding:.3mm 1mm;border:1px solid var(--rule);border-radius:.8mm;margin-right:.8mm;color:var(--muted)}
.kind{display:inline-block;font-size:6.2pt;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:.6mm 1.4mm;border-radius:1mm;white-space:nowrap}
.kind.res{background:#FBEDED;color:var(--weak)}.kind.gap{background:var(--brass-soft);color:#7a6011}.kind.qual{background:var(--rule-soft);color:var(--navy-700)}
.card{border-top:2px solid var(--navy-900);padding-top:2.5mm;margin-top:4mm;page-break-inside:avoid}
.card .meta{font-size:6.8pt;letter-spacing:.08em;text-transform:uppercase;color:var(--brass);font-weight:700}
.card dl{display:grid;grid-template-columns:34mm 1fr;gap:1.4mm 4mm;margin-top:2mm;font-size:8.2pt}
.card dt{font-size:6.6pt;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700;padding-top:.4mm}
.small{font-size:7.6pt}
.fixture{font-size:7.4pt;color:var(--muted);border-left:3px solid var(--weak);padding:2mm 3mm;margin-top:3mm;background:#FBF6F6}
`;

const GAP_CODE = { 'no-level-descriptions': 'L', 'no-records-named': 'R', 'no-operating-cycle': 'C', 'no-improving-level': 'I' } as const;
/** Reviewed rationales cite method question codes; in the report each code reads as the control's name. */
const named = (text: string) => text.replace(/\b(D\d{1,2}-[A-Z]{1,2}-\d{2})\b/g, (_m, id: string) => controlName(id));
const KIND_CLASS: Record<string, string> = { contradiction: 'res', dependency: 'res', gap: 'gap', qualified: 'qual' };

export function buildRevisedComprehensive(input: {
  report: RevisedReport;
  /** The prototype label printed at the top of every section, in the flow of the page so it never covers content. */
  banner: string;
  organisationName: string;
  assessmentReference: string;
  figure: { score: number | null; band: string | null; areas: { area: string; name: string; value: number | null }[]; label: string };
}) {
  const { report: r, figure } = input;
  const S = r.schemes;
  const k = r.summary.byKind;
  const unresolved = S.filter((s) => s.kind === 'contradiction' || s.kind === 'dependency');
  const gapSchemes = S.filter((s) => s.kind === 'gap');
  const qualified = S.filter((s) => s.kind === 'qualified');
  const findingOf = (s: SchemeView) => r.findings.find((f) => f.schemeRef === s.ref);
  const pages: string[] = [];
  const sections: [string, string][] = [];
  const appendices: [string, string, number][] = [];
  const figureText = figure.score === null ? 'No calculated figure.' : `Calculated figure ${figure.score.toFixed(1)} / 100 (${figure.band}). ${figure.label}`;

  // ---- Cover (R-1).
  const judgement = unresolved.length && r.r1.substantial
    ? `In ${plural(unresolved.length, 'fraud scheme', 'fraud schemes')} the organisation's own answers conflict or rely on a weaker practice, and ${plural(gapSchemes.length, 'scheme has', 'schemes have')} a control reported as a gap.`
    : `${gapSchemes.length} of ${S.length} applicable fraud schemes have a control reported as a gap${unresolved.length ? `, and ${unresolved.length} have answers to resolve` : ''}.`;
  const strip = `<div class="proto">${esc(input.banner)}</div>`;
  pages.push(`<section class="page page--navy">${strip}
    <div style="font-size:7.2pt;letter-spacing:.18em;text-transform:uppercase;color:var(--brass);font-weight:600">MK Fraud Insights</div>
    <div style="height:16mm"></div>
    <div style="font-size:7.6pt;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.62)">Comprehensive Fraud Readiness Report</div>
    <h1 style="color:#fff;font-size:25pt;line-height:1.16;max-width:165mm;margin-top:6mm">Fraud schemes, target control environment and implementation programme</h1>
    <div style="height:10mm"></div>
    <div style="font-size:13pt;line-height:1.45;max-width:160mm;color:#fff">${esc(judgement)}</div>
    <div class="sp"></div>
    <div style="border-top:2px solid var(--brass);padding-top:5mm">
      ${r.r1.substantial
        ? `<div style="font-size:8.6pt;line-height:1.55;color:rgba(255,255,255,.8);max-width:150mm">Calculated figure ${figure.score?.toFixed(1) ?? 'not shown'} / 100 (${esc(figure.band)}), a test fixture. It is not a readiness conclusion while ${plural(unresolved.length, 'scheme has', 'schemes have')} answers still to resolve (Section 2).</div>`
        : `<div style="display:flex;gap:12mm;align-items:flex-end"><div><div style="font-size:30pt;font-weight:700;line-height:.9">${figure.score?.toFixed(1) ?? '&ndash;'}</div><div style="font-size:7pt;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.55);margin-top:2mm">Calculated figure / 100</div></div><div><div style="font-size:14pt;font-weight:600;letter-spacing:.04em;text-transform:uppercase">${esc(figure.band)}</div><div style="font-size:7pt;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.55);margin-top:2mm">Band of the calculated figure</div></div></div><div style="font-size:7.4pt;color:rgba(255,255,255,.65);margin-top:2.5mm">A test fixture, not an approved score or readiness conclusion.</div>`}
    </div>
    <div style="height:9mm"></div>
    <div style="font-size:7pt;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.55)">Prepared for</div>
    <div style="font-size:15pt;font-weight:600;margin-top:2mm">${esc(input.organisationName)}</div>
    <div style="font-size:8pt;color:rgba(255,255,255,.7);margin-top:3mm">Assessment reference · ${esc(input.assessmentReference)}</div>
    <div style="height:6mm"></div>
    <div style="font-size:7pt;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.42)">Confidential · Automated analysis · Not independently reviewed</div>
  </section>`);

  const sectionHead = (n: number, title: string, h1: string, note: string) => `<div class="reg-head"><div class="n">Section ${n} · ${esc(title)}</div><h1>${esc(h1)}</h1>${note ? `<div class="reg-note">${esc(note)}</div>` : ''}</div>`;
  const interp = (label: string, text: string) => (text ? `<div class="interp"><div class="interp-l">${esc(label)}</div><p>${esc(text)}</p></div>` : '');
  const addSection = (title: string, body: (n: number) => string) => { const n = sections.length + 1; sections.push([String(n), title]); pages.push(`<section class="reg">${strip}${body(n)}</section>`); };

  // ---- 1. Where the organisation stands.
  const areaRows = [...new Set(S.map((s) => s.area))].map((ar) => {
    const ss = S.filter((s) => s.area === ar);
    const c = (kk: string) => ss.filter((s) => s.kind === kk).length;
    const fx = figure.areas.find((x) => x.area === ar);
    return { ar, name: ss[0].areaName, n: ss.length, inPlace: c('confirmed'), qual: c('qualified'), gap: c('gap'), res: c('contradiction') + c('dependency'), out: c('outstanding') + c('none') + c('not-expected'), fixture: fx?.value ?? null };
  });
  addSection('Where the organisation stands', (n) => `${sectionHead(n, 'Where the organisation stands', 'What the answers indicate', 'Each applicable fraud scheme, classified from the organisation\'s own answers. Nothing here has been tested or verified.')}
    <div class="stats">
      <div class="s"><div class="n">${S.length}</div><div class="l">Fraud schemes that apply</div></div>
      <div class="s"><div class="n">${k.confirmed + k.qualified}</div><div class="l">Controls that stop the scheme reported in place</div></div>
      <div class="s"><div class="n">${k.gap}</div><div class="l">A control reported as a gap</div></div>
      <div class="s"><div class="n">${unresolved.length}</div><div class="l">Answers to resolve</div></div>
      <div class="s"><div class="n">${r.outstanding.length}</div><div class="l">Answers outstanding</div></div>
    </div>
    <table>
      <thead><tr><th style="width:30%">Area</th><th style="width:9%">Schemes</th><th style="width:10%">In place</th><th style="width:13%">In place, further defence weaker</th><th style="width:9%">Gap</th><th style="width:10%">To resolve</th><th style="width:9%">Not analysed</th><th style="width:10%">Calculated figure*</th></tr></thead>
      <tbody>${areaRows.map((x) => `<tr><td><strong>${esc(x.name)}</strong></td><td class="tight">${x.n}</td><td class="tight">${x.inPlace}</td><td class="tight">${x.qual}</td><td class="tight">${x.gap}</td><td class="tight">${x.res}</td><td class="tight">${x.out}</td><td class="tight muted">${x.fixture === null ? 'Not shown' : x.fixture.toFixed(1)}</td></tr>`).join('')}</tbody>
    </table>
    ${k['not-expected'] || k.outstanding || k.none ? `<p class="cap" style="margin-top:1.5mm">Not analysed: ${joinList([k.outstanding ? `${k.outstanding} with answers outstanding (Appendix H)` : '', k.none ? `${k.none} not yet reached in the interview` : '', k['not-expected'] ? `${k['not-expected']} the method does not ask of an organisation of this size` : ''].filter(Boolean))}.</p>` : ''}
    <div class="fixture">* ${esc(figureText)}${r.r1.substantial ? ` Under the R-1 convention it is not read as a conclusion while ${plural(unresolved.length, 'scheme has', 'schemes have')} answers to resolve.` : ''}</div>
    ${interp('What this means', [
      `${k.confirmed + k.qualified} of the ${S.length} schemes have the controls that stop them reported in place${k.qualified ? `; in ${k.qualified} of these a further defence is reported weaker, which does not change the answer given for the control` : ''}.`,
      gapSchemes.length ? `${gapSchemes.length} have a control reported as a gap, ${r.summary.tier1Gap} of them in tier 1, the schemes the draft method confirms in its core stage. The tier says how early the method asks about a scheme; it is not a rating of how serious it is.` : '',
      unresolved.length ? `In ${unresolved.length} the answers need resolving before the scheme can be treated as covered (Section 2).` : '',
      `The core stage is ${r.sufficiency.stages.core} and the breadth stage ${r.sufficiency.stages.breadth}; ${r.sufficiency.analytical.schemes.analysable} of the ${r.sufficiency.analytical.schemes.applicable} schemes asked about can be analysed in full from the answers given${r.outstanding.length ? `, and ${plural(r.outstanding.length, 'answer is', 'answers are')} outstanding (Appendix H)` : ''}.`
    ].filter(Boolean).join(' '))}`);

  // ---- 2. What is driving the position.
  const gapAreas = [...gapSchemes.reduce((m, s) => m.set(s.area, [...(m.get(s.area) ?? []), s]), new Map<string, SchemeView[]>()).entries()].sort((x, y) => y[1].length - x[1].length);
  addSection('What is driving the position', (n) => `${sectionHead(n, 'What is driving the position', 'The patterns behind the answers', 'Answers to resolve first, then requirements that span several areas, then where the gaps concentrate.')}
    ${unresolved.length ? `<h2>Answers to resolve</h2>
    <p class="small">Where a control was reported fully in place and a practice of the same scheme weaker, the two answers were compared using the method's wording. These are the schemes where the answers cannot both be right, or where the reported control relies on the weaker practice. The other ${k.qualified} comparisons found a separate defence, listed in Appendix G.</p>
    <table><thead><tr><th style="width:24%">Scheme</th><th style="width:14%">Relationship</th><th style="width:46%">What the answers say</th><th style="width:16%">Owner</th></tr></thead>
    <tbody>${unresolved.map((s) => `<tr><td><strong>${esc(s.name)}</strong><div class="cap">${esc(s.ref)} · ${esc(s.areaName)}</div></td><td><span class="kind res">${esc(KIND_LABEL[s.kind])}</span></td><td>${esc(s.relations.filter((x) => x.type === 'direct-contradiction' || x.type === 'necessary-dependency').map((x) => x.statement).join(' '))}</td><td>${esc(s.confirmations[0].ownerRole)}</td></tr>`).join('')}</tbody></table>` : ''}
    ${r.connected.length ? `<h2>Requirements that span several areas</h2>
    <p class="small">The method groups some controls into requirements that cross areas. Where two or more of them are reported as gaps in different areas, the weakness is connected: fixing one area leaves the route open through another.</p>
    <table><thead><tr><th style="width:38%">Requirement</th><th style="width:44%">Controls reported as gaps</th><th style="width:18%">In place of those asked</th></tr></thead>
    <tbody>${r.connected.slice(0, 8).map((x) => `<tr><td><strong>${esc(x.name)}</strong></td><td>${esc(x.gaps.map((g) => `${g.key} (${AREA_SHORT[g.area] ?? g.area}: ${lc(g.state)})`).join('; '))}</td><td class="tight">${x.inPlace} of ${x.asked}</td></tr>`).join('')}</tbody></table>` : ''}
    ${gapAreas.length ? `<h2>Where the gaps concentrate</h2>
    <table><thead><tr><th style="width:40%">Area</th><th style="width:20%">Schemes with a gap</th><th style="width:20%">Of which tier 1</th><th style="width:20%">Schemes in the area</th></tr></thead>
    <tbody>${gapAreas.map(([ar, ss]) => `<tr><td><strong>${esc(ss[0].areaName)}</strong></td><td class="tight">${ss.length}</td><td class="tight">${ss.filter((s) => s.tier === 1).length}</td><td class="tight">${S.filter((s) => s.area === ar).length}</td></tr>`).join('')}</tbody></table>
    <p class="cap" style="margin-top:2mm">The schemes themselves are listed by area in Section 3.</p>` : ''}
    ${interp('What this means', [
      unresolved.length ? `The ${plural(unresolved.length, 'scheme', 'schemes')} with answers to resolve come first, because a control relied on as reported may not operate that way.` : '',
      r.connected.length ? `${plural(r.connected.length, 'requirement spans', 'requirements span')} several areas with gaps in more than one, most widely: ${lc(r.connected[0].name)}.` : '',
      gapAreas.length ? `Of the ${gapSchemes.length} schemes with a control reported as a gap, ${concentration(gapAreas.map(([ar, ss]) => [ar, ss.length] as [string, number]), gapSchemes.length)}. This is a count of schemes, not a rating of their seriousness.` : ''
    ].filter(Boolean).join(' '))}`);

  // ---- 3. Where the material fraud exposure sits.
  const open = [...unresolved, ...gapSchemes];
  addSection('Where the material fraud exposure sits', (n) => `${sectionHead(n, 'Where the material fraud exposure sits', 'Open and unresolved fraud schemes', 'Every scheme with a control reported as a gap or answers to resolve, grouped by area. MK has not yet approved a method for rating fraud risks, so no likelihood, impact or priority is assigned. Each scheme\'s risk statement is in Appendix B and its finding in Appendix A.')}
    <table><thead><tr><th style="width:22%">Area</th><th style="width:8%">Open</th><th style="width:70%">Schemes (tier 1 in bold; answers to resolve marked)</th></tr></thead>
    <tbody>${[...new Set(open.map((s) => s.area))].map((ar) => { const ss = open.filter((s) => s.area === ar); return `<tr><td><strong>${esc(ss[0].areaName)}</strong></td><td class="tight">${ss.length}</td><td class="small">${ss.map((s) => `${s.tier === 1 ? '<strong>' : ''}${esc(s.name.replace(/\.$/, ''))}${s.tier === 1 ? '</strong>' : ''} <span class="id">${esc(s.ref)}</span>${s.kind !== 'gap' ? ' <span class="kind res">to resolve</span>' : ''}`).join('; ')}</td></tr>`; }).join('')}</tbody></table>
    ${qualified.length ? `<p class="cap" style="margin-top:2mm">A further ${plural(qualified.length, 'scheme has', 'schemes have')} the control that stops it reported in place with a further defence weaker. These are not open schemes; they are in Appendix A and their practices in Appendix C.</p>` : ''}
    ${interp('What this means', `${open.length} schemes are open or unresolved across ${new Set(open.map((s) => s.area)).size} areas, ${open.filter((s) => s.tier === 1).length} of them in tier 1. The grouping shows where the work sits; it does not rank the schemes, and Section 7 asks management to decide the order.`)}`);

  // ---- 4. Fraud scenario portfolio.
  const portfolio = [...unresolved.slice(0, 3), ...gapSchemes.slice(0, Math.max(3, 6 - Math.min(3, unresolved.length)))].slice(0, 6);
  addSection('Fraud scenario portfolio', (n) => `${sectionHead(n, 'Fraud scenario portfolio', 'How the schemes would work here', 'Plausible pathways for an organisation with the controls it reported, using the method\'s own description of each scheme. They are not allegations that any event has occurred.')}
    ${portfolio.map((s) => {
      const f = findingOf(s);
      const relevant = s.kind === 'gap' ? s.confirmationGaps : s.relations.filter((x) => x.type !== 'complementary-weakness').map((x) => r.analysis.view(r.analysis.byId.get(x.practice)!));
      const here = s.kind === 'gap'
        ? `${relevant.map((v) => (v.format === 'anchored' && v.level !== null ? `${v.key}: ${lc(v.reported)}` : v.reported)).join(' ')}${s.supportingGaps.length ? ` Behind it, ${joinList(s.supportingGaps.slice(0, 3).map((v) => `${lc(v.key)} is ${lc(v.stateShort)}`))}.` : ''}`
        : s.relations.filter((x) => x.type !== 'complementary-weakness').map((x) => x.statement).join(' ');
      const interrupt = relevant.map((v) => v.standard).filter(Boolean) as string[];
      return `<div class="card"><div style="display:flex;justify-content:space-between;align-items:baseline"><h3>${esc(s.name)}</h3><span class="meta">${esc(s.ref)} · ${esc(AREA_SHORT[s.area] ?? s.areaName)} · tier ${s.tier}</span></div>
        <dl>
          <dt>How it starts</dt><dd>${esc(s.how ?? 'The method does not describe how this scheme starts.')}</dd>
          <dt>Why it matters</dt><dd>${esc(s.why ?? (s.methodRisks.length ? `The method links it to ${joinList(s.methodRisks.map(lc))}.` : 'The method does not describe the consequence of this scheme.'))}</dd>
          <dt>What the answers show</dt><dd>${esc(here)}</dd>
          <dt>What would interrupt it</dt><dd>${interrupt.length ? esc(interrupt.join(' ')) : esc(`${joinList(relevant.map((v) => v.key))}, in place across everything ${relevant.length > 1 ? 'they' : 'it'} should cover.`)}</dd>
          <dt>Warning signs</dt><dd>${esc(s.methodRisks.length ? s.methodRisks.join('; ') : 'The method names none for this scheme.')}</dd>
          <dt>Links</dt><dd class="id">${esc([f?.ref, f?.riskRef, ...(f?.controlRefs ?? [])].filter(Boolean).join(', '))}</dd>
        </dl></div>`;
    }).join('')}
    ${open.length > portfolio.length ? `<p class="cap" style="margin-top:3mm">${plural(open.length - portfolio.length, 'further open scheme is', 'further open schemes are')} described in Appendices A and B.</p>` : ''}`);

  // ---- 5. The control environment management should build.
  const programmes = [...new Set(r.controls.map((c) => c.ownerRole))].map((role) => ({ role, controls: r.controls.filter((c) => c.ownerRole === role) }))
    .sort((x, y) => y.controls.filter((c) => c.purpose !== 'strengthen').length - x.controls.filter((c) => c.purpose !== 'strengthen').length || x.role.localeCompare(y.role));
  addSection('The control environment management should build', (n) => `${sectionHead(n, 'The control environment management should build', 'Target controls, by programme', 'One programme for each accountable role. Each control is described in full once, in Appendix C, with the draft method\'s standard; here it is named with its reference and what it is for.')}
    ${programmes.map((p) => {
      const schemes = [...new Set(p.controls.filter((c) => c.purpose !== 'strengthen').flatMap((c) => c.schemeNames))];
      const put = p.controls.filter((c) => c.purpose === 'put-in-place');
      const res = p.controls.filter((c) => c.purpose === 'resolve-answer');
      const str = p.controls.filter((c) => c.purpose === 'strengthen');
      const deps = p.controls.filter((c) => c.prerequisiteRefs.length || c.dependentRefs.length);
      const names = (cs: typeof p.controls) => cs.map((c) => `${c.key} (${c.ref}, ${lc(c.stateShort)})`).join('; ');
      return `<div class="card"><div style="display:flex;justify-content:space-between;align-items:baseline"><h3>${esc(p.role)}</h3><span class="meta">${plural(p.controls.length, 'control', 'controls')}</span></div>
        <dl>
          ${schemes.length ? `<dt>Stops</dt><dd>${esc(joinList(schemes.slice(0, 8).map((x) => lc(x.replace(/\.$/, '')))))}${schemes.length > 8 ? ` and ${schemes.length - 8} more` : ''}.</dd>` : ''}
          ${res.length ? `<dt>Resolve the answers</dt><dd>${esc(names(res))}.</dd>` : ''}
          ${put.length ? `<dt>Put in place</dt><dd>${esc(names(put))}.</dd>` : ''}
          ${deps.length ? `<dt>Dependencies</dt><dd>${esc(deps.map((c) => [c.dependentRefs.length ? `${c.key} (${c.ref}) is relied on by ${joinList(c.dependentRefs)}` : '', c.prerequisiteRefs.length ? `${c.key} (${c.ref}) relies on ${joinList(c.prerequisiteRefs)}` : ''].filter(Boolean).join('; ')).join('; '))}.</dd>` : ''}
          ${str.length ? `<dt>Strengthen</dt><dd>${plural(str.length, 'further defence', 'further defences')} reported weaker behind a control reported in place or a gap: ${esc(str.map((c) => c.ref).join(', '))} (Appendix C).</dd>` : ''}
        </dl></div>`;
    }).join('')}
    ${interp('What this means', `${joinList([[r.controls.filter((c) => c.purpose === 'put-in-place').length, 'control is to be put in place', 'controls are to be put in place'], [r.controls.filter((c) => c.purpose === 'resolve-answer').length, 'needs its answers resolved', 'need their answers resolved'], [r.controls.filter((c) => c.purpose === 'strengthen').length, 'is a further defence to strengthen', 'are further defences to strengthen']].filter(([n]) => n).map(([n, one, many], i) => (i ? `${n} ${n === 1 ? one : many}` : plural(n as number, one as string, many as string))))}. ${r.controls.filter((c) => c.dependentRefs.length).length ? `${plural(r.controls.filter((c) => c.dependentRefs.length).length, 'control is', 'controls are')} relied on by another control, as the method establishes, and should be designed first.` : 'The method establishes no dependency among these controls.'} Where the method describes a control only by its in-place answer, Appendix C says so rather than adding detail the method does not contain.`)}`);

  // ---- 6. Who must own the response.
  addSection('Who must own the response', (n) => `${sectionHead(n, 'Who must own the response', 'Accountability by role', `Roles, not individuals: the assessment does not identify people. The method suggests owners in many forms; this report uses one label per function, and Appendix I lists the method's wording behind each. Oversight: ${r.oversight}, from the organisation's own governance answer.`)}
    <table><thead><tr><th style="width:28%">Role</th><th style="width:12%">Controls</th><th style="width:12%">Schemes</th><th style="width:12%">Actions</th><th style="width:36%">Answers to resolve or obtain</th></tr></thead>
    <tbody>${programmes.map((p) => `<tr><td><strong>${esc(p.role)}</strong></td><td class="tight">${p.controls.length}</td><td class="tight">${new Set(p.controls.flatMap((c) => c.schemeRefs)).size}</td><td class="tight">${r.actions.filter((x) => x.ownerRole === p.role).length}</td><td class="small">${esc(unresolved.filter((s) => s.confirmations[0].ownerRole === p.role).map((s) => s.name.replace(/\.$/, '')).join('; ') || 'None')}</td></tr>`).join('')}
    <tr><td><strong>Chief executive</strong></td><td class="tight">0</td><td class="tight">${new Set(r.actions.filter((x) => x.ownerRole === 'Chief executive').flatMap((x) => x.schemeRefs)).size}</td><td class="tight">${r.actions.filter((x) => x.ownerRole === 'Chief executive').length}</td><td class="small">Names the accountable executives, decides the order of work and reports status to ${esc(lc(r.oversight))}.</td></tr></tbody></table>`);

  // ---- 7. Decisions leadership must make.
  addSection('Decisions leadership must make', (n) => `${sectionHead(n, 'Decisions leadership must make', 'The decision agenda', 'A recommended direction follows the method and the answers; the decision remains management\'s. No deadline is set: "when" states what each decision must come before.')}
    <table><thead><tr><th style="width:5%">Ref</th><th style="width:24%">Decision</th><th style="width:23%">Why</th><th style="width:22%">Recommended direction</th><th style="width:12%">When</th><th style="width:14%">If delayed</th></tr></thead>
    <tbody>${r.decisions.map((d) => `<tr><td class="id">${esc(d.ref)}</td><td><strong>${esc(d.decision)}</strong></td><td>${esc(d.why)}</td><td>${esc(d.recommendedDirection)}</td><td>${esc(d.when)}</td><td>${esc(d.consequenceOfDelay)}</td></tr>`).join('')}</tbody></table>`);

  // ---- 8. What should happen, and in what order.
  addSection('What should happen, and in what order', (n) => `${sectionHead(n, 'What should happen, and in what order', 'The implementation programme', 'Six phases, ordered by what must be known and decided before controls are built. No dates are set from a scheme\'s tier or answers; management sets them. Every action is in Appendix E.')}
    <table><thead><tr><th style="width:5%">#</th><th style="width:20%">Phase</th><th style="width:30%">Purpose</th><th style="width:7%">Actions</th><th style="width:38%">Includes</th></tr></thead>
    <tbody>${PHASES.map((p) => { const xs = r.actions.filter((x) => x.phase === p.n); return xs.length ? `<tr><td class="tight">${p.n}</td><td><strong>${esc(p.title)}</strong></td><td>${esc(p.purpose)}</td><td class="tight">${xs.length}</td><td class="small">${esc(xs.slice(0, 3).map((x) => x.action).join(' '))}${xs.length > 3 ? ` <span class="muted">${xs.length - 3} more in Appendix E.</span>` : ''}</td></tr>` : ''; }).join('')}</tbody></table>
    ${interp('What this means', `Phases 1 and 2 need no new control: they establish the facts, name owners and choose the order of work. ${r.controls.some((c) => c.dependentRefs.length) ? 'Phase 3 then puts in place the controls others rely on, so that no control is built on something that does not exist.' : 'No control in this report relies on another, as far as the method establishes, so phases 3 and 4 can run together.'} Phase 6 runs each control through a full cycle and reports status to ${lc(r.oversight)}.`)}`);

  // ---- 9. How management will know it is working.
  addSection('How management will know it is working', (n) => `${sectionHead(n, 'How management will know it is working', 'Measures and reporting', 'Each control has one success measure, in the method\'s own terms (Appendix F). These are the signals management should expect once a control operates; they are not a claim that they exist today.')}
    <table><thead><tr><th style="width:40%">Indicator</th><th style="width:25%">Today</th><th style="width:35%">Expected</th></tr></thead>
    <tbody>
      ${unresolved.length ? `<tr><td><strong>Schemes with answers to resolve</strong></td><td>${unresolved.length}</td><td>None; each corrected answer recorded</td></tr>` : ''}
      ${r.outstanding.length ? `<tr><td><strong>Outstanding answers</strong></td><td>${r.outstanding.length}</td><td>Each answered, or an open item with an owner</td></tr>` : ''}
      <tr><td><strong>Open schemes with a named owner and a recorded decision</strong></td><td>None recorded (${gapSchemes.length} open)</td><td>Every open scheme selected, deferred with a reason or accepted</td></tr>
      <tr><td><strong>Controls meeting their success measure for a full cycle</strong></td><td>Not measured</td><td>Each control put in place (${r.controls.filter((c) => c.purpose === 'put-in-place').length})</td></tr>
      <tr><td><strong>Status reported to ${esc(lc(r.oversight))}</strong></td><td>Not yet</td><td>At each meeting until each scheme is closed, deferred or accepted</td></tr>
    </tbody></table>
    <h2>Measures by programme</h2>
    <table><thead><tr><th style="width:34%">Programme</th><th style="width:12%">Measures</th><th style="width:54%">Example</th></tr></thead>
    <tbody>${programmes.map((p) => `<tr><td><strong>${esc(p.role)}</strong></td><td class="tight">${p.controls.length}</td><td class="small">${esc([...p.controls].sort((x, y) => x.successMeasure.length - y.successMeasure.length)[0].successMeasure)}</td></tr>`).join('')}</tbody></table>
    ${interp('Conclusion', [
      `${input.organisationName}'s answers show ${plural(k.confirmed + k.qualified, 'scheme', 'schemes')} with the controls that stop them reported in place and ${gapSchemes.length} with a control reported as a gap.`,
      unresolved.length ? `The first task is to resolve the ${plural(unresolved.length, 'scheme', 'schemes')} whose answers conflict or rely on a weaker practice${r.r1.substantial ? '; until then the calculated figure should not be read as a conclusion' : ''}.` : '',
      'The order of the remaining work is management\'s decision, because the draft method does not yet rank fraud risks; this report sets out what each scheme needs, who owns it and how management will know it is working.'
    ].filter(Boolean).join(' '))}`);

  // ---- Appendices: every register row, in full.
  const appendix = (letter: string, title: string, count: number, note: string, body: string) => { appendices.push([letter, title, count]); pages.push(`<section class="reg">${strip}<div class="reg-head"><div class="n">Appendix ${letter}</div><h1>${esc(title)}</h1><div class="reg-note">${esc(note)}</div></div>${body}</section>`); };
  appendix('A', 'Finding register', r.findings.length, 'Every scheme with a control reported as a gap, answers to resolve, or a further defence weaker. "What the answers show" is self-reported and has not been verified. A scheme with answers to resolve is not treated as covered until they are resolved; a further defence reported weaker does not change the answer given for the control that stops the scheme.',
    `<table><thead><tr><th style="width:6%">Ref</th><th style="width:20%">Scheme</th><th style="width:38%">What the answers show</th><th style="width:26%">How it happens and why it matters (method)</th><th style="width:10%">Links</th></tr></thead>
    <tbody>${r.findings.map((f) => `<tr><td class="id">${esc(f.ref)}<div>${esc(f.schemeRef)}</div></td><td><strong>${esc(f.title)}</strong><div class="cap">${esc(f.areaName)} · tier ${f.tier}</div><div><span class="kind ${KIND_CLASS[f.kind]}">${esc(KIND_LABEL[f.kind])}</span></div></td><td>${esc(f.position)}<div class="cap" style="margin-top:.8mm">Answered by ${esc(joinList(f.answeredBy))}.</div></td><td>${esc([f.mechanism, f.whyItMatters].filter(Boolean).join(' ') || 'The method does not describe this scheme further.')}</td><td class="id">${esc([f.riskRef, ...f.controlRefs].filter(Boolean).join(', '))}</td></tr>`).join('')}</tbody></table>`);
  appendix('B', 'Fraud risk register', r.risks.length, 'One risk for each open or unresolved scheme. No likelihood, impact, priority or monetary value is assigned: MK has not yet approved a method for rating them.',
    `<table><thead><tr><th style="width:6%">Ref</th><th style="width:30%">Risk</th><th style="width:22%">Current position</th><th style="width:20%">Treatment</th><th style="width:12%">Owner</th><th style="width:10%">Rating</th></tr></thead>
    <tbody>${r.risks.map((x) => `<tr><td class="id">${esc(x.ref)}<div>${esc(x.findingRef)}</div></td><td><strong>${esc(x.statement)}</strong>${x.consequence ? `<div class="cap" style="margin-top:.8mm">${esc(x.consequence)}</div>` : ''}</td><td>${esc(x.currentPosition)}</td><td class="small">${esc(x.treatment)}</td><td>${esc(x.ownerRole)}</td><td class="cap">Not rated</td></tr>`).join('')}</tbody></table>`);
  appendix('C', 'Control blueprint register', r.controls.length, 'Each control once, with every scheme it serves. The target standard and improving level are the draft method\'s own wording; "Reported today" is what the organisation answered. Where the method is not specific enough to say more, the row says so with the codes below rather than adding detail the method does not contain.',
    `<div class="panel"><div class="l">Method detail codes</div><p class="note">${(Object.keys(GAP_CODE) as (keyof typeof GAP_CODE)[]).map((g) => `<span class="gapkey">${GAP_CODE[g]}</span> ${esc(CONTENT_GAP_TEXT[g])}`).join('<br>')}</p></div>
    <table><thead><tr><th style="width:8%">Ref</th><th style="width:25%">Control and reported today</th><th style="width:27%">Target standard (method)</th><th style="width:26%">Activities</th><th style="width:14%">Owner, records, measure</th></tr></thead>
    <tbody>${r.controls.map((c) => `<tr><td class="id">${esc(c.ref)}<div>${esc(PURPOSE_LABEL[c.purpose])}</div><div>${esc(c.schemeRefs.join(', '))}</div></td><td><strong>${esc(c.key)}</strong><div style="margin-top:.8mm">${esc(c.reported)}</div><div class="cap" style="margin-top:.8mm">Answered by ${esc(c.answeredBy)}.</div></td><td>${esc(c.standard ?? 'Not a control in the method.')}${c.improving ? `<div class="cap" style="margin-top:.8mm">Improving level: ${esc(c.improving)}</div>` : ''}${c.contentGaps.length ? `<div class="cap" style="margin-top:.8mm">Method detail: ${c.contentGaps.map((g) => `<span class="gapkey">${GAP_CODE[g]}</span>`).join('')}</div>` : ''}</td><td class="small">${ul(c.activities)}</td><td class="small">${esc(c.ownerRole)}<div class="id" style="margin-top:.8mm">${esc([...c.recordRefs, c.ref.replace('C', 'M'), ...c.prerequisiteRefs.map((p) => `needs ${p}`)].join(', '))}</div><div class="cap">Cycle: ${esc(c.operatingCycle)}</div></td></tr>`).join('')}</tbody></table>`);
  appendix('D', 'Records management should maintain', r.records.length, 'The records the method names for each control, for management to keep as the control operates. MK has not requested, received or examined any of them. Independent review of evidence is a separate Advisory service; this report does not perform it.',
    `<table><thead><tr><th style="width:7%">Ref</th><th style="width:55%">Record</th><th style="width:18%">Controls</th><th style="width:20%">Kept by</th></tr></thead>
    <tbody>${r.records.map((x) => `<tr><td class="id">${esc(x.ref)}</td><td>${esc(x.text)}</td><td class="id">${esc(x.controlRefs.join(', '))}</td><td>${esc(x.ownerRoles.join('; '))}</td></tr>`).join('')}</tbody></table>
    <p class="cap" style="margin-top:2mm">${plural(r.controls.filter((c) => !c.records).length, 'control has', 'controls have')} no record named by the method; Appendix C marks them.</p>`);
  appendix('E', 'Action register', r.actions.length, 'Every action in the programme, by phase. Phases follow what must be known and decided first; no dates are set.',
    `<table><thead><tr><th style="width:6%">Ref</th><th style="width:12%">Phase</th><th style="width:30%">Action</th><th style="width:12%">Owner</th><th style="width:20%">Deliverable</th><th style="width:20%">Complete when</th></tr></thead>
    <tbody>${r.actions.map((x) => `<tr><td class="id">${esc(x.ref)}${x.dependsOn.length ? `<div>after ${esc(x.dependsOn.join(', '))}</div>` : ''}</td><td class="cap">${x.phase}. ${esc(x.phaseTitle)}</td><td>${esc(x.action)}</td><td>${esc(x.ownerRole)}</td><td class="small">${esc(x.deliverable)}</td><td class="small">${esc(x.completionTest)}</td></tr>`).join('')}</tbody></table>`);
  appendix('F', 'Measurement register', r.measures.length, 'One success measure for each control, in the method\'s terms.',
    `<table><thead><tr><th style="width:7%">Ref</th><th style="width:63%">Measure</th><th style="width:10%">Control</th><th style="width:20%">Owner</th></tr></thead>
    <tbody>${r.measures.map((m) => `<tr><td class="id">${esc(m.ref)}</td><td>${esc(m.measure)}</td><td class="id">${esc(m.controlRefs.join(', '))}</td><td>${esc(m.ownerRole)}</td></tr>`).join('')}</tbody></table>`);
  appendix('G', 'Answer relationships', r.relations.length, 'For each control reported fully in place, every practice of the same scheme reported weaker, not yet used or outstanding, and how the two answers relate. Only answers that cannot both be right, or a control relying on a weaker practice, leave the control unresolved. A further defence reported weaker does not change the answer given for the control; the reason for each classification is given.',
    `<table><thead><tr><th style="width:6%">Scheme</th><th style="width:19%">Control reported in place</th><th style="width:22%">Practice and its answer</th><th style="width:14%">Relationship</th><th style="width:39%">What it means</th></tr></thead>
    <tbody>${r.relations.map((x) => `<tr><td class="id">${esc(x.schemeRef)}</td><td><strong>${esc(x.confirmationName)}</strong></td><td>${esc(x.practiceReported)}</td><td><span class="kind ${x.type === 'direct-contradiction' || x.type === 'necessary-dependency' ? 'res' : 'qual'}">${esc(x.label)}</span><div class="cap">${esc(x.basis === 'reviewed-pair' ? 'Reviewed pair' : x.basis === 'method-structure' ? 'Method structure' : x.basis === 'answer' ? 'From the answer' : 'Not yet reviewed')}</div></td><td class="small">${esc(x.type === 'complementary-weakness' ? (x.basis === 'reviewed-pair' ? named(x.rationale) : 'A separate defence; the method establishes no dependency between the two.') : x.statement)}</td></tr>`).join('')}</tbody></table>`);
  appendix('H', 'Outstanding information', r.outstanding.length, 'Every question asked and not answered. A declined question, a question answered "I don\'t know" and a question still waiting are all outstanding; none is treated as answered.',
    r.outstanding.length ? `<table><thead><tr><th style="width:6%">Ref</th><th style="width:26%">Control</th><th style="width:20%">Status</th><th style="width:20%">Function</th><th style="width:28%">Scheme</th></tr></thead>
    <tbody>${r.outstanding.map((o) => `<tr><td class="id">${esc(o.ref)}</td><td><strong>${esc(o.key)}</strong></td><td>${esc(o.reasonText)}${o.declineReason ? `<div class="cap">${esc(o.declineReason)}</div>` : ''}</td><td>${esc(o.fn ?? 'Not assigned')}</td><td>${esc(o.schemeName ?? 'Not linked to a scheme')}</td></tr>`).join('')}</tbody></table>` : '<p class="small">No answer is outstanding.</p>');
  appendix('I', 'Roles used in this report', r.roles.length, 'Each consolidated role and the method\'s own suggested owners behind it.',
    `<table><thead><tr><th style="width:28%">Role in this report</th><th style="width:72%">Method wording</th></tr></thead>
    <tbody>${r.roles.map((x) => `<tr><td><strong>${esc(x.role)}</strong></td><td class="small">${esc(x.methodLabels.join('; '))}</td></tr>`).join('')}</tbody></table>`);

  // ---- Contents and basis, inserted after the cover now that sections and appendices are known.
  const basis = 'This report is produced by fixed rules from the organisation\'s answers to the MK Fraud Readiness review, read against the draft review method, which MK has not yet approved. The AI manuscript stage has not been run; the interpretation in each section is fixed-rule text. No evidence has been examined, no control has been tested for operating effectiveness, no one has been interviewed and no assurance opinion is given. Records named in this report are records management should maintain; independent review of evidence is a separate Advisory service.';
  pages.splice(1, 0, `<section class="page">${strip}
    <div class="q">How to read this report</div>
    <h1>Contents</h1>
    <div class="toc">
      <div class="row head"><span>Management report</span><span class="sec">Sections 1–${sections.length}</span></div>
      ${sections.map(([n, t]) => `<div class="row"><span>${n} · ${esc(t)}</span></div>`).join('')}
      <div class="row head"><span>Registers</span><span class="sec">Appendices A–${appendices.at(-1)?.[0] ?? 'A'}</span></div>
      ${appendices.map(([l, t, c]) => `<div class="row"><span>${l} · ${esc(t)}</span><span class="muted">${c} entries</span></div>`).join('')}
    </div>
    <div class="panel"><div class="l">The two halves of this report</div><p class="note">Sections 1–${sections.length} are the management report. The appendices hold every scheme, risk, control, record, action, measure, answer relationship and outstanding answer behind it, and the supporting workbook holds the same registers with the method references that trace each row to the question asked and the answer given.</p></div>
    <div class="panel"><div class="l">Basis of this report</div><p class="note">${esc(basis)}</p></div>
    <div class="panel"><div class="l">Test fixture</div><p class="note">${esc(figure.label)}</p></div>
    <div class="sp"></div>
  </section>`);

  const html = `<!doctype html><html lang="en-ZA"><head><meta charset="utf-8"><title>MK Fraud Readiness Comprehensive: ${esc(input.organisationName)}</title><style>${existingComprehensiveStyles()}${EXTRA_STYLES}</style></head><body>${pages.join('')}</body></html>`;
  return { html, sections: sections.map(([n, t]) => ({ n: Number(n), title: t })), appendices: appendices.map(([letter, title, count]) => ({ letter, title, count })) };
}
