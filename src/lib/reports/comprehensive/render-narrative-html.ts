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

const CUSTOMER_PROVENANCE_ID = /\b(?:DOMAIN-D\d+|CONTROL-\d+|DECISION-\d+|ROADMAP-\d+|EIM-DEP-\d+|INTEGRATION-(?:DEPENDENCY|LOOP|OVERLAY)-\d+|D\d+-Q\d+|(?:MF|RISK|FINDING|SC|CI|RA|DEC|THEME|PROOF)-\d+)\b/gi;

const CUSTOMER_RELATIONSHIP_LABELS: Record<string, string> = {
  AUTHORITY_ENABLES: 'Authority enables governance',
  RISK_VIEW_DIRECTS: 'Risk view directs treatment and escalation',
  LEARNING_UPDATES: 'Learning updates the risk view',
  CONTROL_SIGNAL_FEEDS: 'Control signals reach governance'
};

function customerCopy(value: unknown): string {
  return String(value ?? '')
    .replace(/(question-level signals(?:\s+included in the assessment)?)\s+are consistently operating\b/gi, '$1 are recorded as consistently operating')
    .replace(/\bnot\s+a\s+price-based\s+assurance\s+claim\b/gi, 'not an assurance conclusion')
    .replace(/\bprice-based\s+assurance\s+claim\b/gi, 'assurance conclusion')
    .replace(/This is not a claim about price, assurance or permanence\./gi, 'This does not establish operating effectiveness or permanence.')
    .replace(CUSTOMER_PROVENANCE_ID, '')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\(\s*\)|\[\s*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const escCustomer = (value: unknown): string => esc(customerCopy(value));

const fieldSentence = (value: unknown, fallback: string): string => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '');
  return `${text || fallback}.`;
};

const paragraphs = (value: string): string => value
  .split(/\n\s*\n/)
  .map((part) => part.trim())
  .filter(Boolean)
  .map((part) => `<p>${escCustomer(part)}</p>`)
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

function compositionObjectAttrs(exhibit: ReportBlueprintExhibit, kind: string, index: number): string {
  return `data-composition-object="${esc(`${exhibit.exhibitId}:${kind}:${index + 1}`)}"`;
}

function domainProfile(chapter: ComprehensiveNarrativeChapter, exhibit: ReportBlueprintExhibit): string {
  if (!chapter.domainProfile.length) return '';
  return `<figure class="exhibit profile-exhibit" ${exhibitAttrs(exhibit)}>
    <figcaption><strong>Readiness profile</strong><span>Recorded domain results supporting the management position.</span></figcaption>
    <div class="domain-profile">
      ${chapter.domainProfile.map((domain) => {
        const score = typeof domain.score === 'number' ? Math.max(0, Math.min(100, domain.score)) : 0;
        const tone = typeof domain.score === 'number' ? scoreTone(domain.score) : 'neutral';
        return `<div class="domain-row">
          <div class="domain-label"><span>${escCustomer(domain.name)}</span><strong>${domain.score === null ? 'Not scored' : Math.round(domain.score)}</strong></div>
          <div class="bar"><i class="${tone}" style="width:${score}%"></i></div>
        </div>`;
      }).join('')}
    </div>
  </figure>`;
}

function enterpriseIntegration(model: ComprehensiveNarrativePresentationModel, exhibit: ReportBlueprintExhibit): string {
  const integration = model.enterpriseIntegrationMap;
  if (!integration) return '';
  const domainByRef = new Map(integration.domainNodes.map((domain) => [domain.domainRef, domain]));
  const supportedDependencies = integration.dependencies.filter((dependency) => dependency.supportStatus === 'SUPPORTED');
  const postureLabel = (posture: string): string => posture === 'DEEP_DIVE_PRIORITY' ? 'Deep-dive priority' : posture === 'MAINTAIN' ? 'Maintain' : 'Confirm';
  const domainName = (domainRef: string): string => domainByRef.get(domainRef)?.domainName ?? domainRef;
  const relationshipLabel = (relationshipType: string): string => CUSTOMER_RELATIONSHIP_LABELS[relationshipType] ?? customerLabel(relationshipType);
  return `<figure class="exhibit integration-exhibit positive-exhibit" ${exhibitAttrs(exhibit)}>
    <figcaption><strong>Enterprise fraud readiness integration</strong><span>Recorded loops, domain coverage and supported management relationships.</span></figcaption>
    <div class="integration-loop-grid">
      ${integration.loopNodes.map((loop, loopIndex) => `<div class="integration-loop" data-integration-loop="${esc(loop.loopRef)}">
        <div class="integration-loop-head"><strong>${escCustomer(loop.label)}</strong><span>${escCustomer(loop.methodologyRole)}</span></div>
        <div class="integration-domains">
          ${loop.memberDomainRefs.map((domainRef, domainIndex) => {
            const domain = domainByRef.get(domainRef);
            if (!domain) return '';
            const posture = domain.posture === 'DEEP_DIVE_PRIORITY' ? 'focus' : 'maintain';
            return `<article class="integration-domain ${posture}" ${compositionObjectAttrs(exhibit, `domain-${loopIndex + 1}`, domainIndex)}>
              <span>${escCustomer(`Domain ${domainIndex + 1}`)}</span><strong>${escCustomer(domain.domainName)}</strong><em>${escCustomer(postureLabel(domain.posture))}</em>
            </article>`;
          }).join('')}
        </div>
      </div>`).join('')}
    </div>
    <div class="integration-edges">
      <div class="integration-subheading">Supported management relationships</div>
      ${supportedDependencies.map((dependency, index) => `<article class="integration-edge" ${compositionObjectAttrs(exhibit, 'relationship', index)}>
        <div><span class="integration-edge-type">${escCustomer(relationshipLabel(dependency.relationshipType))}</span><span class="integration-edge-route">${escCustomer(dependency.contributingDomainRefs.map(domainName).join(' + '))} · ${escCustomer(integration.loopNodes.find((loop) => loop.loopRef === dependency.loopRef)?.label ?? dependency.loopRef)}</span></div>
        <div><p>${escCustomer(dependency.protectedManagementOutcome)}</p></div>
      </article>`).join('')}
    </div>
    <div class="integration-overlays"><strong>Context overlays</strong>${integration.overlayNodes.map((overlay) => `<span class="integration-overlay" data-integration-overlay="${esc(overlay.overlayRef)}"><b>${escCustomer(overlay.label)}</b><small>${escCustomer(overlay.status === 'ACTIVE_SUPPORTED' ? 'Active context' : overlay.status === 'CONTEXT_ONLY' ? 'Context only' : 'Not established')} · ${escCustomer(overlay.activationCondition)}</small></span>`).join('')}</div>
  </figure>`;
}

function scoreDisplay(model: ComprehensiveNarrativePresentationModel, exhibit: ReportBlueprintExhibit): string {
  const boundary = model.narrativeMode === 'SUSTAINMENT'
    ? 'The assessment responses did not identify material weaknesses.'
    : 'The score is the starting point for the management response.';
  return `<figure class="exhibit score-exhibit" ${exhibitAttrs(exhibit)}>
    <figcaption><strong>Recorded readiness position</strong><span>Recorded assessment position; not an assurance conclusion.</span></figcaption>
    <div class="score-strip"><strong>${Math.round(model.score)}</strong><div><b>${escCustomer(model.maturity)}</b><span>Fraud Readiness Score / 100</span><span>${escCustomer(boundary)}</span></div></div>
  </figure>`;
}

function themeMap(chapter: ComprehensiveNarrativeChapter, exhibit: ReportBlueprintExhibit): string {
  if (!chapter.themes.length) return '';
  return `<figure class="exhibit theme-exhibit" ${exhibitAttrs(exhibit)}>
    <figcaption><strong>Connected management patterns</strong><span>Patterns that management should address together.</span></figcaption>
    <div class="theme-stack">${chapter.themes.slice(0, 5).map((item, index) => `<article ${compositionObjectAttrs(exhibit, 'theme', index)}><h4>${escCustomer(item.title)}</h4><p>${escCustomer(item.managementImplicationBasis)}</p><span>${escCustomer(item.fraudRiskRelationship)}</span></article>`).join('')}</div>
  </figure>`;
}

function strengths(chapter: ComprehensiveNarrativeChapter, exhibit: ReportBlueprintExhibit): string {
  if (!chapter.strengths.length) return '';
  return `<figure class="exhibit positive-exhibit" ${exhibitAttrs(exhibit)}>
    <figcaption><strong>What is supporting readiness</strong><span>Recorded strengths that management should preserve.</span></figcaption>
    <div class="strength-grid">
      ${chapter.strengths.slice(0, 5).map((item, index) => `<article ${compositionObjectAttrs(exhibit, 'strength', index)}><h4>${escCustomer(item.title)}</h4><p>${escCustomer(item.basis)}</p></article>`).join('')}
    </div>
  </figure>`;
}

function sustainmentPriorities(chapter: ComprehensiveNarrativeChapter, exhibit: ReportBlueprintExhibit): string {
  if (!chapter.sustainmentPriorities.length) return '';
  return `<figure class="exhibit positive-exhibit" ${exhibitAttrs(exhibit)}>
    <figcaption><strong>Resilience priorities</strong><span>These are disciplines to preserve, not findings or weaknesses.</span></figcaption>
    <div class="priority-stack">
      ${chapter.sustainmentPriorities.slice(0, 5).map((item, index) => `<article class="priority-item" ${compositionObjectAttrs(exhibit, 'priority', index)}>
        <div><h4>${escCustomer(item.title)}</h4><p>${escCustomer(item.managementFocus)}</p></div>
        <div class="fact-strip">
          <span><b>Owner</b> ${escCustomer(item.accountableExecutive)}</span>
          <span><b>Indicator</b> ${escCustomer(item.effectivenessIndicator)}</span>
        </div>
        <p class="watchpoint"><b>Deterioration signal:</b> ${escCustomer(item.deteriorationTrigger)}</p>
      </article>`).join('')}
    </div>
  </figure>`;
}

function findings(chapter: ComprehensiveNarrativeChapter, exhibit: ReportBlueprintExhibit): string {
  if (!chapter.findings.length) return '';
  return `<figure class="exhibit" ${exhibitAttrs(exhibit)}>
    <figcaption><strong>Material observations supporting this chapter</strong><span>Detailed analytical records remain in the companion workbook.</span></figcaption>
    <div class="priority-stack">
      ${chapter.findings.slice(0, 5).map((item, index) => `<article class="priority-item" ${compositionObjectAttrs(exhibit, 'finding', index)}>
        <h4>${escCustomer(item.title)}</h4>
        <p>${escCustomer(item.advisoryMeaningBasis || item.interpretation)}</p>
        <div class="fact-strip"><span><b>Owner</b> ${escCustomer(item.owner)}</span><span><b>Target</b> ${escCustomer(item.targetPeriod)}</span></div>
      </article>`).join('')}
    </div>
  </figure>`;
}

function scenarios(chapter: ComprehensiveNarrativeChapter, exhibit: ReportBlueprintExhibit): string {
  if (!chapter.scenarios.length) return '';
  return `<figure class="exhibit watch-exhibit" ${exhibitAttrs(exhibit)}>
    <figcaption><strong>Conditional fraud pathways</strong><span>Management tests, not allegations.</span></figcaption>
    <div class="scenario-stack">
      ${chapter.scenarios.slice(0, 4).map((item, index) => `<article ${compositionObjectAttrs(exhibit, 'scenario', index)}>
        <h4>${escCustomer(item.title)}</h4>
        <p><b>Actor:</b> ${escCustomer(fieldSentence(item.actorClass, 'An actor may act through the recorded pathway'))} <b>Entry point:</b> ${escCustomer(fieldSentence(item.entryPoint, 'A sensitive process entry point is involved'))} <b>Mechanism:</b> ${escCustomer(fieldSentence(item.mechanism, 'The pathway may proceed before timely challenge'))}</p>
        <p class="small"><b>Warning indicators:</b> ${escCustomer(item.warningIndicators.slice(0, 3).join('; '))}</p>
      </article>`).join('')}
    </div>
  </figure>`;
}

function controls(chapter: ComprehensiveNarrativeChapter, positive: boolean, exhibit: ReportBlueprintExhibit): string {
  if (!chapter.controls.length) return '';
  return `<figure class="exhibit control-exhibit ${positive ? 'positive-exhibit' : ''}" ${exhibitAttrs(exhibit)}>
    <figcaption><strong>${positive ? 'Control disciplines to preserve and strengthen' : 'Target control environment'}</strong><span>Compact operating specifications only. Full control blueprints remain in the workbook.</span></figcaption>
    <div class="control-stack">
      ${chapter.controls.slice(0, 5).map((item, index) => `<article class="control-item" ${compositionObjectAttrs(exhibit, 'control', index)}>
        <h4>${escCustomer(item.objective)}</h4>
        <p>${escCustomer(item.targetState)}</p>
        <div class="fact-strip">
          <span><b>Accountable</b> ${escCustomer(item.accountableExecutive)}</span>
          <span><b>Operate</b> ${escCustomer(item.frequency)}</span>
          <span><b>Measure</b> ${escCustomer(item.effectivenessMeasure)}</span>
        </div>
      </article>`).join('')}
    </div>
  </figure>`;
}

function decisions(chapter: ComprehensiveNarrativeChapter, exhibit: ReportBlueprintExhibit): string {
  if (!chapter.decisions.length) return '';
  return `<figure class="exhibit decision-exhibit" ${exhibitAttrs(exhibit)}>
    <figcaption><strong>Leadership choices</strong><span>Options, trade-offs and the recommended route.</span></figcaption>
    <div class="decision-stack">
      ${chapter.decisions.slice(0, 4).map((item, index) => `<article class="decision-item" ${compositionObjectAttrs(exhibit, 'decision', index)}>
        <h4>${escCustomer(item.question)}</h4>
        <p class="recommended"><b>Recommended route:</b> ${escCustomer(item.recommendedRoute)}</p>
        <p class="small"><b>Why now:</b> ${escCustomer(item.rationale)}</p>
        <div class="options">${item.options.slice(0, 3).map((option) => `<div><strong>${escCustomer(option.option)}</strong><span>${escCustomer(option.benefit)}</span><small>${escCustomer(option.tradeOff)}</small></div>`).join('')}</div>
        <p class="small"><b>Owner:</b> ${escCustomer(item.owner)} · <b>Target:</b> ${escCustomer(item.targetDate)} · <b>If delayed:</b> ${escCustomer(item.consequenceOfDelay)}</p>
      </article>`).join('')}
    </div>
  </figure>`;
}

function customerLabel(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function customerRelationshipLabel(value: string): string {
  return CUSTOMER_RELATIONSHIP_LABELS[value] ?? customerLabel(value);
}

function exposurePathways(chapter: ComprehensiveNarrativeChapter, exhibit: ReportBlueprintExhibit): string {
  if (!chapter.exposurePathways?.length) return '';
  return `<figure class="exhibit watch-exhibit" ${exhibitAttrs(exhibit)}>
    <figcaption><strong>Supported change pathways</strong><span>Selective context tests that change management attention; not current findings or risks.</span></figcaption>
    <div class="priority-stack pathway-stack">
      ${chapter.exposurePathways.map((item, index) => `<article class="priority-item pathway-item" ${compositionObjectAttrs(exhibit, 'pathway', index)}>
        <h4>${escCustomer(item.label)}</h4>
        <p><b>When attention changes:</b> ${escCustomer(item.changeCondition)}</p>
        <p><b>Why it matters:</b> ${escCustomer(item.analyticalConsequence)}</p>
        <p><b>Management response:</b> ${escCustomer(item.managementImplication)}</p>
        <div class="fact-strip"><span><b>Context</b> ${escCustomer(item.contextKeys.map(customerLabel).join(' · '))}</span><span><b>Exposure basis</b> ${escCustomer(item.supportedExposureIds.map(customerLabel).join(' · '))}</span></div>
        <p class="watchpoint"><b>Boundary:</b> ${escCustomer(item.conditionalBoundary)}</p>
      </article>`).join('')}
    </div>
  </figure>`;
}

function criticalReliances(model: ComprehensiveNarrativePresentationModel, chapter: ComprehensiveNarrativeChapter, exhibit: ReportBlueprintExhibit): string {
  if (!chapter.criticalReliances?.length) return '';
  const controlByRef = new Map(model.chapters.flatMap((item) => item.controls).map((item) => [item.factRef, item]));
  const dependencyByRef = new Map((model.enterpriseIntegrationMap?.dependencies ?? []).flatMap((dependency) => [
    [dependency.dependencyRef, dependency] as const,
    [`INTEGRATION-DEPENDENCY-${dependency.dependencyRef.slice(-3)}`, dependency] as const
  ]));
  return `<figure class="exhibit positive-exhibit" ${exhibitAttrs(exhibit)}>
    <figcaption><strong>Control signals relied on across the management view</strong><span>Shared routes that help management protect outcomes and notice drift.</span></figcaption>
    <div class="priority-stack reliance-stack">
      ${chapter.criticalReliances.map((item, index) => {
        const control = controlByRef.get(item.controlRef);
        const routeLabel = [...new Set((item.dependencyRefs ?? [])
          .map((dependencyRef) => dependencyByRef.get(dependencyRef))
          .filter(Boolean)
          .map((dependency) => customerRelationshipLabel(dependency!.relationshipType)))]
          .join(' · ') || (item.relianceLevel === 'MULTI-ROUTE' ? 'Supported management relationships' : 'Supported management relationship');
        return `<article class="priority-item reliance-item" ${compositionObjectAttrs(exhibit, 'reliance', index)}>
          <h4>${escCustomer(control?.objective ?? 'Control signal supporting the readiness position')}</h4>
          <p>${escCustomer(item.relianceBasis)}</p>
          <p><b>Protected outcome:</b> ${escCustomer(item.protectedOutcomes.join(' · ') || control?.targetState || 'The recorded readiness standard remains visible to management.')}</p>
          <div class="fact-strip"><span><b>Relationship</b> ${escCustomer(routeLabel)}</span><span><b>Management signal</b> ${escCustomer(item.managementSignal)}</span></div>
        </article>`;
      }).join('')}
    </div>
  </figure>`;
}

function transformation(model: ComprehensiveNarrativePresentationModel, chapter: ComprehensiveNarrativeChapter, exhibit: ReportBlueprintExhibit): string {
  if (!/SUSTAINMENT-OPTIMISATION|IMPLEMENTATION-BLUEPRINT|TWELVE-MONTH-MATURATION/.test(chapter.chapterId)) return '';
  if (exhibit.type === 'roadmap_30_60_90') {
    if (!chapter.roadmap.length) return '';
    return `<figure class="exhibit" ${exhibitAttrs(exhibit)}>
      <figcaption><strong>First 90-day management route</strong><span>Owners, outcomes and completion records for the opening cycle.</span></figcaption>
      <div class="stage-grid roadmap-grid">${chapter.roadmap.slice(0, 6).map((item, index) => `<article class="supported" ${compositionObjectAttrs(exhibit, 'roadmap-card', index)}>
        <span class="stage-name">${escCustomer(item.phaseWindow)}</span><p>${escCustomer(item.managementOutcome)}</p>
        <p class="small"><b>Priority work:</b> ${escCustomer(item.priorityWork)}</p>
        <div class="fact-strip"><span><b>Owner</b> ${escCustomer(item.accountableExecutive)}</span><span><b>Proof</b> ${escCustomer(item.proofOfCompletion)}</span></div>
      </article>`).join('')}</div>
    </figure>`;
  }
  const stages = model.transformationSequence;
  if (!stages.length) return '';
  return `<figure class="exhibit maturation-exhibit ${model.narrativeMode === 'SUSTAINMENT' ? 'positive-exhibit' : ''}" ${exhibitAttrs(exhibit)}>
    <figcaption><strong>${model.narrativeMode === 'SUSTAINMENT' ? 'Twelve-month sustainment path' : 'Twelve-month transformation path'}</strong><span>Progression, outcomes and management checkpoints.</span></figcaption>
    <div class="stage-grid">${stages.map((stage, index) => `<article class="${stage.supported ? 'supported' : 'muted-stage'}" ${compositionObjectAttrs(exhibit, 'maturation-card', index)}>
      <span class="stage-name">${escCustomer(stage.stage)}</span><p>${escCustomer(stage.purpose)}</p>
    </article>`).join('')}</div>
  </figure>`;
}

function chapterExhibits(model: ComprehensiveNarrativePresentationModel, chapter: ComprehensiveNarrativeChapter): string {
  const positive = model.narrativeMode === 'SUSTAINMENT';
  return chapter.exhibits.map((exhibit) => {
    switch (exhibit.type) {
      case 'score_display': return scoreDisplay(model, exhibit);
      case 'domain_profile': return domainProfile(chapter, exhibit);
      case 'enterprise_integration': return enterpriseIntegration(model, exhibit);
      case 'strengths': return strengths(chapter, exhibit);
      case 'theme_map': return themeMap(chapter, exhibit);
      case 'sustainment_scorecard': return sustainmentPriorities(chapter, exhibit);
      case 'finding_summary': return findings(chapter, exhibit);
      case 'scenario_pathway': return scenarios(chapter, exhibit);
      case 'control_response': return controls(chapter, positive, exhibit);
      case 'decision_options': return decisions(chapter, exhibit);
      case 'exposure_pathway': return exposurePathways(chapter, exhibit);
      case 'critical_reliance': return criticalReliances(model, chapter, exhibit);
      case 'roadmap_30_60_90':
      case 'maturation_path': return transformation(model, chapter, exhibit);
      default: return '';
    }
  }).filter(Boolean).join('');
}

function chapterHtml(model: ComprehensiveNarrativePresentationModel, chapter: ComprehensiveNarrativeChapter): string {
  const takeaways = new Set<string>();
  const isConclusion = chapter.narrativeRole === 'CONCLUSION';
  const implication = (block: ComprehensiveNarrativeChapter['blocks'][number]): string => takeaways.has(block.managementTakeaway) ? '' : (takeaways.add(block.managementTakeaway), `<aside class="management-implication ${chapter.tone}">
    <span>Management implication</span>
    <p>${escCustomer(block.managementTakeaway)}</p>
  </aside>`);
  const renderBlock = (block: ComprehensiveNarrativeChapter['blocks'][number], includeTitle = chapter.blocks.length > 1): string => {
    const paragraphs = block.paragraphs;
    const leadingParagraphs = paragraphs.slice(0, -1).map((paragraph) => `<p>${escCustomer(paragraph)}</p>`).join('');
    const closingParagraph = paragraphs.length
      ? `<div class="block-close"><p>${escCustomer(paragraphs.at(-1))}</p>${implication(block)}</div>`
      : implication(block);
    return `<div class="narrative-block">
      ${includeTitle ? `<h3>${escCustomer(block.title)}</h3>` : ''}
      <div class="narrative-copy">${leadingParagraphs}${closingParagraph}</div>
    </div>`;
  };
  const renderParagraphGroup = (
    block: ComprehensiveNarrativeChapter['blocks'][number],
    paragraphGroup: string[],
    includeTitle: boolean
  ): string => `<div class="narrative-block">
      ${includeTitle ? `<h3>${escCustomer(block.title)}</h3>` : ''}
      <div class="narrative-copy">${paragraphGroup.map((paragraph) => `<p>${escCustomer(paragraph)}</p>`).join('')}</div>
    </div>`;
  const renderConclusionTail = (
    block: ComprehensiveNarrativeChapter['blocks'][number],
    includeTitle: boolean
  ): string => {
    if (block.paragraphs.length <= 1) {
      return `<div class="conclusion-closing">${renderBlock(block, includeTitle)}${companionPanel(model)}</div>`;
    }
    const precedingParagraphs = block.paragraphs.slice(0, -1);
    const finalParagraph = block.paragraphs.at(-1)!;
    return `${renderParagraphGroup(block, precedingParagraphs, includeTitle)}<div class="conclusion-closing">${renderBlock({ ...block, paragraphs: [finalParagraph] }, false)}${companionPanel(model)}</div>`;
  };
  const firstBlock = chapter.blocks[0];
  const firstParagraph = firstBlock?.paragraphs[0] ?? '';
  const firstBlockHasRemainder = Boolean(firstBlock && firstBlock.paragraphs.length > 1);
  const singleConclusionBlock = isConclusion && chapter.blocks.length === 1 && Boolean(firstBlock);
  const openingImplication = firstBlock && !firstBlockHasRemainder ? implication(firstBlock) : '';
  const opening = firstBlock && firstParagraph && !singleConclusionBlock
      ? `<div class="narrative-block chapter-opening-block">
        ${chapter.blocks.length > 1 ? `<h3>${escCustomer(firstBlock.title)}</h3>` : ''}
        <div class="narrative-copy"><p>${escCustomer(firstParagraph)}</p></div>
      </div>${openingImplication}`
    : '';
  const firstRemainder = firstBlockHasRemainder
    ? renderBlock({ ...firstBlock, paragraphs: firstBlock.paragraphs.slice(1) }, false)
    : '';
  const remainingBlockHtml = chapter.blocks.slice(1).map((block) => renderBlock(block));
  const remainingBlocks = remainingBlockHtml.join('');
  const closing = isConclusion
    ? singleConclusionBlock
      ? renderConclusionTail(firstBlock!, false)
      : remainingBlockHtml.length
        ? `${firstRemainder}${remainingBlockHtml.slice(0, -1).join('')}${renderConclusionTail(chapter.blocks.at(-1)!, chapter.blocks.length > 1)}`
        : firstRemainder
          ? renderConclusionTail({ ...firstBlock!, paragraphs: firstBlock!.paragraphs.slice(1) }, false)
          : `<div class="conclusion-closing">${companionPanel(model)}</div>`
    : `${firstRemainder}${remainingBlocks}`;
  return `<section class="chapter tone-${chapter.tone}" data-chapter="${esc(chapter.chapterId)}">
    <div class="chapter-opening">
      <div class="chapter-marker"><span class="chapter-brand">MK Fraud Insights</span> · Comprehensive · ${String(chapter.order).padStart(2, '0')}</div>
      <h2>${escCustomer(chapter.title)}</h2>
      ${opening}
    </div>
    ${closing}
    ${chapterExhibits(model, chapter)}
  </section>`;
}

function companionPanel(model: ComprehensiveNarrativePresentationModel): string {
  const fixturePanel = Boolean(model.qaLabel);
  return `<aside class="companion-panel" data-companion-workbook="true">
    <div class="companion-kicker">Companion analytical record</div>
    <h3>${escCustomer(model.companionWorkbook.title)}</h3>
    <p>${escCustomer(model.companionWorkbook.purpose)}</p>
    ${fixturePanel
      ? `<p class="companion-compact-note"><b>Sheets supplied:</b> ${model.companionWorkbook.sheets.map((sheet) => escCustomer(sheet)).join(' · ')}</p>`
      : `<div class="sheet-list">${model.companionWorkbook.sheets.map((sheet) => `<span>${escCustomer(sheet)}</span>`).join('')}</div>
         <p class="scope-note">${escCustomer(model.assuranceBoundary)}</p>`}
  </aside>`;
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
  .cover-qa-label{display:inline-block;margin-top:4mm;padding:2mm 3mm;border:1px solid var(--mk-brass);color:var(--mk-brass);font-size:7pt;letter-spacing:.08em;text-transform:uppercase;font-weight:700}
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
  .chapter-opening{break-inside:avoid;page-break-inside:avoid}
  .chapter-marker{color:var(--mk-muted);margin-bottom:5mm;break-after:avoid;page-break-after:avoid}
  .chapter-brand{color:var(--mk-navy-700)}
  .tone-positive .chapter-marker{color:var(--mk-confirmed)}
  .chapter h2{font-size:25pt;line-height:1.08;letter-spacing:-.025em;color:var(--mk-navy-700);margin:0 0 8mm;max-width:165mm;break-after:avoid;page-break-after:avoid}
  .narrative-block{max-width:168mm;margin-bottom:8mm;break-inside:auto;page-break-inside:auto}
  .chapter-opening-block{margin-bottom:0}
  .block-close{break-inside:avoid;page-break-inside:avoid}
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
  .decision-exhibit{break-inside:auto;page-break-inside:auto}
  .decision-exhibit figcaption{break-after:avoid;page-break-after:avoid}
  figcaption{display:flex;justify-content:space-between;gap:8mm;align-items:baseline;margin-bottom:5mm}
  figcaption strong{font-size:12pt;color:var(--mk-navy-700)}
  figcaption span{font-size:8.5pt;color:var(--mk-muted);text-align:right;max-width:78mm}
  .positive-exhibit{border-top:2px solid var(--mk-confirmed)}
  .positive-exhibit .priority-item,.positive-exhibit .control-item{border-left:2px solid var(--mk-confirmed);padding-left:4mm}
  .watch-exhibit{border-top:2px solid var(--mk-major)}
  .watch-exhibit{break-inside:auto;page-break-inside:auto}
  .watch-exhibit figcaption{break-after:avoid;page-break-after:avoid}
  .pathway-stack{display:block}
  .pathway-item{break-inside:avoid;page-break-inside:avoid}
  .control-exhibit{break-inside:auto;page-break-inside:auto}
  .control-exhibit figcaption{break-after:avoid;page-break-after:avoid}
  .control-stack{display:block}
  .maturation-exhibit{break-inside:auto;page-break-inside:auto}
  .maturation-exhibit figcaption{break-after:avoid;page-break-after:avoid}
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
  .strength-grid article,.priority-item,.control-item,.decision-item,.scenario-stack article,.stage-grid article{break-inside:avoid;page-break-inside:avoid}
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
  .stage-grid article{padding:4mm;background:var(--mk-confirmed-bg);border-top:3px solid var(--mk-confirmed);min-height:36mm;break-inside:avoid;page-break-inside:avoid}
  .stage-grid .muted-stage{background:var(--mk-neutral-bg);border-top-color:var(--mk-rule)}
  .stage-name{font-weight:700;font-size:8pt;letter-spacing:.08em;color:var(--mk-confirmed)}
  .integration-exhibit{break-inside:avoid;page-break-inside:avoid}
  .integration-loop-grid{display:grid;grid-template-columns:1fr 1fr;gap:3mm}
  .integration-loop{padding:3mm;background:var(--mk-neutral-bg);border-top:3px solid var(--mk-navy-700);break-inside:avoid;page-break-inside:avoid}
  .integration-loop:nth-child(4){border-top-color:var(--mk-confirmed)}
  .integration-loop-head{display:flex;justify-content:space-between;gap:3mm;align-items:baseline;margin-bottom:2.5mm}
  .integration-loop-head strong{font-size:9pt;color:var(--mk-navy-700)}
  .integration-loop-head span{font-size:7.2pt;color:var(--mk-muted);text-align:right;line-height:1.25}
  .integration-domains{display:grid;grid-template-columns:1fr 1fr;gap:1.8mm}
  .integration-domain{padding:2mm;background:var(--mk-white);border-left:2px solid var(--mk-confirmed);break-inside:avoid;page-break-inside:avoid;min-height:16mm}
  .integration-domain.focus{border-left-color:var(--mk-brass)}
  .integration-domain span,.integration-domain em{display:block;font-size:6.7pt;color:var(--mk-muted);font-style:normal;letter-spacing:.04em}
  .integration-domain strong{display:block;color:var(--mk-navy-700);font-size:8.2pt;line-height:1.2;margin:.8mm 0}
  .integration-domain em{text-transform:uppercase;font-size:6.3pt;font-weight:700;color:var(--mk-confirmed)}
  .integration-domain.focus em{color:var(--mk-brass-text)}
  .integration-edges{display:grid;gap:1.5mm;margin-top:4mm}
  .integration-subheading{font-size:8pt;font-weight:700;color:var(--mk-navy-700);margin-bottom:.5mm}
  .integration-edge{display:grid;grid-template-columns:47mm 1fr;gap:4mm;padding:2.2mm 0;border-bottom:1px solid var(--mk-rule);break-inside:avoid;page-break-inside:avoid}
  .integration-edge-type{display:block;font-size:7pt;font-weight:700;letter-spacing:.06em;color:var(--mk-navy-700)}
  .integration-edge-route{display:block;font-size:7pt;color:var(--mk-muted);margin-top:.7mm}
  .integration-edge p{margin:0 0 1mm;font-size:8.1pt;line-height:1.28}
  .integration-edge-links{font-size:6.9pt;color:var(--mk-muted)}
  .integration-overlays{display:grid;grid-template-columns:35mm 1fr 1fr 1fr;gap:2mm;align-items:start;margin-top:3mm;padding-top:2.5mm;border-top:1px solid var(--mk-rule);font-size:7.4pt;break-inside:avoid;page-break-inside:avoid}
  .integration-overlays>strong{font-size:7.8pt;color:var(--mk-navy-700)}
  .integration-overlay b,.integration-overlay small{display:block}
  .integration-overlay b{font-size:7.1pt;color:var(--mk-navy-700)}
  .integration-overlay small{font-size:6.5pt;line-height:1.25;color:var(--mk-muted);margin-top:.7mm}
  .conclusion-closing{break-inside:avoid;page-break-inside:avoid}
  .conclusion-closing .narrative-block{margin-bottom:0}
  .conclusion-closing .companion-panel{margin-top:2mm}
  .companion-panel{break-before:auto;break-inside:avoid;page-break-inside:avoid;background:var(--mk-neutral-bg);padding:3mm 5mm;margin-top:4mm;border-top:3px solid var(--mk-navy-700)}
  .companion-kicker{font-size:6.5pt;text-transform:uppercase;letter-spacing:.1em;color:var(--mk-muted);font-weight:700;margin-bottom:1mm}
  .companion-panel h3{font-size:10pt;color:var(--mk-navy-700);margin:0 0 .5mm}
  .companion-panel p{max-width:none;font-size:7pt;line-height:1.15;margin:0 0 1mm}
  .companion-panel .companion-compact-note{font-size:6pt;margin:.5mm 0 0}
  .sheet-list{display:flex;flex-wrap:wrap;gap:.7mm;margin-top:1mm}
  .sheet-list span{padding:.7mm 1.2mm;border:1px solid var(--mk-rule);background:var(--mk-white);font-size:6pt}
  .companion-panel .scope-note{break-inside:avoid;margin:1mm 0 0;padding-top:1mm;border-top:1px solid var(--mk-rule);font-size:6pt;color:var(--mk-muted)}
  </style>`;
}

export function renderComprehensiveNarrativeReportHtml(model: ComprehensiveNarrativePresentationModel): string {
  const cover = `<section class="cover">
    <div>
      <div class="cover-brand" data-brand-asset="approved-mk-fraud-insights-mark">${renderCoverLogo()}</div>
      <div class="cover-rule"></div>
      <div class="cover-eyebrow">Fraud readiness advisory</div>
      ${model.qaLabel ? `<div class="cover-qa-label">${escCustomer(model.qaLabel)}</div>` : ''}
      <h1>${escCustomer(model.title)}</h1>
      <h2>${escCustomer(model.organisationName)}</h2>
    </div>
    <div class="cover-score ${model.tone}">
      <strong>${Math.round(model.score)}</strong>
      <div><span>Fraud Readiness Score / 100</span><span>${escCustomer(model.maturity)} · ${escCustomer(model.narrativeMode === 'SUSTAINMENT' ? 'Sustainment' : 'Transformation')}</span></div>
    </div>
    <div class="cover-meta">Report reference ${escCustomer(model.assessmentReference)}<br/>Comprehensive package</div>
    <div class="cover-confidential">Confidential · Internal leadership use</div>
  </section>`;

  const chapters = model.chapters.map((chapter) => chapterHtml(model, chapter)).join('');
  return `<!doctype html><html lang="en-ZA"><head><meta charset="utf-8"><title>${escCustomer(model.title)} · ${escCustomer(model.organisationName)}</title>${css()}</head><body>${cover}${chapters}</body></html>`;
}
