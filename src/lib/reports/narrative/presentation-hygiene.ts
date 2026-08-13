import type { NarrativeClaimBlock } from './manuscript';

/**
 * These are non-semantic provenance references. They may identify an internal fact, but they do
 * not add customer-facing meaning. Semantic machine terms (including underscore-delimited enums)
 * are deliberately excluded and must continue to fail the narrative validator if emitted.
 */
const RAW_QUESTION_ID = /\bD\d+-Q\d+\b/gi;
const RAW_PROVENANCE_ID = /\b(?:MF|RISK|SC|CI|RA|DEC|DECISION|THEME|FINDING|CONTROL|PROOF|ROADMAP)-[A-Z0-9-]+\b/gi;
const PROVENANCE_TOKEN = new RegExp(`${RAW_QUESTION_ID.source}|${RAW_PROVENANCE_ID.source}`, 'gi');

export class NarrativePresentationSanitisationError extends Error {
  readonly code = 'NARRATIVE_PRESENTATION_SANITISATION_EMPTY';

  constructor() {
    super('Deterministic narrative presentation sanitisation removed the complete customer-facing text block.');
    this.name = 'NarrativePresentationSanitisationError';
  }
}

function cleanOrphanedPunctuation(value: string): string {
  return value
    .replace(/\(\s*\)/g, '')
    .replace(/\[\s*\]/g, '')
    .replace(/\{\s*\}/g, '')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([([{])\s+/g, '$1')
    .replace(/\s+([)\]}])/g, '$1')
    .replace(/^\s*[-—–:;,]+\s*/, '')
    .replace(/\s*[-—–:;,]+\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface SanitisedClaimBlock<T extends NarrativeClaimBlock = NarrativeClaimBlock> {
  block: T;
  removedTokenCount: number;
}

/**
 * Sanitises only ClaimBlock.text. claimRefs are copied without inspection or modification, so
 * provenance remains available to deterministic validation and owner review.
 */
export function sanitiseClaimBlock<T extends NarrativeClaimBlock>(block: T): SanitisedClaimBlock<T> {
  const source = String(block.text ?? '');
  const matches = [...source.matchAll(PROVENANCE_TOKEN)];
  const text = cleanOrphanedPunctuation(source.replace(PROVENANCE_TOKEN, ''));
  if (!text) throw new NarrativePresentationSanitisationError();
  return {
    block: { ...block, text } as T,
    removedTokenCount: matches.length
  };
}

/**
 * Applies the ClaimBlock.text boundary to an AI structured output. It intentionally traverses only
 * objects with a string `text` field; arrays such as claimRefs and all analytical input artefacts
 * are not passed through this function and are never changed here.
 */
export function sanitiseNarrativePresentation<T>(value: T): { value: T; removedTokenCount: number } {
  if (Array.isArray(value)) {
    let removedTokenCount = 0;
    const next = value.map((item) => {
      const result = sanitiseNarrativePresentation(item);
      removedTokenCount += result.removedTokenCount;
      return result.value;
    });
    return { value: next as T, removedTokenCount };
  }
  if (!value || typeof value !== 'object') return { value, removedTokenCount: 0 };

  const source = value as Record<string, unknown>;
  if (typeof source.text === 'string') {
    const result = sanitiseClaimBlock(source as unknown as NarrativeClaimBlock);
    return { value: result.block as T, removedTokenCount: result.removedTokenCount };
  }

  let removedTokenCount = 0;
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(source)) {
    const result = sanitiseNarrativePresentation(child);
    next[key] = result.value;
    removedTokenCount += result.removedTokenCount;
  }
  return { value: next as T, removedTokenCount };
}
