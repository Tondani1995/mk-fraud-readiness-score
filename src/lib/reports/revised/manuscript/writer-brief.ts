import type { RevisedFactPack } from './fact-pack';
import type { RevisedStoryPlan } from './story-plan';

/**
 * The writer brief (Reporting Bible v1.1, sections 8.1 and 17): one complete context for the manuscript writer,
 * rendered from the Fact Pack and the Story Plan. It is the input the production AI writer would receive, and the
 * only material the writer may use.
 */
export const WRITER_CONTRACT = [
  'Write the whole manuscript in Markdown. Start each planned section with the line `<!-- section: ID -->` and keep the planned order. Use `#` for the section heading, `##` for each unit (theme, finding, pathway, blueprint or decision) and `###` sparingly.',
  'Every heading states a claim, not a label, in at most 16 words. Every paragraph is followed on its own line by `<!-- refs: REF, REF -->` naming the facts it relies on.',
  'Never type a count, percentage or figure. Insert facts as slots: `[[REF]]` for the value, `[[REF|w]]` for a number in words (one to ten).',
  'Place exhibits on their own line exactly as planned, for example `[[exhibit:profile]]` or `[[exhibit:finding:FINDING-01]]`.',
  'South African and UK English. No em dashes. Connected paragraphs; no fragments, no one-line dramatic paragraphs, no clipped rhythm, no repeated "not X, but Y" constructions.',
  'Calm, precise, practical, authoritative and non-accusatory. Conditional language for possible fraud events. Explain controls in operating terms.',
  'State the self-assessment boundary once, in the executive or basis section. Do not repeat it on every finding.',
  'Do not invent a finding, risk, scenario, control, option, owner, incident, amount, supplier, system or person. Do not rank risks, call any risk high, critical, most material or highest priority, or state a maturity band. Do not claim that anything was tested, verified or validated.',
  'Do not expose question identifiers, internal references or engine language ("recorded condition", "hard gate", "the engine", "the model").',
  'Headings never contain a count in any form, in digits or in words. Write "The findings this report develops", never "Seven findings"; "Patterns across the assessment", never "Two management-level patterns"; "Readiness across the assessed areas", never "ten assessed areas".',
  'The facts below often use the word "recorded". Do not carry it into the prose: say what the position is ("monitoring is reactive"), or write "documented", "kept on file" or "logged".'
];

/**
 * Length budgets (14 November 2026). Every hosted first draft so far had about the planned number of paragraphs but
 * paragraphs of 30 to 43 words, so the manuscript ran 2,400 to 2,900 words against a 3,800 to 5,800 target. The brief
 * therefore gives each section a paragraph count and a word budget, sized so the whole manuscript lands inside the
 * product's target band.
 */
export const LENGTH_TARGET: Record<'essential' | 'comprehensive', { min: number; max: number; aim: number }> = {
  essential: { min: 3800, max: 4500, aim: 4150 },
  comprehensive: { min: 4800, max: 5800, aim: 5300 }
};
const PER_UNIT: Record<string, number> = { THEMES: 3, FINDINGS: 4, PATHWAYS: 3, TARGET: 3, DECISIONS: 3 };
const UNITLESS: Record<string, number> = { ORIENT: 1, EXEC: 5, PROFILE: 4, SCOPE: 3, OPMODEL: 4, PROGRAMME: 4, SCORECARD: 4, BASIS: 4, CONCLUSION: 4 };
export type SectionBudget = { id: string; paragraphs: number; words: number; units: number };
export function sectionBudgets(fp: RevisedFactPack, plan: RevisedStoryPlan): { sections: SectionBudget[]; wordsPerParagraph: number; total: number } {
  const kind = (id: string) => id.replace(/^(ESS|COMP)-/, '');
  const paragraphsFor = (s: RevisedStoryPlan['sections'][number]) => {
    const k = kind(s.id);
    const units = (s.units ?? []).length;
    if (units && PER_UNIT[k]) return units * PER_UNIT[k];
    if (k === 'PRIORITIES') return Math.max(4, (fp.priorities ?? []).length * 2);
    if (k === 'ROADMAP') return Math.max(4, (fp.roadmap ?? []).length * 2);
    return UNITLESS[k] ?? (units ? units * 3 : 3);
  };
  const counted = plan.sections.map((s) => ({ id: s.id, paragraphs: paragraphsFor(s), units: (s.units ?? []).length }));
  const target = LENGTH_TARGET[fp.product === 'essential' ? 'essential' : 'comprehensive'];
  const paragraphs = counted.reduce((n, s) => n + s.paragraphs, 0);
  const wordsPerParagraph = Math.min(110, Math.max(50, Math.round(target.aim / paragraphs / 5) * 5));
  const sections = counted.map((s) => ({ ...s, words: Math.round((s.paragraphs * wordsPerParagraph) / 10) * 10 }));
  return { sections, wordsPerParagraph, total: sections.reduce((n, s) => n + s.words, 0) };
}

export function renderWriterBrief(fp: RevisedFactPack, plan: RevisedStoryPlan, options: { editionLabel?: string } = {}): string {
  const L: string[] = [];
  const o = fp.organisation;
  L.push(`# Writer brief: ${fp.product === 'essential' ? 'Essential' : 'Comprehensive'} manuscript for ${o.name}`);
  L.push('', `Fact Pack ${fp.version} (${fp.sha256.slice(0, 12)}), Story Plan ${plan.version}, Reporting Bible 1.1. ${options.editionLabel ?? 'FICTIONAL PROTOTYPE.'}`);
  L.push('', '## Contract', '', ...WRITER_CONTRACT.map((x) => `- ${x}`));
  L.push(fp.product === 'essential'
    ? '- Deliverable: this report is a PDF only. Never refer to a workbook, spreadsheet, supporting register or action register; the customer does not receive one.'
    : '- Deliverable: this report comes with a supporting workbook that holds every register; refer to it where the report discusses a selection.');
  L.push('- Facts whose ref starts with T- are complete sentences. Insert them as a sentence of their own, never inside another sentence.');
  L.push('- The first paragraph of the executive section must contain [[T-SCENARIO-ACCOUNT]] exactly. Do not restate those scenario counts in your own words.');
  L.push('- A scenario whose applicability is outstanding is not counted as applying. Never describe its controls as in place or missing.');
  L.push('', '## Organisation', '', `- Name: ${o.name}`, `- Reference: ${o.reference}`, `- Industry: ${o.industry ?? 'not given'}`, `- People: ${o.people ?? 'not given'}`, `- Turnover: ${o.turnover ?? 'not given'}`, `- Type: ${o.type ?? 'not given'}`, `- Final oversight: ${o.oversight}${o.oversightKnown ? ' (its own answer)' : ' (not identified)'}`);
  L.push('', '## Position statements (four-position separation)', '');
  for (const p of fp.position) L.push(`- **${p.ref}** ${p.label}: ${p.value}. ${p.text}`);
  L.push('', '## Facts (insert as slots)', '', '| Ref | Fact | Value |', '|---|---|---|');
  for (const f of Object.values(fp.facts)) L.push(`| ${f.ref} | ${f.label} | ${f.value} |`);
  L.push('', '## Areas', '', '| Ref | Area | Apply | Held | Weaker related | To settle | Gap | Outstanding | Not yet established | Pattern |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const a of fp.areas) L.push(`| ${a.ref} | ${a.name} | ${a.apply} | ${a.confirmed} | ${a.qualified} | ${a.unresolved} | ${a.gap} | ${a.outstanding} | ${a.pending} | ${a.pattern} |`);
  L.push('', '## Themes (in report order)', '');
  for (const t of fp.themes) L.push(`### ${t.ref}: ${t.title}`, '', `- Kind: ${t.kind}`, `- Basis: ${t.basis}`, `- Areas: ${t.areas.join('; ')}`, `- Controls: ${t.controls.join('; ') || 'see basis'}`, `- Facts: ${t.factRefs.join(', ')}`, '');
  L.push('## Findings (in report order)', '', `Selection rule: ${fp.selectionRules.findings}`, '');
  for (const f of fp.findings) {
    L.push(`### ${f.ref}: ${f.title} (${f.areaName})`, '', `- Classification: ${f.kind}`, `- Theme: ${f.themeRef ?? 'none'}`, `- Selected because: ${f.selectedBecause}`, `- How (method): ${f.how ?? ''}`, `- Why it matters (method): ${f.why ?? ''}`, `- What the answers show: ${f.position}`);
    for (const c of f.reported) L.push(`- Core control "${c.key}": ${c.state}. Question: ${c.question} Answer: ${c.answer ?? 'none'}. Owner: ${c.owner}.`);
    for (const w of f.furtherWeaknesses) L.push(`- Related: ${w}`);
    for (const q of f.questions) L.push(`- Question for management: ${q}`);
    L.push(`- Method risks: ${f.methodRisks.join('; ')}`, `- Owner: ${f.ownerRole}`, '');
  }
  L.push('## Fraud pathways (approved structures)', '', `Selection rule: ${fp.selectionRules.pathways}`, '');
  for (const p of fp.pathways) {
    const s = p.structure;
    L.push(`### ${p.ref}: ${s.title} (from ${p.findingRef})`, '', `- Actor: ${s.actor}`, `- Opportunity: ${s.opportunity}`, `- Entry point: ${s.entryPoint}`, `- Mechanism: ${s.mechanism}`, `- Weakness relied on: ${s.controlRelied}`, `- Concealment: ${s.concealment}`, `- Consequence: ${s.consequence}`, `- Warning indicators: ${s.warningIndicators.join('; ')}`, `- Containment: ${s.containment}`, `- Long-term response: ${s.longTerm}`, '');
  }
  L.push('## Priority responses (in order)', '', `Selection rule: ${fp.selectionRules.priorities}`, '');
  for (const p of fp.priorities) L.push(`- **${p.ref}** ${p.title} (${p.kind}). Why: ${p.why}. Establish: ${p.establish} Accountable: ${p.accountable}. Practical owner: ${p.practicalOwner}. Stage: ${p.stage}. Success measure: ${p.measure}`);
  if (fp.product === 'comprehensive') {
    L.push('', '## Control blueprints', '');
    for (const b of fp.blueprints) L.push(`### ${b.ref}: ${b.name}`, '', `- Current: ${b.current}`, `- Target: ${b.target}`, `- Objective: ${b.objective}`, `- Accountable executive: ${b.accountable}; process owner: ${b.processOwner}`, `- Population: ${b.population}; frequency: ${b.frequency}`, `- Record: ${b.record}`, `- Independent check: ${b.independentCheck}`, `- Escalation and failure response: ${b.onFailure}`, `- Service level: ${b.sla}`, `- Effectiveness measure: ${b.measure}`, `- Connected controls: ${b.connected.join('; ') || 'none named'}`, `- Activities: ${b.activities.join(' | ')}`, '');
    L.push('## Operating model', '');
    for (const r of fp.operatingModel) L.push(`- **${r.ref}** ${r.role}: ${r.responsibility} (${r.basis})`);
    L.push('', '## Decisions', '');
    for (const d of fp.decisions) {
      L.push(`### ${d.ref}: ${d.question}`, '', `- Why: ${d.why}`, `- Owner: ${d.owner}; when: ${d.when}; if delayed: ${d.delay}`);
      if (d.options) { for (const op of d.options.options) L.push(`- Option "${op.label}": ${op.description} Effort: ${op.effort} Benefit: ${op.benefit} Trade-off: ${op.tradeOff}`); L.push(`- MK recommended route: ${d.options.recommended} Rationale: ${d.options.rationale}`); }
      L.push('');
    }
    L.push('## Scorecard', '');
    for (const m of fp.scorecard) L.push(`- **${m.ref}** ${m.measure}. Owner: ${m.owner}. Frequency: ${m.frequency}. Escalation: ${m.escalation}`);
  }
  if ((fp.legal ?? []).length) { L.push('', '## South African legal context (cite only where it bears on a finding; state what the law provides, never that the organisation breached it)', ''); for (const l of fp.legal) L.push(`- **${l.ref}** (${l.areaName}, ${l.question}): ${l.text}`); }
  L.push('', '## Proposed stages', '');
  for (const s of fp.roadmap) L.push(`- **${s.ref}** ${s.label} (${s.window}): ${s.purpose} Outcomes: ${s.outcomes.join('; ')}. Owners: ${s.owners.join(', ')}.`);
  if (fp.outstanding.length) { L.push('', '## Outstanding questions', ''); for (const x of fp.outstanding) L.push(`- ${x.key}: ${x.reason}${x.fn ? ` (${x.fn})` : ''}${x.scenario ? `; affects "${x.scenario}"` : ''}`); }
  L.push('', '## Boundary', '', ...fp.boundary.map((x) => `- ${x}`));
  L.push('', '## Prohibited claims', '', ...fp.prohibited.map((x) => `- ${x}`));
  L.push('', '## Requirements pending MK approval (keep visible, do not fill)', '', ...fp.pending.map((x) => `- **${x.ref}** ${x.requirement}: ${x.status}`));
  const budget = sectionBudgets(fp, plan);
  const target = LENGTH_TARGET[fp.product === 'essential' ? 'essential' : 'comprehensive'];
  L.push('', '## Length', '', `- The manuscript must run ${target.min.toLocaleString('en-GB')} to ${target.max.toLocaleString('en-GB')} words of prose. Aim for about ${budget.total.toLocaleString('en-GB')}.`,
    `- Write every paragraph as three to five full sentences, about ${budget.wordsPerParagraph} words. Earlier drafts had the right number of paragraphs but paragraphs of thirty to forty words, and were rejected as too short.`,
    '- Each section below states its paragraphs and word budget. Meet each budget; do not save words in one section for another.');
  L.push('', '## Story Plan', '');
  const bySection = new Map(budget.sections.map((b) => [b.id, b]));
  for (const s of plan.sections) {
    L.push(`### ${s.id}: ${s.title} (${s.movement})`, '', `- Purpose: ${s.purpose}`, `- Takeaway: ${s.takeaway}`, `- Required facts: ${s.requiredFacts.join(', ') || 'none'}`, `- Exhibits: ${s.exhibits.map((e) => `[[exhibit:${e}]]`).join(', ') || 'none'}`);
    if (s.units) L.push(`- Units: ${s.units.map((u) => `${u.id} (${u.ref}${u.exhibit ? `, [[exhibit:${u.exhibit}]]` : ''})`).join('; ')}`);
    if (s.units?.length) L.push(`- Unit headings: exactly ${s.units.length} \`## \` heading${s.units.length === 1 ? '' : 's'}, one per unit, each a claim${s.units.length === 1 ? ' (a single unit still has its own heading)' : ''}`);
    const b = bySection.get(s.id);
    if (b) L.push(`- Length: ${b.paragraphs} paragraph${b.paragraphs === 1 ? '' : 's'}, about ${b.words} words${b.units ? ` (${Math.round(b.paragraphs / b.units)} per unit)` : ''}`);
    L.push(`- Next: ${s.next ?? 'end'}`, '');
  }
  return L.join('\n') + '\n';
}
