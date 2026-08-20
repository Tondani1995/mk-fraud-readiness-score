#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const candidatePath = process.argv[2];
const factPackPath = process.argv[3];
const outputPath = process.argv[4];

if (!candidatePath || !factPackPath || !outputPath) {
  console.error('Usage: node rivonia-legacy-provenance-reconciliation.mjs <candidate.json> <fact-pack.json> <output.md>');
  process.exit(2);
}

const [candidate, factPack] = await Promise.all([
  fs.readFile(candidatePath, 'utf8').then(JSON.parse),
  fs.readFile(factPackPath, 'utf8').then(JSON.parse)
]);

const facts = new Map(factPack.facts.map((fact) => [fact.id, fact]));
const unknown = new Map();
const blockText = (block) => typeof block?.text === 'string' ? block.text : '';
const normalise = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const stopWords = new Set(['about', 'after', 'again', 'also', 'could', 'from', 'have', 'into', 'management', 'needs', 'should', 'that', 'their', 'there', 'these', 'they', 'this', 'through', 'where', 'which', 'with', 'within', 'would']);

function tokens(value) {
  return new Set(normalise(value).split(/\s+/).filter((token) => token.length >= 6 && !stopWords.has(token)));
}

function serialisedFact(fact) {
  return [fact.id, fact.kind, fact.value?.title, fact.value?.statement, fact.value?.event, fact.value?.opportunity, fact.value?.mechanism, fact.value?.controlWeakness, fact.value?.consequence, fact.value?.managementImplicationBasis, fact.value?.fraudRiskRelationship, fact.value?.linkedFindingRefs, fact.value?.linkedRiskRefs].flat().filter(Boolean).join(' ');
}

function relatedFacts(block, validRefs) {
  const text = blockText(block);
  const textTokens = tokens(text);
  const related = [];
  for (const fact of facts.values()) {
    if (validRefs.includes(fact.id)) {
      related.push({ id: fact.id, basis: 'already cited in the same ClaimBlock' });
      continue;
    }
    const value = fact.value ?? {};
    const linked = [...(value.linkedFindingRefs ?? []), ...(value.linkedRiskRefs ?? []), ...(value.sourceRefs ?? [])];
    if (linked.some((ref) => validRefs.includes(ref))) {
      related.push({ id: fact.id, basis: `relationship to same-block reference ${linked.find((ref) => validRefs.includes(ref))}` });
      continue;
    }
    const overlap = [...textTokens].filter((token) => tokens(serialisedFact(fact)).has(token));
    if (overlap.length >= 2) related.push({ id: fact.id, basis: `deterministic wording overlap: ${overlap.slice(0, 4).join(', ')}` });
  }
  return related.slice(0, 12);
}

function addOccurrence(sectionIndex, section, location, block) {
  const refs = block.claimRefs ?? [];
  for (const legacyRef of refs) {
    if (facts.has(legacyRef)) continue;
    const occurrence = {
      path: `sections[${sectionIndex}].${location}`,
      sectionId: section.sectionId,
      sectionHeading: section.heading?.text ?? '',
      paragraphOrHeadingText: blockText(block),
      legacyRef,
      existingFactPackRefsInSameBlock: refs.filter((ref) => facts.has(ref)),
      relevantCurrentFacts: relatedFacts(block, refs.filter((ref) => facts.has(ref)))
    };
    const entries = unknown.get(legacyRef) ?? [];
    entries.push(occurrence);
    unknown.set(legacyRef, entries);
  }
}

for (const [sectionIndex, section] of candidate.sections.entries()) {
  addOccurrence(sectionIndex, section, 'heading', section.heading);
  section.paragraphs.forEach((paragraph, paragraphIndex) => addOccurrence(sectionIndex, section, `paragraphs[${paragraphIndex}]`, paragraph));
  if (section.transition) addOccurrence(sectionIndex, section, 'transition', section.transition);
}

const ambiguousReason = (legacyRef, occurrences) => {
  const sections = new Set(occurrences.map((item) => item.sectionId));
  const texts = new Set(occurrences.map((item) => item.paragraphOrHeadingText));
  if (legacyRef.startsWith('THEME-')) return `No current Fact Pack theme has this legacy identity; the same ref is reused across ${sections.size} sections and ${texts.size} distinct customer-facing blocks, so no single theme ref can be proven to support every occurrence.`;
  if (legacyRef.startsWith('RISK-')) return `The same ref is reused across ${sections.size} sections and ${texts.size} distinct blocks. The current Fact Pack contains multiple risk/finding relationships for these propositions, so rebinding to one risk ref would require analytical judgement.`;
  if (legacyRef.startsWith('SCENARIO-')) return `The same ref is reused across ${sections.size} sections and ${texts.size} distinct blocks. The current Fact Pack has conditional pathways with different linked risks/findings, so no single scenario ref is an unambiguous replacement.`;
  return `The legacy ref is absent from the current Fact Pack and its replacement is not mechanically determinable.`;
};

const lines = [
  '# Rivonia Essential — legacy provenance reconciliation',
  '',
  'Status: **OFFLINE DIAGNOSTIC — NO AI CALL**',
  '',
  `Preserved candidate: \`${candidatePath}\``,
  `Current deterministic Fact Pack: \`${factPackPath}\``,
  '',
  'The preserved candidate and its customer-facing prose were not modified. This report inspects every claim reference absent from the current Fact Pack. The `relevantCurrentFacts` lists below are deterministic candidate evidence only; they are not accepted rebindings.',
  '',
  `Unique unknown legacy refs: **${unknown.size}**`,
  `Unknown-ref occurrences: **${[...unknown.values()].reduce((sum, items) => sum + items.length, 0)}**`,
  '',
  '## Decision rule',
  '',
  'A historical claim ref may be rebound only where the unchanged prose is supported by one existing Fact Pack ref, the mapping is unambiguous across every occurrence of that legacy ref, and no new conclusion is created. Any ambiguity makes the historical manuscript non-reusable.',
  '',
  '## Reconciliation results',
  ''
];

for (const [legacyRef, occurrences] of unknown) {
  lines.push(`### ${legacyRef}`, '', `Occurrences: **${occurrences.length}**`, '', `Mapping: **AMBIGUOUS — no rebind permitted**`, '', ambiguousReason(legacyRef, occurrences), '', '#### Every occurrence', '');
  for (const occurrence of occurrences) {
    lines.push(`##### ${occurrence.path} — ${occurrence.sectionId}`, '', `Heading: ${occurrence.sectionHeading}`, '', `Legacy ref: \`${occurrence.legacyRef}\``, '', `Paragraph/heading text: ${occurrence.paragraphOrHeadingText}`, '', `Existing current refs in the same ClaimBlock: ${occurrence.existingFactPackRefsInSameBlock.length ? occurrence.existingFactPackRefsInSameBlock.map((ref) => `\`${ref}\``).join(', ') : 'none'}`, '', 'Deterministic facts relevant to this exact prose:', '');
    if (occurrence.relevantCurrentFacts.length === 0) {
      lines.push('- None identified by same-block references, deterministic relationship, or wording overlap.', '');
    } else {
      for (const related of occurrence.relevantCurrentFacts) {
        const fact = facts.get(related.id);
        const title = fact?.value?.title ?? fact?.kind ?? 'Fact';
        lines.push(`- \`${related.id}\` — ${title}. Basis: ${related.basis}.`);
      }
      lines.push('');
    }
    lines.push('Unambiguous support for this legacy ref at this location: **NO** — the candidate set is evidence for review, not permission to guess.', '');
  }
}

lines.push(
  '## Assurance wording',
  '',
  'The blocked sentence was not changed because the provenance gate is ambiguous and no reconciled candidate was created.',
  '',
  '**Before (preserved, blocking):**',
  '',
  '> The intended measure is a complete custody trail and matching integrity check for sampled material-case evidence; this is a management control objective, not a statement that evidence has been validated.',
  '',
  '**Deterministic presentation correction identified but not applied:**',
  '',
  '> The management objective is a complete custody trail and matching integrity check for sampled material-case evidence.',
  '',
  'This removes the unnecessary negative assurance construction while preserving the same control, owner, timing and measure. It is recorded for the next fresh-generation task; it is not used to make this ambiguous historical draft reusable.',
  '',
  '## Final offline result',
  '',
  `RIVONIA_FRESH_GENERATION_REQUIRED — ${unknown.size} legacy refs remain ambiguous across ${[...unknown.values()].reduce((sum, items) => sum + items.length, 0)} occurrences. No reconciled candidate was created. No AI call was made.`
);

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${lines.join('\n')}\n`);
console.log(JSON.stringify({ outputPath, uniqueUnknownRefs: unknown.size, unknownOccurrences: [...unknown.values()].reduce((sum, items) => sum + items.length, 0), decision: 'RIVONIA_FRESH_GENERATION_REQUIRED', aiCalls: 0 }, null, 2));
