import type { AssembledReportData, RoadmapItem, SelectedContent } from '../types';

function esc(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function score(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'N/A';
  return String(Math.round(Number(value)));
}

function roadmapCards(items: RoadmapItem[], horizon: 'action30' | 'action60' | 'action90') {
  return items.map((item) => `
    <div class="roadmap-card">
      <div class="eyebrow">${esc(item.domainName)} · Suggested owner: ${esc(item.ownerRole)}</div>
      <h4>${esc(item[horizon])}</h4>
      <p>${esc(item.rationale)}</p>
    </div>
  `).join('');
}

export function renderReportHtml(data: AssembledReportData, content: SelectedContent, roadmap: { thirtyDay: RoadmapItem[]; sixtyDay: RoadmapItem[]; ninetyDay: RoadmapItem[] }) {
  const domains = data.domainResults.map((domain) => `
    <tr>
      <td>${esc(domain.domainName)}</td>
      <td>${score(domain.rawScore)}</td>
      <td>${score(domain.coveragePct)}%</td>
      <td>${domain.criticalGapCount}</td>
    </tr>
  `).join('');

  const domainPages = data.domainResults.map((domain) => {
    const narrative = content.domainNarratives[domain.domainName];
    return `
      <section class="page">
        <div class="eyebrow">Domain analysis</div>
        <h2>${esc(narrative?.title ?? domain.domainName)}</h2>
        <div class="domain-score">${score(domain.rawScore)}<span>/100</span></div>
        <p>${esc(narrative?.body)}</p>
      </section>
    `;
  }).join('');

  const gaps = data.criticalMajorGaps.length
    ? data.criticalMajorGaps.map((gap, index) => `
      <div class="gap-card">
        <div class="eyebrow">${esc(gap.domainName)} · ${gap.isCriticalGap ? 'Priority gap' : 'Major gap'}</div>
        <h4>${esc(gap.prompt)}</h4>
        <p>${esc(content.gapCommentary[`gap-${index}`]?.body ?? '')}</p>
      </div>
    `).join('')
    : '<p>No priority gaps were triggered in the persisted score trace.</p>';

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(data.reportReference)}</title>
  <style>
    @page { size: A4; margin: 18mm 14mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #1f1a17; background: #f8f2e8; }
    .page { min-height: 265mm; page-break-after: always; padding: 22px; background: #fffaf0; border: 1px solid #d8c7ad; }
    .cover { background: #15110d; color: #f8f2e8; display: flex; flex-direction: column; justify-content: space-between; }
    .eyebrow { text-transform: uppercase; letter-spacing: .18em; font-size: 10px; color: #9b7b4f; font-weight: 700; }
    h1 { font-size: 46px; line-height: 1.02; margin: 20px 0; max-width: 620px; }
    h2 { font-size: 30px; line-height: 1.12; margin: 12px 0 16px; }
    h3 { font-size: 20px; margin: 18px 0 10px; }
    h4 { font-size: 15px; margin: 8px 0; }
    p { font-size: 13px; line-height: 1.65; color: #4d453d; }
    .cover p { color: #e7dcc8; }
    .score-grid, .matrix, .roadmap-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; margin: 18px 0; }
    .metric, .gap-card, .roadmap-card { border: 1px solid #d8c7ad; background: #fff; padding: 16px; border-radius: 14px; }
    .metric strong { display: block; font-size: 34px; color: #7a5225; }
    .domain-score { font-size: 72px; line-height: 1; color: #7a5225; font-weight: 700; }
    .domain-score span { font-size: 22px; color: #8c8174; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; background: #fff; }
    th, td { padding: 10px; border-bottom: 1px solid #eadfce; text-align: left; font-size: 12px; }
    th { color: #7a5225; text-transform: uppercase; letter-spacing: .12em; font-size: 10px; }
    .quadrant { min-height: 92px; border: 1px solid #d8c7ad; padding: 14px; background: #fff; border-radius: 14px; }
    .marker { display: inline-block; padding: 8px 12px; border-radius: 999px; background: #7a5225; color: #fff; font-size: 12px; font-weight: 700; }
  </style>
</head>
<body>
  <section class="page cover">
    <div>
      <div class="eyebrow">MK Fraud Insights · Confidential advisory report</div>
      <h1>Fraud Readiness Advisory Report</h1>
      <p>${esc(data.organisationName)}</p>
    </div>
    <div>
      <p>Assessment reference: ${esc(data.assessmentReference)}</p>
      <p>Generated: ${esc(new Date(data.generatedAt).toLocaleString('en-ZA'))}</p>
    </div>
  </section>

  <section class="page">
    <div class="eyebrow">Executive diagnosis</div>
    <h2>${esc(content.executiveSummary.title)}</h2>
    <p>${esc(content.executiveSummary.body)}</p>
    <div class="score-grid">
      <div class="metric"><span class="eyebrow">Readiness score</span><strong>${score(data.scoreRun.overallScore)}</strong><p>Final band: ${esc(data.scoreRun.finalMaturity)}</p></div>
      <div class="metric"><span class="eyebrow">Exposure</span><strong>${score(data.scoreRun.exposureScore)}</strong><p>${esc(data.scoreRun.exposureBand)}</p></div>
      <div class="metric"><span class="eyebrow">Coverage</span><strong>${score(data.scoreRun.coveragePct)}%</strong><p>Answered control coverage</p></div>
      <div class="metric"><span class="eyebrow">Priority gaps</span><strong>${data.scoreRun.criticalGapCount}</strong><p>Critical gaps in persisted trace</p></div>
    </div>
  </section>

  <section class="page">
    <div class="eyebrow">Score story</div>
    <h2>Readiness must be read against exposure, not as a standalone number</h2>
    <p>${esc(content.leadershipAttention.body)}</p>
    <div class="matrix">
      <div class="quadrant">Low exposure / Lower readiness</div>
      <div class="quadrant">Higher exposure / Lower readiness</div>
      <div class="quadrant">Low exposure / Higher readiness</div>
      <div class="quadrant">Higher exposure / Higher readiness<br/><br/><span class="marker">${esc(data.scoreRun.finalMaturity)} · ${esc(data.scoreRun.exposureBand)}</span></div>
    </div>
  </section>

  <section class="page">
    <div class="eyebrow">Domain heatmap</div>
    <h2>The score is made up of ten control domains, not one average</h2>
    <table><thead><tr><th>Domain</th><th>Score</th><th>Coverage</th><th>Priority gaps</th></tr></thead><tbody>${domains}</tbody></table>
  </section>

  <section class="page">
    <div class="eyebrow">Priority gaps</div>
    <h2>These are the weaknesses leadership should not average away</h2>
    ${gaps}
  </section>

  <section class="page">
    <div class="eyebrow">False Comfort</div>
    <h2>${esc(content.falseComfort.title)}</h2>
    <p>${esc(content.falseComfort.body)}</p>
  </section>

  ${domainPages}

  <section class="page">
    <div class="eyebrow">Leadership roadmap</div>
    <h2>The next 90 days should focus on ownership, control evidence and pressure-testing</h2>
    <h3>First 30 days</h3><div class="roadmap-grid">${roadmapCards(roadmap.thirtyDay, 'action30')}</div>
    <h3>Next 60 days</h3><div class="roadmap-grid">${roadmapCards(roadmap.sixtyDay, 'action60')}</div>
    <h3>By 90 days</h3><div class="roadmap-grid">${roadmapCards(roadmap.ninetyDay, 'action90')}</div>
  </section>

  <section class="page">
    <div class="eyebrow">Methodology and limitations</div>
    <h2>This report is an advisory interpretation of a structured self-assessment</h2>
    <p>The report uses the persisted score result, score trace, domain results, exposure answers and maturity-cap events. It does not recalculate the score in the PDF layer and it does not constitute an audit, assurance opinion or forensic finding.</p>
  </section>
</body>
</html>`;
}
