import { PROGRAMME_WORK_TYPE_LABEL } from './assembly';
import type { ComprehensiveManagementModel } from './management-model';

/**
 * Comprehensive report composition.
 *
 * Two page grammars in one document. The management core uses fixed A4 pages,
 * one purpose each, with room for the bounded interpretation a later phase will
 * add. The registers flow: their tables break across pages and repeat their
 * headers, because a 34-control register laid out as one object per page is the
 * difference between a 40-page report and a 100-page one.
 *
 * Visual primitives — palette, typography, page geometry, table treatment — are
 * the frozen Essential ones, so Comprehensive reads as the deeper product in the
 * same family. The page structure is not: Essential's eight-page grammar is its
 * own product.
 *
 * This module makes no analytical decisions and contains no prose about the
 * organisation. Every value arrives settled from the management model.
 */

const esc = (value: unknown): string =>
  String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const list = (items: string[], empty = '—'): string =>
  items.filter(Boolean).length ? `<ul>${items.filter(Boolean).map((item) => `<li>${esc(item)}</li>`).join('')}</ul>` : `<span class="muted">${empty}</span>`;

const cell = (value: unknown, fallback = '—'): string => {
  const text = String(value ?? '').trim();
  return text ? esc(text) : `<span class="muted">${fallback}</span>`;
};

/**
 * Where bounded AI will later add interpretation. Rendered as a labelled space
 * so the deterministic report is complete on its own and the future narrative
 * has an explicit, bounded home rather than being sprinkled through registers.
 */
function interpretationSlot(label: string, commentary?: string): string {
  if (commentary) return `<div class="interp"><div class="interp-l">${esc(label)}</div><p>${esc(commentary)}</p></div>`;
  return `<div class="interp interp--pending"><div class="interp-l">${esc(label)}</div><p class="muted">Management interpretation is added at generation. The analysis on this page stands without it.</p></div>`;
}

const STYLES = `
:root{
  --navy-900:#0B1B33;--navy-700:#142F4C;--navy-500:#2C4A6B;--navy-300:#8FA3B5;
  --ink:#1A2634;--muted:#5A6B7C;--rule:#D9E1E7;--rule-soft:#EDF1F4;
  --cream:#FBF9F5;--white:#FFFFFF;--brass:#C9A227;--brass-soft:#F0E6C8;
  --weak:#A32020;--mid:#B8761F;--strong:#1F6B4A;
}
*{box-sizing:border-box;margin:0;padding:0}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:'Avenir Next','Helvetica Neue',Helvetica,Arial,sans-serif;color:var(--ink);
  font-size:9.4pt;line-height:1.45;font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased}
@page{size:A4;margin:16mm 14mm 18mm 14mm}

/* fixed core page */
.page{width:182mm;height:263mm;position:relative;overflow:hidden;page-break-after:always;display:flex;flex-direction:column}
.page--navy{background:var(--navy-900);color:#fff;margin:-16mm -14mm;padding:26mm 20mm 20mm;width:210mm;height:297mm}
.q{font-size:6.8pt;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--brass)}
h1{font-size:18pt;line-height:1.18;font-weight:700;color:var(--navy-900);letter-spacing:-.01em;margin-top:2.5mm}
h2{font-size:10.5pt;font-weight:700;color:var(--navy-700);margin:5mm 0 2.5mm}
h3{font-size:9.4pt;font-weight:700;color:var(--navy-900);margin-bottom:1.5mm}
p{max-width:168mm}
.lede{font-size:10.2pt;line-height:1.5;max-width:165mm}
.cap{font-size:7pt;color:var(--muted)}
.muted{color:var(--muted)}
.gap{height:5mm}.sp{flex:1}
ul{margin:1mm 0 0 4mm}li{margin:.8mm 0}

/* flowing register section */
.reg{page-break-before:always}
.reg-head{border-top:2.5px solid var(--navy-900);padding-top:3mm;margin-bottom:4mm}
.reg-head .n{font-size:7pt;letter-spacing:.14em;text-transform:uppercase;color:var(--brass);font-weight:700}
.reg-head h1{margin-top:1.5mm;font-size:15pt}
.reg-note{font-size:7.4pt;color:var(--muted);margin-top:2mm;max-width:168mm}

/* tables */
table{width:100%;border-collapse:collapse;font-size:7.1pt;margin-top:2.5mm}
thead{display:table-header-group}
tr{page-break-inside:avoid}
th{background:var(--navy-700);color:#fff;font-size:6.2pt;font-weight:700;letter-spacing:.07em;
  text-transform:uppercase;text-align:left;padding:1.6mm 1.8mm;vertical-align:bottom}
td{padding:1.5mm 1.8mm;border-bottom:1px solid var(--rule);vertical-align:top;line-height:1.3}
tbody tr:nth-child(even) td{background:var(--rule-soft)}
td.id{font-size:6.8pt;color:var(--muted);white-space:nowrap}
td.tight{white-space:nowrap}
.tag{display:inline-block;font-size:6.2pt;font-weight:700;letter-spacing:.05em;text-transform:uppercase;
  padding:.6mm 1.4mm;border-radius:1mm;background:var(--rule-soft);color:var(--navy-700)}
.tag.crit{background:#FBEDED;color:var(--weak)}
.tag.gate{background:var(--brass-soft);color:#7a6011}

/* core exhibits */
.stats{display:flex;gap:8mm;border-top:2px solid var(--navy-900);border-bottom:1px solid var(--rule);padding:4mm 0;margin-top:3mm}
.stats .s{flex:1}
.stats .n{font-size:21pt;font-weight:700;color:var(--navy-900);line-height:1;letter-spacing:-.02em}
.stats .l{font-size:6.6pt;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-top:1.4mm;line-height:1.35}
.bars{width:100%;font-size:7.8pt;margin-top:2mm}
.bars .row{display:flex;align-items:center;gap:2.5mm;padding:1.2mm 0;border-bottom:1px solid var(--rule-soft)}
.bars .nm{width:58mm}.bars .track{flex:1;height:6px;background:var(--rule-soft);position:relative}
.bars .fill{position:absolute;left:0;top:0;bottom:0;background:var(--navy-500)}
.bars .fill.weak{background:var(--weak)}.bars .fill.strong{background:var(--strong)}
.bars .val{width:14mm;text-align:right;font-weight:600}
.bars .band{width:20mm;text-align:right;color:var(--muted);font-size:6.8pt}
.prog{border-top:2px solid var(--navy-900);padding-top:2.5mm;margin-bottom:4mm;page-break-inside:avoid}
.prog .hd{display:flex;justify-content:space-between;align-items:baseline}
.prog .qn{font-size:8pt;color:var(--navy-500);margin:1mm 0 1.5mm;font-style:italic}
.prog .meta{font-size:6.8pt;letter-spacing:.08em;text-transform:uppercase;color:var(--brass);font-weight:700}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:5mm}
.panel{background:var(--cream);border-left:3px solid var(--navy-700);padding:3.5mm 4.5mm;margin-top:3mm}
.panel .l{font-size:6.6pt;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--navy-700);margin-bottom:1.5mm}
.interp{border-left:3px solid var(--brass);background:#FDFBF4;padding:3.5mm 4.5mm;margin-top:4mm}
.interp-l{font-size:6.6pt;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#7a6011;margin-bottom:1.5mm}
.interp--pending p{font-size:7.6pt}
.toc{font-size:8.6pt;margin-top:4mm}
.toc .row{display:flex;justify-content:space-between;padding:1.6mm 0;border-bottom:1px solid var(--rule-soft)}
.toc .row.head{font-weight:700;color:var(--navy-900);border-bottom-color:var(--rule);margin-top:3mm}
.toc .sec{color:var(--muted);font-size:7.2pt;letter-spacing:.1em;text-transform:uppercase}
.note{font-size:7.2pt;color:var(--muted);line-height:1.5;max-width:168mm}
`;

const BASIS = 'This report is produced by automated analysis of the recorded MK Fraud Readiness assessment. It has not been independently reviewed. No evidence has been examined, no control has been tested for operating effectiveness, no personnel have been interviewed, and no assurance opinion is given. Assessment positions are self-reported by the organisation. Recommended control designs, evidence requirements and operating measures are MK methodology — what good practice requires — not observations of what the organisation currently does.';

export function renderComprehensiveManagementReportHtml(input: {
  model: ComprehensiveManagementModel;
  organisationName: string;
  assessmentReference: string;
  reportReference?: string;
  generatedAt?: string;
  score: number;
  maturity: string;
  domains: Array<{ title: string; score: number; band: string; emphasis?: 'weak' | 'strong' | 'neutral' }>;
  commentary?: Record<string, string>;
}): string {
  const { model, commentary = {} } = input;
  const core = model.core;
  const reg = model.registers;
  const pages: string[] = [];

  const roleName = new Map(core.governanceRoles.map((role) => [role.canonicalRoleId, role.displayRole]));

  // ---- 1. Cover -------------------------------------------------------------
  pages.push(`<section class="page page--navy">
    <div style="font-size:7.2pt;letter-spacing:.18em;text-transform:uppercase;color:var(--brass);font-weight:600">MK Fraud Insights</div>
    <div style="height:16mm"></div>
    <div style="font-size:7.6pt;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.62)">Comprehensive Fraud Readiness Report</div>
    <h1 style="color:#fff;font-size:27pt;line-height:1.16;max-width:165mm;margin-top:6mm">Fraud exposure, target control environment and implementation programme</h1>
    <div class="sp"></div>
    <div style="border-top:2px solid var(--brass);padding-top:5mm;display:flex;gap:12mm;align-items:flex-end">
      <div><div style="font-size:34pt;font-weight:700;line-height:.9">${input.score.toFixed(2)}</div><div style="font-size:7pt;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.55);margin-top:2mm">Readiness / 100</div></div>
      <div><div style="font-size:15pt;font-weight:600;letter-spacing:.04em;text-transform:uppercase">${esc(input.maturity)}</div><div style="font-size:7pt;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.55);margin-top:2mm">Maturity band</div></div>
    </div>
    <div style="height:9mm"></div>
    <div style="font-size:7pt;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.55)">Prepared for</div>
    <div style="font-size:15pt;font-weight:600;margin-top:2mm">${esc(input.organisationName)}</div>
    <div style="font-size:8pt;color:rgba(255,255,255,.7);margin-top:3mm">Assessment reference · ${esc(input.assessmentReference)}</div>
    ${input.reportReference ? `<div style="font-size:8pt;color:rgba(255,255,255,.7)">Report reference · ${esc(input.reportReference)}</div>` : ''}
    <div style="height:6mm"></div>
    <div style="font-size:7pt;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.42)">Confidential · Automated analysis · Not independently reviewed</div>
  </section>`);

  // ---- 2. Contents and basis ------------------------------------------------
  const coreEntries: Array<[string, string]> = [
    ['1', 'Where the organisation stands'],
    ['2', 'What is driving the position'],
    ['3', 'Where the material fraud exposure sits'],
    ['4', 'The control environment management should build'],
    ['5', 'Who must own the response'],
    ['6', 'Decisions leadership must make'],
    ['7', 'What should happen, and in what order'],
    ['8', 'How management will know it is working']
  ];
  const registerEntries: Array<[string, string, number]> = [
    ['A', 'Finding register', reg.findings.length],
    ['B', 'Fraud risk register', reg.risks.length],
    ['C', 'Control blueprint register', reg.controls.length],
    ['D', 'Evidence requirement register', reg.evidence.reduce((sum, group) => sum + group.items.length, 0)],
    ['E', '12-month action and assurance register', reg.actions.length],
    ['F', 'Measurement register', reg.measures.length]
  ];
  pages.push(`<section class="page">
    <div class="q">How to read this report</div>
    <h1>Contents</h1>
    <div class="toc">
      <div class="row head"><span>Management report</span><span class="sec">Sections 1–8</span></div>
      ${coreEntries.map(([n, title]) => `<div class="row"><span>${n} · ${esc(title)}</span></div>`).join('')}
      <div class="row head"><span>Analytical registers</span><span class="sec">Appendices A–F</span></div>
      ${registerEntries.map(([n, title, count]) => `<div class="row"><span>${n} · ${esc(title)}</span><span class="muted">${count} entries</span></div>`).join('')}
    </div>
    <div class="panel"><div class="l">The two halves of this report</div>
      <p class="note">Sections 1–8 are the management report: what the assessment shows, what it means, and what to do about it. Appendices A–F are the analytical registers behind those sections — every finding, risk, control design, evidence requirement, action and measure, with the identifiers that connect them. The management sections state nothing the registers do not hold.</p>
    </div>
    <div class="panel"><div class="l">Basis of this report</div><p class="note">${esc(BASIS)}</p></div>
    <div class="sp"></div>
  </section>`);

  // ---- 3. Section 1 — position ---------------------------------------------
  pages.push(`<section class="page">
    <div class="q">Where do we stand?</div>
    <h1>The assessed readiness position</h1>
    <div class="stats">
      <div class="s"><div class="n">${input.score.toFixed(2)}</div><div class="l">Readiness score out of 100</div></div>
      <div class="s"><div class="n">${esc(input.maturity)}</div><div class="l">Maturity band</div></div>
      <div class="s"><div class="n">${input.domains.length}</div><div class="l">Domains assessed</div></div>
      <div class="s"><div class="n">${reg.findings.length}</div><div class="l">Material findings</div></div>
      <div class="s"><div class="n">${reg.controls.length}</div><div class="l">Control designs recommended</div></div>
    </div>
    <h2>Domain readiness profile</h2>
    <div class="bars">${input.domains.map((domain) => `<div class="row">
      <div class="nm">${esc(domain.title)}</div>
      <div class="track"><div class="fill ${domain.emphasis === 'weak' ? 'weak' : domain.emphasis === 'strong' ? 'strong' : ''}" style="width:${Math.max(1, Math.min(100, domain.score))}%"></div></div>
      <div class="val">${domain.score.toFixed(2)}</div><div class="band">${esc(domain.band)}</div></div>`).join('')}</div>
    <div class="cap" style="margin-top:2mm">Ordered as assessed. Positions are self-reported through the assessment and have not been independently verified.</div>
    ${interpretationSlot('Executive interpretation', commentary['EXECUTIVE-POSITION'])}
    <div class="sp"></div>
  </section>`);

  // ---- 4. Section 2 — management themes -------------------------------------
  pages.push(`<section class="page">
    <div class="q">What is driving that position?</div>
    <h1>The patterns beneath the score</h1>
    <p class="lede">The assessment produced ${reg.findings.length} material findings. They resolve into ${core.managementThemes.length} connected patterns, ordered by how much of the organisation's critical control population each one affects.</p>
    <table>
      <thead><tr><th style="width:29%">Pattern</th><th style="width:9%">Findings</th><th style="width:9%">Critical</th><th style="width:9%">Hard gate</th><th style="width:44%">Management question this raises</th></tr></thead>
      <tbody>${core.managementThemes.map((theme) => `<tr>
        <td><strong>${esc(theme.title)}</strong><div class="cap" style="margin-top:.8mm">${esc(theme.domains.slice(0, 3).join(' · '))}</div></td>
        <td class="tight">${theme.findingIds.length}</td>
        <td class="tight">${theme.criticalFindingCount ? `<span class="tag crit">${theme.criticalFindingCount}</span>` : '—'}</td>
        <td class="tight">${theme.hardGateFindingCount ? `<span class="tag gate">${theme.hardGateFindingCount}</span>` : '—'}</td>
        <td>${esc(theme.managementQuestion)}</td></tr>`).join('')}</tbody>
    </table>
    <div class="cap" style="margin-top:2mm">Every finding behind these patterns is listed in Appendix A.</div>
    ${interpretationSlot('Why this matters', commentary['DIAGNOSIS'])}
    <div class="sp"></div>
  </section>`);

  // ---- 5. Section 3 — exposure ----------------------------------------------
  pages.push(`<section class="page">
    <div class="q">Where is the material fraud exposure?</div>
    <h1>Exposure by control family</h1>
    <p class="lede">${reg.risks.length} fraud risks arise from the assessed position. They concentrate in ${core.exposureThemes.length} exposure families.</p>
    <table>
      <thead><tr><th style="width:30%">Exposure family</th><th style="width:10%">Risks</th><th style="width:16%">Domains affected</th><th style="width:44%">What the organisation is exposed to</th></tr></thead>
      <tbody>${core.exposureThemes.map((theme) => `<tr>
        <td><strong>${esc(theme.title)}</strong></td>
        <td class="tight">${theme.riskIds.length}</td>
        <td>${esc(theme.domains.slice(0, 2).join(' · ')) || '<span class="muted">—</span>'}</td>
        <td>${esc(theme.managementQuestion)}</td></tr>`).join('')}</tbody>
    </table>
    <div class="cap" style="margin-top:2mm">Full risk statements, causes and treatment directions are in Appendix B. Risks are derived from assessed control positions; no likelihood or monetary value is assigned, because the assessment does not support one.</div>
    ${interpretationSlot('Management implication', commentary['EXPOSURE'])}
    <div class="sp"></div>
  </section>`);

  // ---- 6. Section 4 — control programmes (2 per page) ------------------------
  pages.push(`<section class="page">
    <div class="q">What control environment should we build?</div>
    <h1>The control programmes</h1>
    <p class="lede">The ${reg.controls.length} recommended control designs group into ${core.controlProgrammes.length} programmes. Each is one coherent piece of work with one accountable executive.</p>
    <table>
      <thead><tr><th style="width:30%">Programme</th><th style="width:9%">Controls</th><th style="width:10%">Evidence</th><th style="width:9%">Measures</th><th style="width:22%">Accountable</th><th style="width:20%">Horizon</th></tr></thead>
      <tbody>${core.controlProgrammes.map((programme) => `<tr>
        <td><strong>${esc(programme.title)}</strong></td>
        <td class="tight">${programme.controlIds.length}</td>
        <td class="tight">${programme.evidenceItemCount}</td>
        <td class="tight">${programme.measureCount}</td>
        <td>${cell(roleName.get(programme.accountableRoleId))}</td>
        <td>${cell(programme.targetPeriods.join(', '))}</td></tr>`).join('')}</tbody>
    </table>
    <div class="cap" style="margin-top:2mm">Individual control designs are in Appendix C; the evidence each requires is in Appendix D.</div>
    ${interpretationSlot('Control programme synthesis', commentary['CONTROL-PROGRAMMES'])}
    <div class="sp"></div>
  </section>`);

  const programmeChunks: typeof core.controlProgrammes[] = [];
  for (let index = 0; index < core.controlProgrammes.length; index += 3) programmeChunks.push(core.controlProgrammes.slice(index, index + 3));
  for (const chunk of programmeChunks) {
    pages.push(`<section class="page">
      <div class="q">What control environment should we build?</div>
      <h1>Programme detail</h1>
      ${chunk.map((programme) => `<div class="prog">
        <div class="hd"><h3>${esc(programme.title)}</h3><span class="meta">${programme.controlIds.length} controls</span></div>
        <div class="qn">${esc(programme.managementQuestion)}</div>
        <div class="grid2">
          <div><div class="cap"><strong>Accountable</strong> · ${esc(roleName.get(programme.accountableRoleId) ?? '—')}</div>
               <div class="cap"><strong>Evidence expected</strong> · ${programme.evidenceItemCount} items across ${programme.evidenceGroupCount} controls</div></div>
          <div><div class="cap"><strong>Delivery horizon</strong> · ${esc(programme.targetPeriods.join(', ') || '—')}</div>
               <div class="cap"><strong>Effectiveness measures</strong> · ${programme.measureCount}</div></div>
        </div>
        <div class="cap" style="margin-top:1.5mm">Controls: ${esc(programme.controlIds.join(', '))}</div>
      </div>`).join('')}
      <div class="sp"></div>
    </section>`);
  }

  // ---- 7. Section 5 — governance --------------------------------------------
  const byType = (type: string) => core.governanceRoles.filter((role) => role.roleType === type);
  pages.push(`<section class="page">
    <div class="q">Who must own the response?</div>
    <h1>The governance model</h1>
    <p class="lede">Accountability is expressed as roles, not individuals. The assessment does not identify people, and this report does not infer them.</p>
    <table>
      <thead><tr><th style="width:26%">Role</th><th style="width:16%">Standing</th><th style="width:9%">Controls</th><th style="width:9%">Decisions</th><th style="width:10%">Evidence</th><th style="width:30%">Escalation responsibility</th></tr></thead>
      <tbody>${['EXECUTIVE_ACCOUNTABILITY', 'PROCESS_OWNERSHIP', 'OVERSIGHT'].flatMap((type) => byType(type).map((role) => `<tr>
        <td><strong>${esc(role.displayRole)}</strong></td>
        <td class="cap">${esc(type.replace(/_/g, ' ').toLowerCase())}</td>
        <td class="tight">${role.controls.length || '—'}</td>
        <td class="tight">${role.decisions.length || '—'}</td>
        <td class="tight">${role.evidenceResponsibilities.length || '—'}</td>
        <td>${role.escalationResponsibilities.length ? esc(role.escalationResponsibilities[0]!) : '<span class="muted">—</span>'}</td></tr>`)).join('')}</tbody>
    </table>
    <div class="sp"></div>
  </section>`);

  // ---- 8. Section 6 — decisions ---------------------------------------------
  pages.push(`<section class="page">
    <div class="q">What decisions must leadership make?</div>
    <h1>The decision agenda</h1>
    <table>
      <thead><tr><th style="width:22%">Decision</th><th style="width:22%">Why now</th><th style="width:22%">Recommended direction</th><th style="width:16%">Owner</th><th style="width:18%">Consequence of delay</th></tr></thead>
      <tbody>${core.decisionAgenda.map((decision) => `<tr>
        <td><strong>${cell(decision.decisionRequired)}</strong></td>
        <td>${cell(decision.whyNow)}</td>
        <td>${cell(decision.recommendedDirection)}</td>
        <td>${cell(decision.ownerRole)}<div class="cap">${cell(decision.targetPeriod, '')}</div></td>
        <td>${cell(decision.consequenceOfDelay)}</td></tr>`).join('')}</tbody>
    </table>
    <div class="cap" style="margin-top:2mm">A recommended direction is MK methodology. The decision remains management's.</div>
    <div class="sp"></div>
  </section>`);

  // ---- 9. Section 7 — implementation ----------------------------------------
  pages.push(`<section class="page">
    <div class="q">What should happen, and in what order?</div>
    <h1>The implementation programme</h1>
    <p class="lede">${reg.actions.length} actions across ${core.implementationPhases.length} horizons. Each carries an owner, a deliverable and a test that shows it is complete.</p>
    <table>
      <thead><tr><th style="width:14%">Horizon</th><th style="width:10%">Actions</th><th style="width:76%">Programmes advanced in this horizon</th></tr></thead>
      <tbody>${core.implementationPhases.map((phase) => `<tr>
        <td><strong>${esc(phase.phase)}</strong></td>
        <td class="tight">${phase.actionIds.length}</td>
        <td>${esc(phase.programmeIds.map((id) => core.controlProgrammes.find((programme) => programme.programmeId === id)?.title ?? id).join(' · '))}</td></tr>`).join('')}</tbody>
    </table>
    <div class="cap" style="margin-top:2mm">Every action, with its dependency and completion criterion, is in Appendix E.</div>
    ${interpretationSlot('Implementation synthesis', commentary['IMPLEMENTATION'])}
    <div class="sp"></div>
  </section>`);

  // ---- 10. Section 8 — measurement ------------------------------------------
  pages.push(`<section class="page">
    <div class="q">How will management know it is working?</div>
    <h1>The measurement framework</h1>
    <p class="lede">Each programme carries effectiveness measures drawn from the control designs behind it. These are the signals management should expect to see, not a claim that they exist today.</p>
    <table>
      <thead><tr><th style="width:34%">Programme</th><th style="width:12%">Measures</th><th style="width:12%">Controls</th><th style="width:42%">Accountable for reporting</th></tr></thead>
      <tbody>${core.controlProgrammes.map((programme) => `<tr>
        <td><strong>${esc(programme.title)}</strong></td>
        <td class="tight">${programme.measureCount}</td>
        <td class="tight">${programme.controlIds.length}</td>
        <td>${cell(roleName.get(programme.accountableRoleId))}</td></tr>`).join('')}</tbody>
    </table>
    <div class="cap" style="margin-top:2mm">The individual measures are in Appendix F.</div>
    ${interpretationSlot('Conclusion', commentary['CONCLUSION'])}
    <div class="sp"></div>
  </section>`);

  // ---- Registers -------------------------------------------------------------
  const registerHead = (letter: string, title: string, note: string) =>
    `<div class="reg-head"><div class="n">Appendix ${letter}</div><h1>${esc(title)}</h1><div class="reg-note">${esc(note)}</div></div>`;

  // Scenario portfolio — the same pathways Essential presents.
  //
  // Columns are fed from the Fact Pack projection, so each says what it means:
  // the beginning is a real initiating condition, the progression is the fraud
  // sequence, the interruption point is the control response that breaks it, and
  // the warning indicators are observable signals rather than expected-control
  // text. An earlier pass fed the last column from "why controls may not catch
  // it", which read as a restatement of the control standard.
  if (reg.scenarios.length) {
    pages.push(`<section class="reg">
    ${registerHead('S', 'Fraud scenario portfolio', 'Conditional pathways derived from the recorded control position. Each shows how it could begin, how it could progress, the control response that would interrupt it, and what management could observe first. No allegation that any event has occurred.')}
    <table>
      <thead><tr><th style="width:17%">Pathway</th><th style="width:19%">How it could begin</th><th style="width:20%">How it could progress</th><th style="width:20%">Interruption point</th><th style="width:16%">Warning indicators</th><th style="width:8%">Links</th></tr></thead>
      <tbody>${reg.scenarios.map((scenario) => `<tr>
        <td>${cell(scenario.title)}<div class="cap" style="margin-top:.8mm">${esc(scenario.family)}</div></td>
        <td>${cell(scenario.entryPoint)}</td>
        <td>${cell(scenario.mechanism)}</td>
        <td>${cell(scenario.interruptionPoint)}</td>
        <td>${scenario.warningIndicators.length ? `<ul>${scenario.warningIndicators.map((indicator) => `<li>${cell(indicator)}</li>`).join('')}</ul>` : '—'}</td>
        <td class="id">${esc([...scenario.linkedRiskIds, ...scenario.linkedControlIds].join(', ')) || '—'}</td></tr>`).join('')}</tbody>
    </table>
  </section>`);
  }

  // Control resilience tests — high readiness.
  //
  // Deliberately not called "stress tests". The methodology supports dependency
  // failure and a recorded deterioration trigger; it does not model system
  // migrations, turnover or volume spikes, and the section must not promise an
  // analytical object the model does not contain.
  if (reg.resilienceTests.length) {
    pages.push(`<section class="reg">
    ${registerHead('R', 'Control resilience tests', 'Each capability below is recorded as operating. These are the dependencies it rests on, what would signal deterioration, and the evidence management should inspect to confirm it still holds. No failure is alleged, and MK has performed none of this testing.')}
    <table>
      <thead><tr><th style="width:19%">Capability to sustain</th><th style="width:17%">Dependency to test</th><th style="width:19%">What would signal deterioration</th><th style="width:21%">Evidence to inspect</th><th style="width:16%">Effectiveness signal</th><th style="width:8%">Rhythm</th></tr></thead>
      <tbody>${reg.resilienceTests.map((test) => `<tr>
        <td>${cell(test.capability)}<div class="cap" style="margin-top:.8mm">${esc(test.domain)}</div></td>
        <td>${test.dependencyToTest.length ? `<ul>${test.dependencyToTest.map((dependency) => `<li>${cell(dependency)}</li>`).join('')}</ul>` : '—'}</td>
        <td>${cell(test.deteriorationCondition)}</td>
        <td>${cell(test.evidenceToInspect)}</td>
        <td>${cell(test.effectivenessSignal)}</td>
        <td class="cap">${cell(test.reviewRhythm)}<div class="id" style="margin-top:.8mm">${esc(test.linkedAssurancePriorityId)}</div></td></tr>`).join('')}</tbody>
    </table>
  </section>`);
  }

  // Assurance priorities — the high-readiness value track.
  //
  // A Structured assessment yields few findings because little is wrong. These
  // rows are capabilities the position rests on, with the evidence management
  // should hold and what would signal deterioration. They are never findings and
  // are never labelled weaknesses.
  if (reg.assurancePriorities.length) {
    pages.push(`<section class="reg">
    ${registerHead('P', 'Assurance and resilience priorities', 'These are not weaknesses. Each is a capability the assessment records as operating, listed with what management should hold to confirm it, what it depends on, and what would signal deterioration. MK has performed none of this verification.')}
    <table>
      <thead><tr><th style="width:9%">ID</th><th style="width:19%">Capability</th><th style="width:22%">Evidence management should hold</th><th style="width:18%">Depends on</th><th style="width:18%">Deterioration trigger</th><th style="width:14%">Owner / cadence</th></tr></thead>
      <tbody>${reg.assurancePriorities.map((priority) => `<tr>
        <td class="id">${esc(priority.priorityId)}<div>${esc(priority.priorityClass.replace(/_/g, ' ').toLowerCase())}</div></td>
        <td>${cell(priority.capability)}<div class="cap" style="margin-top:.8mm">${cell(priority.whyItMatters, '')}</div></td>
        <td>${cell(priority.evidenceManagementShouldHold)}${priority.suggestedSamplingApproach ? `<div class="cap" style="margin-top:.8mm">${cell(priority.suggestedSamplingApproach, '')}</div>` : ''}</td>
        <td>${priority.dependencies.length ? `<ul>${priority.dependencies.map((dependency) => `<li>${cell(dependency)}</li>`).join('')}</ul>` : '—'}</td>
        <td>${cell(priority.deteriorationTrigger)}<div class="cap" style="margin-top:.8mm">${cell(priority.effectivenessIndicator, '')}</div></td>
        <td>${cell(priority.accountableExecutive)}<div class="cap" style="margin-top:.8mm">${cell(priority.reviewFrequency, '')}</div></td></tr>`).join('')}</tbody>
    </table>
  </section>`);
  }

  pages.push(`<section class="reg">
    ${registerHead('A', 'Finding register', `Every material finding the assessment produced. "Assessment indication" is what the responses record; it is self-reported and has not been verified.`)}
    <table>
      <thead><tr><th style="width:9%">ID</th><th style="width:13%">Domain</th><th style="width:22%">Assessment indication</th><th style="width:10%">Materiality</th><th style="width:23%">Fraud mechanism</th><th style="width:12%">Risk</th><th style="width:11%">Control</th></tr></thead>
      <tbody>${reg.findings.map((finding) => `<tr>
        <td class="id">${esc(finding.findingId)}<div>${esc(finding.questionCode)}</div></td>
        <td>${esc(finding.domainName)}</td>
        <td>${cell(finding.assessedPosition)}<div class="cap" style="margin-top:.8mm">${cell(finding.whyItMatters, '')}</div></td>
        <td>${esc(finding.materialityClass.replace(/_/g, ' '))}${finding.isHardGate ? ' <span class="tag gate">gate</span>' : finding.isCriticalControl ? ' <span class="tag crit">critical</span>' : ''}</td>
        <td>${cell(finding.fraudMechanism)}</td>
        <td class="id">${esc(finding.linkedRiskIds.join(', ')) || '—'}</td>
        <td class="id">${esc(finding.linkedControlIds.join(', ')) || '—'}</td></tr>`).join('')}</tbody>
    </table>
  </section>`);

  pages.push(`<section class="reg">
    ${registerHead('B', 'Fraud risk register', 'Risks implied by the assessed control positions. No likelihood, monetary value or incident frequency is assigned, because the assessment does not support one.')}
    <table>
      <thead><tr><th style="width:9%">ID</th><th style="width:33%">Risk</th><th style="width:19%">Current control position</th><th style="width:26%">Required treatment</th><th style="width:13%">Owner role</th></tr></thead>
      <tbody>${reg.risks.map((risk) => `<tr>
        <td class="id">${esc(risk.riskId)}<div>${esc(risk.linkedFindingIds.slice(0, 2).join(', '))}</div></td>
        <td><strong>${cell(risk.riskStatement)}</strong></td>
        <td>${cell(risk.currentControlPosition)}</td>
        <td>${cell(risk.requiredTreatment)}</td>
        <td>${cell(risk.ownerRole)}</td></tr>`).join('')}</tbody>
    </table>
  </section>`);

  pages.push(`<section class="reg">
    ${registerHead('C', 'Control blueprint register', 'Recommended control standard for each finding. This is MK methodology — what good practice requires — not a description of what the organisation currently operates. The assessed state column records what the organisation reported for that control.')}
    ${(() => {
      const bands = [...new Set(reg.controls.map((control) => control.currentState).filter(Boolean))];
      return bands.length ? `<div class="panel"><div class="l">Assessed state key</div>${list(bands)}</div>` : '';
    })()}
    <table>
      <thead><tr><th style="width:9%">ID</th><th style="width:21%">Objective</th><th style="width:24%">Recommended design</th><th style="width:9%">Assessed</th><th style="width:14%">Owner / oversight</th><th style="width:10%">Frequency</th><th style="width:13%">Effectiveness test</th></tr></thead>
      <tbody>${(() => {
        const bands = [...new Set(reg.controls.map((control) => control.currentState).filter(Boolean))];
        return reg.controls.map((control) => {
          const bandIndex = bands.indexOf(control.currentState);
          return `<tr>
        <td class="id">${esc(control.controlId)}<div>${esc(control.questionCode)}</div><div>${esc(control.targetPeriod)}</div></td>
        <td><strong>${cell(control.controlObjective)}</strong></td>
        <td>${cell(control.controlDesign || control.targetState)}</td>
        <td class="tight">${bandIndex >= 0 ? `<span class="tag">State ${bandIndex + 1}</span>` : '<span class="muted">—</span>'}</td>
        <td>${cell(control.processOwnerRole)}<div class="cap">${cell(control.oversightFunction, '')}</div></td>
        <td>${cell(control.operatingFrequency)}</td>
        <td>${cell(control.effectivenessTest)}</td></tr>`;
        }).join('');
      })()}</tbody>
    </table>
  </section>`);

  pages.push(`<section class="reg">
    ${registerHead('D', 'Evidence requirement register', 'What management should be able to produce for each recommended control. No evidence has been requested, received or examined.')}
    ${core.controlProgrammes.map((programme) => {
      const groups = reg.evidence.filter((group) => programme.controlIds.includes(group.controlId));
      if (!groups.length) return '';
      return `<h3 style="margin-top:5mm;border-top:1.5px solid var(--navy-700);padding-top:2.5mm">${esc(programme.title)}</h3>
      <table>
        <thead><tr><th style="width:10%">Control</th><th style="width:22%">Evidence required</th><th style="width:26%">What it should prove</th><th style="width:24%">Minimum acceptable characteristic</th><th style="width:18%">Owner / recency</th></tr></thead>
        <tbody>${groups.flatMap((group) => group.items.map((item, index) => `<tr>
          <td class="id">${index === 0 ? esc(group.controlId) : ''}</td>
          <td><strong>${cell(item.artefact)}</strong></td>
          <td>${cell(item.provesWhat)}</td>
          <td>${item.minimumAcceptableCharacteristics.length ? esc(item.minimumAcceptableCharacteristics[0]!) : '<span class="muted">—</span>'}</td>
          <td>${cell(item.ownerRole)}<div class="cap">${cell(item.expectedRecency, '')}</div></td></tr>`)).join('')}</tbody>
      </table>`;
    }).join('')}
  </section>`);

  pages.push(`<section class="reg">
    ${registerHead('E', '12-month action and assurance register', 'The full twelve-month programme. Not every row is initial implementation: later horizons operate each control through its required cycle and then review whether it is still effective. The work type on each row says which it is.')}
    <table>
      <thead><tr><th style="width:9%">Horizon</th><th style="width:11%">Work type</th><th style="width:24%">Action</th><th style="width:14%">Owner</th><th style="width:21%">Completion criterion</th><th style="width:21%">Effectiveness measure</th></tr></thead>
      <tbody>${core.implementationPhases.flatMap((phase) => phase.actions.map((action) => `<tr>
        <td class="tight"><strong>${esc(phase.phase)}</strong></td>
        <td class="cap">${esc(PROGRAMME_WORK_TYPE_LABEL[action.workType] ?? action.workType)}</td>
        <td>${cell(action.deliverable)}${action.mergedFrom.length > 1 ? `<div class="cap">Covers ${action.mergedFrom.length} findings</div>` : ''}</td>
        <td>${cell(action.ownerRole)}</td>
        <td>${cell(action.completionCriterion)}</td>
        <td>${cell(action.effectivenessMeasure)}</td></tr>`)).join('')}</tbody>
    </table>
  </section>`);

  pages.push(`<section class="reg">
    ${registerHead('F', 'Measurement register', 'The effectiveness test behind each recommended control, grouped by programme. These are the signals management should expect once the control operates.')}
    ${core.controlProgrammes.map((programme) => {
      const rows = reg.measures.filter((measure) => measure.programmeId === programme.programmeId);
      if (!rows.length) return '';
      return `<div style="page-break-inside:avoid;margin-bottom:4mm">
        <h3 style="margin-top:3mm">${esc(programme.title)}</h3>
        <table style="margin-top:1.5mm">
          <thead><tr><th style="width:70%">Measure</th><th style="width:30%">Controls it covers</th></tr></thead>
          <tbody>${rows.map((measure) => `<tr><td>${cell(measure.measure)}</td><td class="id">${esc(measure.sourceControlIds.join(', '))}</td></tr>`).join('')}</tbody>
        </table>
      </div>`;
    }).join('')}
  </section>`);

  return `<!doctype html><html lang="en-ZA"><head><meta charset="utf-8"><title>MK Fraud Readiness Comprehensive — ${esc(input.organisationName)}</title><style>${STYLES}</style></head><body>${pages.join('')}</body></html>`;
}

/** Objects this renderer deliberately does not render, and why. */
export const COMPREHENSIVE_NON_RENDERED: ReadonlyArray<{ object: string; reason: string }> = [
  { object: 'core.exposureThemes.controlIds', reason: 'Exposure families are presented by risk count; the control linkage is carried in Appendix B and C.' },
  { object: 'registers.evidence.items.sourceRefs', reason: 'Internal question codes; the customer-facing trace is the control identifier.' }
];
