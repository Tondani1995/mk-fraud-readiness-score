import { MK_CSS_VARIABLES } from '../design/tokens';
import { renderCoverLogo } from '../design/brand-assets';
import type {
  ComprehensiveNarrativeChapter,
  ComprehensiveNarrativePresentationModel,
  ComprehensiveSemanticTone
} from './narrative-presentation-model';
import type { ReportBlueprintExhibit } from '../narrative/report-blueprint';

const esc = (value: unknown): string => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

const paragraphs = (value: string): string => value
  .split(/\n\s*\n/)
  .map((part) => part.trim())
  .filter(Boolean)
  .map((part) => `<p>${esc(part)}</p>`)
  .join('');

function scoreTone(score: number): ComprehensiveSemanticTone {
  if (score >= 65) return 'positive';
  if (score < 35) return 'critical';
  if (score < 55) return 'watch';
  return 'neutral';
}

function exhibitAttrs(exhibit: ReportBlueprintExhibit): string {
  return `data-exhibit-id="${esc(exhibit.exhibitId)}" data-exhibit-type="${esc(exhibit.type)}" data-primary-home="${esc(`${exhibit.placement.chapterId}/${exhibit.placement.sectionId}`)}"`;
}

function domainProfile(chapter: ComprehensiveNarrativeChapter, exhibit: ReportBlueprintExhibit): string {
  if (!chapter.domainProfile.length) return '';
  return `<figure class="exhibit profile-exhibit" ${exhibitAttrs(exhibit)}>
    <figcaption><strong>Readiness profile</strong><span>The profile supports the narrative. It is not the narrative itself.</span></figcaption>
    <div class="domain-profile">
      ${chapter.domainProfile.map((domain) => {
        const score = typeof domain.score === 'number' ? Math.max(0, Math.min(100, domain.score)) : 0;
        const tone = typeof domain.score === 'number' ? scoreTone(domain.score) : 'neutral';
        return `<div class="domain-row">
          <div class="domain-label"><span>${esc(domain.name)}</span><strong>${domain.score === null ? 'Not scored' : Math.round(domain.score)}</strong></div>
          <div class="bar"><i class="${tone}" style="width:${score}%"></i></div>
        </div>`;
      }).join('')}
    </div>
  </figure>`;
}

function scoreDisplay(model: ComprehensiveNarrativePresentationModel, exhibit: ReportBlueprintExhibit): string {
  const boundary = model.narrativeMode === 'SUSTAINMENT'
    ? 'No material weaknesses are promoted from the recorded sustainment profile.'
    : 'The score is the deterministic starting point for the management story.';
  return `<figure class="exhibit score-exhibit" ${exhibitAttrs(exhibit)}>
    <figcaption><strong>Recorded readiness position</strong><span>Deterministic assessment result; not an assurance conclusion.</span></figcaption>
    <div class="score-strip"><strong>${Math.round(model.score)}</strong><div><b>${esc(model.maturity)}</b><span>Fraud Readiness Score / 100</span><span>${esc(boundary)}</span></div></div>
  </figure>`;
}

function themeMap(chapter: ComprehensiveNarrativeChapter, exhibit: ReportBlueprintExhibit): string {
  if (!chapter.themes.length) return '';
  return `<figure class="exhibit theme-exhibit" ${exhibitAttrs(exhibit)}>
    <figcaption><strong>Connected management patterns</strong><span>Systemic themes are explained in the narrative and retained here as a navigation aid.</span></figcaption>
    <div class="theme-stack">${chapter.themes.slice(0, 5).map((item) => `<article><h4>${esc(item.title)}</h4><p>${esc(item.managementImplicationBasis)}</p><span>${esc(item.fraudRiskRelationship)}</span></article>`).join('')}</div>
  </figure>`;
}

function strengths(chapter: ComprehensiveNarrativeChapter, exhibit: ReportBlueprintExhibit): string {
  if (!chapter.strengths.length) return '';
  return `<figure class="exhibit positive-exhibit" ${exhibitAttrs(exhibit)}>
    <figcaption><strong>What is supporting readiness</strong><span>Recorded strengths that the narrative explains and management should preserve.</span></figcaption>
    <div class="strength-grid">
      ${chapter.strengths.slice(0, 5).map((item) => `<article><h4>${esc(item.title)}</h4><p>${esc(item.basis)}</p></article>`).join('')}
    </div>
  </figure>`;
}

function sustainmentPriorities(chapter: ComprehensiveNarrativeChapter, exhibit: ReportBlueprintExhibit): string {
  if (!chapter.sustainmentPriorities.length) return '';
  return `<figure class="exhibit positive-exhibit" ${exhibitAttrs(exhibit)}>
    <figcaption><strong>Resilience priorities</strong><span>These are disciplines to preserve, not findings or weaknesses.</span></figcaption>
    <div class="priority-stack">
      ${chapter.sustainmentPriorities.slice(0, 5).map((item) => `<article class="priority-item">
        <div><h4>${esc(item.title)}</h4><p>${esc(item.managementFocus)}</p></div>
        <div class="fact-strip">
          <span><b>Owner</b> ${esc(item.accountableExecutive)}</span>
          <span><b>Indicator</b> ${esc(item.effectivenessIndicator)}</span>
        </div>
        <p class="watchpoint"><b>Deterioration signal:</b> ${esc(item.deteriorationTrigger)}</p>
      </article>`).join('')}
    </div>
  </figure>`;
}

function findings(chapter: ComprehensiveNarrativeChapter, exhibit: ReportBlueprintExhibit): string {
  if (!chapter.findings.length) return '';
  return `<figure class="exhibit" ${exhibitAttrs(exhibit)}>
    <figcaption><strong>Material observations supporting this chapter</strong><span>Detailed finding and risk registers remain in the companion workbook.</span></figcaption>
    <div class="priority-stack">
      ${chapter.findings.slice(0, 5).map((item) => `<article class="priority-item">
        <h4>${esc(item.title)}</h4>
        <p>${esc(item.advisoryMeaningBasis || item.interpretation)}</p>
        <div class="fact-strip"><span><b>Owner</b> ${esc(item.owner)}</span><span><b>Target</b> ${esc(item.targetPeriod)}</span></div>
      </article>`).join('')}
    </div>
  </figure>`;
}

function scenarios(chapter: ComprehensiveNarrativeChapter, exhibit: ReportBlueprintExhibit): string {
  if (!chapter.scenarios.length) return '';
  return `<figure class="exhibit watch-exhibit" ${exhibitAttrs(exhibit)}>
    <figcaption><strong>Conditional fraud pathways</strong><span>Management tests, not allegations.</span></figcaption>
    <div class="scenario-stack">
      ${chapter.scenarios.slice(0, 4).map((item) => `<article>
        <h4>${esc(item.title)}</h4>
        <p>${esc(item.actorClass)} may use ${esc(item.entryPoint).replace(/\.$/, '')} to ${esc(item.mechanism).replace(/^./, (c) => c.toLowerCase())}</p>
        <p class="small"><b>Warning indicators:</b> ${esc(item.warningIndicators.slice(0, 3).join('; '))}</p>
      </article>`).join('')}
    </div>
  </figure>`;
}

function controls(chapter: ComprehensiveNarrativeChapter, positive: boolean, exhibit: ReportBlueprintExhibit): string {
  if (!chapter.controls.length) return '';
  return `<figure class="exhibit ${positive ? 'positive-exhibit' : ''}" ${exhibitAttrs(exhibit)}>
    <figcaption><strong>${positive ? 'Control disciplines to preserve and strengthen' : 'Target control environment'}</strong><span>Compact operating specifications only. Full control blueprints remain in the workbook.</span></figcaption>
    <div class="control-stack">
      ${chapter.controls.slice(0, 5).map((item) => `<article class="control-item">
        <h4>${esc(item.objective)}</h4>
        <p>${esc(item.targetState)}</p>
        <div class="fact-strip">
          <span><b>Accountable</b> ${esc(item.accountableExecutive)}</span>
          <span><b>Operate</b> ${esc(item.frequency)}</span>
          <span><b>Measure</b> ${esc(item.effectivenessMeasure)}</span>
        </div>
      </article>`).join('')}
    </div>
  </figure>`;
}

function decisions(chapter: ComprehensiveNarrativeChapter, exhibit: ReportBlueprintExhibit): string {
  if (!chapter.decisions.length) return '';
  return `<figure class="exhibit" ${exhibitAttrs(exhibit)}>
    <figcaption><strong>Leadership choices</strong><span>The narrative explains why the choice matters; this exhibit keeps the options visible.</span></figcaption>
    <div class="decision-stack">
      ${chapter.decisions.slice(0, 4).map((item) => `<article class="decision-item">
        <h4>${esc(item.question)}</h4>
        <p class="recommended"><b>Recommended route:</b> ${esc(item.recommendedRoute)}</p>
        <p class="small"><b>Why now:</b> ${esc(item.rationale)}</p>
        <div class="options">${item.options.slice(0, 3).map((option) => `<div><strong>${esc(option.option)}</strong><span>${esc(option.benefit)}</span><small>${esc(option.tradeOff)}</small></div>`).join('')}</div>
        <p class="small"><b>Owner:</b> ${esc(item.owner)} · <b>Target:</b> ${esc(item.targetDate)} · <b>If delayed:</b> ${esc(item.consequenceOfDelay)}</p>
      </article>`).join('')}
    </div>
  </figure>`;
}

function transformation(model: ComprehensiveNarrativePresentationModel, chapter: ComprehensiveNarrativeChapter, exhibit: ReportBlueprintExhibit): string {
  if (!/SUSTAINMENT-OPTIMISATION|IMPLEMENTATION-BLUEPRINT|TWELVE-MONTH-MATURATION/.test(chapter.chapterId)) return '';
  const stages = model.transformationSequence;
  if (!stages.length) return '';
  return `<figure class="exhibit ${model.narrativeMode === 'SUSTAINMENT' ? 'positive-exhibit' : ''}" ${exhibitAttrs(exhibit)}>
    <figcaption><strong>${model.narrativeMode === 'SUSTAINMENT' ? 'Twelve-month sustainment path' : 'Twelve-month transformation path'}</strong><span>Progression and outcomes, not a register dump.</span></figcaption>
    <div class="stage-grid">${stages.map((stage) => `<article class="${stage.supported ? 'supported' : 'muted-stage'}">
      <span class="stage-name">${esc(stage.stage)}</span><p>${esc(stage.purpose)}</p>
    </article>`).join('')}</div>
  </figure>`;
}

function chapterExhibits(model: ComprehensiveNarrativePresentationModel, chapter: ComprehensiveNarrativeChapter): string {
  const positive = model.narrativeMode === 'SUSTAINMENT';
  return chapter.exhibits.map((exhibit) => {
    switch (exhibit.type) {
      case 'score_display': return scoreDisplay(model, exhibit);
      case 'domain_profile': return domainProfile(chapter, exhibit);
      case 'strengths': return strengths(chapter, exhibit);
      case 'theme_map': return themeMap(chapter, exhibit);
      case 'sustainment_scorecard': return sustainmentPriorities(chapter, exhibit);
      case 'finding_summary': return findings(chapter, exhibit);
      case 'scenario_pathway': return scenarios(chapter, exhibit);
      case 'control_response': return controls(chapter, positive, exhibit);
      case 'decision_options': return decisions(chapter, exhibit);
      case 'roadmap_30_60_90':
      case 'maturation_path': return transformation(model, chapter, exhibit);
      default: return '';
    }
  }).filter(Boolean).join('');
}

function chapterHtml(model: ComprehensiveNarrativePresentationModel, chapter: ComprehensiveNarrativeChapter): string {
  const takeaways = new Set<string>();
  const blocks = chapter.blocks.map((block) => `<div class="narrative-block">
    ${chapter.blocks.length > 1 ? `<h3>${esc(block.title)}</h3>` : ''}
    <div class="narrative-copy">${block.paragraphs.map((paragraph) => `<p>${esc(paragraph)}</p>`).join('')}</div>
    ${takeaways.has(block.managementTakeaway) ? '' : (takeaways.add(block.managementTakeaway), `<aside class="management-implication ${chapter.tone}">
      <span>Management implication</span>
      <p>${esc(block.managementTakeaway)}</p>
    </aside>`)}
  </div>`).join('');
  return `<section class="chapter tone-${chapter.tone}" data-chapter="${esc(chapter.chapterId)}">
    <div class="chapter-marker"><span class="chapter-brand">MK Fraud Insights</span> · Comprehensive · ${String(chapter.order).padStart(2, '0')}</div>
    <h2>${esc(chapter.title)}</h2>
    ${blocks}
    ${chapterExhibits(model, chapter)}
  </section>`;
}

function css(): string {
  return `<style>
  :root{${MK_CSS_VARIABLES}}
  @page{size:A4;margin:17mm 16mm 20mm}
  *{box-sizing:border-box}
  html,body{margin:0;padding:0}
  body{font:10.6pt/1.58 'Open Sans','Noto Sans','Helvetica Neue',Arial,sans-serif;color:var(--mk-ink);background:var(--mk-white);print-color-adjust:exact;-webkit-print-color-adjust:exact}
  h1,h2,h3,h4,strong,b,figcaption,.cover-brand,.cover-eyebrow,.chapter-marker{font-family:'Open Sans','Noto Sans','Helvetica Neue',Arial,sans-serif}
  .cover{height:260mm;page-break-after:always;background:var(--mk-navy-900);color:var(--mk-white);padding:24mm 20mm;display:flex;flex-direction:column;justify-content:space-between}
  .cover-brand{min-height:24pt}
  .cover-brand img{display:block;height:24pt;width:auto}
  .cover-rule{width:28mm;border-top:1.2mm solid var(--mk-brass);margin:9mm 0}
  .cover .cover-eyebrow,.chapter-marker{text-transform:uppercase;letter-spacing:.13em;font-size:7.5pt;font-weight:700}
  .cover .cover-eyebrow{color:var(--mk-brass)}
  .cover h1{font-size:35pt;line-height:1.02;letter-spacing:-.035em;max-width:155mm;margin:8mm 0 5mm}
  .cover h2{font-size:15pt;font-weight:400;color:var(--mk-rule);margin:0;max-width:150mm}
  .cover-score{display:flex;align-items:flex-end;gap:10mm;border-top:1px solid var(--mk-white-25);padding-top:9mm}
  .cover-score strong{font-size:38pt;line-height:.9;color:var(--mk-white)}
  .cover-score.positive strong{color:var(--mk-confirmed)}
  .cover-score.watch strong{color:var(--mk-major)}
  .cover-score.critical strong{color:var(--mk-critical)}
  .cover-score span{display:block;color:var(--mk-rule)}
  .cover-meta,.cover-confidential{font-size:9pt;color:var(--mk-rule)}
  .cover-confidential{text-transform:uppercase;letter-spacing:.1em;font-size:7.5pt}
  .chapter{break-before:auto;padding-top:2mm;margin-top:14mm;orphans:3;widows:3}
  .chapter:first-of-type{margin-top:0}
  .chapter-marker{color:var(--mk-muted);margin-bottom:5mm}
  .chapter-brand{color:var(--mk-navy-700)}
  .tone-positive .chapter-marker{color:var(--mk-confirmed)}
  .chapter h2{font-size:25pt;line-height:1.08;letter-spacing:-.025em;color:var(--mk-navy-700);margin:0 0 8mm;max-width:165mm;break-after:avoid}
  .narrative-block{max-width:168mm;margin-bottom:8mm;break-inside:avoid}
  .tone-neutral .narrative-block,.tone-watch .narrative-block,.tone-critical .narrative-block{break-inside:auto}
  .narrative-block h3{font-size:14.5pt;color:var(--mk-navy-700);margin:7mm 0 3mm;break-after:avoid}
  .narrative-copy{max-width:162mm}
  .narrative-copy p{margin:0 0 4.5mm;font-size:11pt;line-height:1.6}
  .management-implication{margin:7mm 0 8mm;padding:4.5mm 5mm;border-left:4px solid var(--mk-navy-700);background:var(--mk-neutral-bg);break-inside:avoid}
  .management-implication span{font-size:7.5pt;text-transform:uppercase;letter-spacing:.09em;font-weight:700;color:var(--mk-muted)}
  .management-implication p{font-size:11.2pt;margin:1.5mm 0 0}
  .management-implication.positive{border-left-color:var(--mk-confirmed);background:var(--mk-confirmed-bg)}
  .management-implication.watch{border-left-color:var(--mk-major);background:var(--mk-neutral-bg)}
  .management-implication.critical{border-left-color:var(--mk-critical);background:var(--mk-critical-bg)}
  .exhibit{break-inside:avoid;margin:8mm 0 4mm;padding-top:4mm;border-top:1px solid var(--mk-rule);font-size:9.4pt}
  figcaption{display:flex;justify-content:space-between;gap:8mm;align-items:baseline;margin-bottom:5mm}
  figcaption strong{font-size:12pt;color:var(--mk-navy-700)}
  figcaption span{font-size:8.5pt;color:var(--mk-muted);text-align:right;max-width:78mm}
  .positive-exhibit{border-top:2px solid var(--mk-confirmed)}
  .positive-exhibit .priority-item,.positive-exhibit .control-item{border-left:2px solid var(--mk-confirmed);padding-left:4mm}
  .watch-exhibit{border-top:2px solid var(--mk-major)}
  .domain-profile{display:grid;grid-template-columns:1fr 1fr;gap:3.5mm 9mm}
  .score-strip{display:flex;align-items:center;gap:7mm;padding:5mm;background:var(--mk-neutral-bg);border-left:3px solid var(--mk-navy-700)}
  .score-strip>strong{font-size:28pt;line-height:1;color:var(--mk-navy-700)}
  .score-strip b,.score-strip span{display:block}.score-strip b{font-size:12pt;color:var(--mk-navy-700)}.score-strip span{font-size:8.5pt;color:var(--mk-muted);margin-top:1mm}
  .theme-stack{display:grid;grid-template-columns:1fr 1fr;gap:4mm}.theme-stack article{padding:4mm 0;border-bottom:1px solid var(--mk-rule);break-inside:avoid}.theme-stack article span{font-size:8.3pt;color:var(--mk-muted)}
  .domain-label{display:flex;justify-content:space-between;gap:4mm;font-size:8.8pt;margin-bottom:1mm}
  .domain-label strong{color:var(--mk-navy-700)}
  .bar{height:3mm;background:var(--mk-rule);border-radius:8px;overflow:hidden}
  .bar i{display:block;height:100%;background:var(--mk-navy-500)}
  .bar i.positive{background:var(--mk-confirmed)}
  .bar i.watch{background:var(--mk-major)}
  .bar i.critical{background:var(--mk-critical)}
  .strength-grid{display:grid;grid-template-columns:1fr 1fr;gap:5mm}
  .strength-grid article,.priority-item,.control-item,.decision-item,.scenario-stack article{break-inside:avoid}
  .strength-grid article{padding:4mm 0;border-bottom:1px solid var(--mk-rule)}
  h4{font-size:11pt;color:var(--mk-navy-700);margin:0 0 2mm}
  .strength-grid p,.priority-item p,.control-item p,.decision-item p,.scenario-stack p{margin:0 0 3mm}
  .priority-stack,.control-stack,.decision-stack,.scenario-stack{display:grid;gap:6mm}
  .priority-item,.control-item,.decision-item,.scenario-stack article{padding:5mm 0;border-bottom:1px solid var(--mk-rule)}
  .priority-item:last-child,.control-item:last-child,.decision-item:last-child,.scenario-stack article:last-child{border-bottom:0}
  .fact-strip{display:flex;flex-wrap:wrap;gap:3mm 7mm;font-size:8.3pt;color:var(--mk-muted);margin-top:3mm}
  .fact-strip b{color:var(--mk-ink)}
  .watchpoint{color:var(--mk-ink);background:transparent;border-left:2px solid var(--mk-major);padding:1.5mm 0 1.5mm 3mm;margin-top:3mm!important;font-size:8.7pt}
  .options{display:grid;grid-template-columns:repeat(3,1fr);gap:3mm;margin:4mm 0}
  .options div{background:var(--mk-neutral-bg);padding:3.5mm}
  .options strong,.options span,.options small{display:block}
  .options span{margin:1.5mm 0}
  .options small,.small{font-size:8.3pt;color:var(--mk-muted)}
  .recommended{color:var(--mk-confirmed)}
  .stage-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:3mm}
  .stage-grid article{padding:4mm;background:var(--mk-confirmed-bg);border-top:3px solid var(--mk-confirmed);min-height:36mm}
  .stage-grid .muted-stage{background:var(--mk-neutral-bg);border-top-color:var(--mk-rule)}
  .stage-name{font-weight:700;font-size:8pt;letter-spacing:.08em;color:var(--mk-confirmed)}
  .companion{break-before:auto;background:var(--mk-neutral-bg);padding:12mm 10mm;margin-top:14mm;border-top:3px solid var(--mk-navy-700);break-inside:avoid}
  .companion h2{font-size:19pt}
  .companion p{max-width:155mm}
  .sheet-list{display:flex;flex-wrap:wrap;gap:2mm;margin-top:5mm}
  .sheet-list span{padding:2mm 3mm;border:1px solid var(--mk-rule);background:var(--mk-white);font-size:8pt}
  .scope-note{break-inside:avoid;margin:10mm 0 0;padding-top:5mm;border-top:1px solid var(--mk-rule);font-size:8.8pt;color:var(--mk-muted)}
  </style>`;
}

export function renderComprehensiveNarrativeReportHtml(model: ComprehensiveNarrativePresentationModel): string {
  const cover = `<section class="cover">
    <div>
      <div class="cover-brand" data-brand-asset="approved-mk-fraud-insights-mark">${renderCoverLogo()}</div>
      <div class="cover-rule"></div>
      <div class="cover-eyebrow">Fraud readiness advisory</div>
      <h1>${esc(model.title)}</h1>
      <h2>${esc(model.organisationName)}</h2>
    </div>
    <div class="cover-score ${model.tone}">
      <strong>${Math.round(model.score)}</strong>
      <div><span>Fraud Readiness Score / 100</span><span>${esc(model.maturity)} · ${esc(model.narrativeMode === 'SUSTAINMENT' ? 'Sustainment' : 'Transformation')}</span></div>
    </div>
    <div class="cover-meta">Report reference ${esc(model.assessmentReference)}<br/>Comprehensive package</div>
    <div class="cover-confidential">Confidential · Internal leadership use</div>
  </section>`;

  const chapters = model.chapters.map((chapter) => chapterHtml(model, chapter)).join('');
  const companion = `<section class="companion">
    <div class="chapter-marker">Companion analytical record</div>
    <h2>${esc(model.companionWorkbook.title)}</h2>
    <p>${esc(model.companionWorkbook.purpose)}</p>
    <div class="sheet-list">${model.companionWorkbook.sheets.map((sheet) => `<span>${esc(sheet)}</span>`).join('')}</div>
    <p class="scope-note">${esc(model.assuranceBoundary)}</p>
  </section>`;

  return `<!doctype html><html lang="en-ZA"><head><meta charset="utf-8"><title>${esc(model.title)} · ${esc(model.organisationName)}</title>${css()}</head><body>${cover}${chapters}${companion}</body></html>`;
}
