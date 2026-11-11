import { createHash } from 'node:crypto';

/**
 * JSON with object keys sorted at every level, so the same value always produces the same text. Used wherever a digest
 * must be reproducible across processes and stores: the ruleset key in the database, the answer log digest and the
 * report input digest. Arrays keep their order, because order is meaningful in an append-only log.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = sortKeys(v);
    }
    return out;
  }
  return value;
}

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function canonicalDigest(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}
