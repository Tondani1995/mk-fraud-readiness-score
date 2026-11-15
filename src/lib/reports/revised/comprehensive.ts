import { renderComprehensiveManagementReportHtml } from '@/lib/reports/comprehensive/render-comprehensive-html';
import { METHOD_SETS_NO_ESCALATION, AREA_SHORT, INCONSISTENT, KIND_LABEL, PURPOSE_LABEL, joinList, methodOrder, type ControlBlueprint, type RevisedReport, type SchemeView } from './evidence-model';
import { controlName } from './answer-text';
import { CONTROL_CONTENT_VERSION } from './control-content/index';
import { scenarioAccount, type PositionStatement } from './position';

/**
 * FICTIONAL INTEGRATION PROTOTYPE. The Comprehensive report from the revised report model.
 *
 * Working structure approved by MK on 12 November: management sections, complete appendices and a supporting
 * workbook. The visual system is the existing renderer's own style sheet, taken from its output so the two cannot
 * drift; the management sections are fixed-rule prose because the AI manuscript stage is not run.
 *
 * Corrections on MK's second direction of 12 November: the four position statements on the cover and in Section 1,
 * with no band and no threshold; no materiality or priority language, and scenarios in the method's order; control
 * blueprints from the control-content library, laid out as one block per control; proposed planning windows for a
 * twelve-month programme, not deadlines; a management scorecard grouped by owner; and an information coverage
 * appendix that separates what the assessment establishes from what remains unknown.
 */

const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const lc = (s: string) => (s && !/^[A-Z]{2,}|^I\b/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

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
.kind{display:inline-block;font-size:6.2pt;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:.6mm 1.4mm;border-radius:1mm;white-space:nowrap}
.kind.res{background:#FBEDED;color:var(--weak)}.kind.gap{background:var(--brass-soft);color:#7a6011}.kind.qual{background:var(--rule-soft);color:var(--navy-700)}.kind.clar{background:#EEF2F8;color:var(--navy-700)}
.card{border-top:2px solid var(--navy-900);padding-top:2.5mm;margin-top:4mm;page-break-inside:avoid}
.card .meta{font-size:6.8pt;letter-spacing:.08em;text-transform:uppercase;color:var(--brass);font-weight:700}
.card dl{display:grid;grid-template-columns:34mm 1fr;gap:1.4mm 4mm;margin-top:2mm;font-size:8.2pt}
.card dt{font-size:6.6pt;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700;padding-top:.4mm}
.small{font-size:7.6pt}
.fixture{font-size:7.4pt;color:var(--muted);border-left:3px solid var(--weak);padding:2mm 3mm;margin-top:3mm;background:#FBF6F6}
.pos4{display:grid;grid-template-columns:1fr 1fr;gap:3.5mm 7mm;border-top:2px solid var(--navy-900);border-bottom:1px solid var(--rule);padding:4mm 0;margin-top:2mm}
.pos4 .l{font-size:6.6pt;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);font-weight:700}
.pos4 .v{font-size:10pt;font-weight:700;color:var(--navy-900);margin-top:1mm}
.pos4 .t{font-size:7.8pt;line-height:1.5;margin-top:1mm}
.bp{border-top:1.5px solid var(--navy-900);padding:2.2mm 0 2.6mm;page-break-inside:avoid;font-size:7.9pt;line-height:1.45}
.bp .top{display:flex;justify-content:space-between;gap:4mm;align-items:baseline}
.bp .nm{font-size:9.2pt;font-weight:700;color:var(--navy-900)}
.bp .mt{font-size:6.6pt;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);white-space:nowrap}
.bp .g2{display:grid;grid-template-columns:1fr 1fr;gap:1.6mm 6mm;margin-top:1.6mm}
.bp .g3{display:grid;grid-template-columns:1fr 1.3fr 1fr;gap:1.6mm 5mm;margin-top:1.8mm;padding-top:1.6mm;border-top:1px solid var(--rule-soft)}
.bp .h{font-size:6.3pt;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700;margin-bottom:.4mm}
.bp ol{margin:0;padding-left:4mm}.bp li{margin:0 0 .3mm}
h2{break-after:avoid;page-break-after:avoid}.keep{break-inside:avoid;page-break-inside:avoid}
.grp{font-size:7.2pt;letter-spacing:.12em;text-transform:uppercase;color:var(--brass);font-weight:700;margin:5mm 0 1mm}
`;

/** Reviewed rationales cite method question codes; in the report each code reads as the control's name. */
const named = (text: string) => text.replace(/\b(D\d{1,2}-[A-Z]{1,2}-\d{2})\b/g, (_m, id: string) => controlName(id));
const KIND_CLASS: Record<string, string> = { contradiction: 'res', dependency: 'res', clarify: 'clar', gap: 'gap', qualified: 'qual' };

export function buildRevisedComprehensive(input: {
  report: RevisedReport;
  /** The prototype label printed at the top of every section, in the flow of the page so it never covers content. */
  banner: string;
  organisationName: string;
  assessmentReference: string;
  position: PositionStatement[];
  figure: { score: number | null; areas: { area: string; name: string; value: number | null }[]; label: string };
}) {
  const { report: r, figure, position } = input;
  const S = r.schemes;
  const k = r.summary.byKind;
  const inconsistent = S.filter((s) => INCONSISTENT.includes(s.kind));
  const clarify = S.filter((s) => s.kind === 'clarify');
  const gapSchemes = S.filter((s) => s.kind === 'gap');
  const qualified = S.filter((s) => s.kind === 'qualified');
  const findingOf = (s: SchemeView) => r.findings.find((f) => f.schemeRef === s.ref);
  const reportedInPlace = k.confirmed + k.qualified + k.clarify + k.contradiction + k.dependency;
  const pages: string[] = [];
  const sections: [string, string][] = [];
  const appendices: [string, string, number][] = [];
  const posGrid = (light: boolean) => light
    ? `<div style="border-top:2px solid var(--brass);padding-top:4mm;display:grid;grid-template-columns:1fr 1fr;gap:3mm 9mm;max-width:168mm">${position.map((p) => `<div><div style="font-size:6.6pt;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.55)">${esc(p.label)}</div><div style="font-size:9.6pt;font-weight:600;color:#fff;margin-top:1mm">${esc(p.value)}</div></div>`).join('')}</div>`
    : `<div class="pos4">${position.map((p) => `<div><div class="l">${esc(p.label)}</div><div class="v">${esc(p.value)}</div><div class="t">${esc(p.text)}</div></div>`).join('')}</div>`;

  // ---- Cover.
  const judgement = scenarioAccount(r).sentence;
  const strip = `<div class="proto">${esc(input.banner)}</div>`;
  pages.push(`<section class="page page--navy">${strip}
    <div style="font-size:7.2pt;letter-spacing:.18em;text-transform:uppercase;color:var(--brass);font-weight:600">MK Fraud Insights</div>
    <div style="height:16mm"></div>
    <div style="font-size:7.6pt;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.62)">Comprehensive Fraud Readiness Report</div>
    <h1 style="color:#fff;font-size:25pt;line-height:1.16;max-width:165mm;margin-top:6mm">Fraud scenarios, target controls and implementation programme</h1>
    <div style="height:10mm"></div>
    <div style="font-size:13pt;line-height:1.45;max-width:160mm;color:#fff">${esc(judgement)}</div>
    <div class="sp"></div>
    ${posGrid(true)}
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
    return { ar, name: ss[0].areaName, n: ss.length, inPlace: c('confirmed'), qual: c('qualified'), gap: c('gap'), settle: c('contradiction') + c('dependency'), clar: c('clarify'), out: c('outstanding') + c('none') + c('not-expected'), fixture: fx?.value ?? null };
  });
  const cov = r.sufficiency.coverage;
  addSection('Where the organisation stands', (n) => `${sectionHead(n, 'Where the organisation stands', 'What the assessment establishes', 'Four separate statements, made the same way for every organisation: what was calculated, what is inconsistent, how the answers read, and what has been concluded. Nothing here has been tested or verified.')}
    ${posGrid(false)}
    <table style="margin-top:4mm">
      <thead><tr><th style="width:29%">Area</th><th style="width:8%">Scenarios</th><th style="width:9%">In place</th><th style="width:11%">In place, related practice weaker</th><th style="width:7%">Gap</th><th style="width:8%">To settle</th><th style="width:8%">To clarify</th><th style="width:9%">Not analysed</th><th style="width:11%">Calculated test result*</th></tr></thead>
      <tbody>${areaRows.map((x) => `<tr><td><strong>${esc(x.name)}</strong></td><td class="tight">${x.n}</td><td class="tight">${x.inPlace}</td><td class="tight">${x.qual}</td><td class="tight">${x.gap}</td><td class="tight">${x.settle}</td><td class="tight">${x.clar}</td><td class="tight">${x.out}</td><td class="tight muted">${x.fixture === null ? 'Not calculated' : x.fixture.toFixed(1)}</td></tr>`).join('')}</tbody>
    </table>
    <div class="fixture">* ${esc(figure.label)} Shown for traceability only: not a score, a band or a ranking of the areas.</div>
    ${interp('What this means', [
      `The organisation answered ${cov.all.answered} of the ${cov.all.applicable} confirmations that apply, ${cov.tier1.answered} of ${cov.tier1.applicable} in the core stage${r.outstanding.length ? `, and ${plural(r.outstanding.length, 'question is', 'questions are')} outstanding (Appendix H)` : ''}. Of the diagnostic questions put to it, ${r.sufficiency.diagnostics.answered} of ${r.sufficiency.diagnostics.applicable} were answered; the rest of the method's diagnostic questions were not asked, and nothing is concluded about them (Appendix J).`,
      `The tier of a scenario says how early the method asks about it, not how serious it is, and the calculated test result is not a readiness level.`
    ].join(' '))}`);

  // ---- 2. What is driving the position.
  const resolveRows = [...inconsistent, ...clarify];
  const gapAreaRows = [...new Set(gapSchemes.map((s) => s.area))].map((ar) => ({ ar, ss: gapSchemes.filter((s) => s.area === ar) }));
  addSection('What is driving the position', (n) => `${sectionHead(n, 'What is driving the position', 'The patterns behind the answers', 'Answers to settle and questions to clarify first, because a control relied on as reported may not operate that way; then requirements that span areas, and the count of gaps by area.')}
    ${resolveRows.length ? `<h2>Answers to settle and questions to clarify</h2>
    <p class="small">Where a control was reported fully in place and a related practice of the same scenario weaker, the two answers were compared using MK's reviewed relationships. A conflict is recorded only where both answers describe the same fact; incomplete documentation, such as a missing list or rating, is not treated as proof that a control cannot operate, and is raised as a question instead. Every pair, including those not yet reviewed, is in Appendix G.</p>
    <table><thead><tr><th style="width:23%">Scenario</th><th style="width:13%">Status</th><th style="width:48%">What the answers say, and the question to answer</th><th style="width:16%">Owner</th></tr></thead>
    <tbody>${resolveRows.map((s) => { const rel = s.relations.filter((x) => x.type === 'direct-contradiction' || x.type === 'necessary-dependency' || (x.type === 'not-established' && x.question)); return `<tr><td><strong>${esc(s.name)}</strong><div class="cap">${esc(s.ref)} · ${esc(s.areaName)}</div></td><td><span class="kind ${KIND_CLASS[s.kind]}">${esc(KIND_LABEL[s.kind])}</span></td><td>${esc(rel.map((x) => x.statement).join(' '))}${rel.some((x) => x.question) ? `<div style="margin-top:1mm"><strong>Question:</strong> ${esc(rel.filter((x) => x.question).map((x) => x.question).join(' '))}</div>` : ''}</td><td>${esc(s.confirmations[0].ownerRole)}</td></tr>`; }).join('')}</tbody></table>` : ''}
    ${r.connected.length ? `<div class="keep"><h2>Requirements that span several areas</h2>
    <p class="small">The method groups some controls into requirements that cross areas. Where two or more of them are reported as gaps in different areas, the weakness is connected: fixing one area leaves the route open through another.</p>
    <table><thead><tr><th style="width:38%">Requirement</th><th style="width:44%">Controls reported as gaps</th><th style="width:18%">In place of those asked</th></tr></thead>
    <tbody>${r.connected.map((x) => `<tr><td><strong>${esc(x.name)}</strong></td><td>${esc(x.gaps.map((g) => `${g.key} (${AREA_SHORT[g.area] ?? g.area}: ${lc(g.state)})`).join('; '))}</td><td class="tight">${x.inPlace} of ${x.asked}</td></tr>`).join('')}</tbody></table></div>` : ''}
    ${gapAreaRows.length ? `<div class="keep"><h2>Scenarios with a control reported as a gap, by area</h2>
    <table><thead><tr><th style="width:46%">Area</th><th style="width:27%">Scenarios with a gap</th><th style="width:27%">Scenarios in the area</th></tr></thead>
    <tbody>${gapAreaRows.map(({ ar, ss }) => `<tr><td><strong>${esc(ss[0].areaName)}</strong></td><td class="tight">${ss.length}</td><td class="tight">${S.filter((s) => s.area === ar).length}</td></tr>`).join('')}</tbody></table>
    <p class="cap" style="margin-top:2mm">Areas in the method's order. A count of scenarios is not a measure of their seriousness.</p></div>` : ''}
    ${interp('What this means', [
      resolveRows.length ? `${joinList([inconsistent.length ? `${plural(inconsistent.length, 'scenario has', 'scenarios have')} answers to settle` : '', clarify.length ? `${plural(clarify.length, 'scenario raises a question', 'scenarios raise questions')} the answers do not settle` : ''].filter(Boolean))}. These come first, because the controls concerned are reported in place and the answers do not yet establish that they cover their scenarios.` : 'No answers conflict in the pairs compared, and no reviewed pair leaves a question open.',
      r.connected.length ? `${plural(r.connected.length, 'requirement spans', 'requirements span')} several areas with gaps in more than one.` : '',
      gapSchemes.length ? `${plural(gapSchemes.length, 'scenario has', 'scenarios have')} a control reported as a gap, across ${plural(gapAreaRows.length, 'area', 'areas')}.` : ''
    ].filter(Boolean).join(' '))}`);

  // ---- 3. Reported fraud scenarios.
  const open = [...inconsistent, ...clarify, ...gapSchemes].sort(methodOrder);
  addSection('Reported fraud scenarios', (n) => `${sectionHead(n, 'Reported fraud scenarios', 'The scenarios this report acts on, by area', 'Every scenario with answers to settle, a question to clarify or a control reported as a gap, in the method\'s order. MK has not approved a method for rating fraud risks, so no likelihood, impact, materiality or priority is assigned, and neither the order nor the tier is a ranking. Each scenario\'s finding is in Appendix A and its risk statement in Appendix B.')}
    <table><thead><tr><th style="width:22%">Area</th><th style="width:8%">Acted on</th><th style="width:70%">Scenarios</th></tr></thead>
    <tbody>${[...new Set(open.map((s) => s.area))].map((ar) => { const ss = open.filter((s) => s.area === ar); return `<tr><td><strong>${esc(ss[0].areaName)}</strong></td><td class="tight">${ss.length}</td><td class="small">${ss.map((s) => `${esc(s.name.replace(/\.$/, ''))} <span class="id">${esc(s.ref)}</span>${s.kind !== 'gap' ? ` <span class="kind ${KIND_CLASS[s.kind]}">${s.kind === 'clarify' ? 'to clarify' : 'to settle'}</span>` : ''}`).join('; ')}</td></tr>`; }).join('')}</tbody></table>
    ${qualified.length ? `<p class="cap" style="margin-top:2mm">A further ${plural(qualified.length, 'scenario has', 'scenarios have')} the control that stops it reported in place with a related practice weaker. They are in Appendix A, and the related practices in Appendix C.</p>` : ''}
    ${interp('What this means', `${plural(open.length, 'scenario is', 'scenarios are')} acted on across ${plural(new Set(open.map((s) => s.area)).size, 'area', 'areas')}. The grouping shows where the work sits; Section 7 asks management to decide the order, using explicit factors.`)}`);

  // ---- 4. How the scenarios could occur.
  const portfolio: SchemeView[] = [...inconsistent, ...clarify].slice(0, 3);
  for (const ar of [...new Set(gapSchemes.map((s) => s.area))]) { if (portfolio.length >= 6) break; portfolio.push(gapSchemes.find((s) => s.area === ar)!); }
  addSection('How the scenarios could occur', (n) => `${sectionHead(n, 'How the scenarios could occur', 'Illustrative exposure mechanisms', 'Included: every scenario with answers to settle or a question to clarify (up to three), then the first scenario with a control reported as a gap in each area, in the method\'s order, up to six in all. They are plausible pathways for an organisation with the controls it reported, not allegations that any event has occurred, and their inclusion is not a ranking.')}
    ${portfolio.map((s) => {
      const f = findingOf(s);
      const rel = s.relations.filter((x) => x.type === 'direct-contradiction' || x.type === 'necessary-dependency' || (x.type === 'not-established' && x.question));
      const relevant = s.kind === 'gap' ? s.confirmationGaps : rel.map((x) => r.analysis.view(r.analysis.byId.get(x.practice)!));
      const here = s.kind === 'gap'
        ? `${relevant.map((v) => (v.format === 'anchored' && v.level !== null ? `${v.key}: ${lc(v.reported)}` : v.reported)).join(' ')}${s.supportingGaps.length ? ` Behind it, ${joinList(s.supportingGaps.slice(0, 3).map((v) => `${lc(v.key)} is ${lc(v.stateShort)}`))}.` : ''}`
        : rel.map((x) => x.statement).join(' ');
      const targets = relevant.map((v) => r.controls.find((c) => c.id === v.id)?.target).filter(Boolean) as string[];
      return `<div class="card"><div style="display:flex;justify-content:space-between;align-items:baseline"><h3>${esc(s.name)}</h3><span class="meta">${esc(s.ref)} · ${esc(AREA_SHORT[s.area] ?? s.areaName)}</span></div>
        <dl>
          <dt>How it starts</dt><dd>${esc(s.how ?? 'The method does not describe how this scenario starts.')}</dd>
          <dt>Why it matters</dt><dd>${esc(s.why ?? (s.methodRisks.length ? `The method links it to ${joinList(s.methodRisks.map(lc))}.` : 'The method does not describe the consequence of this scenario.'))}</dd>
          <dt>What the answers show</dt><dd>${esc(here)}</dd>
          <dt>What would interrupt it</dt><dd>${s.kind === 'clarify' ? `${esc(rel.find((x) => x.question)?.question ?? '')} <span class="muted">The answer decides whether anything needs to change.</span>` : s.kind !== 'gap' ? 'Establishing which answer is right; until then, the scenario is not treated as covered.' : esc(targets.join(' ') || `${joinList(relevant.map((v) => v.key))} in place.`)}</dd>
          <dt>Warning signs</dt><dd>${esc(s.methodRisks.length ? s.methodRisks.join('; ') : 'The method names none for this scenario.')}</dd>
          <dt>Links</dt><dd class="id">${esc([f?.ref, f?.riskRef, ...(f?.controlRefs ?? [])].filter(Boolean).join(', '))}</dd>
        </dl></div>`;
    }).join('')}
    ${open.length > portfolio.length ? `<p class="cap" style="margin-top:3mm">${plural(open.length - portfolio.length, 'further scenario is', 'further scenarios are')} described in Appendices A and B.</p>` : ''}`);

  // ---- 5. The control environment management should build.
  const programmes = [...new Set(r.controls.map((c) => c.ownerRole))].sort((x, y) => x.localeCompare(y)).map((role) => ({ role, controls: r.controls.filter((c) => c.ownerRole === role) }));
  addSection('The control environment management should build', (n) => `${sectionHead(n, 'The control environment management should build', 'Target controls, by accountable role', 'One programme for each accountable role, in alphabetical order. Each control\'s blueprint, with its target practice, activities, records and success measure, is in Appendix C; here it is named with its reference.')}
    ${programmes.map((p) => {
      const scenarios = [...new Set(p.controls.filter((c) => c.purpose !== 'strengthen').flatMap((c) => c.schemeNames))];
      const put = p.controls.filter((c) => c.purpose === 'put-in-place');
      const res = p.controls.filter((c) => c.purpose === 'resolve-answer');
      const str = p.controls.filter((c) => c.purpose === 'strengthen');
      const deps = p.controls.filter((c) => c.prerequisiteRefs.length || c.dependentRefs.length);
      const names = (cs: ControlBlueprint[]) => cs.map((c) => `${c.key} (${c.ref})`).join('; ');
      return `<div class="card"><div style="display:flex;justify-content:space-between;align-items:baseline"><h3>${esc(p.role)}</h3><span class="meta">${plural(p.controls.length, 'control', 'controls')}</span></div>
        <dl>
          ${scenarios.length ? `<dt>Scenarios</dt><dd>${esc(joinList(scenarios.slice(0, 6).map((x) => lc(x.replace(/\.$/, '')))))}${scenarios.length > 6 ? ` and ${scenarios.length - 6} more` : ''}.</dd>` : ''}
          ${res.length ? `<dt>Settle the answers</dt><dd>${esc(names(res))}.</dd>` : ''}
          ${put.length ? `<dt>Put in place</dt><dd>${esc(names(put))}.</dd>` : ''}
          ${deps.length ? `<dt>Inputs</dt><dd>${esc(deps.map((c) => (c.dependentRefs.length ? `${c.key} (${c.ref}) supplies an input to ${joinList(c.dependentRefs)}` : `${c.key} (${c.ref}) needs ${joinList(c.prerequisiteRefs)}`)).join('; '))}.</dd>` : ''}
          ${str.length ? `<dt>Strengthen</dt><dd>${esc(names(str))}.</dd>` : ''}
        </dl></div>`;
    }).join('')}
    ${interp('What this means', `${joinList([[r.controls.filter((c) => c.purpose === 'put-in-place').length, 'control is to be put in place', 'controls are to be put in place'], [r.controls.filter((c) => c.purpose === 'resolve-answer').length, 'needs its answers settled', 'need their answers settled'], [r.controls.filter((c) => c.purpose === 'strengthen').length, 'is a related practice to strengthen', 'are related practices to strengthen']].filter(([x]) => x).map(([x, one, many]) => plural(x as number, one as string, many as string)))}. ${r.controls.some((c) => c.dependentRefs.length) ? 'Where a reviewed relationship establishes that one control consumes another\'s output, the input is designed first.' : 'No reviewed relationship establishes that one of these controls consumes another\'s output, so no control is sequenced before another for that reason.'} Each blueprint comes from MK's draft control-content library (${CONTROL_CONTENT_VERSION}), which MK has not yet approved.`)}`);

  // ---- 6. Who must own the response.
  // One row per role. The chief executive coordinates the programme; when the method also makes the chief executive
  // a control owner, the two are one row, not two.
  const roleRows = () => {
    const CEO = 'Chief executive';
    const rows = programmes.map((p) => {
      const acts = r.actions.filter((x) => x.ownerRole === p.role);
      const settle = resolveRows.filter((s) => s.confirmations[0].ownerRole === p.role).map((s) => s.name.replace(/\.$/, '')).join('; ');
      const coord = p.role === CEO ? `Names the accountable executives, decides the order of work and reports status to ${lc(r.oversight)}.` : '';
      return { role: p.role, controls: p.controls.length, scenarios: new Set([...p.controls.flatMap((c) => c.schemeRefs), ...(p.role === CEO ? acts.flatMap((x) => x.schemeRefs) : [])]).size, actions: acts.length, note: [settle ? `${settle}.` : '', coord].filter(Boolean).join(' ') || 'None' };
    });
    if (!programmes.some((p) => p.role === CEO)) {
      const acts = r.actions.filter((x) => x.ownerRole === CEO);
      rows.push({ role: CEO, controls: 0, scenarios: new Set(acts.flatMap((x) => x.schemeRefs)).size, actions: acts.length, note: `Names the accountable executives, decides the order of work and reports status to ${lc(r.oversight)}.` });
      rows.sort((a, b) => a.role.localeCompare(b.role));
    }
    return rows;
  };
  addSection('Who must own the response', (n) => `${sectionHead(n, 'Who must own the response', 'Accountability by role', `Roles, not individuals: the assessment does not identify people. The method suggests owners in many forms; this report uses one label per function, and Appendix I lists the method's wording behind each. Oversight: ${r.oversightKnown ? `${lc(r.oversight)}, from the organisation's own answer` : 'not identified in the answers'}.`)}
    <table><thead><tr><th style="width:28%">Role</th><th style="width:12%">Controls</th><th style="width:12%">Scenarios</th><th style="width:12%">Actions</th><th style="width:36%">Answers to settle or questions to answer</th></tr></thead>
    <tbody>${roleRows().map((x) => `<tr><td><strong>${esc(x.role)}</strong></td><td class="tight">${x.controls}</td><td class="tight">${x.scenarios}</td><td class="tight">${x.actions}</td><td class="small">${esc(x.note)}</td></tr>`).join('')}</tbody></table>`);

  // ---- 7. Decisions leadership must make.
  addSection('Decisions leadership must make', (n) => `${sectionHead(n, 'Decisions leadership must make', 'The decision agenda', 'A recommended direction follows the method and the answers; the decision remains management\'s. No deadline is set: "when" states what each decision must come before.')}
    <table><thead><tr><th style="width:5%">Ref</th><th style="width:22%">Decision</th><th style="width:20%">Why</th><th style="width:29%">Recommended direction</th><th style="width:11%">When</th><th style="width:13%">If delayed</th></tr></thead>
    <tbody>${r.decisions.map((d) => `<tr><td class="id">${esc(d.ref)}</td><td><strong>${esc(d.decision)}</strong></td><td>${esc(d.why)}</td><td>${esc(d.recommendedDirection)}</td><td>${esc(d.when)}</td><td>${esc(d.consequenceOfDelay)}</td></tr>`).join('')}</tbody></table>`);

  // ---- 8. Proposed implementation stages.
  addSection('Proposed implementation stages', (n) => `${sectionHead(n, 'Proposed implementation stages', 'A twelve-month programme, in proposed stages', 'Each stage has a proposed planning window for when it could start. The windows are proposals for management\'s own plan: not deadlines, not contractual dates and not estimates of how long any control takes to design, put in place or show to be operating. Every action is in Appendix E.')}
    <table><thead><tr><th style="width:4%">Stage</th><th style="width:16%">Stage</th><th style="width:15%">Proposed window</th><th style="width:25%">Purpose</th><th style="width:6%">Actions</th><th style="width:34%">Includes</th></tr></thead>
    <tbody>${r.phases.map((p, i) => { const xs = r.actions.filter((x) => x.phase === p.n); return `<tr><td class="tight">${i + 1}</td><td><strong>${esc(p.title)}</strong></td><td class="small">${esc(p.window)}</td><td class="small">${esc(p.purpose)}</td><td class="tight">${xs.length}</td><td class="small">${esc(xs.slice(0, 2).map((x) => x.action).join(' '))}${xs.length > 2 ? ` <span class="muted">${xs.length - 2} more in Appendix E.</span>` : ''}</td></tr>`; }).join('')}</tbody></table>
    ${interp('What this means', `The first two stages need no new control: they establish the facts, name owners and decide the order of work. ${r.controls.some((c) => c.dependentRefs.length) ? 'The prerequisite stage puts in place the controls whose output another control consumes, as reviewed relationships establish.' : 'No control here consumes another\'s output as far as reviewed relationships establish, so no prerequisite stage is needed.'} A control counts as working only after it has met its success measure for at least one full operating cycle; for annual controls that may fall beyond the twelve months. Status is reported to ${lc(r.oversight)} throughout.`)}`);

  // ---- 9. How management will know it is working.
  const cycles = (cs: ControlBlueprint[]) => { const m = new Map<string, number>(); cs.forEach((c) => m.set(c.operatingCycle, (m.get(c.operatingCycle) ?? 0) + 1)); return [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([c, x]) => `${c} (${x})`).join('; '); };
  addSection('How management will know it is working', (n) => `${sectionHead(n, 'How management will know it is working', 'Indicators and the management scorecard', 'Each control has one success measure, stated as the outcome its records should show for a period (Appendix F). They are the signals management should expect once a control operates, not a claim that they exist today.')}
    <table><thead><tr><th style="width:40%">Indicator</th><th style="width:25%">Today</th><th style="width:35%">Expected</th></tr></thead>
    <tbody>
      ${inconsistent.length ? `<tr><td><strong>Scenarios with answers to settle</strong></td><td>${inconsistent.length}</td><td>None; each corrected answer recorded</td></tr>` : ''}
      ${clarify.length ? `<tr><td><strong>Questions the answers leave open</strong></td><td>${clarify.length}</td><td>Each answered in writing and added to the record</td></tr>` : ''}
      ${r.outstanding.length ? `<tr><td><strong>Outstanding answers</strong></td><td>${r.outstanding.length}</td><td>Each answered, or an open item with an owner</td></tr>` : ''}
      <tr><td><strong>Open scenarios with a named owner and a recorded decision</strong></td><td>None recorded (${gapSchemes.length} open)</td><td>Every open scenario selected, deferred with a reason or accepted</td></tr>
      <tr><td><strong>Controls meeting their success measure for a full cycle</strong></td><td>Not measured</td><td>Each control put in place (${r.controls.filter((c) => c.purpose === 'put-in-place').length}), then each related practice strengthened</td></tr>
      <tr><td><strong>Status reported to ${esc(lc(r.oversight))}</strong></td><td>Not yet</td><td>At each meeting until each scenario is closed, deferred or accepted</td></tr>
    </tbody></table>
    <h2>The scorecard, by owner</h2>
    <table><thead><tr><th style="width:30%">Owner</th><th style="width:12%">Measures</th><th style="width:58%">Most common operating cycles</th></tr></thead>
    <tbody>${programmes.map((p) => `<tr><td><strong>${esc(p.role)}</strong></td><td class="tight">${p.controls.length}</td><td class="small">${esc(cycles(p.controls))}</td></tr>`).join('')}</tbody></table>
    ${interp('Conclusion', [
      scenarioAccount(r).sentence,
      resolveRows.length ? `The first task is to ${joinList([inconsistent.length ? `settle the answers for ${plural(inconsistent.length, 'scenario', 'scenarios')}` : '', clarify.length ? `answer the ${plural(clarify.length, 'open question', 'open questions')}` : ''].filter(Boolean))}.` : '',
      'MK has not approved a readiness method, so the report draws no readiness conclusion and does not rank fraud risks; it sets out what each scenario needs, who owns it, the records to keep and how management will know each control is working.'
    ].filter(Boolean).join(' '))}`);

  // ---- Appendices: every register row, in full.
  const appendix = (letter: string, title: string, count: number, note: string, body: string) => { appendices.push([letter, title, count]); pages.push(`<section class="reg">${strip}<div class="reg-head"><div class="n">Appendix ${letter}</div><h1>${esc(title)}</h1><div class="reg-note">${esc(note)}</div></div>${body}</section>`); };
  appendix('A', 'Finding register', r.findings.length, 'Every scenario with answers to settle, a question to clarify, a control reported as a gap or a related practice weaker, in the method\'s order. "What the answers show" is self-reported and has not been verified. Decision factors are the facts the assessment holds for ordering the work; they are not a rating.',
    `<table><thead><tr><th style="width:6%">Ref</th><th style="width:20%">Scenario</th><th style="width:36%">What the answers show</th><th style="width:26%">How it happens and why it matters (method)</th><th style="width:12%">Decision factors</th></tr></thead>
    <tbody>${r.findings.map((f) => `<tr><td class="id">${esc(f.ref)}<div>${esc(f.schemeRef)}</div></td><td><strong>${esc(f.title)}</strong><div class="cap">${esc(f.areaName)}</div><div><span class="kind ${KIND_CLASS[f.kind]}">${esc(KIND_LABEL[f.kind])}</span></div></td><td>${esc(f.position)}${f.questions.length ? `<div style="margin-top:.8mm"><strong>Question:</strong> ${esc(f.questions.join(' '))}</div>` : ''}<div class="cap" style="margin-top:.8mm">Answered by ${esc(joinList(f.answeredBy))}.</div></td><td>${esc([f.mechanism, f.whyItMatters].filter(Boolean).join(' ') || 'The method does not describe this scenario further.')}</td><td class="small">${esc(f.factors.controlPosition)}${f.factors.controlsShared ? `<div>Control also serves ${plural(f.factors.controlsShared, 'other scenario', 'other scenarios')}</div>` : ''}${f.factors.outstandingAnswers ? `<div>${plural(f.factors.outstandingAnswers, 'answer', 'answers')} outstanding</div>` : ''}<div class="id">${esc([f.riskRef, ...f.controlRefs].filter(Boolean).join(', '))}</div></td></tr>`).join('')}</tbody></table>`);
  appendix('B', 'Fraud risk register', r.risks.length, 'One risk for each scenario with a control reported as a gap or answers to settle. No likelihood, impact, priority or monetary value is assigned: MK has not yet approved a method for rating them.',
    `<table><thead><tr><th style="width:6%">Ref</th><th style="width:32%">Risk</th><th style="width:24%">Current position</th><th style="width:22%">Treatment</th><th style="width:16%">Owner</th></tr></thead>
    <tbody>${r.risks.map((x) => `<tr><td class="id">${esc(x.ref)}<div>${esc(x.findingRef)}</div></td><td><strong>${esc(x.statement)}</strong>${x.consequence ? `<div class="cap" style="margin-top:.8mm">${esc(x.consequence)}</div>` : ''}<div class="cap" style="margin-top:.8mm">Not rated.</div></td><td>${esc(x.currentPosition)}</td><td class="small">${esc(x.treatment)}</td><td>${esc(x.ownerRole)}</td></tr>`).join('')}</tbody></table>`);
  const block = (c: ControlBlueprint) => `<div class="bp">
      <div class="top"><div><span class="id">${esc(c.ref)}</span> <span class="nm">${esc(c.key)}</span></div><div class="mt">${esc(c.ownerRole)} · ${esc(c.schemeRefs.join(', '))}</div></div>
      <div class="g2">
        <div><div class="h">Reported today</div>${esc(c.reported)}${c.answeredBy !== 'the respondent' ? ` <span class="muted">(answered by ${esc(c.answeredBy)})</span>` : ''}</div>
        <div><div class="h">Target operating practice</div>${c.target ? esc(c.target) : '<span class="muted">As the method\'s standard describes.</span>'}</div>
      </div>
      <div style="margin-top:1.6mm"><div class="h">Implementation activities</div><ol>${c.activities.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></div>
      <div class="g3">
        <div><div class="h">Records to keep${c.recordRefs.length ? ` · ${esc(c.recordRefs.join(', '))}` : ''}</div>${esc(c.recordName ? c.recordName.charAt(0).toUpperCase() + c.recordName.slice(1) : 'Not named')}<div class="muted">Cycle: ${esc(c.operatingCycle)}</div></div>
        <div><div class="h">Success measure · ${esc(c.ref.replace('C', 'M'))}</div>${esc(c.successMeasure)}</div>
        <div><div class="h">If it fails</div>${esc(c.onFailure ?? METHOD_SETS_NO_ESCALATION)}</div>
      </div>
    </div>`;
  const purposes: ControlBlueprint['purpose'][] = ['resolve-answer', 'put-in-place', 'strengthen'];
  appendix('C', 'Control blueprint register', r.controls.length, `Each control once, with every scenario it serves, grouped by what is to be done and then in the method's order. "Reported today" is what the organisation answered; the target practice, activities, records, measure and failure response come from MK's draft control-content library (${CONTROL_CONTENT_VERSION}), which is advisory content and not approved. The method's own wording and source references for each control are in the supporting workbook.`,
    purposes.map((p) => { const cs = r.controls.filter((c) => c.purpose === p); return cs.length ? `<div class="grp">${esc(PURPOSE_LABEL[p])} · ${cs.length}</div>${cs.map(block).join('')}` : ''; }).join(''));
  appendix('D', 'Records management should maintain', r.records.length, 'The records each control should produce as it operates, for management to keep. MK has not requested, received or examined any of them. Independent review of evidence is a separate Advisory service; this report does not perform it.',
    `<table><thead><tr><th style="width:7%">Ref</th><th style="width:62%">Record and what it shows</th><th style="width:13%">Controls</th><th style="width:18%">Kept by</th></tr></thead>
    <tbody>${r.records.map((x) => `<tr><td class="id">${esc(x.ref)}</td><td>${esc(x.text)}</td><td class="id">${esc(x.controlRefs.join(', '))}</td><td>${esc(x.ownerRoles.join('; '))}</td></tr>`).join('')}</tbody></table>`);
  appendix('E', 'Action register', r.actions.length, 'Every action in the programme, grouped by proposed stage. The windows are proposals for planning, not deadlines or estimates.',
    `<table><thead><tr><th style="width:6%">Ref</th><th style="width:38%">Action</th><th style="width:14%">Owner</th><th style="width:21%">Deliverable</th><th style="width:21%">Complete when</th></tr></thead>
    <tbody>${r.phases.map((ph, i) => `<tr><td colspan="5" style="background:var(--cream)"><span class="grp" style="margin:0">Stage ${i + 1} · ${esc(ph.title)}</span> <span class="cap">${esc(ph.window)}</span></td></tr>${r.actions.filter((x) => x.phase === ph.n).map((x) => `<tr><td class="id">${esc(x.ref)}${x.dependsOn.length ? `<div>after ${esc(x.dependsOn.join(', '))}</div>` : ''}</td><td>${esc(x.action)}</td><td>${esc(x.ownerRole)}</td><td class="small">${esc(x.deliverable)}</td><td class="small">${esc(x.completionTest)}</td></tr>`).join('')}`).join('')}</tbody></table>`);
  appendix('F', 'Management scorecard', r.measures.length, 'The success measures, grouped by the owner who reports them, with each control\'s operating cycle. Each measure is stated once, in full, in its control\'s blueprint (Appendix C) and in the supporting workbook.',
    `<table><thead><tr><th style="width:8%">Measure</th><th style="width:8%">Control</th><th style="width:52%">Control name</th><th style="width:32%">Operating cycle</th></tr></thead>
    <tbody>${programmes.map((p) => `<tr><td colspan="4" style="background:var(--cream)"><span class="grp" style="margin:0">${esc(p.role)}</span> <span class="cap">${plural(p.controls.length, 'measure', 'measures')}</span></td></tr>${p.controls.map((c) => `<tr><td class="id">${esc(c.ref.replace('C', 'M'))}</td><td class="id">${esc(c.ref)}</td><td>${esc(c.key)}</td><td class="small">${esc(c.operatingCycle)}</td></tr>`).join('')}`).join('')}</tbody></table>`);
  appendix('G', 'Answer relationships', r.relations.length, 'For each control reported fully in place, every related practice of the same scenario reported weaker, with no case yet or outstanding, and how the two relate. A practice answered "not applicable" is outside scope and is not listed. Only answers that cannot both be right, or a control lacking an input it needs, are unresolved inconsistencies; a reviewed pair the answers leave open is a question to clarify; a pair not yet reviewed supports no conclusion.',
    r.relations.length ? `<table><thead><tr><th style="width:6%">Scenario</th><th style="width:18%">Control reported in place</th><th style="width:22%">Related practice and its answer</th><th style="width:15%">Relationship</th><th style="width:39%">What it means</th></tr></thead>
    <tbody>${r.relations.map((x) => `<tr><td class="id">${esc(x.schemeRef)}</td><td><strong>${esc(x.confirmationName)}</strong></td><td>${esc(x.practiceReported)}</td><td><span class="kind ${x.type === 'direct-contradiction' || x.type === 'necessary-dependency' ? 'res' : x.question ? 'clar' : 'qual'}">${esc(x.label)}</span><div class="cap">${esc(x.basis === 'reviewed-pair' ? 'Reviewed pair' : x.basis === 'answer' ? 'From the answer' : x.basis === 'semantics-not-met' ? 'Reviewed conditions not met' : 'Not reviewed')}</div></td><td class="small">${esc(x.type === 'complementary-weakness' ? named(x.rationale) : x.statement)}${x.question ? `<div style="margin-top:.8mm"><strong>Question:</strong> ${esc(x.question)}</div>` : ''}</td></tr>`).join('')}</tbody></table>` : '<p class="small">No control reported fully in place has a related practice reported weaker, with no case yet or outstanding.</p>');
  appendix('H', 'Outstanding information', r.outstanding.length, 'Every question asked and not answered. A declined question, a question answered "I don\'t know" and a question still waiting are all outstanding; none is treated as answered.',
    r.outstanding.length ? `<table><thead><tr><th style="width:6%">Ref</th><th style="width:26%">Control</th><th style="width:20%">Status</th><th style="width:20%">Function</th><th style="width:28%">Scenario</th></tr></thead>
    <tbody>${r.outstanding.map((o) => `<tr><td class="id">${esc(o.ref)}</td><td><strong>${esc(o.key)}</strong></td><td>${esc(o.reasonText)}${o.declineReason ? `<div class="cap">${esc(o.declineReason)}</div>` : ''}</td><td>${esc(o.fn ?? 'Not assigned')}</td><td>${esc(o.schemeName ?? 'Not linked to a scenario')}</td></tr>`).join('')}</tbody></table>` : '<p class="small">No answer is outstanding.</p>');
  appendix('I', 'Roles used in this report', r.roles.length, 'Each consolidated role and the method\'s own suggested owners behind it.',
    `<table><thead><tr><th style="width:28%">Role in this report</th><th style="width:72%">Method wording</th></tr></thead>
    <tbody>${r.roles.map((x) => `<tr><td><strong>${esc(x.role)}</strong></td><td class="small">${esc(x.methodLabels.join('; '))}</td></tr>`).join('')}</tbody></table>`);
  const suff = r.sufficiency;
  const areaName = (ar: string) => S.find((s) => s.area === ar)?.areaName ?? ar;
  appendix('J', 'Information coverage', suff.coverage.byArea.length, 'What the assessment establishes and what remains unknown: the confirmations answered in each area and the diagnostic questions put to each function. Questions the method did not ask are not counted, and nothing is concluded about them.',
    `<table><thead><tr><th style="width:44%">Area</th><th style="width:18%">Confirmations that apply</th><th style="width:18%">Answered</th><th style="width:20%">Share answered</th></tr></thead>
    <tbody>${suff.coverage.byArea.map((x) => `<tr><td><strong>${esc(areaName(x.area))}</strong></td><td class="tight">${x.applicable}</td><td class="tight">${x.answered}</td><td class="tight">${Math.round(x.share * 100)}%</td></tr>`).join('')}</tbody></table>
    ${suff.functions.length ? `<h2>Diagnostic questions put to functions</h2><table><thead><tr><th style="width:36%">Function</th><th style="width:13%">Asked</th><th style="width:13%">Answered</th><th style="width:13%">Declined</th><th style="width:13%">Not known</th><th style="width:12%">Waiting</th></tr></thead>
    <tbody>${suff.functions.map((f) => `<tr><td><strong>${esc(f.fn)}</strong>${f.declinedInFull ? ' <span class="kind res">declined in full</span>' : ''}</td><td class="tight">${f.items}</td><td class="tight">${f.answered}</td><td class="tight">${f.declined}</td><td class="tight">${f.unknown}</td><td class="tight">${f.waiting}</td></tr>`).join('')}</tbody></table>` : ''}`);

  // ---- Contents and basis, inserted after the cover now that sections and appendices are known.
  const basis = `${figure.label} This report is produced by fixed rules from the organisation\'s answers to the MK Fraud Readiness review, read against the draft review method and the draft control-content library, neither of which MK has yet approved. The AI manuscript stage has not been run; the interpretation in each section is fixed-rule text. No evidence has been examined, no control has been tested for operating effectiveness, no one has been interviewed and no assurance opinion is given. Records named in this report are records management should maintain; independent review of evidence is a separate Advisory service.`;
  pages.splice(1, 0, `<section class="page">${strip}
    <div class="q">How to read this report</div>
    <h1>Contents</h1>
    <div class="toc">
      <div class="row head"><span>Management report</span><span class="sec">Sections 1–${sections.length}</span></div>
      ${sections.map(([sn, t]) => `<div class="row"><span>${sn} · ${esc(t)}</span></div>`).join('')}
      <div class="row head"><span>Registers</span><span class="sec">Appendices A–${appendices.at(-1)?.[0] ?? 'A'}</span></div>
      ${appendices.map(([l, t, c]) => `<div class="row"><span>${l} · ${esc(t)}</span><span class="muted">${c} entries</span></div>`).join('')}
    </div>
    <div class="panel"><div class="l">The two halves of this report</div><p class="note">Sections 1–${sections.length} are the management report. The appendices hold every scenario, risk, control blueprint, record, action, measure, answer relationship and outstanding answer behind it, and the supporting workbook holds the same registers with the method references that trace each row to the question asked and the answer given.</p></div>
    <div class="panel"><div class="l">Basis of this report</div><p class="note">${esc(basis)}</p></div>
    <div class="sp"></div>
  </section>`);

  const html = `<!doctype html><html lang="en-ZA"><head><meta charset="utf-8"><title>MK Fraud Readiness Comprehensive: ${esc(input.organisationName)}</title><style>${existingComprehensiveStyles()}${EXTRA_STYLES}</style></head><body>${pages.join('')}</body></html>`;
  return { html, sections: sections.map(([sn, t]) => ({ n: Number(sn), title: t })), appendices: appendices.map(([letter, title, count]) => ({ letter, title, count })) };
}
