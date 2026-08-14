/**
 * Essential report HTML composition.
 *
 * Consumes the presentation model and emits explicit A4 page containers, so the
 * layout gate can measure real pages rather than one flowing body, and so page
 * breaks are an authoring decision rather than an accident of content length.
 *
 * This module makes no analytical decisions. Every value, order and label
 * arrives already settled.
 */
import type { EssentialReportPresentationModel } from './presentation-model';

const esc = (value: unknown): string =>
  String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const humanDate = (iso: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${d} ${months[(m ?? 1) - 1]} ${y}`;
};

const STYLES = `
:root{
  --navy-900:#0B1B33;--navy-700:#142F4C;--navy-500:#2C4A6B;--navy-300:#8FA3B5;
  --ink:#1A2634;--muted:#5A6B7C;--rule:#D9E1E7;--rule-soft:#EDF1F4;
  --cream:#FBF9F5;--white:#FFFFFF;--brass:#C9A227;--brass-soft:#F0E6C8;
  --weak:#A32020;--weak-bg:#FBEDED;--mid:#B8761F;--strong:#1F6B4A;--strong-bg:#EDF5F0;
}
*{box-sizing:border-box;margin:0;padding:0}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:'Avenir Next','Helvetica Neue',Helvetica,Arial,sans-serif;color:var(--ink);
  font-size:9.6pt;line-height:1.5;font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased}
@page{size:A4;margin:0}
.page{width:210mm;height:297mm;position:relative;overflow:hidden;background:var(--white);
  page-break-after:always;padding:18mm 16mm 20mm 16mm;display:flex;flex-direction:column}
.page:last-child{page-break-after:auto}
.page--navy{background:var(--navy-900);color:var(--white)}
.foot{position:absolute;left:16mm;right:16mm;bottom:11mm;display:flex;justify-content:space-between;
  font-size:7pt;color:var(--muted);border-top:1px solid var(--rule);padding-top:2.5mm}
.q{font-size:7pt;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--brass)}
h1{font-size:19pt;line-height:1.2;font-weight:700;color:var(--navy-900);letter-spacing:-.01em;max-width:160mm;margin-top:3mm}
h2{font-size:10pt;font-weight:700;color:var(--navy-700);letter-spacing:.02em;margin-bottom:3mm}
.lede{font-size:10.4pt;line-height:1.55;max-width:158mm;color:var(--ink)}
p{max-width:160mm}
.small{font-size:8.6pt;line-height:1.5}
.cap{font-size:7.2pt;color:var(--muted)}
.gap{height:7mm}.gap-l{height:11mm}.sp{flex:1}
hr.rule{border:0;height:1px;background:var(--rule);margin:5mm 0}
.brass{width:22mm;height:2px;background:var(--brass);border:0}

/* cover */
.cover{padding:24mm 20mm 18mm 20mm}
.cover .eyebrow{font-size:7.4pt;letter-spacing:.18em;text-transform:uppercase;color:var(--brass);font-weight:600}
.cover .tier{font-size:8pt;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.6)}
.cover .org{font-size:17pt;font-weight:600}
.cover .judge{font-size:25pt;line-height:1.18;font-weight:700;letter-spacing:-.02em;max-width:165mm}
.cover .lbl{font-size:7pt;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.55)}
.cover hr{border:0;height:1px;background:rgba(255,255,255,.22)}
.scorebox{display:flex;gap:14mm;align-items:flex-end;border-top:2px solid var(--brass);padding-top:6mm}
.scorebox .n{font-size:42pt;font-weight:700;line-height:.9;letter-spacing:-.02em}
.scorebox .of{font-size:12pt;color:rgba(255,255,255,.65)}
.scorebox .m{font-size:13pt;font-weight:600;letter-spacing:.04em;text-transform:uppercase}

/* stat row */
.stats{display:flex;gap:10mm;border-top:2px solid var(--navy-900);border-bottom:1px solid var(--rule);padding:5mm 0}
.stats .s{flex:1}
.stats .n{font-size:24pt;font-weight:700;color:var(--navy-900);line-height:1;letter-spacing:-.02em}
.stats .l{font-size:7pt;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-top:1.8mm;line-height:1.4}

/* tables */
table{width:100%;border-collapse:collapse;font-size:8.5pt}
thead th{background:var(--navy-700);color:var(--white);font-size:6.9pt;font-weight:700;
  letter-spacing:.1em;text-transform:uppercase;text-align:left;padding:2.6mm 2.8mm}
tbody td{padding:2.8mm 2.8mm;border-bottom:1px solid var(--rule);vertical-align:top;line-height:1.45}
td.n,th.n{text-align:right}
.rank{font-weight:700;color:var(--navy-900)}

/* domain profile bars */
.bars{width:100%;font-size:8.4pt}
.bars .row{display:flex;align-items:center;gap:3mm;padding:1.5mm 0;border-bottom:1px solid var(--rule-soft)}
.bars .nm{width:62mm;color:var(--navy-900)}
.bars .track{flex:1;height:7px;background:var(--rule-soft);position:relative}
.bars .fill{position:absolute;left:0;top:0;bottom:0;background:var(--navy-500)}
.bars .fill.weak{background:var(--weak)}
.bars .fill.strong{background:var(--strong)}
.bars .val{width:19mm;text-align:right;font-weight:600;color:var(--navy-900)}
.bars .band{width:22mm;text-align:right;color:var(--muted);font-size:7.4pt}

/* contrast */
.contrast{display:grid;grid-template-columns:1fr 1fr;gap:7mm}
.cbox{border-top:2px solid var(--brass);padding-top:4mm}
.cpair{display:flex;justify-content:space-between;align-items:baseline;padding:1.6mm 0;border-bottom:1px solid var(--rule-soft)}
.cpair .t{font-size:8.2pt;color:var(--navy-900)}
.cpair .v{font-size:12pt;font-weight:700;color:var(--navy-900)}
.cpair .v.low{color:var(--weak)}
.cgap{font-size:7pt;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin:2.5mm 0 2mm}

/* scenario flow */
.flow{display:flex;align-items:stretch;gap:0;margin:3mm 0 3mm}
.flow .node{flex:1;background:var(--navy-700);color:#fff;padding:3mm 3.2mm;font-size:7.4pt;line-height:1.35;display:flex;align-items:center}
.flow .node.break{background:var(--mid)}
.flow .node.stop{background:var(--navy-500)}
.flow .arw{width:5mm;display:flex;align-items:center;justify-content:center;color:var(--brass);font-size:10pt}
.scn{border-left:3px solid var(--navy-700);padding-left:5mm;margin-bottom:6mm}
.scn h3{font-size:9.6pt;font-weight:700;color:var(--navy-900);line-height:1.3;margin-bottom:2mm}

/* roadmap */
.stage{border-top:2px solid var(--navy-900);padding-top:3.5mm;margin-bottom:6mm}
.stage .hd{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2mm}
.stage .nm{font-size:9.6pt;font-weight:700;color:var(--navy-900);letter-spacing:.02em}
.stage .win{font-size:7.2pt;letter-spacing:.1em;text-transform:uppercase;color:var(--brass);font-weight:700}
.stage .out{font-size:8.6pt;color:var(--ink);margin-bottom:2.5mm}
.act{display:flex;gap:3mm;padding:1.6mm 0;border-bottom:1px solid var(--rule-soft);font-size:8.2pt}
.act .a{flex:1}
.act .o{width:44mm;color:var(--muted);font-size:7.6pt}
.dep{font-size:7pt;color:var(--mid);letter-spacing:.04em}

.panel{background:var(--cream);border-left:3px solid var(--navy-700);padding:5mm 6mm}
.panel .l{font-size:7pt;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--navy-700);margin-bottom:2mm}
.note{font-size:7.4pt;color:var(--muted);line-height:1.5;max-width:160mm}
`;

/**
 * The application renderer prints a running footer through Chromium's
 * displayHeaderFooter. Emitting a second footer inside the page stacked two
 * footers on every page, so page furniture is left to the renderer.
 */
function pageFoot(_model: EssentialReportPresentationModel, _n: number, _total: number): string {
  return '';
}

function domainBars(model: EssentialReportPresentationModel): string {
  return `<div class="bars">${model.domainProfile.rows.map((r) => `
    <div class="row">
      <div class="nm">${esc(r.title)}</div>
      <div class="track"><div class="fill ${r.emphasis === 'weak' ? 'weak' : r.emphasis === 'strong' ? 'strong' : ''}" style="width:${Math.max(1, Math.min(100, r.score))}%"></div></div>
      <div class="val">${r.score.toFixed(2)}</div>
      <div class="band">${esc(r.band)}</div>
    </div>`).join('')}</div>
  <div class="cap" style="margin-top:2.5mm">Ordered weakest first. Overall readiness ${model.readinessScore.score} / 100.</div>`;
}

function contrastBlock(model: EssentialReportPresentationModel): string {
  if (!model.materialContrasts) return '';
  return `<div class="contrast">${model.materialContrasts.contrasts.map((c) => `
    <div class="cbox">
      <div class="cpair"><span class="t">${esc(c.strongerTitle)}</span><span class="v">${c.strongerScore}</span></div>
      <div class="cpair"><span class="t">${esc(c.weakerTitle)}</span><span class="v low">${c.weakerScore}</span></div>
      <div class="cgap">Gap ${c.gap.toFixed(2)} points</div>
      <p class="small">${esc(c.interpretation)}</p>
    </div>`).join('')}</div>`;
}

export function renderEssentialReportHtml(model: EssentialReportPresentationModel): string {
  const total = model.pages.length;
  const id = model.reportIdentity;
  const out: string[] = [];

  // p1 cover
  out.push(`<section class="page page--navy cover">
    <div class="eyebrow">MK Fraud Insights</div>
    <div style="height:3mm"></div><hr class="brass">
    <div style="height:20mm"></div>
    <div class="tier">${esc(id.productLabel)}</div>
    <div style="height:5mm"></div>
    <div class="judge">${esc(model.cover.centralJudgement)}</div>
    <div class="sp"></div>
    <div class="scorebox">
      <div><span class="n">${model.cover.score}</span><span class="of"> / 100</span></div>
      <div class="m">${esc(model.cover.maturity)}</div>
      <div style="flex:1"></div>
    </div>
    <div style="height:9mm"></div><hr>
    <div style="height:5mm"></div>
    <div class="lbl">Prepared for</div><div style="height:2mm"></div>
    <div class="org">${esc(id.organisationName)}</div>
    <div style="height:6mm"></div>
    <div style="font-size:8.4pt;line-height:1.9;color:rgba(255,255,255,.75)">
      Assessment reference · ${esc(id.assessmentReference)}<br>${humanDate(id.assessmentDate) ? `Assessment date · ${esc(humanDate(id.assessmentDate))}` : ''}
    </div>
    <div style="height:8mm"></div>
    <div class="lbl">${esc(id.confidentiality)} · Prepared for the management of ${esc(id.organisationName)}</div>
  </section>`);

  // p2 at a glance
  const rs = model.readinessScore;
  out.push(`<section class="page">
    <div class="q">What does the assessment show?</div>
    <h1>Fraud readiness at a glance</h1>
    <div class="gap"></div>
    <div class="stats">
      <div class="s"><div class="n">${rs.score}</div><div class="l">Readiness score<br>out of 100</div></div>
      <div class="s"><div class="n">${esc(rs.maturity)}</div><div class="l">Maturity band</div></div>
      <div class="s"><div class="n">${rs.domainsAssessed}</div><div class="l">Domains<br>assessed</div></div>
      <div class="s"><div class="n">${rs.strongest.score}</div><div class="l">Strongest domain</div></div>
      <div class="s"><div class="n">${rs.weakest.score}</div><div class="l">Weakest domain</div></div>
    </div>
    ${model.pages[1]?.commentary ? `<div class="gap"></div><p class="lede">${esc(model.pages[1].commentary)}</p>` : ''}
    <div class="gap"></div>
    <h2>Domain readiness profile</h2>
    ${domainBars(model)}
    ${model.materialContrasts ? `<div class="gap"></div><h2>Material capability relationships</h2>${contrastBlock(model)}` : ''}
    <div class="sp"></div>
    ${pageFoot(model, 2, total)}
  </section>`);

  // p3 diagnosis
  out.push(`<section class="page">
    <div class="q">Why does the position look like this?</div>
    <h1>${esc(model.diagnosis.title)}</h1>
    <div class="gap"></div>
    <table>
      <thead><tr><th style="width:34%">Pattern</th><th style="width:30%">Assessment signals</th><th style="width:36%">Why it matters</th></tr></thead>
      <tbody>${model.diagnosis.rows.map((r) => `<tr>
        <td><strong>${esc(r.pattern)}</strong></td>
        <td>${r.signals.map((s) => `${esc(s.title)} <strong>${s.score}</strong>`).join('<br>')}</td>
        <td>${esc(r.whyItMatters)}</td></tr>`).join('')}</tbody>
    </table>
    ${model.diagnosis.interpretation ? `<div class="gap"></div><div class="panel"><div class="l">The pattern that matters</div><p class="small">${esc(model.diagnosis.interpretation)}</p></div>` : ''}
    <div class="sp"></div>
    ${pageFoot(model, 3, total)}
  </section>`);

  let n = 4;

  // exposures
  if (model.exposures) {
    out.push(`<section class="page">
      <div class="q">Where does fraud exposure matter most?</div>
      <h1>${esc(model.exposures.title)}</h1>
      <div class="gap"></div>
      <table>
        <thead><tr><th style="width:5%">#</th><th style="width:27%">Priority exposure</th><th style="width:26%">Why it matters</th><th style="width:30%">Management interruption point</th><th style="width:12%">Priority</th></tr></thead>
        <tbody>${model.exposures.rows.map((r) => `<tr>
          <td class="rank">${r.rank}</td>
          <td><strong>${esc(r.exposure)}</strong></td>
          <td>${esc(r.whyItMatters)}</td>
          <td>${esc(r.interruptionPoint)}</td>
          <td>${esc(r.priority)}</td></tr>`).join('')}</tbody>
      </table>
      <div class="sp"></div>
      ${pageFoot(model, n, total)}
    </section>`);
    n += 1;
  }

  // scenarios
  if (model.scenarios) {
    out.push(`<section class="page">
      <div class="q">How could that exposure materialise?</div>
      <h1>${esc(model.scenarios.title)}</h1>
      <div class="gap"></div>
      ${model.scenarios.scenarios.map((s) => `
        <div class="scn">
          <h3>${esc(s.title)}</h3>
          <div class="flow">
            <div class="node">${esc(s.entryPoint)}</div><div class="arw">›</div>
            <div class="node break">${esc(s.controlBreak)}</div><div class="arw">›</div>
            <div class="node stop">${esc(s.immediateInterruption)}</div>
          </div>
          <p class="small">${esc(s.howItUnfolds)}</p>
        </div>`).join('')}
      <div class="sp"></div>
      <p class="note" style="margin-bottom:5mm">${esc(model.scenarios.assuranceNote)}</p>
      ${pageFoot(model, n, total)}
    </section>`);
    n += 1;
  }

  // priorities
  out.push(`<section class="page">
    <div class="q">What does management need to change?</div>
    <h1>${esc(model.priorities.title)}</h1>
    <div class="gap"></div>
    <table>
      <thead><tr><th style="width:5%">#</th><th style="width:32%">Management outcome</th><th style="width:27%">Why now</th><th style="width:18%">Accountable</th><th style="width:18%">What better looks like</th></tr></thead>
      <tbody>${model.priorities.rows.map((r) => `<tr>
        <td class="rank">${r.rank}</td>
        <td><strong>${esc(r.outcome)}</strong></td>
        <td>${esc(r.whyNow)}</td>
        <td>${esc(r.accountableRole)}</td>
        <td>${esc(r.betterLooksLike)}</td></tr>`).join('')}</tbody>
    </table>
    <div class="sp"></div>
    ${pageFoot(model, n, total)}
  </section>`);
  n += 1;

  // roadmap
  if (model.roadmap.stages.length) {
    out.push(`<section class="page">
      <div class="q">What should happen in the first 90 days?</div>
      <h1>${esc(model.roadmap.title)}</h1>
      ${model.roadmap.interpretation ? `<div class="gap"></div><p class="lede">${esc(model.roadmap.interpretation)}</p>` : ''}
      <div class="gap"></div>
      ${model.roadmap.stages.map((st) => `
        <div class="stage">
          <div class="hd"><span class="nm">${esc(st.stage)}</span><span class="win">${esc(st.window)}</span></div>
          <div class="out">${esc(st.primaryOutcome)}</div>
          ${st.actions.map((a) => `<div class="act"><span class="a">${esc(a.action)}${a.dependsOn.length ? ` <span class="dep">· depends on ${esc(a.dependsOn.join(', '))}</span>` : ''}</span><span class="o">${esc(a.owner)}</span></div>`).join('')}
        </div>`).join('')}
      <div class="sp"></div>
      ${pageFoot(model, n, total)}
    </section>`);
    n += 1;
  }

  // dashboard + conclusion + basis
  out.push(`<section class="page">
    <div class="q">How will management know whether readiness is improving?</div>
    <h1>${esc(model.dashboard.title)}</h1>
    <div class="gap"></div>
    <table>
      <thead><tr><th style="width:36%">Measure</th><th style="width:28%">Position today</th><th style="width:36%">90-day expectation</th></tr></thead>
      <tbody>${model.dashboard.rows.map((r) => `<tr><td><strong>${esc(r.measure)}</strong></td><td>${esc(r.current)}</td><td>${esc(r.expectation)}</td></tr>`).join('')}</tbody>
    </table>
    ${model.conclusion ? `<div class="gap-l"></div><h2>Management conclusion</h2><p class="lede">${esc(model.conclusion)}</p>` : ''}
    <div class="sp"></div>
    <hr class="rule">
    <p class="note">${esc(model.reportBasis)}</p>
    ${pageFoot(model, n, total)}
  </section>`);

  return `<!doctype html><html lang="en-ZA"><head><meta charset="utf-8"><title>${esc(id.organisationName)} — ${esc(id.productLabel)}</title><style>${STYLES}</style></head><body>${out.join('')}</body></html>`;
}
